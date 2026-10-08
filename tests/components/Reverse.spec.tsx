import { fireEvent, render } from "@solidjs/testing-library";

import Reverse from "../../src/components/Reverse";
import { BTC, LN } from "../../src/consts/Assets";
import Pair from "../../src/utils/Pair";
import { TestComponent, contextWrapper, signals } from "../helper";

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(signals.pair().pairs, fromAsset, toAsset));
};

describe("Reverse", () => {
    test("should reverse assets", () => {
        const {
            container: { firstChild: flip },
        } = render(
            () => (
                <>
                    <Reverse />
                    <TestComponent />
                </>
            ),
            {
                wrapper: contextWrapper,
            },
        );

        setPairAssets(BTC, LN);

        fireEvent.click(flip!);

        expect(signals.pair().fromAsset).toEqual(LN);
        expect(signals.pair().toAsset).toEqual(BTC);
    });

    test("should clear onChainAddress on reverse", () => {
        const {
            container: { firstChild: flip },
        } = render(
            () => (
                <>
                    <Reverse />
                    <TestComponent />
                </>
            ),
            {
                wrapper: contextWrapper,
            },
        );

        signals.setOnchainAddress(
            "bcrt1q7vq47xpsg3n3v7ks7xj3q2xg0e2k9f3xn2vy8q",
        );
        setPairAssets(LN, BTC);

        fireEvent.click(flip!);

        expect(signals.onchainAddress()).toEqual("");
        expect(signals.pair().fromAsset).toEqual(BTC);
        expect(signals.pair().toAsset).toEqual(LN);
    });

    test("should clear invoice on reverse", () => {
        const {
            container: { firstChild: flip },
        } = render(
            () => (
                <>
                    <Reverse />
                    <TestComponent />
                </>
            ),
            { wrapper: contextWrapper },
        );

        signals.setInvoice("lnbc1invoice");
        setPairAssets(BTC, LN);

        fireEvent.click(flip!);

        expect(signals.invoice()).toEqual("");
    });
});
