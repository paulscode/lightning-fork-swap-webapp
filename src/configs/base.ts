import type { Asset, Url } from "boltz-swaps/types";
import type log from "loglevel";

export type Config = {
    apiUrl: Url;
    network: "mainnet" | "regtest";
    assets?: Record<string, Asset>;
    // Onion address of the site; the footer links to it only when set
    torUrl?: string;
    // The on-chain address donations go to (lnd's wallet); without it the
    // Donate tab of the donation window is not shown
    donation?: { address: string };
    // Our node, for "Open a channel to us": its pubkey and where it listens
    ourNode?: { pubkey: string; uris: string[] };
} & typeof defaults;

const defaults = {
    // Replaces the landing page and the swap box with a notice that swaps are
    // paused. Refunds, rescues and pending swaps stay reachable
    swapsSuspended: false,

    // Disables API endpoints that create cooperative signatures for claim
    // and refund transactions
    // **Should only be enabled for testing purposes**
    cooperativeDisabled: false,

    preventReloadOnPendingSwaps: true,

    loglevel: "info" as log.LogLevelDesc,
    defaultLanguage: "en",
    // The source of what runs, as AGPL-3.0 section 13 requires: this
    // repository links to the backend and web app repositories
    repoUrl: "https://github.com/paulscode/lightning-fork-swap",
    // Where people get help and get in touch: the operator's forum
    contactUrl: "https://paulscode.com",
    // The smallest channel our node accepts (lnd's minchansize)
    channelMinSat: 1_000_000,
};

const isTor = () =>
    typeof window !== "undefined" &&
    window.location.hostname.endsWith(".onion");

const chooseUrl = (url?: Url) =>
    url ? (isTor() && url.tor ? url.tor : url.normal) : undefined;

// Base URL of the page the app is served from, without a trailing slash
const sameOrigin = (): string =>
    typeof window !== "undefined" ? window.location.origin : "";

const baseConfig: Omit<Config, "network" | "apiUrl"> = defaults;

export { baseConfig, chooseUrl, isTor, sameOrigin };
