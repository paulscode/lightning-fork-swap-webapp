import { render, screen, waitFor } from "@solidjs/testing-library";
import { BigNumber } from "bignumber.js";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";

import CreateButton from "../../src/components/CreateButton";
import { config } from "../../src/config";
import { BTC, LN } from "../../src/consts/Assets";
import { Side } from "../../src/consts/Enums";
import { useCreateContext } from "../../src/context/Create";
import { useGlobalContext } from "../../src/context/Global";
import i18n from "../../src/i18n/i18n";
import Pair from "../../src/utils/Pair";
import { generateRescueFile } from "../../src/utils/rescueFile";
import type * as SwapCreatorModule from "../../src/utils/swapCreator";
import type * as ValidationModule from "../../src/utils/validation";
import { blake2bInvoice, sha256Invoice } from "../fixtures/invoices";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    signals,
} from "../helper";
import { pairs as testPairs } from "../pairs";

const { createSubmarineMock, createReverseMock, validateResponseMock } =
    vi.hoisted(() => ({
        createSubmarineMock: vi.fn(),
        createReverseMock: vi.fn(),
        validateResponseMock: vi.fn(),
    }));

// bolt11 signature recovery rejects the Uint8Arrays of the jsdom realm, so
// decode the fixture invoices by hand, keeping the BLAKE2b feature check
vi.mock("boltz-swaps/invoice", async (importOriginal) => {
    const original = await importOriginal<typeof InvoiceModule>();
    const fixtures = await import("../fixtures/invoices");

    return {
        ...original,
        decodeInvoice: vi.fn((invoice: string) => {
            if (invoice === fixtures.sha256Invoice) {
                throw new original.MissingBlake2bFeatureError();
            }
            if (invoice !== fixtures.blake2bInvoice) {
                throw new Error("invalid invoice");
            }

            return {
                type: original.InvoiceType.Bolt11,
                satoshis: fixtures.invoiceAmount,
                preimageHash: "00".repeat(32),
            };
        }),
    };
});

vi.mock("../../src/utils/validation", async (importActual) => ({
    ...(await importActual<typeof ValidationModule>()),
    validateResponse: validateResponseMock,
}));

vi.mock("../../src/utils/swapCreator", async (importActual) => ({
    ...(await importActual<typeof SwapCreatorModule>()),
    createSubmarine: createSubmarineMock,
    createReverse: createReverseMock,
}));

const claimAddress = "bcrt1qfan5dacdvedpzmweqcq0swxg7klhsh4d0qn74u";

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(globalSignals.pairs(), fromAsset, toAsset));
};

const renderCreateButton = () =>
    render(
        () => (
            <>
                <TestComponent />
                <CreateButton />
            </>
        ),
        { wrapper: contextWrapper },
    );

const minimumLabel = (amount: string) =>
    i18n.en.minimum_amount
        .replace("{{ amount }}", amount)
        .replace("{{ denomination }}", "sats");

const lnurlResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

// Serves a Lightning address that allows 100 to 200 sat or, with a
// callback, pays out the given invoice
const stubLnurl = (pr?: string) => {
    const fetchMock = vi.fn((url: string) => {
        if (url.includes("/.well-known/lnurlp/")) {
            return Promise.resolve(
                lnurlResponse(
                    pr === undefined
                        ? { minSendable: 100_000, maxSendable: 200_000 }
                        : {
                              minSendable: 1_000,
                              maxSendable: 200_000_000,
                              callback: "https://example.com/cb",
                          },
                ),
            );
        }
        if (url.startsWith("https://example.com/cb")) {
            return Promise.resolve(lnurlResponse({ pr }));
        }
        return Promise.resolve(new Response("nope", { status: 500 }));
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
};

const setupLnurl = async (sendAmount: number, receiveAmount: number) => {
    renderCreateButton();
    globalSignals.setOnline(true);
    signals.setSendAmount(BigNumber(sendAmount));
    signals.setReceiveAmount(BigNumber(receiveAmount));
    signals.setAmountValid(true);
    setPairAssets(BTC, LN);
    signals.setLnurl("test@example.com");

    const btn = (await screen.findByText(
        i18n.en.create_swap,
    )) as HTMLButtonElement;
    expect(btn.disabled).toBeFalsy();
    return btn;
};

describe("CreateButton", () => {
    beforeEach(() => {
        window.history.pushState({}, "", "/");
        validateResponseMock.mockResolvedValue(undefined);
        createSubmarineMock.mockImplementation(
            (
                assetSend: string,
                assetReceive: string,
                sendAmount: BigNumber,
                receiveAmount: BigNumber,
                invoice: string,
            ) =>
                Promise.resolve({
                    id: "submarine",
                    type: SwapType.Submarine,
                    assetSend,
                    assetReceive,
                    sendAmount: sendAmount.toNumber(),
                    receiveAmount: receiveAmount.toNumber(),
                    invoice,
                    address: claimAddress,
                    version: 1,
                    date: 0,
                }),
        );
        createReverseMock.mockImplementation(
            (
                assetSend: string,
                assetReceive: string,
                sendAmount: BigNumber,
                receiveAmount: BigNumber,
                claim: string,
            ) =>
                Promise.resolve({
                    id: "reverse",
                    type: SwapType.Reverse,
                    assetSend,
                    assetReceive,
                    sendAmount: sendAmount.toNumber(),
                    receiveAmount: receiveAmount.toNumber(),
                    claimAddress: claim,
                    lockupAddress: claimAddress,
                    version: 1,
                    date: 0,
                }),
        );
    });

    afterEach(() => {
        vi.clearAllMocks();
        vi.unstubAllGlobals();
    });

    test("should show a loading spinner while pairs are loading", async () => {
        render(() => <CreateButton />, { wrapper: contextWrapper });

        const btn = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
        expect(btn.classList.contains("btn-danger")).toBe(false);
        expect(btn.classList.contains("btn-error")).toBe(false);

        expect(await screen.findByTestId("loading-spinner")).not.toBeNull();
        expect(screen.queryByText(i18n.en.invalid_pair)).toBeNull();
    });

    test("should clear spinner and show label once pairs load", async () => {
        let global: ReturnType<typeof useGlobalContext> | undefined;
        let create: ReturnType<typeof useCreateContext> | undefined;
        const Capture = () => {
            global = useGlobalContext();
            create = useCreateContext();
            return null;
        };

        render(
            () => (
                <>
                    <Capture />
                    <CreateButton />
                </>
            ),
            { wrapper: contextWrapper },
        );

        expect(await screen.findByTestId("loading-spinner")).not.toBeNull();

        global!.setPairs(testPairs);
        create!.setMinimum(50_000);

        expect(await screen.findByText(minimumLabel("50 000"))).not.toBeNull();
        expect(screen.queryByTestId("loading-spinner")).toBeNull();
    });

    test("should initially be disabled with minimum label", async () => {
        renderCreateButton();
        signals.setMinimum(50_000);

        const btn = (await screen.findByText(
            minimumLabel("50 000"),
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
        expect(btn.classList.contains("btn-error")).toBe(false);
    });

    test("should apply btn-error class for maximum_amount", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        setPairAssets(BTC, LN);
        signals.setSendAmount(BigNumber(250_000));
        signals.setReceiveAmount(BigNumber(200_000));
        signals.setMinimum(50_000);
        signals.setMaximum(200_000);
        signals.setAmountValid(false);
        signals.setInvoice(blake2bInvoice);
        signals.setInvoiceValid(true);

        const btn = (await screen.findByText(
            i18n.en.maximum_amount
                .replace("{{ amount }}", "200 000")
                .replace("{{ denomination }}", "sats"),
        )) as HTMLButtonElement;
        expect(btn.classList.contains("btn-error")).toBe(true);
        expect(btn.classList.contains("btn-danger")).toBe(false);
    });

    test("should be enabled with create_swap label", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        setPairAssets(LN, BTC);
        signals.setAmountValid(true);
        signals.setAddressValid(true);
        signals.setOnchainAddress(claimAddress);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeFalsy();
    });

    test("should be disabled with api_offline label", async () => {
        renderCreateButton();
        globalSignals.setOnline(false);

        const btn = (await screen.findByText(
            i18n.en.api_offline,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
        expect(btn.classList.contains("btn-danger")).toBe(true);
    });

    test("should be disabled on invalid address", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        signals.setAddressValid(true);
        setPairAssets(LN, BTC);
        signals.setOnchainAddress(claimAddress);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeFalsy();

        signals.setAddressValid(false);
        expect(btn.disabled).toBeTruthy();
        expect(btn.textContent).toEqual(
            i18n.en.invalid_address.replace("{{ asset }}", BTC),
        );
    });

    test("should be disabled on empty address", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        setPairAssets(LN, BTC);
        signals.setOnchainAddress("");

        const btn = (await screen.findByText(
            i18n.en.invalid_address.replace("{{ asset }}", BTC),
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
    });

    test("should be disabled on invalid invoice", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        signals.setInvoiceValid(true);
        setPairAssets(BTC, LN);
        signals.setInvoice(blake2bInvoice);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeFalsy();

        signals.setInvoiceValid(false);
        expect(btn.disabled).toBeTruthy();
        expect(btn.textContent).toEqual(i18n.en.invalid_invoice);
    });

    test("should show invoice errors like invalid_0_amount", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        signals.setInvoiceValid(true);
        setPairAssets(BTC, LN);
        signals.setInvoice(blake2bInvoice);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;

        signals.setInvoiceValid(false);
        signals.setInvoiceError("invalid_0_amount");
        expect(btn.disabled).toBeTruthy();
        expect(btn.textContent).toEqual(i18n.en.invalid_0_amount);
        expect(btn.classList.contains("btn-error")).toBe(true);

        // The invoice error wins over the amount error
        signals.setAmountValid(false);
        expect(btn.textContent).toEqual(i18n.en.invalid_0_amount);
    });

    test("should show invoice_missing_blake2b as a user error", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        setPairAssets(BTC, LN);
        signals.setInvoice(sha256Invoice);
        signals.setInvoiceValid(false);
        signals.setInvoiceError("invoice_missing_blake2b");

        const btn = (await screen.findByText(
            i18n.en.invoice_missing_blake2b,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
        expect(btn.classList.contains("btn-error")).toBe(true);
    });

    test("should be disabled on empty invoice", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        signals.setInvoiceValid(true);
        setPairAssets(BTC, LN);
        signals.setInvoice("");

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        expect(btn.disabled).toBeTruthy();
    });

    test("should show btn-error for invalid pairs", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        signals.setSendAmount(BigNumber(100_000));
        signals.setAmountValid(true);
        signals.setQuoteLoading(true);
        setPairAssets(BTC, BTC);

        const btn = (await screen.findByTestId(
            "create-swap-button",
        )) as HTMLButtonElement;
        await waitFor(() => {
            expect(btn.textContent).toBe(i18n.en.invalid_pair);
        });
        expect(btn.classList.contains("btn-error")).toBe(true);
        expect(btn.classList.contains("btn-danger")).toBe(false);
        // No spinner for pairs that cannot be routed
        expect(screen.queryByTestId("loading-spinner")).toBeNull();
    });

    test("should show invalid_send_asset for assets that cannot be sent", async () => {
        const btcConfig = config.assets![BTC];
        config.assets![BTC] = { ...btcConfig, canSend: false };

        try {
            renderCreateButton();
            globalSignals.setOnline(true);
            signals.setSendAmount(BigNumber(100_000));
            signals.setAmountValid(true);
            setPairAssets(BTC, LN);

            const btn = (await screen.findByTestId(
                "create-swap-button",
            )) as HTMLButtonElement;
            await waitFor(() => {
                expect(btn.textContent).toBe(i18n.en.invalid_send_asset);
            });
            expect(btn.classList.contains("btn-error")).toBe(true);

            // Offline takes precedence over user errors
            globalSignals.setOnline(false);
            await waitFor(() => {
                expect(btn.textContent).toBe(i18n.en.api_offline);
            });
            expect(btn.classList.contains("btn-danger")).toBe(true);
            expect(btn.classList.contains("btn-error")).toBe(false);
        } finally {
            config.assets![BTC] = btcConfig;
        }
    });

    test("should create a submarine swap", async () => {
        renderCreateButton();
        globalSignals.setOnline(true);
        setPairAssets(BTC, LN);
        signals.setSendAmount(BigNumber(106_900));
        signals.setReceiveAmount(BigNumber(100_000));
        signals.setAmountChanged(Side.Send);
        signals.setAmountValid(true);
        signals.setInvoice(blake2bInvoice);
        signals.setInvoiceValid(true);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        btn.click();

        await waitFor(() => {
            expect(window.location.pathname).toEqual("/swap/submarine");
        });
        expect(createSubmarineMock).toHaveBeenCalledTimes(1);
        expect(createSubmarineMock).toHaveBeenCalledWith(
            BTC,
            BTC,
            BigNumber(106_900),
            BigNumber(100_000),
            blake2bInvoice,
            testPairs.submarine[BTC][BTC].hash,
            expect.any(Function),
            undefined,
        );
        expect(createReverseMock).not.toHaveBeenCalled();
        expect(validateResponseMock).toHaveBeenCalledTimes(1);
        expect(await globalSignals.getSwap("submarine")).not.toBeNull();
        expect(signals.invoice()).toEqual("");
        expect(signals.invoiceValid()).toEqual(false);
    });

    test("should create a reverse swap", async () => {
        renderCreateButton();
        const rescueFile = generateRescueFile();
        globalSignals.setRescueFile(rescueFile);
        globalSignals.setOnline(true);
        setPairAssets(LN, BTC);
        signals.setSendAmount(BigNumber(112_202));
        signals.setReceiveAmount(BigNumber(100_000));
        signals.setAmountChanged(Side.Send);
        signals.setAmountValid(true);
        signals.setOnchainAddress(claimAddress);
        signals.setAddressValid(true);

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        btn.click();

        await waitFor(() => {
            expect(window.location.pathname).toEqual("/swap/reverse");
        });
        expect(createReverseMock).toHaveBeenCalledTimes(1);
        expect(createReverseMock).toHaveBeenCalledWith(
            BTC,
            BTC,
            BigNumber(112_202),
            BigNumber(100_000),
            claimAddress,
            testPairs.reverse[BTC][BTC].hash,
            rescueFile,
            expect.any(Function),
            claimAddress,
        );
        expect(createSubmarineMock).not.toHaveBeenCalled();
        expect(signals.onchainAddress()).toEqual("");
        expect(signals.addressValid()).toEqual(false);
    });

    test("should not create a swap when validating the response fails", async () => {
        validateResponseMock.mockRejectedValue(new Error("invalid"));

        renderCreateButton();
        globalSignals.setOnline(true);
        setPairAssets(BTC, LN);
        signals.setSendAmount(BigNumber(106_900));
        signals.setAmountValid(true);
        signals.setInvoice(blake2bInvoice);
        signals.setInvoiceValid(true);

        await globalSignals.clearSwaps();

        const btn = (await screen.findByText(
            i18n.en.create_swap,
        )) as HTMLButtonElement;
        btn.click();

        await waitFor(() => {
            expect(window.location.pathname).toEqual("/error");
        });
        expect(await globalSignals.getSwap("submarine")).toBeNull();
    });

    test("should be disabled with LNURL min amount error", async () => {
        stubLnurl();
        const btn = await setupLnurl(90, 80);
        btn.click();

        const errorBtn = (await screen.findByText(
            i18n.en.min_amount_destination
                .replace("{{ amount }}", "100")
                .replace("{{ denomination }}", "sats"),
        )) as HTMLButtonElement;
        expect(errorBtn.disabled).toBeTruthy();
        expect(errorBtn.classList.contains("btn-error")).toBe(true);
        expect(errorBtn.classList.contains("btn-danger")).toBe(false);
    });

    test("should be disabled with LNURL max amount error", async () => {
        stubLnurl();
        const btn = await setupLnurl(400, 300);
        btn.click();

        const errorBtn = (await screen.findByText(
            i18n.en.max_amount_destination
                .replace("{{ amount }}", "200")
                .replace("{{ denomination }}", "sats"),
        )) as HTMLButtonElement;
        expect(errorBtn.disabled).toBeTruthy();
        expect(errorBtn.classList.contains("btn-error")).toBe(true);
    });

    test("should resolve an LNURL invoice on click and store it", async () => {
        const fetchMock = stubLnurl(blake2bInvoice);
        const btn = await setupLnurl(1_300, 1_234);
        btn.click();

        await waitFor(() => expect(signals.lnurl()).toBe(""));
        expect(fetchMock).toHaveBeenCalledWith(
            "https://example.com/cb?amount=1234000",
            expect.anything(),
        );
        await waitFor(() => {
            expect(createSubmarineMock).toHaveBeenCalledTimes(1);
        });
        expect(createSubmarineMock.mock.calls[0][4]).toEqual(blake2bInvoice);
        expect(createSubmarineMock.mock.calls[0][7]).toEqual(
            "test@example.com",
        );
    });

    test("should refuse an LNURL invoice without the BLAKE2b feature bit", async () => {
        stubLnurl(sha256Invoice);
        const btn = await setupLnurl(1_300, 1_234);
        btn.click();

        const errorBtn = (await screen.findByText(
            i18n.en.invoice_missing_blake2b,
        )) as HTMLButtonElement;
        expect(errorBtn.disabled).toBeTruthy();
        expect(errorBtn.classList.contains("btn-error")).toBe(true);
        expect(signals.invoice()).toBe("");
        expect(signals.invoiceValid()).toBe(false);
        expect(signals.lnurl()).toBe("test@example.com");
        expect(createSubmarineMock).not.toHaveBeenCalled();
    });

    test("should recover to an enabled button when the LNURL fetch fails", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() =>
                Promise.resolve(
                    lnurlResponse({ status: "ERROR", reason: "no user" }, 404),
                ),
            ),
        );
        const btn = await setupLnurl(400, 300);
        signals.setInvoiceValid(true);
        btn.click();

        await waitFor(() => expect(signals.invoiceValid()).toBe(false));
        await waitFor(() => expect(btn.disabled).toBeFalsy());
        expect(btn.textContent).toBe(i18n.en.create_swap);
        expect(signals.lnurl()).toBe("test@example.com");
        expect(signals.invoice()).toBe("");
    });
});
