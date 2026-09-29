import { AssetKind, Explorer } from "boltz-swaps/types";
import { type Config, baseConfig, chooseUrl } from "src/configs/base";

// For local end-to-end testing against a regtest backend.
// VITE_API_URL: the backend API (default http://localhost:9001)
// VITE_EXPLORER_API_URL: an Esplora-compatible API (optional; without it,
//   refunds fall back to the backend for fees and broadcasts)
// VITE_EXPLORER_URL: human-facing explorer links (optional)
const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined) ||
    "http://localhost:9001";
const explorerApiUrl = import.meta.env.VITE_EXPLORER_API_URL as
    string | undefined;
const explorerUrl = import.meta.env.VITE_EXPLORER_URL as string | undefined;

const config = {
    ...baseConfig,
    network: "regtest",
    loglevel: "debug",
    preventReloadOnPendingSwaps: false,
    apiUrl: {
        normal: apiUrl,
    },
    assets: {
        BTC: {
            type: AssetKind.UTXO,
            blockExplorerUrl: explorerUrl
                ? {
                      id: Explorer.Esplora,
                      normal: explorerUrl,
                  }
                : undefined,
            blockExplorerApis: explorerApiUrl
                ? [
                      {
                          id: Explorer.Esplora,
                          normal: explorerApiUrl,
                      },
                  ]
                : [],
        },
    },
} as Config;

export { config, chooseUrl };
