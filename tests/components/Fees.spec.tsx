import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { BigNumber } from "bignumber.js";
import type { Pairs } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import Fees from "../../src/components/Fees";
import { BTC, LN } from "../../src/consts/Assets";
import { Denomination } from "../../src/consts/Enums";
import Pair from "../../src/utils/Pair";
import { calculateSendAmount } from "../../src/utils/calculate";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    signals,
} from "../helper";
import { pairs } from "../pairs";

const fetched = vi.hoisted(() => ({ pairs: undefined as Pairs | undefined }));

vi.mock("../../packages/boltz-swaps/src/client.ts", () => ({
    getPairs: vi.fn(() => Promise.resolve(fetched.pairs)),
}));

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(globalSignals.pairs(), fromAsset, toAsset));
};

const renderFees = () =>
    render(
        () => (
            <>
                <TestComponent />
                <Fees />
            </>
        ),
        { wrapper: contextWrapper },
    );

describe("Fees component", () => {
    beforeEach(() => {
        localStorage.clear();
        fetched.pairs = pairs;
    });

    afterEach(() => {
        localStorage.clear();
    });

    test("should render", () => {
        renderFees();
        expect(screen.getByTestId("fees-toggle")).not.toBeNull();
    });

    test("should set the fees of the submarine pair", async () => {
        renderFees();
        setPairAssets(BTC, LN);

        await waitFor(() => {
            expect(signals.boltzFee()).toEqual(
                pairs.submarine[BTC][BTC].fees.percentage,
            );
            expect(signals.minerFee()).toEqual(
                pairs.submarine[BTC][BTC].fees.minerFees,
            );
        });
    });

    test("should set the fees of the reverse pair", async () => {
        renderFees();
        setPairAssets(LN, BTC);

        const fees = pairs.reverse[BTC][BTC].fees;
        await waitFor(() => {
            expect(signals.boltzFee()).toEqual(fees.percentage);
            expect(signals.minerFee()).toEqual(
                fees.minerFees.claim + fees.minerFees.lockup,
            );
        });
    });

    test("should recalculate limits on direction switch", async () => {
        renderFees();
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(signals.minimum()).toEqual(
                pairs.reverse[BTC][BTC].limits.minimal,
            );
            expect(signals.maximum()).toEqual(
                pairs.reverse[BTC][BTC].limits.maximal,
            );
        });

        setPairAssets(BTC, LN);

        await waitFor(() => {
            expect(signals.minimum()).toEqual(
                calculateSendAmount(
                    BigNumber(pairs.submarine[BTC][BTC].limits.minimal),
                    signals.boltzFee(),
                    signals.minerFee(),
                    SwapType.Submarine,
                ).toNumber(),
            );
            expect(signals.maximum()).toEqual(
                calculateSendAmount(
                    BigNumber(pairs.submarine[BTC][BTC].limits.maximal),
                    signals.boltzFee(),
                    signals.minerFee(),
                    SwapType.Submarine,
                ).toNumber(),
            );
        });
    });

    test("should reset the limits for pairs that are not routable", async () => {
        renderFees();
        setPairAssets(BTC, BTC);

        await waitFor(() => {
            expect(signals.minimum()).toEqual(0);
            expect(signals.maximum()).toEqual(0);
            expect(signals.limitsLoading()).toEqual(false);
        });
    });

    test("should show the routing fee limit of submarine swaps", async () => {
        // Fees fetches the pairs on mount
        const withRoutingFee = structuredClone(pairs) as Pairs;
        withRoutingFee.submarine[BTC][BTC].fees.maximalRoutingFee = 0.0123;
        fetched.pairs = withRoutingFee;

        renderFees();
        globalSignals.setPairs(withRoutingFee);
        setPairAssets(BTC, LN);

        await waitFor(() => {
            expect(screen.getByTestId("routing-fee-limit").textContent).toEqual(
                "123 ppm",
            );
        });
        expect(
            screen.getByTestId("routing-fee-limit").closest(".fees-extra-line"),
        ).not.toBeNull();

        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(screen.queryByTestId("routing-fee-limit")).toBeNull();
        });
    });

    test("should show the fee total and expand details on toggle", async () => {
        renderFees();
        globalSignals.setDenomination(Denomination.Sat);
        setPairAssets(BTC, LN);
        signals.setSendAmount(BigNumber(106_900));

        // 6_800 miner fee + 100 Boltz fee
        await waitFor(() => {
            expect(screen.getByTestId("fees-total-amount").textContent).toEqual(
                "6 900",
            );
        });

        const toggle = screen.getByTestId("fees-toggle");
        expect(toggle.getAttribute("aria-expanded")).toEqual("false");

        fireEvent.click(toggle);

        expect(toggle.getAttribute("aria-expanded")).toEqual("true");
        expect(screen.getByTestId("network-fee").textContent).toEqual("6 800");
        expect(screen.getByTestId("boltz-fee").textContent).toEqual("100");
        expect(
            screen
                .getByTestId("network-fee")
                .parentElement?.querySelector(
                    '.denominator[data-denominator="sat"]',
                ),
        ).not.toBeNull();
    });
});
