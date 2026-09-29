import { useNavigate } from "@solidjs/router";
import { Show } from "solid-js";

import BlockExplorer, {
    BlockExplorerTargetKind,
} from "../components/BlockExplorer";
import { useGlobalContext } from "../context/Global";
import { usePayContext } from "../context/Pay";

const SwapRefunded = (props: { refundTxId: string }) => {
    const navigate = useNavigate();
    const { swap } = usePayContext();
    const { t } = useGlobalContext();

    return (
        <div>
            <p>{t("refunded")}</p>
            <hr />
            <Show when={swap()}>
                {(currentSwap) => (
                    <BlockExplorer
                        asset={currentSwap().assetSend}
                        kind={BlockExplorerTargetKind.Tx}
                        id={props.refundTxId}
                        typeLabel="refund_tx"
                    />
                )}
            </Show>
            <hr />
            <span class="btn" onClick={() => navigate("/swap")}>
                {t("new_swap")}
            </span>
        </div>
    );
};

export default SwapRefunded;
