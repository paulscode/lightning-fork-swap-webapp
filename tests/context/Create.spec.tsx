import { render, waitFor } from "@solidjs/testing-library";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";

import { BTC, LN } from "../../src/consts/Assets";
import Pair from "../../src/utils/Pair";
import {
    blake2bInvoice,
    invoiceAmount,
    sha256Invoice,
} from "../fixtures/invoices";
import { TestComponent, contextWrapper, signals } from "../helper";

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

afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
});

const regtestAddress = "bcrt1qgzzhsnvstqjd5nyr0u6fz706up6ap0jy4ajs3x";

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(signals.pair().pairs, fromAsset, toAsset));
};

const mockUrlParams = (params: Record<string, string | null | undefined>) =>
    vi
        .spyOn(URLSearchParams.prototype, "get")
        .mockImplementation((key) => params[key] ?? null);

describe("signals", () => {
    test("should default to a reverse swap from LN to BTC", () => {
        render(() => <TestComponent />, { wrapper: contextWrapper });

        expect(signals.pair().fromAsset).toEqual(LN);
        expect(signals.pair().toAsset).toEqual(BTC);
        expect(signals.pair().swapType).toEqual(SwapType.Reverse);
    });

    test.each`
        assetSend | assetReceive | expected
        ${LN}     | ${BTC}       | ${SwapType.Reverse}
        ${BTC}    | ${LN}        | ${SwapType.Submarine}
        ${BTC}    | ${BTC}       | ${undefined}
    `(
        "should set swap type to $expected based on $assetSend > $assetReceive",
        ({ assetSend, assetReceive, expected }) => {
            render(() => <TestComponent />, { wrapper: contextWrapper });
            setPairAssets(assetSend, assetReceive);
            expect(signals.pair().swapType).toEqual(expected);
        },
    );

    test.each`
        assetSend | assetReceive | amountValid | addressValid | invoiceValid | valid
        ${LN}     | ${BTC}       | ${true}     | ${true}      | ${false}     | ${true}
        ${LN}     | ${BTC}       | ${true}     | ${false}     | ${true}      | ${false}
        ${LN}     | ${BTC}       | ${false}    | ${true}      | ${false}     | ${false}
        ${BTC}    | ${LN}        | ${true}     | ${false}     | ${true}      | ${true}
        ${BTC}    | ${LN}        | ${true}     | ${true}      | ${false}     | ${false}
        ${BTC}    | ${LN}        | ${false}    | ${false}     | ${true}      | ${false}
        ${BTC}    | ${BTC}       | ${true}     | ${true}      | ${true}      | ${false}
    `(
        "should set valid to $valid for $assetSend > $assetReceive",
        ({
            assetSend,
            assetReceive,
            amountValid,
            addressValid,
            invoiceValid,
            valid,
        }) => {
            render(() => <TestComponent />, { wrapper: contextWrapper });
            signals.setAmountValid(amountValid);
            signals.setAddressValid(addressValid);
            signals.setInvoiceValid(invoiceValid);
            setPairAssets(assetSend, assetReceive);
            expect(signals.valid()).toEqual(valid);
        },
    );

    test.each`
        sendAsset | receiveAsset | amount
        ${LN}     | ${BTC}       | ${1000000}
        ${BTC}    | ${LN}        | ${1000000}
        ${BTC}    | ${LN}        | ${0}
    `(
        "should set assets $sendAsset > $receiveAsset based on urlParams",
        ({ sendAsset, receiveAsset, amount }) => {
            mockUrlParams({
                sendAsset,
                receiveAsset,
                sendAmount: String(amount),
            });

            render(() => <TestComponent />, { wrapper: contextWrapper });

            expect(signals.pair().fromAsset).toEqual(sendAsset);
            expect(signals.pair().toAsset).toEqual(receiveAsset);
            expect(Number(signals.sendAmount())).toEqual(amount);
        },
    );

    test("should set the receive amount from urlParams when no send amount is set", () => {
        mockUrlParams({
            sendAsset: BTC,
            receiveAsset: LN,
            receiveAmount: "250000",
        });

        render(() => <TestComponent />, { wrapper: contextWrapper });

        expect(Number(signals.receiveAmount())).toEqual(250_000);
        expect(Number(signals.sendAmount())).toEqual(0);
    });

    test.each(["L-BTC", "RBTC", "USDT0"])(
        "should ignore unsupported asset %s in urlParams",
        (asset) => {
            mockUrlParams({ sendAsset: asset, receiveAsset: asset });

            render(() => <TestComponent />, { wrapper: contextWrapper });

            expect(signals.pair().fromAsset).toEqual(LN);
            expect(signals.pair().toAsset).toEqual(BTC);
        },
    );

    test.each`
        receiveAsset | destination         | expectedReceiveAsset
        ${BTC}       | ${"test@lnurl.com"} | ${LN}
        ${BTC}       | ${blake2bInvoice}   | ${LN}
        ${LN}        | ${regtestAddress}   | ${BTC}
    `(
        "should have destination $destination taking precedence over receiveAsset",
        ({ receiveAsset, destination, expectedReceiveAsset }) => {
            mockUrlParams({ receiveAsset, destination });

            render(() => <TestComponent />, { wrapper: contextWrapper });

            expect(signals.pair().toAsset).toEqual(expectedReceiveAsset);
            if (expectedReceiveAsset === LN) {
                expect(signals.invoice()).toEqual(destination);
                expect(signals.invoiceValid()).toEqual(true);
            } else {
                expect(signals.onchainAddress()).toEqual(destination);
                expect(signals.addressValid()).toEqual(true);
            }
        },
    );

    test("should keep an unparsable destination for a BTC receive asset but mark it invalid", () => {
        mockUrlParams({ receiveAsset: BTC, destination: "notanaddress" });

        render(() => <TestComponent />, { wrapper: contextWrapper });

        expect(signals.pair().toAsset).toEqual(BTC);
        expect(signals.onchainAddress()).toEqual("notanaddress");
        expect(signals.addressValid()).toEqual(false);
    });

    test("should take the receive amount from an invoice destination", () => {
        mockUrlParams({ destination: blake2bInvoice, sendAmount: "999999" });

        render(() => <TestComponent />, { wrapper: contextWrapper });

        expect(Number(signals.receiveAmount())).toEqual(invoiceAmount);
        expect(Number(signals.sendAmount())).toEqual(0);
    });

    test.each`
        embedded  | description
        ${"true"} | ${"embedded mode"}
        ${null}   | ${"non-embedded mode"}
    `(
        "should set destinationLocked with lockOutput + bolt11 destination in $description",
        async ({ embedded }: { embedded: string | null }) => {
            mockUrlParams({
                destination: blake2bInvoice,
                lockOutput: "true",
                embedded,
            });

            render(() => <TestComponent />, { wrapper: contextWrapper });

            await waitFor(() => {
                expect(signals.destinationLocked()).toBe(true);
            });

            expect(signals.pair().toAsset).toEqual(LN);
            expect(signals.invoice()).toEqual(blake2bInvoice);
            expect(signals.invoiceValid()).toEqual(true);
            expect(Number(signals.receiveAmount())).toEqual(invoiceAmount);
        },
    );

    test("should not set destinationLocked when lockOutput is missing", async () => {
        mockUrlParams({ destination: blake2bInvoice, embedded: "true" });

        render(() => <TestComponent />, { wrapper: contextWrapper });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(blake2bInvoice);
        });
        expect(signals.destinationLocked()).toBe(false);
    });

    test("should not lock or take the amount of an invoice without the BLAKE2b feature bit", async () => {
        mockUrlParams({ destination: sha256Invoice, lockOutput: "true" });

        render(() => <TestComponent />, { wrapper: contextWrapper });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(sha256Invoice);
        });
        expect(signals.destinationLocked()).toBe(false);
        expect(Number(signals.receiveAmount())).toEqual(0);
    });

    test("should reset amounts", () => {
        render(() => <TestComponent />, { wrapper: contextWrapper });

        signals.setSendAmount(signals.sendAmount().plus(100));
        signals.setReceiveAmount(signals.receiveAmount().plus(50));
        signals.setAmountValid(true);
        signals.setQuoteError("invalid_pair");

        signals.resetAmounts();

        expect(Number(signals.sendAmount())).toEqual(0);
        expect(Number(signals.receiveAmount())).toEqual(0);
        expect(signals.sendAmountFormatted()).toEqual("");
        expect(signals.receiveAmountFormatted()).toEqual("");
        expect(signals.amountValid()).toEqual(false);
        expect(signals.quoteError()).toBeUndefined();
    });
});
