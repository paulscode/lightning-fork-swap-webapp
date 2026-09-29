import { render, screen } from "@solidjs/testing-library";
import { OutputType } from "boltz-core";
import { SwapType } from "boltz-swaps/types";
import { createSignal } from "solid-js";

import { BTC, LN } from "../../src/consts/Assets";
import { swapStatusFailed } from "../../src/consts/SwapStatus";
import i18n from "../../src/i18n/i18n";
import TransactionLockupFailed from "../../src/status/TransactionLockupFailed";
import type { SomeSwap } from "../../src/utils/swapCreator";
import { TestComponent, contextWrapper, payContext } from "../helper";

const renderLockupFailed = () => {
    // eslint-disable-next-line solid/reactivity
    const [, setStatusOverride] = createSignal<string>();

    render(
        () => (
            <>
                <TestComponent />
                <TransactionLockupFailed
                    setStatusOverride={setStatusOverride}
                />
            </>
        ),
        {
            wrapper: contextWrapper,
        },
    );
};

const submarineSwap = (status?: string) =>
    ({
        id: "lockup-failed",
        assetSend: BTC,
        assetReceive: LN,
        version: OutputType.Taproot,
        status,
        type: SwapType.Submarine,
    }) as SomeSwap;

describe("TransactionLockupFailed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("should show the failure reason", async () => {
        renderLockupFailed();
        payContext.setSwap(submarineSwap());
        payContext.setFailureReason("overpaid");

        await expect(
            screen.findByText(i18n.en.lockup_failed),
        ).resolves.not.toBeUndefined();
        expect(screen.getByText(/overpaid/u)).toBeInTheDocument();
    });

    test("should show refund button for submarine swaps", async () => {
        renderLockupFailed();
        payContext.setSwap(submarineSwap());
        payContext.setRefundableUTXOs([{ hex: "0x0" }]);

        await expect(
            screen.findByText(i18n.en.refund),
        ).resolves.not.toBeUndefined();
    });

    test.each(Object.values(swapStatusFailed))(
        "should show refund button for failed swap with any UTXO (%s)",
        async (status) => {
            renderLockupFailed();
            payContext.setRefundableUTXOs([
                {
                    hex: "0x",
                    timeoutEta: undefined,
                    timeoutBlockHeight: undefined,
                },
            ]);
            payContext.setSwap(submarineSwap(status));

            await expect(
                screen.findByText(i18n.en.refund),
            ).resolves.not.toBeUndefined();
        },
    );

    test("should not show refund button for swap with no UTXO", async () => {
        renderLockupFailed();
        payContext.setSwap(submarineSwap(swapStatusFailed.SwapExpired));

        await expect(
            screen.findByText(i18n.en.no_lockup_transaction),
        ).resolves.not.toBeUndefined();
    });

    test("should not show refund button for reverse swaps", () => {
        renderLockupFailed();
        payContext.setSwap({
            assetSend: LN,
            assetReceive: BTC,
            version: OutputType.Taproot,
            status: swapStatusFailed.SwapExpired,
            type: SwapType.Reverse,
        } as SomeSwap);

        expect(screen.getByText(i18n.en.lockup_failed)).toBeInTheDocument();
        expect(screen.queryByText(i18n.en.no_lockup_transaction)).toBeNull();
        expect(screen.queryByText(i18n.en.refund)).toBeNull();
        expect(screen.queryByTestId("refundAddress")).toBeNull();
    });

    test("should show the refunded view once refunded", async () => {
        renderLockupFailed();
        payContext.setSwap({
            ...submarineSwap(),
            refundTx: "refundtxid",
        } as SomeSwap);

        await expect(
            screen.findByText(i18n.en.refunded),
        ).resolves.not.toBeUndefined();
        expect(screen.queryByText(i18n.en.lockup_failed)).toBeNull();
    });
});
