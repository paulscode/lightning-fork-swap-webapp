import { useNavigate } from "@solidjs/router";

import logo from "../assets/lightning-fork-icon.webp";
import { useGlobalContext } from "../context/Global";

const NotFound = () => {
    const navigate = useNavigate();
    const { t } = useGlobalContext();

    return (
        <div id="notfound" class="inner-wrap">
            <h1>
                {t("not_found")}
                <small>{t("not_found_subline")}</small>
            </h1>

            <img
                src={logo}
                alt=""
                class="notfound-image"
                width="220"
                height="220"
            />

            <span class="btn btn-inline" onClick={() => navigate("/")}>
                {t("back_to_home")}
            </span>
        </div>
    );
};

export default NotFound;
