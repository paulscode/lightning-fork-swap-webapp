import { type Accessor, type Setter, Show, onCleanup } from "solid-js";

import RefundButton from "../components/RefundButton";
import { useGlobalContext } from "../context/Global";
import { usePayContext } from "../context/Pay";
import NotFound from "../pages/NotFound";
import { isRefundableSwapType } from "../utils/rescue";
import type { SubmarineSwap } from "../utils/swapCreator";
import SwapRefunded from "./SwapRefunded";

const TransactionLockupFailed = (props: {
    setStatusOverride: Setter<string | undefined>;
}) => {
    const { t } = useGlobalContext();
    const { failureReason, swap } = usePayContext();

    onCleanup(() => {
        props.setStatusOverride(undefined);
    });

    return (
        <Show when={swap() !== null} fallback={<NotFound />}>
            <Show when={swap()?.refundTx === undefined}>
                <h2>{t("lockup_failed")}</h2>
                <p>
                    {t("failure_reason")}: {failureReason()}
                </p>
                <hr />
                <Show when={isRefundableSwapType(swap())}>
                    <RefundButton swap={swap as Accessor<SubmarineSwap>} />
                </Show>
            </Show>
            <Show when={swap()?.refundTx !== undefined}>
                <SwapRefunded refundTxId={swap()!.refundTx!} />
            </Show>
        </Show>
    );
};

export default TransactionLockupFailed;
