import { broadcastApiTransaction } from "boltz-swaps/client";
import { Explorer, type ExplorerUrl, type Url } from "boltz-swaps/types";
import log from "loglevel";

import { chooseUrl, config } from "../config";
import { BTC } from "../consts/Assets";
import { formatError } from "./errors";
import { constructRequestOptions } from "./helper";
import type { SubmarineSwap } from "./swapCreator";

export type UTXO = {
    txid: string;
    vout: number;
};

type SwapUTXO = {
    hex: string;
    id: string;
    timeoutBlockHeight?: number;
};

type MempoolFeeEstimation = Record<
    "fastestFee" | "halfHourFee" | "hourFee" | "economyFee" | "minimumFee",
    number
>;

export const blockTimeMinutes: Record<string, number> = {
    [BTC]: 10,
};

export const getNetworkName = (asset: string) =>
    asset === BTC ? "Bitcoin (BLAKE2b)" : "";

const handleResponseSuccess = async <T>(response: Response): Promise<T> => {
    const contentType = response.headers.get("content-type");
    if (contentType?.includes("application/json")) {
        return (await response.json()) as T;
    }
    return (await response.text()) as T;
};

const handleResponseError = async (response: Response) => {
    const errorMessage = `HTTP ${response.status} from ${response.url}`;
    try {
        const body = await response.json();
        throw new Error(`${errorMessage}: ${formatError(body)}`);
    } catch {
        throw new Error(errorMessage);
    }
};

/**
 * Sequentially fetches resources from block explorers APIs and returns the response
 */
const fetchBlockExplorer = async <T>(
    asset: string,
    endpoint: string,
    options: RequestInit = {},
): Promise<T> => {
    for (const url of config.assets?.[asset]?.blockExplorerApis ?? []) {
        const { opts, requestTimeout } = constructRequestOptions(options);

        try {
            const basePath = chooseUrl(url);

            const res = await fetch(`${basePath}${endpoint}`, opts);

            if (!res.ok) {
                try {
                    const body = await res.json();
                    log.error(
                        `block explorer fetch ${endpoint} for asset ${asset} failed`,
                        formatError(body),
                    );
                    continue;
                } catch {
                    // If parsing JSON fails, throw a generic error with status text
                    log.error(
                        `block explorer fetch ${endpoint} for asset ${asset} failed`,
                        res.statusText,
                    );
                    continue;
                }
            }

            return await handleResponseSuccess<T>(res);
        } catch (e) {
            log.error(
                `block explorer fetch ${endpoint} for asset ${asset} failed`,
                e,
            );
            continue;
        } finally {
            clearTimeout(requestTimeout);
        }
    }

    throw new Error(
        `all block explorer APIs failed for asset ${asset}, endpoint ${endpoint}`,
    );
};

/**
 * Fetches resources from multiple block explorer APIs in parallel and returns the first successful response
 */
const fetchBlockExplorerParallel = async <T>(
    asset: string,
    endpoint: string,
    options: RequestInit = {},
): Promise<T> => {
    const urls = config.assets?.[asset]?.blockExplorerApis ?? [];

    try {
        const parallelPromises = urls.map(async (url) => {
            const { opts, requestTimeout } = constructRequestOptions(options);
            try {
                const basePath = chooseUrl(url);

                const res = await fetch(`${basePath}${endpoint}`, opts);

                if (!res.ok) {
                    await handleResponseError(res);
                }

                return res;
            } finally {
                clearTimeout(requestTimeout);
            }
        });

        const response = await Promise.any(parallelPromises);

        return await handleResponseSuccess<T>(response);
    } catch (err) {
        if (err instanceof AggregateError) {
            err.errors.forEach((e, i) => {
                log.error(
                    `fetch to external explorer ${chooseUrl(urls[i])} failed: ${e}`,
                );
            });
        }
        throw new Error(`all external fetch attempts to ${endpoint} failed`, {
            cause: err,
        });
    }
};

// The explorer is proxied as text/plain (so that nothing it returns can run
// on this origin), so its JSON arrives as a string to parse here
const explorerJson = (value: unknown): unknown =>
    typeof value === "string" ? JSON.parse(value) : value;

const isTxid = (value: unknown): value is string =>
    typeof value === "string" && /^[0-9a-f]{64}$/.test(value);

const getAddressUTXOs = async (
    asset: string,
    address: string,
): Promise<UTXO[]> => {
    const utxos = explorerJson(
        await fetchBlockExplorer<unknown>(asset, `/address/${address}/utxo`),
    );
    if (
        !Array.isArray(utxos) ||
        !utxos.every(
            (utxo: Partial<UTXO> | null) =>
                typeof utxo === "object" &&
                utxo !== null &&
                isTxid(utxo.txid) &&
                Number.isSafeInteger(utxo.vout),
        )
    ) {
        throw new Error("block explorer returned malformed UTXOs");
    }
    return utxos as UTXO[];
};

export const getRawTransaction = async (asset: string, txid: string) => {
    return await fetchBlockExplorer<string>(asset, `/tx/${txid}/hex`);
};

// Builds without an explorer (regtest) cannot check the server's word
// against one; every mainnet build has one
export const hasBlockExplorer = (asset: string): boolean =>
    (config.assets?.[asset]?.blockExplorerApis ?? []).length > 0;

export const getBlockTipHeight = async (asset: string) => {
    const height = await fetchBlockExplorer<string>(
        asset,
        "/blocks/tip/height",
    );

    if (!Number.isFinite(Number(height))) {
        throw new Error(
            `invalid block tip height for asset ${asset}: ${height}`,
        );
    }

    return height;
};

export const getTransactionConfirmed = async (
    asset: string,
    txid: string,
): Promise<boolean> => {
    const status = explorerJson(
        await fetchBlockExplorer<unknown>(asset, `/tx/${txid}/status`),
    ) as { confirmed?: unknown } | null;
    if (
        typeof status !== "object" ||
        status === null ||
        typeof status.confirmed !== "boolean"
    ) {
        throw new Error("block explorer returned a malformed status");
    }
    return status.confirmed;
};

export const getTransactionOutSpend = async (
    asset: string,
    txid: string,
    vout: number,
) => {
    const outspend = explorerJson(
        await fetchBlockExplorer<unknown>(
            asset,
            `/tx/${txid}/outspend/${vout}`,
        ),
    ) as { spent?: unknown; txid?: unknown } | null;
    if (
        typeof outspend !== "object" ||
        outspend === null ||
        typeof outspend.spent !== "boolean" ||
        (outspend.txid !== undefined && !isTxid(outspend.txid))
    ) {
        throw new Error("block explorer returned a malformed outspend");
    }
    return outspend as { spent: boolean; txid?: string };
};

export const broadcastToExplorer = async (
    asset: string,
    txHex: string,
): Promise<{ id: string }> => {
    const txId = await fetchBlockExplorerParallel<string>(asset, "/tx", {
        method: "POST",
        body: txHex,
    });

    return { id: txId };
};

export const broadcastTransaction = async (
    asset: string,
    txHex: string,
): Promise<{ id: string }> => {
    const results = await Promise.allSettled([
        broadcastApiTransaction(asset, txHex),
        broadcastToExplorer(asset, txHex),
    ]);
    const successfulResult = results.find(
        (result) => result.status === "fulfilled",
    );
    if (successfulResult) {
        return (successfulResult as PromiseFulfilledResult<{ id: string }>)
            .value;
    }

    throw (results[0] as PromiseRejectedResult).reason;
};

export const getSwapUTXOs = async (
    swap: SubmarineSwap,
): Promise<SwapUTXO[]> => {
    const utxos = await getAddressUTXOs(swap.assetSend, swap.address);

    const rawTxs: SwapUTXO[] = [];
    for (const utxo of utxos) {
        const rawTx = await getRawTransaction(swap.assetSend, utxo.txid);
        rawTxs.push({
            hex: rawTx,
            id: utxo.txid,
            // Important to know if the swap has timed out or not
            timeoutBlockHeight: swap.timeoutBlockHeight,
        });
    }

    return rawTxs;
};

const getEsploraFeeEstimations = async (apiEndpoint: Url) => {
    const { opts, requestTimeout } = constructRequestOptions();
    try {
        const res = await fetch(
            `${chooseUrl(apiEndpoint)}/fee-estimates`,
            opts,
        );

        if (!res.ok) {
            await handleResponseError(res);
        }

        return ((await res.json()) as Record<string, number>)[3];
    } finally {
        clearTimeout(requestTimeout);
    }
};

const getMempoolFeeEstimations = async (mempoolApi: Url) => {
    const { opts, requestTimeout } = constructRequestOptions();
    try {
        const res = await fetch(
            `${chooseUrl(mempoolApi)}/v1/fees/recommended`,
            opts,
        );

        if (!res.ok) {
            await handleResponseError(res);
        }

        return ((await res.json()) as MempoolFeeEstimation).halfHourFee;
    } finally {
        clearTimeout(requestTimeout);
    }
};

export const getFeeEstimations = async (url: ExplorerUrl) => {
    switch (url.id) {
        case Explorer.Mempool:
            return await getMempoolFeeEstimations(url);
        case Explorer.Esplora:
            return await getEsploraFeeEstimations(url);
        default:
            throw new Error(`unknown explorer type: ${String(url.id)}`);
    }
};
