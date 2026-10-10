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
// VITE_DONATION_ADDRESS: an address of the regtest lnd's wallet (optional)
// VITE_OUR_NODE: pubkey@host:port of the regtest swap node (optional)
const donationAddress = import.meta.env.VITE_DONATION_ADDRESS as
    string | undefined;
const ourNode = import.meta.env.VITE_OUR_NODE as string | undefined;

const config = {
    ...baseConfig,
    network: "regtest",
    loglevel: "debug",
    preventReloadOnPendingSwaps: false,
    donation: donationAddress ? { address: donationAddress } : undefined,
    ourNode: ourNode
        ? { pubkey: ourNode.split("@")[0], uris: [ourNode.split("@")[1]] }
        : undefined,
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
