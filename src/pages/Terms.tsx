import type { Component } from "solid-js";

import ExternalLink from "../components/ExternalLink";
import { config } from "../config";
import "../style/legal.scss";

const Terms: Component = () => {
    return (
        <div class="terms-container">
            <h1>Terms of Use</h1>
            <p>
                By using Lightning Fork Swap (the "service") you accept these
                terms. If you do not accept them, do not use the service.
            </p>

            <h2>1. What the service does</h2>
            <p>
                The service swaps between on-chain BTC on the Bitcoin (BLAKE2b)
                chain and its Lightning network. It offers two kinds of swaps:
            </p>
            <ul>
                <li>
                    Submarine swaps: you send on-chain BTC and the service pays
                    your Lightning invoice.
                </li>
                <li>
                    Reverse swaps: you pay a Lightning invoice and receive
                    on-chain BTC.
                </li>
            </ul>
            <p>
                Only Lightning invoices from nodes on the Bitcoin (BLAKE2b)
                chain work. Such invoices carry feature bit 512. Invoices from
                other networks are rejected.
            </p>

            <h2>2. Non-custodial</h2>
            <p>
                Swaps are atomic. Funds are locked in hash time-locked contracts
                (HTLCs): either both sides of a swap complete, or neither does.
                The service never holds your funds. If a submarine swap fails,
                you can refund your on-chain coins, cooperatively with the
                service or on your own once the timelock expires. If a reverse
                swap fails, your Lightning payment is not settled and returns to
                you.
            </p>

            <h2>3. Your responsibilities</h2>
            <p>
                Your browser stores your swap data and your rescue key. The
                service cannot recover them for you. Keep a backup of your
                rescue key; without it you may be unable to refund a failed
                swap. Check addresses and invoices before you confirm a swap,
                and keep enough time to act before a timelock expires.
            </p>

            <h2>4. Experimental software</h2>
            <p>
                The service is experimental software running on a young chain.
                It may contain bugs, and the chain itself may behave in ways
                nobody expects. You use the service at your own risk. It is
                provided "as is", without warranty of any kind. The operator is
                not liable for any loss arising from its use, to the extent the
                law allows.
            </p>
            <p>
                The operator may change fees, limits or these terms, and may
                pause new swaps at any time. Pending swaps, refunds and the
                rescue page keep working while new swaps are paused.
            </p>

            <h2>5. Open source</h2>
            <p>
                The software is open source under the GNU Affero General Public
                License v3.0 (AGPL-3.0). It is built on{" "}
                <ExternalLink href="https://github.com/BoltzExchange/boltz-web-app">
                    Boltz
                </ExternalLink>
                . The source code of this service is available at{" "}
                <ExternalLink href={config.repoUrl}>
                    {new URL(config.repoUrl, window.location.href).href}
                </ExternalLink>
                .
            </p>
        </div>
    );
};

export default Terms;
