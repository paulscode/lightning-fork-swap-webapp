import { ImArrowDown } from "solid-icons/im";

import { useCreateContext } from "../context/Create";
import { useGlobalContext } from "../context/Global";
import Pair from "../utils/Pair";

const Reverse = () => {
    const { pairs, t } = useGlobalContext();
    const { pair, setPair, setOnchainAddress, setInvoice } = useCreateContext();

    const setDirection = () => {
        setOnchainAddress("");
        setInvoice("");
        setPair(new Pair(pairs(), pair().toAsset, pair().fromAsset));
    };

    return (
        <button
            id="flip-assets"
            type="button"
            aria-label={t("flip_assets")}
            title={t("flip_assets")}
            onClick={() => setDirection()}>
            <ImArrowDown size={14} />
        </button>
    );
};

export default Reverse;
