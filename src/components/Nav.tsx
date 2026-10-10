import { A } from "@solidjs/router";
import { Show, createSignal } from "solid-js";

import logo from "../assets/lightning-fork-icon.webp";
import Warnings from "../components/Warnings";
import { config } from "../config";
import { useGlobalContext } from "../context/Global";
import "../style/nav.scss";
import { openDonate } from "../utils/donate";
import { donationAvailable } from "./DonateModal";
import ExternalLink from "./ExternalLink";

const Nav = (props: { network: string }) => {
    const { t, setHideHero } = useGlobalContext();
    const [hamburger, setHamburger] = createSignal(false);

    return (
        <nav>
            <Warnings />
            <div class="nav-inner">
                <A
                    id="logo"
                    href="/"
                    aria-label="Lightning Fork Swap"
                    onClick={() => {
                        setHideHero(false);
                        setHamburger(false);
                    }}>
                    <img
                        class="logo-icon"
                        src={logo}
                        width="36"
                        height="36"
                        alt=""
                    />
                    <span class="logo-wordmark">
                        Lightning Fork <span class="logo-accent">Swap</span>
                    </span>
                </A>
                <Show when={props.network !== "mainnet"}>
                    <div id="network" class="btn btn-small">
                        {props.network.toUpperCase()}
                    </div>
                </Show>
                <div id="collapse" class={hamburger() ? "active" : ""}>
                    <A href="/swap" onClick={() => setHamburger(false)}>
                        {t("swap")}
                    </A>
                    <A href="/rescue" onClick={() => setHamburger(false)}>
                        {t("rescue")}
                    </A>
                    <A href="/history" onClick={() => setHamburger(false)}>
                        {t("history")}
                    </A>
                    <A href="/network" onClick={() => setHamburger(false)}>
                        {t("network")}
                    </A>
                    <ExternalLink
                        href={config.contactUrl}
                        onClick={() => setHamburger(false)}>
                        {t("contact")}
                    </ExternalLink>
                </div>
                <Show when={donationAvailable()}>
                    <button
                        type="button"
                        class="nav-donate"
                        data-testid="nav-donate"
                        aria-label={t("donate")}
                        onClick={() => {
                            setHamburger(false);
                            openDonate();
                        }}>
                        <span aria-hidden="true">⚡</span>
                        <span class="nav-donate-label" aria-hidden="true">
                            {" "}
                            {t("donate")}
                        </span>
                    </button>
                </Show>
                <svg
                    id="hamburger"
                    viewBox="0 0 100 100"
                    width="45"
                    role="button"
                    aria-label="Menu"
                    class={hamburger() ? "active" : ""}
                    onClick={() => setHamburger(!hamburger())}>
                    <path
                        class="line top"
                        d="m 70,33 h -40 c 0,0 -8.5,-0.149796 -8.5,8.5 0,8.649796 8.5,8.5 8.5,8.5 h 20 v -20"
                    />
                    <path class="line middle" d="m 70,50 h -40" />
                    <path
                        class="line bottom"
                        d="m 30,67 h 40 c 0,0 8.5,0.149796 8.5,-8.5 0,-8.649796 -8.5,-8.5 -8.5,-8.5 h -20 v 20"
                    />
                </svg>
            </div>
        </nav>
    );
};

export default Nav;
