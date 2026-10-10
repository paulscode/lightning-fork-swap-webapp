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

// Set at build time; the address is created on the live node's lnd wallet
// (lncli newaddress p2tr) and recorded in deploy/OPERATING.md
const donationAddress = import.meta.env.VITE_DONATION_ADDRESS as
    string | undefined;

const config = {
    ...baseConfig,
    network: "mainnet",
    donation: donationAddress ? { address: donationAddress } : undefined,
    ourNode: {
        pubkey: "03cd3175b98f56a4b7a27d169ff211afe4d49973448fce92e2f7f03f526663e666",
        uris: [
            "91.190.100.60:9735",
            "uo4swnsgfzlstnyx44eimndqkykz5aqbep7bqmwwg42foofgr7h2pqyd.onion:9735",
        ],
    },
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
