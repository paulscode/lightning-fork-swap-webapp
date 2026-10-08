import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { equalBytes } from "@scure/btc-signer/utils.js";
import { BigNumber } from "bignumber.js";
import {
    Scripts,
    SwapTreeSerializer,
    type Types,
    compareTrees,
    reverseSwapTree,
    swapTree,
} from "boltz-core";
import {
    decodeInvoice,
    isMissingBlake2bFeatureError,
} from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";
import { createMusig, tweakMusig } from "boltz-swaps/utxo";

import { type AssetType, BTC } from "../consts/Assets";
import { Denomination } from "../consts/Enums";
import type { deriveKeyFn } from "../context/Global";
import { getBlockTipHeight } from "./blockchain";
import { decodeAddress } from "./compat";
import { formatAmountDenomination } from "./denomination";
import type { ECKeys } from "./ecpair";
import { isInvoice, isLnurl } from "./invoice";
import type { ReverseSwap, SomeSwap, SubmarineSwap } from "./swapCreator";

const invalidSendAmountMsg = (expected: number, got: number) =>
    `invalid send amount. Expected ${expected}, got ${got}`;
const invalidReceiveAmountMsg = (expected: number, got: number) =>
    `invalid receive amount. Expected ${expected} to be bigger than ${got}`;

const validateAddress = (
    chain: string,
    tree: Types.SwapTree,
    ourKeys: ECKeys,
    theirPublicKey: Uint8Array,
    address: string,
): void => {
    const keyAgg = createMusig(ourKeys, theirPublicKey);
    const tweaked = tweakMusig(keyAgg, tree.tree);

    const compareScript = Scripts.p2trOutput(tweaked.aggPubkey);
    const decodedAddress = decodeAddress(chain, address);

    if (!equalBytes(decodedAddress.script, compareScript)) {
        throw new Error("decoded address script mismatch");
    }
};

const bip21Amount = (expectedAmount: number): string =>
    formatAmountDenomination(
        BigNumber(expectedAmount),
        Denomination.Btc,
        ".",
        BTC,
    );

// The parameters the backend puts in a submarine swap's BIP21; any other
// (lightning=, a second amount=, ...) would tell a wallet to pay something
// else
const bip21AllowedParams = new Set(["amount", "label"]);

/**
 * The BIP21 the app shows and links to, built from the address and amount it
 * has checked; the server's string is validated but never used.
 */
export const swapBip21 = (address: string, expectedAmount: number): string =>
    expectedAmount === 0
        ? `bitcoin:${address}`
        : `bitcoin:${address}?amount=${bip21Amount(expectedAmount)}`;

const validateBip21 = (
    bip21: string,
    address: string,
    expectedAmount: number,
): void => {
    const [target, query, ...rest] = bip21.split("?");
    if (rest.length > 0 || target !== `bitcoin:${address}`) {
        throw new Error("invalid BIP21 format");
    }

    const params = new URLSearchParams(query ?? "");
    for (const key of params.keys()) {
        if (!bip21AllowedParams.has(key)) {
            throw new Error(`unexpected parameter in BIP21: ${key}`);
        }
    }
    if (params.getAll("amount").length > 1) {
        throw new Error("more than one amount in BIP21");
    }

    if (expectedAmount === 0) {
        const hasAmount = params.has("amount");
        if (hasAmount) {
            throw new Error(
                `unexpected amount in BIP21. Expected 0, got ${params.get("amount")}`,
            );
        }
        return;
    }

    if (params.get("amount") !== bip21Amount(expectedAmount)) {
        throw new Error(
            `invalid BIP21 amount. Expected ${expectedAmount}, got ${params.get("amount")}`,
        );
    }
};

const validateReverse = (swap: ReverseSwap, deriveKey: deriveKeyFn): void => {
    const invoiceData = decodeInvoice(swap.invoice);

    // Amounts
    if (invoiceData.satoshis !== swap.sendAmount) {
        throw new Error(
            invalidSendAmountMsg(invoiceData.satoshis, swap.sendAmount),
        );
    }

    if (swap.onchainAmount <= swap.receiveAmount) {
        throw new Error(
            invalidReceiveAmountMsg(swap.onchainAmount, swap.receiveAmount),
        );
    }

    // Invoice
    const preimageHash = sha256(hex.decode(swap.preimage));
    if (invoiceData.preimageHash !== hex.encode(preimageHash)) {
        throw new Error(
            `invalid swap preimage hash. Expected ${hex.encode(preimageHash)}, got ${invoiceData.preimageHash}`,
        );
    }

    checkCost(swap, swap.sendAmount, swap.onchainAmount);

    // SwapTree
    const tree = SwapTreeSerializer.deserializeSwapTree(swap.swapTree);

    if (
        swap.claimPrivateKeyIndex === undefined ||
        swap.refundPublicKey === undefined
    ) {
        throw new Error("missing swap key data for reverse validation");
    }
    const ourKeys = deriveKey(
        swap.claimPrivateKeyIndex,
        swap.assetReceive as AssetType,
    );
    const theirPublicKey = hex.decode(swap.refundPublicKey);

    const compareTree = reverseSwapTree(
        false,
        preimageHash,
        ourKeys.publicKey,
        theirPublicKey,
        swap.timeoutBlockHeight,
    );

    if (!compareTrees(tree, compareTree)) {
        throw new Error("swap tree mismatch");
    }

    validateAddress(
        swap.assetReceive,
        tree,
        ourKeys,
        theirPublicKey,
        swap.lockupAddress,
    );
};

const validateSubmarine = (
    swap: SubmarineSwap,
    deriveKey: deriveKeyFn,
): void => {
    // Amounts
    if (swap.expectedAmount !== swap.sendAmount) {
        throw new Error(
            invalidSendAmountMsg(swap.expectedAmount, swap.sendAmount),
        );
    }

    // SwapTree
    const invoiceData = decodeInvoice(swap.invoice);
    checkCost(swap, swap.expectedAmount, invoiceData.satoshis);

    const tree = SwapTreeSerializer.deserializeSwapTree(swap.swapTree);

    if (swap.refundPrivateKeyIndex === undefined) {
        throw new Error("missing refund key index for submarine validation");
    }
    const ourKeys = deriveKey(
        swap.refundPrivateKeyIndex,
        swap.assetSend as AssetType,
    );
    const theirPublicKey = hex.decode(swap.claimPublicKey);

    const compareTree = swapTree(
        false,
        hex.decode(invoiceData.preimageHash),
        theirPublicKey,
        ourKeys.publicKey,
        swap.timeoutBlockHeight,
    );

    if (!compareTrees(tree, compareTree)) {
        throw new Error("swap tree mismatch");
    }

    // Address
    validateAddress(
        swap.assetSend,
        tree,
        ourKeys,
        theirPublicKey,
        swap.address,
    );

    validateBip21(swap.bip21, swap.address, swap.expectedAmount);
};

// The timeouts the server should give, in blocks from the tip, with room
// for blocks found while the swap is created (the backend's timeoutDelta:
// reverse 1440 minutes = 144 blocks, submarine 10080 minutes = 1008 blocks).
// A reverse timeout too close leaves no time to claim before the server can
// refund; a submarine timeout too far keeps the user from refunding.
export const timeoutBounds = {
    [SwapType.Reverse]: { min: 72, max: 300 },
    [SwapType.Submarine]: { min: 72, max: 2100 },
};

// The most a swap may cost the user, service and network fees together:
// well above this service's terms (0.1 % submarine, 0.5 % reverse, miner
// fees of a few hundred sat), so that only a server asking far more is
// refused.
export const maxSwapCost = { percent: 1, sat: 10_000 };

const checkCost = (swap: SomeSwap, paid: number, received: number) => {
    const ceiling = Math.floor(
        (paid * maxSwapCost.percent) / 100 + maxSwapCost.sat,
    );
    if (paid - received > ceiling) {
        throw new Error(
            `swap ${swap.id} costs ${paid - received} sat of ${paid}, more than ${ceiling}`,
        );
    }
};

const validateTimeout = async (swap: SomeSwap): Promise<void> => {
    const bounds = timeoutBounds[swap.type as keyof typeof timeoutBounds];
    const asset =
        swap.type === SwapType.Reverse ? swap.assetReceive : swap.assetSend;
    const tip = Number(await getBlockTipHeight(asset));
    const blocks = swap.timeoutBlockHeight - tip;
    if (
        !Number.isSafeInteger(swap.timeoutBlockHeight) ||
        blocks < bounds.min ||
        blocks > bounds.max
    ) {
        throw new Error(
            `swap ${swap.id} times out ${blocks} blocks from the tip ${tip}, outside ${bounds.min} to ${bounds.max}`,
        );
    }
};

export const validateResponse = async (
    swap: SomeSwap,
    deriveKey: deriveKeyFn,
): Promise<void> => {
    switch (swap.type) {
        case SwapType.Submarine:
            validateSubmarine(swap, deriveKey);
            break;

        case SwapType.Reverse:
            validateReverse(swap, deriveKey);
            break;

        default:
            throw new Error("unknown_swap_type");
    }

    await validateTimeout(swap);
};

export const validateInvoice = (inputValue: string): number => {
    const isInputInvoice = isInvoice(inputValue);
    if (isLnurl(inputValue) || isInputInvoice) {
        if (isInputInvoice) {
            let decoded: ReturnType<typeof decodeInvoice>;
            try {
                decoded = decodeInvoice(inputValue);
            } catch (e) {
                if (isMissingBlake2bFeatureError(e)) {
                    throw new Error("invoice_missing_blake2b", { cause: e });
                }
                throw new Error("invalid_invoice", { cause: e });
            }
            if (decoded.satoshis === 0) {
                throw new Error("invalid_0_amount");
            }
            return decoded.satoshis;
        }
    }
    throw new Error("invalid_invoice");
};
