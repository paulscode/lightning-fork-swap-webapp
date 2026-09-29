import { hex } from "@scure/base";
import {
    OutputType,
    type RefundDetails,
    SwapTreeSerializer,
    detectSwap,
} from "boltz-core";

import { getPartialRefundSignature } from "../client.ts";
import { formatError } from "../errors.ts";
import { getLogger } from "../logger.ts";
import {
    type ECKeys,
    createMusig,
    hashForWitnessV1,
    tweakMusig,
} from "./musig.ts";
import {
    type UtxoNetwork,
    constructRefund,
    decodeAddress,
    parseTransaction,
    setCooperativeWitness,
    txToHex,
    txToId,
} from "./transaction.ts";

type SerializedSwapTree = Parameters<
    typeof SwapTreeSerializer.deserializeSwapTree
>[0];

export type RefundSubmarineUtxoParams = {
    id: string;
    network: UtxoNetwork;
    swapTree: SerializedSwapTree;
    claimPublicKey: string;
    refundKeys: ECKeys;
    lockupTxHex: string;
    refundAddress: string;
    feePerVbyte: number;
    timeoutBlockHeight: number;
    cooperative?: boolean;
};

export type RefundLockup = {
    lockupTxHex: string;
    timeoutBlockHeight: number;
};

export type RefundUtxosParams = {
    id: string;
    network: UtxoNetwork;
    swapTree: SerializedSwapTree;
    claimPublicKey: string;
    refundKeys: ECKeys;
    lockups: RefundLockup[];
    refundAddress: string;
    feePerVbyte: number;
    // Single nLockTime for the whole uncooperative refund; the caller resolves
    // it from the per-lockup timeouts (e.g. their maximum).
    nLockTime: number;
    cooperative?: boolean;
};

export type RefundResult = {
    transactionHex: string;
    transactionId: string;
    cooperativeError?: string;
};

export const refundUtxos = async (
    params: RefundUtxosParams,
): Promise<RefundResult> => {
    const cooperative = params.cooperative ?? true;
    const { network } = params;

    const boltzPublicKey = hex.decode(params.claimPublicKey);
    const tree = SwapTreeSerializer.deserializeSwapTree(params.swapTree);
    const keyAgg = createMusig(params.refundKeys, boltzPublicKey);
    const tweaked = tweakMusig(keyAgg, tree.tree);

    const details = params.lockups.map((lockup) => {
        const lockupTx = parseTransaction(lockup.lockupTxHex);
        const swapOutput = detectSwap(tweaked.aggPubkey, lockupTx);
        if (swapOutput === undefined) {
            throw new Error("could not find swap output in lockup transaction");
        }
        return {
            ...swapOutput,
            cooperative,
            swapTree: tree,
            privateKey: params.refundKeys.privateKey,
            type: OutputType.Taproot,
            transactionId: txToId(lockupTx),
            internalKey: keyAgg.aggPubkey,
        };
    }) as unknown as RefundDetails[];

    const decoded = decodeAddress(params.refundAddress, network);
    const refundTx = constructRefund(
        details,
        decoded.script,
        cooperative ? 0 : params.nLockTime,
        params.feePerVbyte,
        true,
    );

    if (!cooperative) {
        return {
            transactionHex: txToHex(refundTx),
            transactionId: txToId(refundTx),
        };
    }

    try {
        // One input per lockup detail; sign each cooperatively in its own
        // musig session.
        for (let index = 0; index < details.length; index++) {
            const inputKeyAgg = createMusig(params.refundKeys, boltzPublicKey);
            const inputTweaked = tweakMusig(inputKeyAgg, tree.tree);

            const sigHash = hashForWitnessV1(
                details as unknown as { script: Uint8Array; amount: bigint }[],
                refundTx,
                index,
            );

            const withNonce = inputTweaked.message(sigHash).generateNonce();

            const boltzSig = await getPartialRefundSignature(
                params.id,
                withNonce.publicNonce,
                txToHex(refundTx),
                index,
            );

            const aggNonces = withNonce.aggregateNonces([
                [boltzPublicKey, boltzSig.pubNonce],
            ]);
            const session = aggNonces.initializeSession();
            const signed = session.signPartial();
            const withBoltz = signed.addPartial(
                boltzPublicKey,
                boltzSig.signature,
            );

            setCooperativeWitness(
                refundTx,
                index,
                withBoltz.aggregatePartials(),
            );
        }

        return {
            transactionHex: txToHex(refundTx),
            transactionId: txToId(refundTx),
        };
    } catch (e) {
        getLogger().warn("Uncooperative refund because", e);
        const fallback = await refundUtxos({ ...params, cooperative: false });
        return { ...fallback, cooperativeError: formatError(e) };
    }
};

export const refundSubmarineUtxo = async (
    params: RefundSubmarineUtxoParams,
): Promise<RefundResult> => {
    const { transactionHex, transactionId } = await refundUtxos({
        id: params.id,
        network: params.network,
        swapTree: params.swapTree,
        claimPublicKey: params.claimPublicKey,
        refundKeys: params.refundKeys,
        lockups: [
            {
                lockupTxHex: params.lockupTxHex,
                timeoutBlockHeight: params.timeoutBlockHeight,
            },
        ],
        refundAddress: params.refundAddress,
        feePerVbyte: params.feePerVbyte,
        nLockTime: params.timeoutBlockHeight,
        cooperative: params.cooperative,
    });
    return { transactionHex, transactionId };
};
