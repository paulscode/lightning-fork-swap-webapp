import { Show } from "solid-js";

import { config } from "../config";
import { useGlobalContext } from "../context/Global";
import "../style/footer.scss";
import ExternalLink from "./ExternalLink";

const upstreamUrl = "https://github.com/BoltzExchange/boltz-web-app";

const Footer = () => {
    const { t } = useGlobalContext();

    return (
        <footer>
            <div class="footer-nav">
                <ExternalLink href={config.repoUrl}>
                    {t("source_code")}
                </ExternalLink>
                <a href="/terms">{t("terms")}</a>
                <a href="/privacy">{t("privacy")}</a>
                <a href="/rescue">{t("rescue")}</a>
                <Show when={config.torUrl}>
                    <ExternalLink href={config.torUrl!}>
                        {t("onion")}
                    </ExternalLink>
                </Show>
            </div>
            <p class="attribution">
                <ExternalLink href={upstreamUrl}>
                    {t("built_on_boltz")}
                </ExternalLink>
            </p>
            <p class="version">
                {t("version")}: {__APP_VERSION__}, {t("commithash")}:{" "}
                <ExternalLink
                    href={`${config.repoUrl}/commit/${__GIT_COMMIT__}`}>
                    {__GIT_COMMIT__}
                </ExternalLink>
            </p>
        </footer>
    );
};
export default Footer;
