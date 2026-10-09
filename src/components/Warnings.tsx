import { Show } from "solid-js";

import reload_svg from "../assets/reload.svg";
import { useGlobalContext } from "../context/Global";

const Warnings = () => {
    const { t, online, fetchPairs } = useGlobalContext();

    return (
        <div>
            <Show when={!online()}>
                <div id="offline" class="banner">
                    {t("api_offline_msg")}
                    <span class="icon-reload" onClick={() => fetchPairs()}>
                        <img src={reload_svg} />
                    </span>
                </div>
            </Show>
        </div>
    );
};

export default Warnings;
