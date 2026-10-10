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

            <h2>5. Donations</h2>
            <p>
                You may give coins to the service to grow its liquidity. A
                donation is a gift. It is not a payment for a swap or for
                anything else, it creates no contract or obligation, and it is
                not refunded, including amounts sent by mistake. It is not a
                tax-deductible charitable contribution. Donations are used only
                for the service's liquidity and the on-chain fees of managing
                it. The donation address receives donations only; anyone can see
                on the chain what it has received.
            </p>
            <p>
                Send donations only from a wallet on the Bitcoin (BLAKE2b)
                chain. If you send from coins that also exist on the SHA256
                chain without replay protection, a copy of your transaction
                there would move those coins to our address on that chain; we
                never do that ourselves, and if it happens you can{" "}
                <ExternalLink href={config.contactUrl}>contact us</ExternalLink>{" "}
                to work out returning them, after proving they are yours. We do
                not promise a return.
            </p>
            <p>
                Opening a Lightning channel from your node to ours is voluntary
                and costs you only its miner fee; the coins in your side of it
                stay yours. We may close channels at any time.
            </p>

            <h2>6. Open source</h2>
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
