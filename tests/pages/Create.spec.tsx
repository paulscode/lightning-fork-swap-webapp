import { useNavigate } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { BigNumber } from "bignumber.js";
import { SwapType } from "boltz-swaps/types";
import { Show, createSignal, onMount } from "solid-js";

import { BTC, LN } from "../../src/consts/Assets";
import { Denomination, Side } from "../../src/consts/Enums";
import i18n from "../../src/i18n/i18n";
import Create from "../../src/pages/Create";
import Pair from "../../src/utils/Pair";
import { calculateReceiveAmount } from "../../src/utils/calculate";
import type * as HelperModule from "../../src/utils/helper";
import { isMobile } from "../../src/utils/helper";
import { blake2bInvoice } from "../fixtures/invoices";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    signals,
} from "../helper";
import { pairs } from "../pairs";

vi.mock("../../packages/boltz-swaps/src/client.ts", () => ({
    getPairs: vi.fn(() => Promise.resolve(pairs)),
}));
vi.mock("qr-scanner", () => ({
    default: { hasCamera: vi.fn(() => Promise.resolve(true)) },
}));
vi.mock("../../src/utils/helper", async (importActual) => ({
    ...(await importActual<typeof HelperModule>()),
    isMobile: vi.fn(() => false),
}));

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(signals.pair().pairs, fromAsset, toAsset));
};

const renderCreate = () =>
    render(
        () => (
            <>
                <TestComponent />
                <Create />
            </>
        ),
        {
            wrapper: contextWrapper,
        },
    );

const invalidBtcAddress = i18n.en.invalid_address.replace("{{ asset }}", BTC);

const renderAfterNavigation = (url: string, beforeNavigate?: () => void) => {
    const NavigateToCreate = () => {
        const navigate = useNavigate();
        const [showCreate, setShowCreate] = createSignal(false);

        onMount(() => {
            beforeNavigate?.();
            navigate(url);
            setShowCreate(true);
        });

        return (
            <>
                <TestComponent />
                <Show when={showCreate()}>
                    <Create />
                </Show>
            </>
        );
    };

    render(() => <NavigateToCreate />, {
        wrapper: contextWrapper,
    });
};

describe("Create", () => {
    afterEach(() => {
        vi.mocked(isMobile).mockReturnValue(false);
        localStorage.clear();
    });

    test("should apply asset url params when Create mounts after navigation", async () => {
        renderAfterNavigation(`/?sendAsset=${BTC}&receiveAsset=${LN}`);

        await waitFor(() => {
            expect(signals.pair().fromAsset).toEqual(BTC);
            expect(signals.pair().toAsset).toEqual(LN);
        });
        expect(signals.pair().swapType).toEqual(SwapType.Submarine);
        expect(window.location.search).toEqual("");

        window.history.replaceState({}, "", "/");
    });

    test("should preserve toAsset when only sendAsset is in URL", async () => {
        let initialToAsset: string | undefined;

        renderAfterNavigation(`/?sendAsset=${BTC}`, () => {
            initialToAsset = signals.pair().toAsset;
        });

        await waitFor(() => {
            expect(signals.pair().fromAsset).toEqual(BTC);
        });
        expect(signals.pair().toAsset).toEqual(initialToAsset);
        expect(window.location.search).toEqual("");

        window.history.replaceState({}, "", "/");
    });

    test("should preserve fromAsset when only receiveAsset is in URL", async () => {
        let initialFromAsset: string | undefined;

        renderAfterNavigation(`/?receiveAsset=${LN}`, () => {
            initialFromAsset = signals.pair().fromAsset;
        });

        await waitFor(() => {
            expect(signals.pair().toAsset).toEqual(LN);
        });
        expect(signals.pair().fromAsset).toEqual(initialFromAsset);
        expect(window.location.search).toEqual("");

        window.history.replaceState({}, "", "/");
    });

    test("should render Create", async () => {
        renderCreate();
        const button = await screen.findAllByText(i18n.en.create_swap);
        expect(button).not.toBeUndefined();
    });

    test("should label both sides with their network", async () => {
        renderCreate();
        globalSignals.setPairs(pairs);
        setPairAssets(BTC, LN);

        expect(await screen.findByText("Bitcoin (BLAKE2b)")).toHaveAttribute(
            "for",
            "sendAmount",
        );
        expect(screen.getByText("Lightning")).toHaveAttribute(
            "for",
            "receiveAmount",
        );
    });

    test("should show only the address input for reverse swaps", async () => {
        renderCreate();
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(screen.getAllByTestId("onchainAddress")).toHaveLength(1);
        });
        expect(screen.queryByTestId("invoice")).toBeNull();
    });

    test("should show only the invoice input for submarine swaps", async () => {
        renderCreate();
        globalSignals.setPairs(pairs);
        setPairAssets(BTC, LN);

        await waitFor(() => {
            expect(screen.getAllByTestId("invoice")).toHaveLength(1);
        });
        expect(screen.queryByTestId("onchainAddress")).toBeNull();
    });

    test("should show WASM error", async () => {
        renderCreate();
        globalSignals.setWasmSupported(false);
        expect(
            await screen.findAllByText(i18n.en.error_wasm),
        ).not.toBeUndefined();
    });

    test("should block creation when a quote resolves to zero", async () => {
        renderCreate();

        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        const currentPair = signals.pair();
        currentPair.calculateReceiveAmount = vi
            .fn(() => Promise.resolve(BigNumber(0)))
            .mockName("calculateReceiveAmount");

        signals.setAddressValid(true);
        signals.setOnchainAddress(
            "bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3",
        );

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: "100000" },
        });

        await waitFor(() => {
            expect(currentPair.calculateReceiveAmount).toHaveBeenCalled();
        });

        const button = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(signals.amountValid()).toBe(false);
            expect(button.disabled).toBe(true);
            expect(button.textContent).toBe(i18n.en.error_zero_quote);
        });
    });

    test("should block creation when a quote rejects", async () => {
        renderCreate();

        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        const currentPair = signals.pair();
        currentPair.calculateReceiveAmount = vi
            .fn(() => Promise.reject(new Error("quote failed")))
            .mockName("calculateReceiveAmount");

        signals.setAddressValid(true);
        signals.setOnchainAddress(
            "bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3",
        );

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: "100000" },
        });

        await waitFor(() => {
            expect(currentPair.calculateReceiveAmount).toHaveBeenCalled();
        });

        const button = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(signals.amountValid()).toBe(false);
            expect(button.disabled).toBe(true);
            expect(button.textContent).toBe(i18n.en.error_no_quote);
        });

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(button.textContent).not.toBe(i18n.en.error_no_quote);
        });
    });

    test("should reset the send amount when a receive-side quote rejects", async () => {
        renderCreate();

        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        const currentPair = signals.pair();
        currentPair.calculateSendAmount = vi
            .fn(() => Promise.reject(new Error("quote failed")))
            .mockName("calculateSendAmount");

        fireEvent.input(await screen.findByTestId("receiveAmount"), {
            target: { value: "100000" },
        });

        await waitFor(() => {
            expect(currentPair.calculateSendAmount).toHaveBeenCalled();
        });

        const button = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(signals.sendAmount().toString()).toBe("0");
            expect(signals.amountValid()).toBe(false);
            expect(button.textContent).toBe(i18n.en.error_no_quote);
        });
    });

    test("should ignore a stale quote rejection after a newer quote resolves", async () => {
        renderCreate();

        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        const currentPair = signals.pair();
        let rejectFirstQuote: ((reason: Error) => void) | undefined;
        const firstQuote = new Promise<BigNumber>((_, reject) => {
            rejectFirstQuote = reject;
        });

        currentPair.calculateReceiveAmount = vi
            .fn()
            .mockImplementationOnce(() => firstQuote)
            .mockImplementation(() => Promise.resolve(BigNumber(90_000)))
            .mockName("calculateReceiveAmount");

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: "100000" },
        });

        await waitFor(() => {
            expect(currentPair.calculateReceiveAmount).toHaveBeenCalledTimes(1);
        });

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: "200000" },
        });

        await waitFor(() => {
            expect(currentPair.calculateReceiveAmount).toHaveBeenCalledTimes(2);
            expect(signals.receiveAmount().toString()).toBe("90000");
        });

        rejectFirstQuote?.(new Error("quote failed"));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(signals.receiveAmount().toString()).toBe("90000");
        expect(signals.quoteError()).toBeUndefined();
        expect(signals.amountValid()).toBe(true);
    });

    test("should update receive amount on direction change", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        signals.setSendAmount(BigNumber(50_000));

        // To force trigger a recalculation
        setPairAssets(BTC, LN);
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(38110));
        });

        setPairAssets(BTC, LN);
        const expectedReceiveAmount = await signals
            .pair()
            .calculateReceiveAmount(BigNumber(50_000), signals.minerFee());

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(expectedReceiveAmount);
        });
        expect(expectedReceiveAmount).not.toEqual(BigNumber(38110));
    });

    test("should update receive amount on miner fee change", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        signals.setSendAmount(BigNumber(50_000));

        // To force trigger a recalculation
        setPairAssets(BTC, LN);
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(38110));
        });

        const updatedCfg = structuredClone(pairs);
        updatedCfg.reverse[BTC][BTC].fees.minerFees.claim += 1;
        globalSignals.setPairs(updatedCfg);

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(38110 - 1));
        });
    });

    test("should update calculated value on fee change", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        signals.setMinimum(pairs.reverse[BTC][BTC].limits.minimal);
        setPairAssets(LN, BTC);

        const updateConfig = () => {
            const updatedCfg = structuredClone(pairs);
            updatedCfg.reverse[BTC][BTC].fees.minerFees.claim += 1;
            globalSignals.setPairs(updatedCfg);
        };

        const amount = 100_000;
        fireEvent.input(await screen.findByTestId("receiveAmount"), {
            target: { value: amount },
        });

        await waitFor(() => {
            expect(signals.amountChanged()).toEqual(Side.Receive);
            expect(signals.sendAmount()).toEqual(BigNumber(112202));
            expect(signals.receiveAmount()).toEqual(BigNumber(amount));
        });

        updateConfig();

        await waitFor(() => {
            expect(signals.sendAmount()).toEqual(BigNumber(112203));
            expect(signals.receiveAmount()).toEqual(BigNumber(amount));
        });

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: amount },
        });

        await waitFor(() => {
            expect(signals.amountChanged()).toEqual(Side.Send);
            expect(signals.sendAmount()).toEqual(BigNumber(amount));
            expect(signals.receiveAmount()).toEqual(BigNumber(87859));
        });

        updateConfig();

        await waitFor(() => {
            expect(signals.sendAmount()).toEqual(BigNumber(amount));
            expect(signals.receiveAmount()).toEqual(BigNumber(87859));
        });
    });

    test.each`
        fromAsset | toAsset | swapType
        ${LN}     | ${BTC}  | ${SwapType.Reverse}
        ${BTC}    | ${LN}   | ${SwapType.Submarine}
    `(
        "should set max amount on click for $swapType swaps",
        async ({ fromAsset, toAsset, swapType }) => {
            renderCreate();

            globalSignals.setPairs(pairs);
            setPairAssets(fromAsset, toAsset);

            const expectedMaximum = await signals.pair().getMaximum();
            await waitFor(() => {
                expect(signals.maximum()).toEqual(expectedMaximum);
            });
            const amount = signals.maximum();

            fireEvent.click(await screen.findByTestId("limit-max-button"));

            await waitFor(() => {
                expect(signals.sendAmount()).toEqual(BigNumber(amount));
                expect(signals.receiveAmount()).toEqual(
                    calculateReceiveAmount(
                        BigNumber(amount),
                        signals.boltzFee(),
                        signals.minerFee(),
                        swapType as SwapType,
                    ),
                );
                expect(signals.amountValid()).toBe(true);
            });
        },
    );

    test("should hide the max button for a locked destination", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });
        expect(screen.getByTestId("limit-max-button")).toBeInTheDocument();

        signals.setDestinationLocked(true);

        await waitFor(() => {
            expect(screen.queryByTestId("limit-max-button")).toBeNull();
        });
        expect(
            (screen.getByTestId("sendAmount") as HTMLInputElement).disabled,
        ).toBe(true);
        expect(
            (screen.getByTestId("receiveAmount") as HTMLInputElement).disabled,
        ).toBe(true);
    });

    test("should prioritize amount errors", async () => {
        renderCreate();
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const sendAmountInput = await screen.findByTestId("sendAmount");
        fireEvent.input(sendAmountInput, {
            target: {
                value: `${pairs.reverse[BTC][BTC].limits.minimal}`,
            },
        });

        const addressButton = await screen.findByTestId("onchainAddress");
        fireEvent.input(addressButton, {
            target: {
                value: "invalid address",
            },
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        globalSignals.setOnline(true);

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toEqual(invalidBtcAddress);
        });

        fireEvent.input(sendAmountInput, {
            target: {
                value: "1",
            },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toEqual(i18n.en.error_zero_quote);
        });
    });

    test.each`
        fromAsset | toAsset | description
        ${LN}     | ${BTC}  | ${"reverse swap to BTC"}
        ${BTC}    | ${LN}   | ${"submarine swap from BTC"}
    `(
        "should show minimum amount error (not address/invoice) on initial page load for $description",
        async ({ fromAsset, toAsset }) => {
            renderCreate();
            globalSignals.setOnline(true);
            globalSignals.setPairs(pairs);
            setPairAssets(fromAsset, toAsset);

            await waitFor(() => {
                expect(signals.minimum()).toBeGreaterThan(0);
            });

            const createButton = (await screen.findByTestId(
                "create-swap-button",
            )) as HTMLButtonElement;

            await waitFor(() => {
                expect(createButton.disabled).toEqual(true);
                expect(createButton.textContent).toMatch(/^Minimum amount is /);
            });
        },
    );

    test("should show the maximum amount error above the maximum", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        globalSignals.setDenomination(Denomination.Sat);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: `${signals.maximum() + 1}` },
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(signals.amountValid()).toBe(false);
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toMatch(/^Maximum amount is /);
        });
    });

    test("should re-prioritize the minimum amount error after clearing the send amount (reverse swap)", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        const sendAmountInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;

        await waitFor(() => {
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });

        fireEvent.input(sendAmountInput, {
            target: {
                value: `${pairs.reverse[BTC][BTC].limits.minimal}`,
            },
        });

        await waitFor(() => {
            expect(createButton.textContent).toEqual(invalidBtcAddress);
        });

        fireEvent.input(sendAmountInput, {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });
    });

    test("should re-prioritize the minimum amount error after clearing the send amount (submarine swap)", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(BTC, LN);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        const sendAmountInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;

        await waitFor(() => {
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });

        fireEvent.input(sendAmountInput, {
            target: {
                value: `${signals.minimum()}`,
            },
        });

        await waitFor(() => {
            expect(createButton.textContent).toEqual(i18n.en.invalid_invoice);
        });

        fireEvent.input(sendAmountInput, {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });
    });

    test.each`
        invoiceValid
        ${true}
        ${false}
    `(
        "should clear a fixed invoice when the amount changes (invoice valid: $invoiceValid)",
        async ({ invoiceValid }) => {
            renderCreate();
            globalSignals.setOnline(true);
            globalSignals.setPairs(pairs);
            setPairAssets(BTC, LN);
            await waitFor(() => {
                expect(signals.minimum()).toBeGreaterThan(0);
            });

            signals.setInvoice(blake2bInvoice);
            signals.setInvoiceValid(invoiceValid as boolean);

            fireEvent.input(await screen.findByTestId("sendAmount"), {
                target: { value: `${signals.minimum()}` },
            });

            await waitFor(() => {
                expect(signals.invoice()).toBe("");
                expect(signals.invoiceValid()).toBe(false);
                expect(globalSignals.notification()).toBe(
                    i18n.en.invoice_cleared_amount_changed,
                );
                expect(globalSignals.notificationType()).toBe("success");
            });
        },
    );

    test("should keep an LNURL destination when the amount changes", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(BTC, LN);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        signals.setInvoice("test@lnurl.com");

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: `${signals.minimum()}` },
        });

        await waitFor(() => {
            expect(signals.sendAmount()).toEqual(BigNumber(signals.minimum()));
        });
        expect(signals.invoice()).toBe("test@lnurl.com");
        expect(globalSignals.notification()).not.toBe(
            i18n.en.invoice_cleared_amount_changed,
        );
    });

    test("should show invalid address error when amount is empty and an invalid address is entered", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        const addressInput = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        await waitFor(() => {
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });

        fireEvent.input(addressInput, {
            target: { value: "totally invalid address" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toEqual(invalidBtcAddress);
        });

        fireEvent.input(addressInput, {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });
    });

    test("should show invalid invoice error when amount is empty and an invalid invoice is entered", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(BTC, LN);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;
        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
        });

        fireEvent.input(invoiceInput, {
            target: { value: "totally invalid invoice" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toEqual(i18n.en.invalid_invoice);
        });

        fireEvent.input(invoiceInput, {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toMatch(/^Minimum amount is /);
            expect(screen.getByTestId("invoice")).toBeInTheDocument();
        });
    });

    test("should re-show invalid address error after clearing a previously entered destination address", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        const sendAmountInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;
        const addressInput = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(sendAmountInput, {
            target: {
                value: `${pairs.reverse[BTC][BTC].limits.minimal}`,
            },
        });

        fireEvent.input(addressInput, {
            target: { value: "totally invalid address" },
        });

        await waitFor(() => {
            expect(createButton.textContent).toEqual(invalidBtcAddress);
        });

        fireEvent.input(addressInput, {
            target: { value: "" },
        });

        await waitFor(() => {
            expect(createButton.disabled).toEqual(true);
            expect(createButton.textContent).toEqual(invalidBtcAddress);
        });
    });

    test("should enable creation of a reverse swap with a valid amount and address", async () => {
        renderCreate();
        globalSignals.setOnline(true);
        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.minimum()).toBeGreaterThan(0);
        });

        fireEvent.input(await screen.findByTestId("sendAmount"), {
            target: { value: `${pairs.reverse[BTC][BTC].limits.minimal}` },
        });
        fireEvent.input(await screen.findByTestId("onchainAddress"), {
            target: { value: "bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3" },
        });

        const createButton = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;

        await waitFor(() => {
            expect(signals.valid()).toBe(true);
            expect(createButton.disabled).toBe(false);
            expect(createButton.textContent).toEqual(i18n.en.create_swap);
        });
    });

    test("should allow comma in pasted amounts", async () => {
        renderCreate();
        globalSignals.setPairs(pairs);
        globalSignals.setSeparator(".");
        globalSignals.setDenomination(Denomination.Sat);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        const pasteEvent = new Event("paste");

        // @ts-expect-error clipboardData is injected manually
        pasteEvent.clipboardData = {
            getData: vi.fn(() => "0.01"),
        };

        const preventDefaultSpy = vi.fn();
        pasteEvent.preventDefault = preventDefaultSpy;

        const sendAmountInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;

        sendAmountInput.dispatchEvent(pasteEvent);
        fireEvent.input(sendAmountInput, {
            target: {
                value: `0,01`,
            },
        });

        expect(preventDefaultSpy).not.toHaveBeenCalled(); // no errors on onPaste
        await waitFor(() => {
            expect(globalSignals.denomination()).toEqual(Denomination.Btc);
            expect(globalSignals.separator()).toEqual(".");
            expect(sendAmountInput.value).toEqual("0.01");
        });
    });

    test("should allow space in pasted amounts", async () => {
        renderCreate();

        const amount = "50 000";

        globalSignals.setPairs(pairs);
        globalSignals.setDenomination(Denomination.Btc);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        const pasteEvent = new Event("paste");

        // @ts-expect-error clipboardData is injected manually
        pasteEvent.clipboardData = {
            getData: vi.fn(() => amount),
        };

        const preventDefaultSpy = vi.fn();
        pasteEvent.preventDefault = preventDefaultSpy;

        const sendAmountInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;

        sendAmountInput.dispatchEvent(pasteEvent);
        fireEvent.input(sendAmountInput, {
            target: {
                value: amount,
            },
        });

        expect(preventDefaultSpy).not.toHaveBeenCalled(); // no errors on onPaste
        await waitFor(() => {
            expect(globalSignals.denomination()).toEqual(Denomination.Sat);
            expect(sendAmountInput.value).toEqual(amount);
        });
    });

    test("should reject pasting an invalid amount", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        const pasteEvent = new Event("paste");

        // @ts-expect-error clipboardData is injected manually
        pasteEvent.clipboardData = {
            getData: vi.fn(() => "not an amount"),
        };

        const preventDefaultSpy = vi.fn();
        pasteEvent.preventDefault = preventDefaultSpy;

        (await screen.findByTestId("sendAmount")).dispatchEvent(pasteEvent);

        expect(preventDefaultSpy).toHaveBeenCalled();
        expect(globalSignals.notification()).toEqual(i18n.en.paste_invalid);
        expect(globalSignals.notificationType()).toEqual("error");
    });

    test("should drop maxlength on amount inputs when the pair is invalid", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        const sendInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;
        const receiveInput = (await screen.findByTestId(
            "receiveAmount",
        )) as HTMLInputElement;

        expect(sendInput.hasAttribute("maxlength")).toBe(true);
        expect(receiveInput.hasAttribute("maxlength")).toBe(true);

        // Fees.tsx zeros maximum when the pair is not routable
        setPairAssets(BTC, BTC);

        await waitFor(() => {
            expect(signals.maximum()).toEqual(0);
            expect(sendInput.hasAttribute("maxlength")).toBe(false);
            expect(receiveInput.hasAttribute("maxlength")).toBe(false);
        });

        signals.setMaximum(21_000_000);

        await waitFor(() => {
            expect(sendInput.hasAttribute("maxlength")).toBe(true);
            expect(receiveInput.hasAttribute("maxlength")).toBe(true);
        });
    });

    test("should allow typing past one digit when the pair is invalid", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        globalSignals.setDenomination(Denomination.Sat);
        setPairAssets(LN, BTC);

        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        signals.setMaximum(0);

        const sendInput = (await screen.findByTestId(
            "sendAmount",
        )) as HTMLInputElement;

        await waitFor(() => {
            expect(sendInput.hasAttribute("maxlength")).toBe(false);
        });

        fireEvent.input(sendInput, { target: { value: "123456" } });

        expect(sendInput.value).toBe("123 456");
    });

    test("should keep send amount at zero when receive amount is zero", async () => {
        renderCreate();

        globalSignals.setPairs(pairs);
        setPairAssets(LN, BTC);
        await waitFor(() => {
            expect(signals.maximum()).toBeGreaterThan(0);
        });

        const updateConfig = () => {
            const updatedCfg = structuredClone(pairs);
            updatedCfg.reverse[BTC][BTC].fees.minerFees.claim += 1;
            globalSignals.setPairs(updatedCfg);
        };

        fireEvent.input(await screen.findByTestId("receiveAmount"), {
            target: { value: "0" },
        });

        await waitFor(() => {
            expect(signals.amountChanged()).toEqual(Side.Receive);
            expect(signals.receiveAmount()).toEqual(BigNumber(0));
            expect(signals.sendAmount()).toEqual(BigNumber(0));
        });

        updateConfig();

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(0));
            expect(signals.sendAmount()).toEqual(BigNumber(0));
        });
    });

    test.each`
        mobile   | fromAsset | toAsset | visible
        ${true}  | ${BTC}    | ${LN}   | ${true}
        ${true}  | ${LN}     | ${BTC}  | ${true}
        ${false} | ${BTC}    | ${LN}   | ${false}
        ${false} | ${LN}     | ${BTC}  | ${false}
    `(
        "should show QR scanner for mobile: $mobile, toAsset: $toAsset -> $visible",
        async ({ mobile, fromAsset, toAsset, visible }) => {
            vi.mocked(isMobile).mockReturnValue(mobile as boolean);

            renderCreate();
            setPairAssets(fromAsset, toAsset);

            const buttonText = globalSignals.t("scan_qr_code");
            if (visible) {
                expect(await screen.findByText(buttonText)).not.toBeNull();
            } else {
                // Flush the async camera availability check before
                // asserting the scanner is absent
                await new Promise((resolve) => setTimeout(resolve, 0));
                expect(screen.queryByText(buttonText)).toBeNull();
            }
        },
    );

    test("should hide QR scanner for locked Lightning destinations on mobile", async () => {
        vi.mocked(isMobile).mockReturnValue(true);

        const LockedCreate = () => {
            const [showCreate, setShowCreate] = createSignal(false);

            onMount(() => {
                signals.setPair(new Pair(pairs, BTC, LN));
                signals.setDestinationLocked(true);
                setShowCreate(true);
            });

            return (
                <>
                    <TestComponent />
                    <Show when={showCreate()}>
                        <Create />
                    </Show>
                </>
            );
        };

        render(() => <LockedCreate />, {
            wrapper: contextWrapper,
        });

        await waitFor(() => {
            expect(signals.destinationLocked()).toBe(true);
        });

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(screen.queryByText(globalSignals.t("scan_qr_code"))).toBeNull();
        expect(screen.queryByTestId("invoice")).toBeNull();
    });
});
