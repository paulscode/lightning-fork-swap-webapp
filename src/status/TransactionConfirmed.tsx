import LoadingSpinner from "../components/LoadingSpinner";
import { useGlobalContext } from "../context/Global";

// The claim of a confirmed reverse swap runs in the background (PayProvider)
const TransactionConfirmed = () => {
    const { t } = useGlobalContext();

    return (
        <div>
            <h2>{t("tx_confirmed")}</h2>
            <p>{t("tx_ready_to_claim")}</p>
            <LoadingSpinner />
        </div>
    );
};

export default TransactionConfirmed;
