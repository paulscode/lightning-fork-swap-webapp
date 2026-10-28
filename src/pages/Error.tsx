import { useLocation } from "@solidjs/router";
import BigNumber from "bignumber.js";
import { Show } from "solid-js";

import type { SwapStoppedState } from "../components/CreateButton";
import Warning from "../components/Warning";
import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import { formatAmount, formatDenomination } from "../utils/denomination";

// A swap the server created but the app stopped (CreateButton): why, that
// nothing was paid, and the swap's id to give the operator
const SwapStopped = (props: { state: SwapStoppedState }) => {
    const { t, denomination, separator } = useGlobalContext();
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);
    const reason = () => {
        const s = props.state;
        if (
            s.check === "cost" &&
            s.cost !== undefined &&
            s.paid !== undefined
        ) {
            return t("swap_stopped_cost", {
                cost: show(s.cost),
                amount: show(s.paid),
                denomination: formatDenomination(denomination(), BTC),
            });
        }
        if (s.check === "timeout") {
            return t("swap_stopped_timeout");
        }
        return t("swap_stopped_other");
    };
    return (
        <>
            <h2>{t("swap_stopped")}</h2>
            <p data-testid="swap-stopped-reason">{reason()}</p>
            <p>{t("swap_stopped_nothing_paid")}</p>
            <p class="swap-stopped-id">
                {t("swap_stopped_id", { id: props.state.swapId })}
            </p>
        </>
    );
};

const Error = (props: { error?: string; subline?: string }) => {
    const { t } = useGlobalContext();
    const location = useLocation<SwapStoppedState | undefined>();
    const stopped = (): SwapStoppedState | undefined => {
        const state = location.state;
        return state?.swapId ? { ...state, swapId: state.swapId } : undefined;
    };
    return (
        <div class="frame">
            <Warning />
            <hr />
            <Show
                when={stopped()}
                fallback={
                    <>
                        <h2>{props.error || t("error")}</h2>
                        <p>{props.subline || t("error_subline")}</p>
                    </>
                }>
                {(state) => <SwapStopped state={state()} />}
            </Show>
        </div>
    );
};

export default Error;
