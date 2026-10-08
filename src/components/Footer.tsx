import { Show } from "solid-js";

import { config } from "../config";
import { useGlobalContext } from "../context/Global";
import "../style/footer.scss";
import ExternalLink from "./ExternalLink";

const Footer = () => {
    const { t } = useGlobalContext();

    return (
        <footer>
            <div class="footer-nav">
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
                <ExternalLink href={config.repoUrl}>
                    {t("open_source")}
                </ExternalLink>
            </p>
        </footer>
    );
};
export default Footer;
