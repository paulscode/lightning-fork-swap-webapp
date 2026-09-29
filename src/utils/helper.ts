import { hex } from "@scure/base";
import type {
    Pairs,
    ReversePairTypeTaproot,
    SubmarinePairTypeTaproot,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import { chooseUrl, config } from "../config";
import { isTor } from "../configs/base";
import { type AssetType, BTC, LN } from "../consts/Assets";
import type { deriveKeyFn } from "../context/Global";
import { type ECKeys, ECPair } from "./ecpair";
import { formatError } from "./errors";
import type { SomeSwap } from "./swapCreator";

export const defaultTimeoutDuration = isTor() ? 45_000 : 15_000;

export const isIos = () =>
    !!navigator.userAgent.match(/iphone|ipad/gi) || false;

export const isMobile = () =>
    isIos() || !!navigator.userAgent.match(/android|blackberry/gi) || false;

// Sent as the referral header so the operator can tell web app swaps apart
export const getReferral = (): string =>
    isMobile() ? "lightning_fork_swap_mobile" : "lightning_fork_swap_desktop";

export const cropString = (str: string, maxLen = 40, subStrSize = 19) => {
    if (str.length < maxLen) {
        return str;
    }
    return (
        str.substring(0, subStrSize) +
        "..." +
        str.substring(str.length - subStrSize)
    );
};

export const formatAddress = (
    address?: string | null,
    groupSize = 5,
): string[] => {
    if (!address) return [];
    const clean = address.replace(/\s/g, "");
    const groups: string[] = [];
    for (let i = 0; i < clean.length; i += groupSize) {
        groups.push(clean.substring(i, i + groupSize));
    }
    return groups;
};

export const clipboard = (text: string) => {
    void navigator.clipboard.writeText(text);
};

export const getApiUrl = (): string => {
    const url = chooseUrl(config.apiUrl);
    if (url === undefined) {
        throw new Error("missing API url in config");
    }
    return url;
};

export const coalesceLn = (asset: string) => (asset === LN ? BTC : asset);

export const getPair = <
    T extends SubmarinePairTypeTaproot | ReversePairTypeTaproot,
>(
    pairs: Pairs | undefined,
    swapType: SwapType,
    assetSend: string,
    assetReceive: string,
): T | undefined => {
    if (pairs === undefined) return undefined;

    const pairSwapType = pairs[swapType];
    if (pairSwapType === undefined) return undefined;
    const pairAssetSend = pairSwapType[coalesceLn(assetSend)];
    if (pairAssetSend === undefined) return undefined;
    const pairAssetReceive = pairAssetSend[coalesceLn(assetReceive)];
    if (pairAssetReceive === undefined) return undefined;
    return pairAssetReceive as T;
};

export const constructRequestOptions = (
    options: RequestInit = {},
    timeout: number = defaultTimeoutDuration,
) => {
    const controller = new AbortController();
    const requestTimeout = setTimeout(
        () => controller.abort({ reason: "Request timed out" }),
        timeout,
    );

    const opts: RequestInit = {
        signal: controller.signal, // Default abort signal, can be overridden by options.signal
        ...options,
    };

    return { opts, requestTimeout };
};

export const fetcher = async <T = unknown>(
    url: string,
    params?: Record<string, unknown>,
    options?: RequestInit,
    requestTimeoutDuration: number = defaultTimeoutDuration,
): Promise<T> => {
    const controller = new AbortController();
    const requestTimeout = setTimeout(
        () => controller.abort({ reason: "Request timed out" }),
        requestTimeoutDuration,
    );

    try {
        const referral = getReferral();

        const signal =
            options?.signal != null
                ? AbortSignal.any([controller.signal, options.signal])
                : controller.signal;
        const headers = new Headers(options?.headers);
        if (!headers.has("referral")) {
            headers.set("referral", referral);
        }
        if (params) {
            headers.set("Content-Type", "application/json");
        }

        const opts: RequestInit = {
            ...options,
            method: params ? "POST" : options?.method,
            headers,
            signal,
            body: params ? JSON.stringify(params) : options?.body,
        };

        const apiUrl = getApiUrl() + url;
        const response = await fetch(apiUrl, opts);

        if (!response.ok) {
            try {
                const contentType = response.headers.get("content-type");
                if (contentType?.includes("application/json")) {
                    const body = await response.json();
                    return Promise.reject(formatError(body));
                }
                return Promise.reject(await response.text());

                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                return Promise.reject(response);
            }
        }
        return (await response.json()) as T;
    } catch (e) {
        throw new Error(formatError(e), { cause: e });
    } finally {
        clearTimeout(requestTimeout);
    }
};

export const parsePrivateKey = (
    deriveKey: deriveKeyFn,
    asset: AssetType,
    keyIndex?: number,
    privateKeyHex?: string,
): ECKeys => {
    if (keyIndex !== undefined) {
        return deriveKey(keyIndex, asset);
    }
    if (privateKeyHex === undefined) {
        throw new Error("missing private key for parsePrivateKey");
    }

    try {
        return ECPair.fromPrivateKey(hex.decode(privateKeyHex));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
        // When the private key is not HEX, we try to decode it as WIF
        return ECPair.fromWIF(privateKeyHex);
    }
};

export const getDestinationAddress = (
    swap: SomeSwap | null | undefined,
): string => {
    if (swap === null || swap === undefined) {
        return "";
    }

    if (swap.type === SwapType.Submarine) {
        return swap.originalDestination || swap.invoice;
    }

    return swap.originalDestination || swap.claimAddress;
};
