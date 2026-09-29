export enum SwapType {
    Submarine = "submarine",
    Reverse = "reverse",
}

export type FetchOptions = {
    signal?: AbortSignal;
    // Bounds the whole operation end-to-end, not each request.
    timeoutMs?: number;
};

export type AssetType = "LN" | "BTC";

export type RefundableAssetType = "BTC";

export enum AssetKind {
    UTXO = "UTXO",
}

export enum Explorer {
    Mempool = "mempool",
    Esplora = "esplora",
}

export type Url = {
    normal: string;
    tor?: string;
};

export type ExplorerUrl = Url & {
    id: Explorer;
};

export type Asset = {
    type: AssetKind;
    canSend?: boolean;
    disabled?: boolean;

    blockExplorerUrl?: ExplorerUrl;
    blockExplorerApis?: ExplorerUrl[];
};
