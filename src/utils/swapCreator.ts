import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import type BigNumber from "bignumber.js";
import { OutputType } from "boltz-core";
import {
    type ReverseCreatedResponse,
    type SubmarineCreatedResponse,
    createReverseSwap,
    createSubmarineSwap,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import { type AssetType, LN } from "../consts/Assets";
import type { newKeyFn } from "../context/Global";
import { type RescueFile, derivePreimageFromRescueKey } from "./rescueFile";

export type SwapBaseData = {
    type: SwapType;
    status?: string;
    assetSend: string;
    assetReceive: string;
    version: number;
    date: number;

    // Not set for submarine swaps; but set for interface compatibility
    claimTx?: string;
    // A reverse swap's claim, kept to broadcast again until it confirms
    claimTxHex?: string;
    claimConfirmed?: boolean;
    refundTx?: string;
    lockupTx?: string;

    // Original user input (Lightning address/LNURL) before resolution
    originalDestination?: string;
};

export type SwapBase = SwapBaseData & {
    sendAmount: number;
    receiveAmount: number;
};

export type SubmarineSwap = SwapBase &
    SubmarineCreatedResponse & {
        type: SwapType.Submarine;
        invoice: string;
        preimage?: string;
        refundPrivateKeyIndex?: number;

        // Deprecated; used for backwards compatibility
        refundPrivateKey?: string;
    };

export type ReverseSwap = SwapBase &
    ReverseCreatedResponse & {
        type: SwapType.Reverse;
        preimage: string;
        claimAddress: string;
        claimPrivateKeyIndex?: number;
        // Set before the preimage first left this browser (a claim's
        // signature request or broadcast): from then on, nothing the
        // server says can make a claim unsafe, and it must go through
        preimageRevealed?: boolean;

        // Deprecated; used for backwards compatibility
        claimPrivateKey?: string;
    };

export type SomeSwap = SubmarineSwap | ReverseSwap;

// The on-chain asset of a swap: what is locked for a submarine swap and
// what is received for a reverse swap
export const getRelevantAssetForSwap = (swap: SwapBaseData) =>
    swap.type === SwapType.Submarine ? swap.assetSend : swap.assetReceive;

export const getSwapAddress = (swap: SomeSwap): string =>
    swap.type === SwapType.Submarine ? swap.address : swap.lockupAddress;

export const getFinalAssetSend = (
    swap: Pick<SwapBaseData, "type" | "assetSend">,
    coalesceLn: boolean = false,
): string =>
    coalesceLn && swap.type === SwapType.Reverse ? LN : swap.assetSend;

export const getFinalAssetReceive = (
    swap: Pick<SwapBaseData, "type" | "assetReceive">,
    coalesceLn: boolean = false,
): string =>
    coalesceLn && swap.type === SwapType.Submarine ? LN : swap.assetReceive;

export const createSubmarine = async (
    assetSend: string,
    assetReceive: string,
    sendAmount: BigNumber,
    receiveAmount: BigNumber,
    invoice: string,
    pairHash: string,
    newKey: newKeyFn,
    originalDestination?: string,
): Promise<SubmarineSwap> => {
    const key = await newKey(assetSend as AssetType);
    const res = await createSubmarineSwap(
        assetSend,
        assetReceive,
        invoice,
        pairHash,
        hex.encode(key.key.publicKey),
    );

    return {
        ...annotateSwapBaseData(
            res,
            SwapType.Submarine,
            assetSend,
            assetReceive,
            sendAmount,
            receiveAmount,
        ),
        invoice,
        originalDestination,
        refundPrivateKeyIndex: key.index,
    };
};

export const createReverse = async (
    assetSend: string,
    assetReceive: string,
    sendAmount: BigNumber,
    receiveAmount: BigNumber,
    claimAddress: string,
    pairHash: string,
    rescueFile: RescueFile,
    newKey: newKeyFn,
    originalDestination?: string,
): Promise<ReverseSwap> => {
    const key = await newKey(assetReceive as AssetType);
    const preimage = derivePreimageFromRescueKey(
        rescueFile,
        key.index,
        assetReceive as AssetType,
    );
    const preimageHash = hex.encode(sha256(preimage));

    const res = await createReverseSwap(
        assetSend,
        assetReceive,
        Number(sendAmount),
        preimageHash,
        pairHash,
        hex.encode(key.key.publicKey),
        claimAddress,
    );

    return {
        ...annotateSwapBaseData(
            res,
            SwapType.Reverse,
            assetSend,
            assetReceive,
            sendAmount,
            receiveAmount,
        ),
        claimAddress,
        originalDestination,
        preimage: hex.encode(preimage),
        claimPrivateKeyIndex: key.index,
    };
};

// What the app keeps about a swap for itself: never taken from the
// server's creation response, where a server could set them to stop a
// claim (claimTx, status) or to swap the keys (the deprecated private keys)
export const localSwapFields = [
    "status",
    "claimTx",
    "claimTxHex",
    "claimConfirmed",
    "refundTx",
    "lockupTx",
    "preimage",
    "preimageRevealed",
    "claimAddress",
    "claimPrivateKey",
    "claimPrivateKeyIndex",
    "refundPrivateKey",
    "refundPrivateKeyIndex",
    "originalDestination",
] as const;

const withoutLocalFields = <T>(response: T): T => {
    const copy = { ...response } as Record<string, unknown>;
    for (const field of localSwapFields) {
        delete copy[field];
    }
    return copy as T;
};

const annotateSwapBaseData = <T, K extends SwapType>(
    createdResponse: T,
    type: K,
    assetSend: string,
    assetReceive: string,
    sendAmount: BigNumber,
    receiveAmount: BigNumber,
): T & SwapBase & { type: K } => ({
    ...withoutLocalFields(createdResponse),
    type,
    assetSend,
    assetReceive,
    date: new Date().getTime(),
    version: OutputType.Taproot,
    sendAmount: Number(sendAmount),
    receiveAmount: Number(receiveAmount),
});
