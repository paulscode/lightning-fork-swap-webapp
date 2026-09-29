import { hex } from "@scure/base";

import { getReferralHeader, isCooperativeDisabled } from "./config.ts";
import { fetcher } from "./http/fetcher.ts";
import { getLogger } from "./logger.ts";
import { SwapType } from "./types.ts";

const cooperativeErrorMessage = "cooperative signatures for swaps are disabled";
const checkCooperative = () => {
    if (isCooperativeDisabled()) {
        throw new Error(cooperativeErrorMessage);
    }
};

// The Boltz API records the referral header for analytics. For `referralId`
// (passed in swap-creation request bodies) we reuse the same value.
const getReferralId = (): string | undefined => getReferralHeader();

type ReverseMinerFees = {
    lockup: number;
    claim: number;
};

type PairLimits = {
    minimal: number;
    maximal: number;
};

type PairType = {
    hash: string;
    rate: number;
};

type SubmarinePairTypeTaproot = PairType & {
    limits: PairLimits & {
        maximalZeroConf: number;
        minimalBatched?: number;
    };
    fees: {
        minerFees: number;
        percentage: number;
        maximalRoutingFee?: number;
    };
};

type ReversePairTypeTaproot = PairType & {
    limits: PairLimits;
    fees: {
        percentage: number;
        minerFees: ReverseMinerFees;
    };
};

type SubmarinePairsTaproot = Record<
    string,
    Record<string, SubmarinePairTypeTaproot>
>;

type ReversePairsTaproot = Record<
    string,
    Record<string, ReversePairTypeTaproot>
>;

type Pairs = {
    [SwapType.Submarine]: SubmarinePairsTaproot;
    [SwapType.Reverse]: ReversePairsTaproot;
};

type PartialSignature = {
    pubNonce: Uint8Array;
    signature: Uint8Array;
};

type SwapTreeLeaf = {
    output: string;
    version: number;
};

type SwapTree = {
    claimLeaf: SwapTreeLeaf;
    refundLeaf: SwapTreeLeaf;
};

type SubmarineCreatedResponse = {
    id: string;
    address: string;
    bip21: string;
    swapTree: SwapTree;
    acceptZeroConf: boolean;
    expectedAmount: number;
    claimPublicKey: string;
    timeoutBlockHeight: number;
};

type ReverseCreatedResponse = {
    id: string;
    invoice: string;
    swapTree: SwapTree;
    lockupAddress: string;
    timeoutBlockHeight: number;
    onchainAmount: number;
    refundPublicKey?: string;
};

type RestorableSwapDetails = {
    tree: SwapTree;
    keyIndex: number;
    lockupAddress: string;
    serverPublicKey: string;
    timeoutBlockHeight: number;
    amount?: number;
    transaction?: { id: string; vout: number };
    preimageHash?: string;
};

export type EmptyResponse = Record<string, never>;

export type RestorableSwap = {
    id: string;
    type: SwapType;
    status: string;
    from: string;
    to: string;
    createdAt: number;
    preimageHash?: string;
    claimPrivateKey?: string;
    claimDetails?: RestorableSwapDetails;
    refundDetails?: RestorableSwapDetails;
    metadata?: string;
};

export type LockupTransaction = {
    id: string;
    hex: string;
    timeoutBlockHeight: number;
    timeoutEta?: number;
};

export type SwapStatusResponse = {
    status: string;
    failureReason?: string;
    zeroConfRejected?: boolean;
    transaction?: {
        id: string;
        hex: string;
    };
};

export const getPairs = async (options?: RequestInit): Promise<Pairs> => {
    const [submarine, reverse] = await Promise.all([
        fetcher<SubmarinePairsTaproot>(
            "/v2/swap/submarine",
            undefined,
            options,
        ),
        fetcher<ReversePairsTaproot>("/v2/swap/reverse", undefined, options),
    ]);

    return {
        [SwapType.Reverse]: reverse,
        [SwapType.Submarine]: submarine,
    };
};

export const fetchBip21Invoice = async (invoice: string) => {
    const log = getLogger();
    try {
        log.debug("Fetching BIP21 for invoice", invoice);
        const res = await fetcher<{ bip21: string; signature: string }>(
            `/v2/swap/reverse/${invoice}/bip21`,
        );
        return res;
    } catch {
        log.debug("No BIP21 found for invoice");
        return null;
    }
};

export const createSubmarineSwap = (
    from: string,
    to: string,
    invoice: string,
    pairHash: string,
    refundPublicKey?: string,
    metadata?: string,
    refundAddress?: string,
): Promise<SubmarineCreatedResponse> =>
    fetcher("/v2/swap/submarine", {
        from,
        to,
        invoice,
        refundPublicKey,
        pairHash,
        referralId: getReferralId(),
        metadata,
        refundAddress,
    });

export const createReverseSwap = (
    from: string,
    to: string,
    invoiceAmount: number,
    preimageHash: string,
    pairHash: string,
    claimPublicKey?: string,
    claimAddress?: string,
    metadata?: string,
): Promise<ReverseCreatedResponse> =>
    fetcher("/v2/swap/reverse", {
        from,
        to,
        invoiceAmount,
        preimageHash,
        claimPublicKey,
        claimAddress,
        referralId: getReferralId(),
        pairHash,
        metadata,
    });

export const patchSwapMetadata = (
    id: string,
    metadata: string,
): Promise<EmptyResponse> =>
    fetcher<EmptyResponse>(
        `/v2/swap/${id}/metadata`,
        { metadata },
        { method: "PATCH" },
    );

export const getPartialRefundSignature = async (
    id: string,
    pubNonce: Uint8Array,
    transactionHex: string,
    index: number,
): Promise<PartialSignature> => {
    checkCooperative();
    const res = await fetcher<{ pubNonce: string; partialSignature: string }>(
        `/v2/swap/submarine/${id}/refund`,
        {
            index,
            pubNonce: hex.encode(pubNonce),
            transaction: transactionHex,
        },
    );
    return {
        pubNonce: hex.decode(res.pubNonce),
        signature: hex.decode(res.partialSignature),
    };
};

export const getPartialReverseClaimSignature = async (
    id: string,
    preimage: Uint8Array,
    pubNonce: Uint8Array,
    transactionHex: string,
    index: number,
): Promise<PartialSignature> => {
    checkCooperative();
    const res = await fetcher<{ pubNonce: string; partialSignature: string }>(
        `/v2/swap/reverse/${id}/claim`,
        {
            index,
            preimage: hex.encode(preimage),
            pubNonce: hex.encode(pubNonce),
            transaction: transactionHex,
        },
    );
    return {
        pubNonce: hex.decode(res.pubNonce),
        signature: hex.decode(res.partialSignature),
    };
};

export const getSubmarineClaimDetails = async (id: string) => {
    const res = await fetcher<{
        pubNonce: string;
        preimage: string;
        transactionHash: string;
    }>(`/v2/swap/submarine/${id}/claim`);
    return {
        pubNonce: hex.decode(res.pubNonce),
        preimage: hex.decode(res.preimage),
        transactionHash: hex.decode(res.transactionHash),
    };
};

export const postSubmarineClaimDetails = (
    id: string,
    pubNonce: Uint8Array,
    partialSignature: Uint8Array,
) => {
    checkCooperative();
    return fetcher(`/v2/swap/submarine/${id}/claim`, {
        pubNonce: hex.encode(pubNonce),
        partialSignature: hex.encode(partialSignature),
    });
};

export const getFeeEstimations = () =>
    fetcher<Record<string, number>>("/v2/chain/fees");

// API-only transaction broadcast. Host wraps this with `broadcastToExplorer`
// fallback in `src/utils/blockchain.ts` to race the two channels.
export const broadcastApiTransaction = (
    asset: string,
    txHex: string,
): Promise<{ id: string }> =>
    fetcher<{ id: string }>(`/v2/chain/${asset}/transaction`, {
        hex: txHex,
    });

export const getLockupTransaction = (
    id: string,
    type: SwapType,
): Promise<LockupTransaction> => {
    if (type !== SwapType.Submarine) {
        throw new Error(`cannot get lockup transaction for swap type ${type}`);
    }

    return fetcher<LockupTransaction>(`/v2/swap/submarine/${id}/transaction`);
};

export const getReverseTransaction = (id: string) =>
    fetcher<{
        id: string;
        hex: string;
        timeoutBlockHeight: number;
    }>(`/v2/swap/reverse/${id}/transaction`);

export const getSwapStatus = (id: string) =>
    fetcher<SwapStatusResponse>(`/v2/swap/${id}`);

const maxStatusIds = 64;

export const getSwapStatuses = async (
    ids: string[],
): Promise<Record<string, SwapStatusResponse>> => {
    if (ids.length === 0) {
        return {};
    }
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += maxStatusIds) {
        chunks.push(ids.slice(i, i + maxStatusIds));
    }
    const parts = await Promise.all(
        chunks.map((chunk) =>
            fetcher<Record<string, SwapStatusResponse>>(
                `/v2/swap/status?${chunk.map((id) => `ids=${encodeURIComponent(id)}`).join("&")}`,
            ),
        ),
    );
    const merged: Record<string, SwapStatusResponse> = {};
    for (const part of parts) {
        Object.assign(merged, part);
    }
    return merged;
};

export const getSubmarinePreimage = (id: string) =>
    fetcher<{ preimage: string }>(`/v2/swap/submarine/${id}/preimage`);

export const getRestorableSwaps = (
    xpub: string,
    pagination?: { startIndex: number; limit: number },
    signal?: AbortSignal,
) => {
    const options = signal === undefined ? undefined : { signal };
    return fetcher<RestorableSwap[]>(
        `/v2/swap/restore`,
        { xpub, pagination },
        options,
        30_000,
    );
};

export type {
    Pairs,
    PartialSignature,
    ReversePairTypeTaproot,
    SubmarineCreatedResponse,
    SubmarinePairTypeTaproot,
    ReverseCreatedResponse,
};
