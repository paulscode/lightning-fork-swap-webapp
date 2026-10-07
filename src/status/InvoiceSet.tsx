import PayOnchain from "../components/PayOnchain";
import { usePayContext } from "../context/Pay";
import type { SubmarineSwap } from "../utils/swapCreator";
import { swapBip21 } from "../utils/validation";

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
            bip21={swapBip21(submarine.address, submarine.expectedAmount)}
        />
    );
};

export default InvoiceSet;
