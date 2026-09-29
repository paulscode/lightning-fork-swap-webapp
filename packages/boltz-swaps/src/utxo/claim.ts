import { hex } from "@scure/base";
import {
    type ClaimDetails,
    OutputType,
    SwapTreeSerializer,
    detectSwap,
} from "boltz-core";

import { getPartialReverseClaimSignature } from "../client.ts";
import { getLogger } from "../logger.ts";
import {
    type ECKeys,
    createMusig,
    hashForWitnessV1,
    tweakMusig,
} from "./musig.ts";
import {
    type UtxoNetwork,
    constructClaim,
    decodeAddress,
    getOutputAmount,
    parseTransaction,
    setCooperativeWitness,
    txToHex,
    txToId,
} from "./transaction.ts";

export type UtxoAsset = "BTC";

type SerializedSwapTree = Parameters<
    typeof SwapTreeSerializer.deserializeSwapTree
>[0];

export type ReverseUtxoClaimParams = {
    id: string;
    network: UtxoNetwork;
    serverPublicKey: string;
    swapTree: SerializedSwapTree;
    claimKeys: ECKeys;
    preimage: Uint8Array;
    claimAddress: string;
    receiveAmount: number;
    lockupTxHex: string;
    cooperative?: boolean;
};

export type UtxoClaimResult = {
    transactionHex: string;
    transactionId: string;
};

const buildAdjustedTaprootClaim = (
    params: ReverseUtxoClaimParams & { cooperative: boolean },
) => {
    const boltzPublicKey = hex.decode(params.serverPublicKey);
    const tree = SwapTreeSerializer.deserializeSwapTree(params.swapTree);
    const keyAgg = createMusig(params.claimKeys, boltzPublicKey);
    const tweaked = tweakMusig(keyAgg, tree.tree);

    const lockupTx = parseTransaction(params.lockupTxHex);
    const swapOutput = detectSwap(tweaked.aggPubkey, lockupTx);
    if (swapOutput === undefined) {
        throw new Error("could not find swap output in lockup transaction");
    }

    const details = [
        {
            ...swapOutput,
            cooperative: params.cooperative,
            swapTree: tree,
            privateKey: params.claimKeys.privateKey,
            type: OutputType.Taproot,
            transactionId: txToId(lockupTx),
            internalKey: keyAgg.aggPubkey,
            preimage: params.preimage,
        },
    ] as unknown as ClaimDetails[];

    const decoded = decodeAddress(params.claimAddress, params.network);
    const claimTx = createAdjustedClaim(
        params.receiveAmount,
        details,
        decoded.script,
    );

    return { claimTx, details, tweaked, boltzPublicKey };
};

export const claimReverseUtxo = async (
    params: ReverseUtxoClaimParams,
): Promise<UtxoClaimResult> => {
    const cooperative = params.cooperative ?? true;

    const { claimTx, details, tweaked, boltzPublicKey } =
        buildAdjustedTaprootClaim({ ...params, cooperative });

    if (!cooperative) {
        return {
            transactionHex: txToHex(claimTx),
            transactionId: txToId(claimTx),
        };
    }

    try {
        const sigHash = hashForWitnessV1(
            details as unknown as { script: Uint8Array; amount: bigint }[],
            claimTx,
            0,
        );

        const withNonce = tweaked.message(sigHash).generateNonce();

        const boltzSig = await getPartialReverseClaimSignature(
            params.id,
            params.preimage,
            withNonce.publicNonce,
            txToHex(claimTx),
            0,
        );

        const aggNonces = withNonce.aggregateNonces([
            [boltzPublicKey, boltzSig.pubNonce],
        ]);
        const session = aggNonces.initializeSession();
        setCooperativeWitness(
            claimTx,
            0,
            session
                .signPartial()
                .addPartial(boltzPublicKey, boltzSig.signature)
                .aggregatePartials(),
        );

        return {
            transactionHex: txToHex(claimTx),
            transactionId: txToId(claimTx),
        };
    } catch (e) {
        getLogger().warn("Uncooperative reverse Taproot claim because", e);
        return claimReverseUtxo({ ...params, cooperative: false });
    }
};

const createAdjustedClaim = (
    receiveAmount: number,
    claimDetails: ClaimDetails[],
    destination: Uint8Array,
) => {
    if (receiveAmount === 0) {
        throw new Error("amount to be received is 0");
    }

    let inputSum = 0;
    for (const details of claimDetails) {
        inputSum += getOutputAmount(details as never);
    }

    const feeBudget = Math.floor(inputSum - receiveAmount);
    if (feeBudget < 0) {
        throw new Error(
            `cannot construct claim transaction: receiveAmount ${receiveAmount} exceeds available input sum ${inputSum}`,
        );
    }

    return constructClaim(claimDetails, destination, feeBudget, true);
};
