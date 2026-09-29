import { AssetKind, Explorer } from "boltz-swaps/types";
import {
    type Config,
    baseConfig,
    chooseUrl,
    sameOrigin,
} from "src/configs/base";

// The API is served from the same origin as the web app (`/v2/...` and the
// WebSocket at `/v2/ws`) unless VITE_API_URL is set at build time.
const apiUrl =
    (import.meta.env.VITE_API_URL as string | undefined) || sameOrigin();

const config = {
    ...baseConfig,
    network: "mainnet",
    loglevel: "info",
    apiUrl: {
        normal: apiUrl,
    },
    assets: {
        BTC: {
            type: AssetKind.UTXO,
            blockExplorerUrl: {
                id: Explorer.Mempool,
                normal: "https://mempool.guide",
            },
            // mempool.guide sends no CORS headers, so the deployment proxies
            // its API at /explorer/api on the same origin
            blockExplorerApis: [
                {
                    id: Explorer.Mempool,
                    normal: `${sameOrigin()}/explorer/api`,
                },
            ],
        },
    },
} as Config;

export { config, chooseUrl };
