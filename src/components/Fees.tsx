import { Show, createEffect } from "solid-js";

import { useCreateContext } from "../context/Create";
import { useGlobalContext } from "../context/Global";
import FeesCollapse from "./FeesCollapse";
import Denomination from "./settings/Denomination";

const ppmFactor = 10_000;

export const RoutingFee = () => {
    const { t } = useGlobalContext();
    const { pair } = useCreateContext();

    return (
        <Show when={pair().maxRoutingFee !== undefined}>
            <span class="fees-extra-line">
                {t("routing_fee_limit")}:{" "}
                <span data-testid="routing-fee-limit">
                    {pair().maxRoutingFee! * ppmFactor} ppm
                </span>
            </span>
        </Show>
    );
};

const Fees = () => {
    const { pairs, fetchPairs } = useGlobalContext();
    const {
        pair,
        setMaximum,
        setMinimum,
        setLimitsLoading,
        setMinerFee,
        setBoltzFee,
    } = useCreateContext();

    createEffect(() => {
        if (!pairs()) {
            setLimitsLoading(true);
            return;
        }

        if (!pair().isRoutable) {
            setLimitsLoading(false);
            setMinimum(0);
            setMaximum(0);
            return;
        }

        setBoltzFee(pair().feePercentage);
        setMinerFee(pair().minerFees);

        const initiatingPair = pair();
        setLimitsLoading(true);
        void Promise.all([
            initiatingPair.getMinimum(),
            initiatingPair.getMaximum(),
        ])
            .then(([min, max]) => {
                if (pair() !== initiatingPair) {
                    return;
                }

                setMinimum(min);
                setMaximum(max);
                setLimitsLoading(false);
            })
            .catch(() => {
                if (pair() !== initiatingPair) {
                    return;
                }
                setLimitsLoading(false);
            });
    });

    void fetchPairs();

    return (
        <div class="fees-dyn">
            <div class="fees-dyn-denom">
                <Denomination />
            </div>
            <div class="fees-dyn-right">
                <FeesCollapse />
            </div>
        </div>
    );
};

export default Fees;
