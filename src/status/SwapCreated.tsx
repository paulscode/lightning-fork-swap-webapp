import PayInvoice from "../components/PayInvoice";
import { usePayContext } from "../context/Pay";
import type { ReverseSwap } from "../utils/swapCreator";

const SwapCreated = () => {
    const { swap } = usePayContext();
    const reverse = swap() as ReverseSwap;

    return (
        <PayInvoice sendAmount={reverse.sendAmount} invoice={reverse.invoice} />
    );
};

export default SwapCreated;
