import { AssetKind } from "boltz-swaps/types";

import { config } from "../config";

export const LN = "LN";
export const BTC = "BTC";

export type AssetType = typeof LN | typeof BTC;

export type RefundableAssetType = typeof BTC;

export const assets: string[] = [
    LN,
    ...Object.keys(config.assets ?? {}).filter((asset) => asset === BTC),
];

export const refundableAssets = [BTC];

// The chain asset is BTC on the Bitcoin BLAKE2b chain; label it so it cannot
// be mistaken for SHA256 Bitcoin
export const getAssetNetwork = (asset: string): string | null => {
    switch (asset) {
        case BTC:
            return "Bitcoin (BLAKE2b)";
        case LN:
            return "Lightning";
        default:
            return null;
    }
};

export const getAssetDisplaySymbol = (asset: string): string => asset;

export const getKindForAsset = (asset: string): AssetKind =>
    config.assets?.[asset]?.type ?? AssetKind.UTXO;
