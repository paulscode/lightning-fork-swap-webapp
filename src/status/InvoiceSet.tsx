import PayOnchain from "../components/PayOnchain";
import { usePayContext } from "../context/Pay";
import type { SubmarineSwap } from "../utils/swapCreator";

const InvoiceSet = () => {
    const { swap } = usePayContext();
    const submarine = swap() as SubmarineSwap;

    return (
        <PayOnchain
            type={submarine.type}
            assetSend={submarine.assetSend}
            assetReceive={submarine.assetReceive}
            expectedAmount={submarine.expectedAmount}
            address={submarine.address}
            bip21={submarine.bip21}
        />
    );
};

export default InvoiceSet;
