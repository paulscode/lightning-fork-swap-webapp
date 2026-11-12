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
    txToId,
} from "boltz-swaps/utxo";
import log from "loglevel";

import { config } from "../config";
import type { AssetType } from "../consts/Assets";
import type { deriveKeyFn } from "../context/Global";
import {
    broadcastTransaction,
    getBlockTipHeight,
    getRawTransaction,
    getTransactionConfirmed,
    hasBlockExplorer,
} from "./blockchain";
import { minClaimFeeRate } from "./fees";
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
    cooperative: boolean,
    minFeeRate: number,
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
        minFeeRate,
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

// Blocks a lockup must still have before its timeout for the preimage to
// be revealed: the claim must confirm before the server could refund
export const minClaimMarginBlocks = 30;

export const lockupCheckRetry = { attempts: 6, delayMs: 5_000 };

/**
 * Claiming reveals the preimage, which lets the server settle the user's
 * Lightning payment. Before that, the lockup the server reports must be one
 * the explorer (not the server) knows, and far enough from its timeout that
 * the server cannot refund it first.
 */
export const verifyReverseLockup = async (
    swap: ReverseSwap,
    lockupHex: string,
    requireConfirmed = false,
): Promise<void> => {
    if (!hasBlockExplorer(swap.assetReceive)) {
        log.warn(`No explorer to check the lockup of swap ${swap.id} with`);
        return;
    }
    const txid = txToId(parseTransaction(lockupHex));

    let explorerHex: string | undefined;
    for (let attempt = 1; ; attempt++) {
        try {
            explorerHex = await getRawTransaction(swap.assetReceive, txid);
            break;
        } catch (e) {
            // A lockup only just broadcast may not have reached it yet
            if (attempt >= lockupCheckRetry.attempts) {
                throw new Error(
                    `the explorer does not know lockup ${txid} of swap ${swap.id}`,
                    { cause: e },
                );
            }
            await new Promise((resolve) =>
                setTimeout(resolve, lockupCheckRetry.delayMs),
            );
        }
    }

    if (explorerHex.trim().toLowerCase() !== lockupHex.trim().toLowerCase()) {
        throw new Error(
            `lockup ${txid} of swap ${swap.id} differs from the explorer's`,
        );
    }

    // Without 0-conf the user waits for a confirmation: the explorer's
    // word, not the server's
    if (
        requireConfirmed &&
        !(await getTransactionConfirmed(swap.assetReceive, txid))
    ) {
        throw new Error(`lockup ${txid} of swap ${swap.id} is not confirmed`);
    }

    const tip = Number(await getBlockTipHeight(swap.assetReceive));
    if (swap.timeoutBlockHeight - tip < minClaimMarginBlocks) {
        throw new Error(
            `swap ${swap.id} times out at block ${swap.timeoutBlockHeight}, too close to the tip ${tip} to claim safely`,
        );
    }
};

export type ClaimOptions = {
    // This browser revealed the preimage already (it stored that before the
    // reveal): the lockup is claimed whatever it is, nothing is left to
    // protect. Never from the server: a server that says "settled" before
    // the reveal would skip the checks below.
    preimageRevealed?: boolean;
    // Called just before the preimage first leaves the browser, to record
    // that it did
    beforeReveal?: () => Promise<void>;
    // 0-conf off: the lockup must be confirmed, by the explorer
    requireConfirmed?: boolean;
};

export const claim = async (
    deriveKey: deriveKeyFn,
    swap: ReverseSwap,
    swapStatusTransaction: { hex: string },
    cooperative: boolean,
    options: ClaimOptions = {},
): Promise<ReverseSwap> => {
    if (!options.preimageRevealed) {
        await verifyReverseLockup(
            swap,
            swapStatusTransaction.hex,
            options.requireConfirmed ?? false,
        );
    }

    const minFeeRate = await minClaimFeeRate(swap.assetReceive);
    const lockupTx = parseTransaction(swapStatusTransaction.hex);
    // Building the claim asks the server for its signature with the
    // preimage (cooperative), or broadcasts it (not): either reveals it
    await options.beforeReveal?.();
    const claimTransaction = await claimReverseSwap(
        deriveKey,
        swap,
        lockupTx,
        cooperative,
        minFeeRate,
    );

    log.debug("Broadcasting claim transaction");
    const res = await broadcastTransaction(
        swap.assetReceive,
        txToHex(claimTransaction),
    );
    log.debug("Claim transaction broadcast result", res);

    // Record the transaction that was built, not what a broadcaster says
    const claimTxId = txToId(claimTransaction);
    if (res.id !== undefined && res.id !== claimTxId) {
        log.warn(
            `Broadcaster returned ${res.id} for claim transaction ${claimTxId}`,
        );
    }
    swap.claimTx = claimTxId;
    swap.claimTxHex = txToHex(claimTransaction);

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
