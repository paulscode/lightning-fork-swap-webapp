import { A } from "@solidjs/router";

import { useGlobalContext } from "../context/Global";
import "../style/suspension.scss";

export const Suspension = () => {
    const { t } = useGlobalContext();

    return (
        <div id="suspension">
            <span class="status">
                <span class="dot" />
                {t("suspension_status")}
            </span>

            <div class="notice">
                <p>{t("suspension_p1")}</p>
                <p>{t("suspension_p2")}</p>
                <A class="btn" href="/rescue">
                    {t("suspension_rescue_link")}
                </A>
            </div>
        </div>
    );
};

export default Suspension;
