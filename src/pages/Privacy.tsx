import type { Component } from "solid-js";

import ExternalLink from "../components/ExternalLink";
import "../style/legal.scss";

const Privacy: Component = () => {
    return (
        <div class="privacy-container">
            <h1>Privacy</h1>
            <p>
                This page explains what Lightning Fork Swap (the "service") can
                see when you use it.
            </p>

            <h2>1. No accounts, no tracking</h2>
            <p>
                The service has no accounts and asks for no personal details. It
                uses no analytics, no tracking cookies and no third-party
                trackers.
            </p>

            <h2>2. What the operator sees</h2>
            <p>To run swaps, the operator's server sees and stores:</p>
            <ul>
                <li>swap amounts, fees and timestamps;</li>
                <li>on-chain addresses and transactions involved in a swap;</li>
                <li>Lightning invoices and payment hashes;</li>
                <li>
                    IP addresses and request details in server logs, as with any
                    website.
                </li>
            </ul>
            <p>
                On-chain transactions and addresses are public on the Bitcoin
                (BLAKE2b) chain anyway. To hide your IP address, use Tor or a
                VPN.
            </p>

            <h2>3. What stays in your browser</h2>
            <p>
                Your browser stores your swap data and your rescue key locally.
                The rescue key never leaves your browser: the service only
                receives the public keys a swap needs, and, when you use the
                rescue page, an extended public key so it can look up your
                swaps. That extended public key lets the operator link those
                swaps to each other. Clearing your browser data deletes your
                local swap data, so keep a backup of your rescue key; you are
                responsible for it.
            </p>

            <h2>4. Block explorer data</h2>
            <p>
                The site shows chain data (transactions, fees, block heights)
                from{" "}
                <ExternalLink href="https://mempool.guide">
                    mempool.guide
                </ExternalLink>
                . These requests go through this site, so mempool.guide does not
                see your IP address. Links that open mempool.guide directly do
                send your request to it.
            </p>

            <h2>5. Open source</h2>
            <p>
                The software is open source under the AGPL-3.0 and built on
                Boltz, so anyone can check what it does.
            </p>
        </div>
    );
};

export default Privacy;
