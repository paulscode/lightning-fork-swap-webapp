import { A } from "@solidjs/router";
import { BigNumber } from "bignumber.js";
import { For, Show, createSignal } from "solid-js";

import Accordion from "../components/Accordion";
import { donationAvailable } from "../components/DonateModal";
import NetworkSky from "../components/NetworkSky";
import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import type { DictKey } from "../i18n/i18n";
import type { GraphMeta } from "../network/data";
import Create from "../pages/Create";
import "../style/hero.scss";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { openDonate } from "../utils/donate";

const steps: [DictKey, DictKey][] = [
    ["hero_submarine_title", "hero_submarine_text"],
    ["hero_reverse_title", "hero_reverse_text"],
    ["hero_refund_title", "hero_refund_text"],
];

const faq: [DictKey, DictKey][] = [
    ["faq_fees_q", "faq_fees_a"],
    ["faq_limits_q", "faq_limits_a"],
    ["faq_timeout_q", "faq_timeout_a"],
    ["faq_chain_q", "faq_chain_a"],
    ["faq_rescue_q", "faq_rescue_a"],
];

// The home page: the network sky behind, the swap card on it, then how it
// works, how to help, and questions
export const Hero = () => {
    const { t, denomination, separator } = useGlobalContext();
    const [meta, setMeta] = createSignal<GraphMeta | undefined>();
    const [openFaq, setOpenFaq] = createSignal<number | undefined>();
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);

    return (
        <div id="hero" class="home">
            <section class="home-first">
                <div class="home-sky">
                    <NetworkSky mode="background" onMeta={setMeta} />
                    <A href="/network" class="home-tap" data-testid="home-tap">
                        {t("home_tap_explore")}
                    </A>
                </div>
                <div class="home-intro" data-testid="home-intro">
                    <h1>{t("home_headline")}</h1>
                    <p class="home-subline">{t("home_subline")}</p>
                    <Show when={meta()}>
                        <p class="home-stats" data-testid="home-stats">
                            {t("home_stats", {
                                nodes: meta()!.nodes,
                                channels: meta()!.channels,
                                capacity: show(meta()!.capacity),
                                unit: formatDenomination(denomination(), BTC),
                            })}
                        </p>
                    </Show>
                    <A href="/network" class="btn btn-light home-explore">
                        {t("network_more")}
                    </A>
                </div>
                <div id="create-overlay" class="home-card">
                    <Create />
                </div>
            </section>

            <section class="home-section home-how" aria-labelledby="home-how">
                <h2 id="home-how">{t("home_how")}</h2>
                <ol class="hero-boxes">
                    <For each={steps}>
                        {([title, text], i) => (
                            <li class="hero-box">
                                <span class="hero-step" aria-hidden="true">
                                    {i() + 1}
                                </span>
                                <h3>{t(title)}</h3>
                                <p>{t(text)}</p>
                            </li>
                        )}
                    </For>
                </ol>
            </section>

            <Show when={donationAvailable()}>
                <section
                    class="home-section home-help"
                    aria-labelledby="home-help">
                    <h2 id="home-help">{t("home_help_title")}</h2>
                    <p>{t("home_help_text")}</p>
                    <div class="btns">
                        <button
                            type="button"
                            class="btn"
                            data-testid="home-donate"
                            onClick={() => openDonate("onchain")}>
                            {t("donate_tab_onchain")}
                        </button>
                        <button
                            type="button"
                            class="btn btn-light"
                            onClick={() => openDonate("channel")}>
                            {t("network_open_channel")}
                        </button>
                    </div>
                </section>
            </Show>

            <section class="home-section home-faq" aria-labelledby="home-faq">
                <h2 id="home-faq">{t("home_faq")}</h2>
                <For each={faq}>
                    {([q, a], i) => (
                        <Accordion
                            title={t(q)}
                            isOpen={openFaq() === i()}
                            onClick={() =>
                                setOpenFaq(openFaq() === i() ? undefined : i())
                            }>
                            <p>{t(a)}</p>
                        </Accordion>
                    )}
                </For>
            </section>
        </div>
    );
};

export default Hero;
