import type { StatusSource } from "./statusSource/types.ts";
import { type Asset, AssetKind } from "./types.ts";

// Runtime configuration the host application injects so lib code can resolve
// asset metadata and the API endpoint.
//
// The optional `A` parameter captures the host's asset-symbol union for
// type-safe SDK methods.
export interface BoltzSwapsConfig<A extends string = string> {
    assets: Record<A, Asset>;
    // Resolved API base URL (post clearnet/onion switching). Lib's `fetcher`
    // reads this on every call so onion mode stays dynamic.
    boltzApiUrl: string;
    // Referral header value. Read on every request.
    referral?: string;

    // Bitcoin network for UTXO operations. Defaults to "mainnet".
    network?: "mainnet" | "testnet" | "regtest";

    // When true, cooperative-signature endpoints throw before sending.
    // Should only be used for testing.
    cooperativeDisabled?: boolean;

    // Source of swap-status updates. Defaults to a WebSocket stream with a
    // REST polling fallback (createDefaultStatusSource).
    statusSource?: StatusSource;
}

// Loose input shape accepted by `setBoltzSwapsConfig`.
export type BoltzSwapsConfigInput<A extends string = string> = Partial<
    BoltzSwapsConfig<A>
>;

// The API lives on the same origin as the web app by default.
const defaultApiUrl = (): string =>
    typeof window !== "undefined" && window.location !== undefined
        ? window.location.origin
        : "http://localhost:9001";

const defaultsAssets: Record<string, Asset> = {};

// Builds a getter-proxy so dynamic inputs stay dynamic: every property read
// re-resolves the underlying input and falls back to the default if undefined.
const mergeWithDefaults = <A extends string>(
    input: BoltzSwapsConfigInput<A>,
): BoltzSwapsConfig<A> => {
    const merged = {} as BoltzSwapsConfig<A>;
    Object.defineProperty(merged, "assets", {
        enumerable: true,
        get: () => input.assets ?? (defaultsAssets as Record<A, Asset>),
    });
    Object.defineProperty(merged, "boltzApiUrl", {
        enumerable: true,
        get: () => input.boltzApiUrl ?? defaultApiUrl(),
    });
    for (const key of [
        "referral",
        "cooperativeDisabled",
        "network",
        "statusSource",
    ] as const) {
        Object.defineProperty(merged, key, {
            enumerable: true,
            get: () => input[key],
        });
    }
    return merged;
};

let active: BoltzSwapsConfig = mergeWithDefaults({});

export const setBoltzSwapsConfig = <A extends string = string>(
    config: BoltzSwapsConfigInput<A>,
): void => {
    active = mergeWithDefaults(config) as BoltzSwapsConfig;
};

export const getBoltzSwapsConfig = (): BoltzSwapsConfig => active;

const getAssetConfig = (asset: string): Asset | undefined =>
    getBoltzSwapsConfig().assets[asset];

export const getKindForAsset = (asset: string): AssetKind => {
    const assetConfig = getAssetConfig(asset);
    if (!assetConfig) {
        return AssetKind.UTXO;
    }

    return assetConfig.type;
};

export const getBoltzApiUrl = (): string => getBoltzSwapsConfig().boltzApiUrl;

export const getReferralHeader = (): string | undefined =>
    getBoltzSwapsConfig().referral;

export const isCooperativeDisabled = (): boolean =>
    getBoltzSwapsConfig().cooperativeDisabled === true;

export const getConfiguredNetwork = (): "mainnet" | "testnet" | "regtest" =>
    getBoltzSwapsConfig().network ?? "mainnet";
