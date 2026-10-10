import { BigNumber } from "bignumber.js";
import log from "loglevel";
import { createSignal } from "solid-js";

import { config } from "../config";
import { BTC } from "../consts/Assets";
import { Denomination } from "../consts/Enums";
import { validateAddress } from "./compat";
import { formatAmountDenomination } from "./denomination";

export type DonateTab = "onchain" | "channel";

// Which tab of the donation window is open; undefined when it is closed
const [donateTab, setDonateTab] = createSignal<DonateTab | undefined>();
export { donateTab };

export const openDonate = (tab: DonateTab = "onchain") => setDonateTab(tab);
export const closeDonate = () => setDonateTab(undefined);

// The donation line after a swap, once hidden, stays hidden until the page
// is loaded again (nothing is stored)
const [donateLineHidden, setDonateLineHidden] = createSignal(false);
export { donateLineHidden, setDonateLineHidden };

export const isDonateTab = (value: unknown): value is DonateTab =>
    value === "onchain" || value === "channel";

// The configured donation address, when it is one of this network's: a
// build with a broken address shows no Donate tab rather than a QR code
// that sends coins nowhere (build.py also refuses one for mainnet)
export const donationAddress = (): string | undefined => {
    const address = config.donation?.address;
    if (address === undefined || address === "") {
        return undefined;
    }
    if (!validateAddress(BTC, address)) {
        log.error(`donation address ${address} is not valid on this network`);
        return undefined;
    }
    return address;
};

// Suggested amounts, in sat
export const donationPresets = [10_000, 100_000, 1_000_000];

export const donationLabel = "Lightning Fork Swap donation";

// The BIP21 a wallet scans: the address, the amount (when chosen) and a
// label. Same scheme as the swap pages
export const donationBip21 = (address: string, amountSat: number): string => {
    const params = new URLSearchParams();
    if (amountSat > 0) {
        params.set(
            "amount",
            formatAmountDenomination(
                BigNumber(amountSat),
                Denomination.Btc,
                ".",
                BTC,
            ),
        );
    }
    params.set("label", donationLabel);
    return `bitcoin:${address}?${params.toString().replace(/\+/g, "%20")}`;
};

// An address split to be read: its start and end, which a user compares
// with what their wallet pasted, and the middle
export const splitAddress = (
    address: string,
    edge = 6,
): [string, string, string] =>
    address.length <= edge * 2
        ? [address, "", ""]
        : [
              address.slice(0, edge),
              address.slice(edge, -edge),
              address.slice(-edge),
          ];

// Our node's connection strings, and the command that opens a channel to it
export const nodeUri = (pubkey: string, hostPort: string) =>
    `${pubkey}@${hostPort}`;

export const openChannelCommand = (
    pubkey: string,
    hostPort: string,
    amountSat: number,
) =>
    `lncli openchannel --node_key ${pubkey} --connect ${hostPort} --local_amt ${amountSat}`;

// A link may open the donation window over any page: ?donate=onchain or
// ?donate=channel. The parameter is then removed from the address bar
export const openDonateFromLink = () => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("donate");
    if (wanted === null) {
        return;
    }
    openDonate(isDonateTab(wanted) ? wanted : "onchain");
    params.delete("donate");
    const query = params.toString();
    window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
};
