import { BigNumber } from "bignumber.js";
import { VsChevronRight } from "solid-icons/vs";
import { createMemo, createSignal } from "solid-js";

import { BTC } from "../consts/Assets";
import { useCreateContext } from "../context/Create";
import { useGlobalContext } from "../context/Global";
import { formatAmount } from "../utils/denomination";
import AmountDenominator from "./AmountDenominator";
import { RoutingFee } from "./Fees";

const FeesCollapse = () => {
    const { t, denomination, separator } = useGlobalContext();
    const { pair, receiveAmount, minerFee, sendAmount, boltzFee } =
        useCreateContext();

    const [feesExpanded, setFeesExpanded] = createSignal(false);

    const boltzFeeAmount = createMemo(() => {
        if (!pair().isRoutable) {
            return BigNumber(0);
        }

        // Recompute whenever a new quote comes in
        receiveAmount();

        return pair().feeOnSend(sendAmount());
    });

    const totalFees = createMemo(() =>
        BigNumber(minerFee()).plus(boltzFeeAmount()),
    );

    return (
        <>
            <button
                type="button"
                class="fees-toggle"
                data-testid="fees-toggle"
                aria-expanded={feesExpanded()}
                onClick={() => setFeesExpanded(!feesExpanded())}>
                <span class="fees-toggle-label">
                    <span class="fees-toggle-icon">
                        <VsChevronRight />
                    </span>
                    {t("swap_fees")}:
                </span>
                <span class="fees-toggle-value">
                    <span data-testid="fees-total-amount">
                        {formatAmount(
                            totalFees(),
                            denomination(),
                            separator(),
                            BTC,
                        )}
                    </span>
                    <AmountDenominator value={denomination()} />
                </span>
            </button>
            <div
                class="fees-details-shell"
                classList={{ "is-expanded": feesExpanded() }}
                aria-hidden={!feesExpanded()}
                inert={!feesExpanded() || undefined}>
                <div class="fees-details-inner">
                    <label class="fees-details">
                        {t("network_fee")}:{" "}
                        <span class="fee-amount">
                            <span class="network-fee" data-testid="network-fee">
                                {formatAmount(
                                    BigNumber(minerFee()),
                                    denomination(),
                                    separator(),
                                    BTC,
                                    true,
                                )}
                            </span>
                            <AmountDenominator value={denomination()} />
                        </span>
                        <br />
                        {t("fee")} (
                        <span>
                            {boltzFee().toString().replaceAll(".", separator())}
                            %
                        </span>
                        ):{" "}
                        <span class="fee-amount">
                            <span class="boltz-fee" data-testid="boltz-fee">
                                {formatAmount(
                                    boltzFeeAmount(),
                                    denomination(),
                                    separator(),
                                    BTC,
                                    true,
                                )}
                            </span>
                            <AmountDenominator value={denomination()} />
                        </span>
                    </label>
                </div>
            </div>
            <RoutingFee />
        </>
    );
};

export default FeesCollapse;
