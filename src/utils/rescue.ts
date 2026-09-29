import { getLockupTransaction } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import {
    type RefundResult,
    type UtxoNetwork,
    refundUtxos,
} from "boltz-swaps/utxo";
import log from "loglevel";

import { config } from "../config";
import {
    type AssetType,
    type RefundableAssetType,
    refundableAssets,
} from "../consts/Assets";
import {
    swapStatusFailed,
    swapStatusFinal,
    swapStatusPending,
    swapStatusSuccess,
} from "../consts/SwapStatus";
import type { deriveKeyFn } from "../context/Global";
import {
    blockTimeMinutes,
    broadcastTransaction,
    getBlockTipHeight,
    getSwapUTXOs,
} from "./blockchain";
import type { ECKeys } from "./ecpair";
import { formatError } from "./errors";
import { getFeeEstimationsFailover } from "./fees";
import { parsePrivateKey } from "./helper";
import type { ReverseSwap, SomeSwap, SubmarineSwap } from "./swapCreator";

export enum RescueAction {
    Successful = "successful",
    Claim = "claim",
    Refund = "refund",
    Pending = "pending",
    Failed = "failed",
}

export const enum RefundType {
    Cooperative = "cooperative",
    Uncooperative = "uncooperative",
}

export const RescueNoAction = [
    RescueAction.Successful,
    RescueAction.Pending,
    RescueAction.Failed,
];

export const isSwapClaimable = ({
    status,
    type,
    zeroConf,
    includeSuccess = false,
}: {
    status: string;
    type: SwapType;
    swap?: SomeSwap;
    zeroConf: boolean;
    includeSuccess?: boolean;
}) => {
    switch (type) {
        case SwapType.Reverse: {
            const statuses = [swapStatusPending.TransactionConfirmed];

            if (zeroConf) {
                statuses.push(swapStatusPending.TransactionMempool);
            }

            if (includeSuccess) {
                statuses.push(swapStatusSuccess.InvoiceSettled);
            }

            return statuses.includes(status);
        }
        default:
            return false;
    }
};

export const hasSwapTimedOut = (swap: SomeSwap, currentBlockHeight: number) => {
    if (typeof currentBlockHeight !== "number") {
        return false;
    }

    const timeoutBlockHeight =
        swap.type === SwapType.Submarine
            ? (swap as SubmarineSwap).timeoutBlockHeight
            : (swap as ReverseSwap).timeoutBlockHeight;
    return (
        timeoutBlockHeight !== undefined &&
        currentBlockHeight >= timeoutBlockHeight
    );
};

const refundTaproot = (
    swap: SubmarineSwap,
    transactionsToRefund: { hex: string; timeoutBlockHeight?: number }[],
    privateKey: ECKeys,
    refundAddress: string,
    feePerVbyte: number,
    cooperative: boolean,
    nLockTime: number,
): Promise<RefundResult> => {
    log.info(
        `starting to refund swap ${swap.id} cooperatively: ${cooperative}`,
    );

    // Cooperative co-signing, per-input signing and the uncooperative fallback
    // all live in the SDK primitive
    return refundUtxos({
        id: swap.id,
        network: config.network as UtxoNetwork,
        swapTree: swap.swapTree,
        claimPublicKey: swap.claimPublicKey,
        refundKeys: privateKey,
        lockups: transactionsToRefund.map((tx) => ({
            lockupTxHex: tx.hex,
            timeoutBlockHeight: tx.timeoutBlockHeight ?? nLockTime,
        })),
        refundAddress,
        feePerVbyte,
        nLockTime,
        cooperative,
    });
};

const broadcastRefund = async <T extends SubmarineSwap>(
    swap: T,
    txConstructionResponse: Awaited<ReturnType<typeof refundTaproot>>,
): Promise<string> => {
    try {
        log.debug("Broadcasting refund transaction");
        const res = await broadcastTransaction(
            swap.assetSend,
            txConstructionResponse.transactionHex,
        );
        log.debug("Refund broadcast result", res);
        return res.id;
    } catch (e) {
        // When the uncooperative refund transaction is not ready to be broadcast yet
        // (= non-final) and the cooperative spend has been tried but failed,
        // throw the error of the cooperative spend
        throw e === "non-final" &&
            txConstructionResponse.cooperativeError !== undefined
            ? txConstructionResponse.cooperativeError
            : e;
    }
};

export const refund = async <T extends SubmarineSwap>(
    deriveKey: deriveKeyFn,
    swap: T,
    refundAddress: string,
    transactionsToRefund: { hex: string; timeoutBlockHeight?: number }[],
    type: RefundType,
): Promise<string> => {
    log.info(`${type} refunding swap ${swap.id}: `, swap);

    const privateKey = parsePrivateKey(
        deriveKey,
        swap.assetSend as AssetType,
        swap.refundPrivateKeyIndex,
        swap.refundPrivateKey,
    );

    const feePerVbyte = await getFeeEstimationsFailover(swap.assetSend);

    const validTimeouts = transactionsToRefund
        .filter(
            (tx): tx is typeof tx & { timeoutBlockHeight: number } =>
                typeof tx.timeoutBlockHeight === "number",
        )
        .map((tx) => tx.timeoutBlockHeight);
    const nLockTime = validTimeouts.length > 0 ? Math.max(...validTimeouts) : 0;

    const refundTransaction = await refundTaproot(
        swap,
        transactionsToRefund,
        privateKey,
        refundAddress,
        feePerVbyte,
        type === RefundType.Cooperative,
        nLockTime,
    );

    return broadcastRefund(swap, refundTransaction);
};

export const isRefundableSwapType = (swap: SomeSwap | null | undefined) =>
    swap !== null &&
    swap !== undefined &&
    swap.type === SwapType.Submarine;

export const getRescuableUTXOs = async (currentSwap: SomeSwap) => {
    const [lockupTxResult, utxosResult] = await Promise.allSettled([
        getLockupTransaction(currentSwap.id, currentSwap.type),
        getSwapUTXOs(currentSwap as SubmarineSwap),
    ]);

    const lockupTx =
        lockupTxResult.status === "fulfilled" ? lockupTxResult.value : null;
    const utxos = utxosResult.status === "fulfilled" ? utxosResult.value : null;

    if (utxos) {
        if (utxos.length === 0) {
            return [];
        }
        return utxos;
    }

    // Fallback to lockup tx if 3rd party utxo data is not available and swap status is not final
    if (
        lockupTx &&
        currentSwap.status !== undefined &&
        !Object.values(swapStatusFinal).includes(currentSwap.status)
    ) {
        return [lockupTx];
    }

    log.error("failed to fetch utxo data for swap:", currentSwap.id);
    return [];
};

export const getCurrentBlockHeight = async (swaps: SomeSwap[]) => {
    try {
        const assets: RefundableAssetType[] = Array.from(
            new Set<AssetType>(
                swaps.map((swap) => swap.assetSend as AssetType),
            ),
        ).filter((asset): asset is RefundableAssetType =>
            refundableAssets.includes(asset),
        );

        const blockHeights = await Promise.allSettled(
            assets.map(getBlockTipHeight),
        );

        const currentBlockHeight: Partial<Record<RefundableAssetType, number>> =
            {};

        blockHeights.forEach((res, index) => {
            const asset = assets[index];
            if (res.status === "rejected") {
                log.warn(`could not get block tip height for asset ${asset}`);
                return;
            }

            currentBlockHeight[asset] = Number(res.value);
        });

        return currentBlockHeight;
    } catch (e) {
        log.error("failed to fetch current block height:", formatError(e));
        throw e;
    }
};

export const createRescueList = async (
    swaps: SomeSwap[],
    zeroConf: boolean,
) => {
    if (swaps.length === 0) {
        return [];
    }

    const currentBlockHeight = await getCurrentBlockHeight(swaps);

    return await Promise.all(
        swaps.map(async (swap) => {
            try {
                const isUtxoRefundable = isRefundableSwapType(swap);
                const utxos = isUtxoRefundable
                    ? await getRescuableUTXOs(swap)
                    : [];

                const status = swap.status ?? "";
                const blockHeight =
                    currentBlockHeight[swap.assetSend as RefundableAssetType];

                if (utxos.length === 0) {
                    if (Object.values(swapStatusSuccess).includes(status)) {
                        return { ...swap, action: RescueAction.Successful };
                    }
                    if (Object.values(swapStatusFailed).includes(status)) {
                        return { ...swap, action: RescueAction.Failed };
                    }
                }

                // Prioritize refunding for expired swaps with UTXOs
                if (
                    isUtxoRefundable &&
                    blockHeight !== undefined &&
                    hasSwapTimedOut(swap, blockHeight) &&
                    utxos.length > 0
                ) {
                    return {
                        ...swap,
                        action: RescueAction.Refund,
                        timedOut: true,
                    };
                }

                if (
                    isSwapClaimable({
                        status,
                        type: swap.type,
                        zeroConf,
                    })
                ) {
                    return { ...swap, action: RescueAction.Claim };
                }

                const pendingFromUserPerspective = Object.values(
                    swapStatusPending,
                ).filter(
                    (status) =>
                        status !== swapStatusPending.TransactionClaimPending,
                );
                if (
                    isUtxoRefundable &&
                    !pendingFromUserPerspective.includes(status) &&
                    utxos.length > 0
                ) {
                    return {
                        ...swap,
                        action: RescueAction.Refund,
                        waitForSwapTimeout:
                            Object.values(swapStatusSuccess).includes(status),
                    };
                }

                return { ...swap, action: RescueAction.Pending };
            } catch (e) {
                log.error(
                    `error creating rescue list for swap ${swap.id}:`,
                    formatError(e),
                );
                return { ...swap, action: RescueAction.Pending };
            }
        }),
    );
};

export const getTimeoutEta = (
    asset: string,
    timeoutBlockHeight: number,
    currentBlockHeight: number,
) => {
    const blocksRemaining = timeoutBlockHeight - currentBlockHeight;
    const secondsRemaining = blocksRemaining * blockTimeMinutes[asset] * 60;
    return Math.floor(Date.now() / 1000) + secondsRemaining;
};
