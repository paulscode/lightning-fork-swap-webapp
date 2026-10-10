import NetworkSky from "../components/NetworkSky";
import { useGlobalContext } from "../context/Global";

// /network: the whole network sky, to explore
const Network = () => {
    const { t } = useGlobalContext();
    return (
        <div class="network-page" data-testid="network-page">
            <h1 class="visually-hidden">{t("network_title")}</h1>
            <NetworkSky mode="full" />
        </div>
    );
};

export default Network;
