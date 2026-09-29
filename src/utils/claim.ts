import { hex } from "@scure/base";
import { SwapTreeSerializer, detectSwap } from "boltz-core";
import { signSubmarineClaim } from "boltz-swaps/submarine";
import {
    type TransactionInterface,
    type UtxoNetwork,
    claimReverseUtxo,
    createMusig,
    parseTransaction,
    tweakMusig,
    txToHex,
} from "boltz-swaps/utxo";
import log from "loglevel";

import { config } from "../config";
import type { AssetType } from "../consts/Assets";
import type { deriveKeyFn } from "../context/Global";
import { broadcastTransaction } from "./blockchain";
import { parsePrivateKey } from "./helper";
import type { ReverseSwap, SubmarineSwap } from "./swapCreator";

const getClaimKeys = (deriveKey: deriveKeyFn, swap: ReverseSwap) =>
    parsePrivateKey(
        deriveKey,
        swap.assetReceive as AssetType,
        swap.claimPrivateKeyIndex,
        swap.claimPrivateKey,
    );

const claimReverseSwap = async (
    deriveKey: deriveKeyFn,
    swap: ReverseSwap,
    lockupTx: TransactionInterface,
    cooperative: boolean = true,
): Promise<TransactionInterface> => {
    log.info(`Claiming reverse swap cooperatively: ${cooperative}`);

    if (swap.refundPublicKey === undefined) {
        throw new Error("missing refund public key for reverse swap");
    }

    const result = await claimReverseUtxo({
        id: swap.id,
        network: config.network as UtxoNetwork,
        serverPublicKey: swap.refundPublicKey,
        swapTree: swap.swapTree,
        claimKeys: getClaimKeys(deriveKey, swap),
        preimage: hex.decode(swap.preimage),
        claimAddress: swap.claimAddress,
        receiveAmount: swap.receiveAmount,
        lockupTxHex: txToHex(lockupTx),
        cooperative,
    });

    return parseTransaction(result.transactionHex);
};

export const findSwapOutputVout = (
    deriveKey: deriveKeyFn,
    swap: ReverseSwap,
    lockupTx: TransactionInterface,
): number | undefined => {
    if (swap.refundPublicKey === undefined) {
        return undefined;
    }

    const keyAgg = createMusig(
        getClaimKeys(deriveKey, swap),
        hex.decode(swap.refundPublicKey),
    );
    const tree = SwapTreeSerializer.deserializeSwapTree(swap.swapTree);
    const tweaked = tweakMusig(keyAgg, tree.tree);
    return detectSwap(tweaked.aggPubkey, lockupTx)?.vout;
};

export const claim = async (
    deriveKey: deriveKeyFn,
    swap: ReverseSwap,
    swapStatusTransaction: { hex: string },
    cooperative: boolean,
): Promise<ReverseSwap> => {
    const lockupTx = parseTransaction(swapStatusTransaction.hex);
    const claimTransaction = await claimReverseSwap(
        deriveKey,
        swap,
        lockupTx,
        cooperative,
    );

    log.debug("Broadcasting claim transaction");
    const res = await broadcastTransaction(
        swap.assetReceive,
        txToHex(claimTransaction),
    );
    log.debug("Claim transaction broadcast result", res);

    if (res.id) {
        swap.claimTx = res.id;
    }

    return swap;
};

export const createSubmarineSignature = async (
    deriveKey: deriveKeyFn,
    swap: SubmarineSwap,
) => {
    log.info("Creating cooperative claim signature for", swap.id);

    await signSubmarineClaim({
        id: swap.id,
        swapTree: swap.swapTree,
        claimPublicKey: swap.claimPublicKey,
        refundKeys: parsePrivateKey(
            deriveKey,
            swap.assetSend as AssetType,
            swap.refundPrivateKeyIndex,
            swap.refundPrivateKey,
        ),
        invoice: swap.invoice,
    });
};
