import type { Asset, Url } from "boltz-swaps/types";
import type log from "loglevel";

export type Config = {
    apiUrl: Url;
    network: "mainnet" | "regtest";
    assets?: Record<string, Asset>;
    // Onion address of the site; the footer links to it only when set
    torUrl?: string;
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
    // Where the source code of the running service can be downloaded, as the
    // AGPL requires: the deployment serves it at /source/ on the same origin.
    // A GitHub URL also works (the footer then links the exact commit).
    repoUrl: "/source/",
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
