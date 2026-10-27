import type { Component } from "solid-js";

import ExternalLink from "../components/ExternalLink";
import { config } from "../config";
import "../style/legal.scss";

// Each period here is what the service's configuration does (the
// repository's deploy/ folder: nginx's logs, the retention job); change
// them together.
const Privacy: Component = () => {
    return (
        <div class="privacy-container">
            <h1>Privacy</h1>
            <p class="legal-updated">Last updated: 27 October 2026</p>
            <p>
                This page explains what Lightning Fork Swap (the "service")
                records when you use it, why, and for how long.
            </p>

            <h2>1. In short</h2>
            <ul>
                <li>
                    No accounts, no names or emails, no cookies that track you,
                    no analytics.
                </li>
                <li>
                    Your IP address is not stored with your swaps. Our request
                    log replaces it with a code that changes every day and is
                    kept 10 days.
                </li>
                <li>
                    A swap's invoice, keys and addresses are removed 90 days
                    after the swap is settled. Amounts and dates are kept for
                    our accounts.
                </li>
                <li>
                    Your rescue key and your swap details stay in your browser.
                </li>
            </ul>

            <h2>2. What we never collect</h2>
            <p>
                We ask for no personal details. The service has no accounts, no
                analytics, no tracking cookies, no third-party trackers and no
                advertising. Swaps do not record which kind of device you used.
            </p>

            <h2>3. What we record, and for how long</h2>
            <table class="legal-table">
                <thead>
                    <tr>
                        <th>What</th>
                        <th>Why</th>
                        <th>Kept</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>
                            Request log: the time, a daily code in place of your
                            IP address, the page or API route without swap ids,
                            transaction ids, addresses or invoices, the result,
                            and the kind of browser
                        </td>
                        <td>Running the site and fixing problems</td>
                        <td>10 days</td>
                    </tr>
                    <tr>
                        <td>
                            Threat log: the IP address, path and browser of
                            requests refused as hostile (scanners, malformed
                            requests, requests for other sites). A request
                            refused for being too frequent is logged with the
                            daily code only
                        </td>
                        <td>Defending the service</td>
                        <td>30 days</td>
                    </tr>
                    <tr>
                        <td>
                            The swap service's error log: swap ids and what went
                            wrong, never what you sent
                        </td>
                        <td>Fixing problems</td>
                        <td>10 days</td>
                    </tr>
                    <tr>
                        <td>
                            Each swap: amounts, fees, status, dates and its
                            on-chain transactions; while it can still be paid,
                            claimed or refunded, also its invoice, your public
                            key, your address and its script
                        </td>
                        <td>Running swaps and refunds, and our accounts</td>
                        <td>
                            Invoice, key, address and script: until 90 days
                            after the swap is settled. The rest: kept
                        </td>
                    </tr>
                    <tr>
                        <td>
                            Service figures: balances, channels, counts of swaps
                            and refusals. No personal data
                        </td>
                        <td>Planning liquidity</td>
                        <td>Details 180 days, daily totals kept</td>
                    </tr>
                    <tr>
                        <td>Encrypted copies of the databases</td>
                        <td>Recovering from a failure</td>
                        <td>30 days</td>
                    </tr>
                </tbody>
            </table>
            <p>
                A swap that may still need a refund or a rescue is kept whole
                for as long as that is possible, however old it is, so that you
                can recover your coins.
            </p>

            <h2>4. Your IP address</h2>
            <p>
                Your IP address reaches our web server and stops there: the swap
                service behind it never receives it. The request log records a
                code computed from your address with a key that is replaced
                every day and not kept, so after the day nobody, us included,
                can tell which address a code stood for, or link two days
                together. Only requests refused as hostile are logged with their
                address (section 3).
            </p>
            <p>
                To keep your IP address from us altogether, use Tor Browser or a
                VPN.
            </p>

            <h2>5. Public by nature</h2>
            <p>
                On-chain transactions and addresses are public on the Bitcoin
                (BLAKE2b) chain. A Lightning payment is seen by the nodes that
                route it, and an invoice by whoever pays it. When you use the
                rescue page, your browser sends us an extended public key so we
                can find your swaps; it lets us link those swaps to each other.
            </p>

            <h2>6. What stays in your browser</h2>
            <p>
                Your browser stores your swap data and your rescue key locally.
                The rescue key never leaves your browser: the service only
                receives the public keys a swap needs. The app also keeps a log
                of its own in your browser for 7 days; it leaves your device
                only if you download it. Clearing your browser data deletes your
                local swap data, so keep a backup of your rescue key; you are
                responsible for it.
            </p>

            <h2>7. Other parties</h2>
            <ul>
                <li>
                    <ExternalLink href="https://mempool.guide">
                        mempool.guide
                    </ExternalLink>{" "}
                    provides chain data (transactions, fees, block heights).
                    These requests go through this site, so mempool.guide sees
                    our server, not you. Links that open mempool.guide directly
                    do send your request to it.
                </li>
                <li>
                    If you pay to a Lightning address or an LNURL, your browser
                    contacts that service directly, and it sees your IP address.
                </li>
                <li>
                    The operator receives alerts about the service through a
                    messaging service. They can include swap ids and transaction
                    ids, never IP addresses, and at most the first characters of
                    a donor's address.
                </li>
                <li>
                    The server is rented from a hosting provider, which runs the
                    machine but does not use its data.
                </li>
            </ul>

            <h2>8. Donations</h2>
            <ul>
                <li>
                    A donation to our address: its transaction and whether it
                    was sent with replay protection. For a protected donation,
                    the addresses it came from are removed after 30 days. For
                    one that could be copied to the SHA256 chain, they are kept
                    while we check it (up to a year), so that coins copied to
                    our address there can be returned to their owner.
                </li>
                <li>
                    A channel donation: your node's id and address, and the
                    order's history, deleted 90 days after the order ends.
                </li>
                <li>
                    A SHA256-chain donation through the API: the request, its
                    return address (kept, so that a later deposit can still be
                    passed on) and its deposits. The ownership proofs you send
                    are removed 90 days after we decide whether to copy the
                    donation.
                </li>
            </ul>

            <h2>9. Requests from authorities</h2>
            <p>
                We can only hand over what this page says we keep, for as long
                as we keep it.
            </p>

            <h2>10. Changes and contact</h2>
            <p>
                When this page changes, its date changes; earlier versions are
                in the service's public source history. For questions,{" "}
                <ExternalLink href={config.contactUrl}>contact us</ExternalLink>
                .
            </p>

            <h2>11. Open source</h2>
            <p>
                The software is open source under the AGPL-3.0 and built on
                Boltz, so anyone can check what it does.
            </p>
        </div>
    );
};

export default Privacy;
