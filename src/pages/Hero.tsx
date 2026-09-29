import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import { useGlobalContext } from "../context/Global";
import Create from "../pages/Create";
import "../style/hero.scss";

export const Hero = () => {
    const navigate = useNavigate();
    const { hideHero, setHideHero, t } = useGlobalContext();

    return (
        <div id="hero" class="inner-wrap">
            <div
                id="create-overlay"
                class={hideHero() ? "" : "glow"}
                onClick={() => setHideHero(true)}>
                <Create />
            </div>
            <Show when={!hideHero()}>
                <h1>
                    {t("headline")}
                    <small>{t("subline")}</small>
                </h1>
                <span class="btn btn-inline" onClick={() => navigate("swap")}>
                    {t("start_swapping")}
                </span>
                <div class="hero-boxes">
                    <div class="hero-box">
                        <h3>{t("hero_submarine_title")}</h3>
                        <hr />
                        <p>{t("hero_submarine_text")}</p>
                    </div>
                    <div class="hero-box">
                        <h3>{t("hero_reverse_title")}</h3>
                        <hr />
                        <p>{t("hero_reverse_text")}</p>
                    </div>
                    <div class="hero-box">
                        <h3>{t("hero_refund_title")}</h3>
                        <hr />
                        <p>{t("hero_refund_text")}</p>
                    </div>
                </div>
            </Show>
        </div>
    );
};

export default Hero;
