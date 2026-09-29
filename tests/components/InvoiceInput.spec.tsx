import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { BigNumber } from "bignumber.js";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { vi } from "vitest";

import InvoiceInput from "../../src/components/InvoiceInput";
import { BTC, LN } from "../../src/consts/Assets";
import dict from "../../src/i18n/i18n";
import Pair from "../../src/utils/Pair";
import { extractInvoice, invoicePrefix } from "../../src/utils/invoice";
import {
    blake2bInvoice,
    invoiceAmount,
    sha256Invoice,
} from "../fixtures/invoices";
import { TestComponent, contextWrapper, signals } from "../helper";

const zeroAmountInvoice = "lnbcrt1zeroamount";
const staleQuoteInvoice = "lnbcrt1stalequote";

// Under jsdom, bolt11's signature recovery rejects its own Buffers (the
// Uint8Array check sees a different realm), so real invoices cannot be decoded
// here. This stand-in behaves like the SDK's decodeInvoice for the fixtures:
// it accepts the BLAKE2b-chain invoice and throws the SDK's
// MissingBlake2bFeatureError for the SHA256-chain one. The real decoding of
// both fixtures is covered in tests/utils/validation.spec.ts.
vi.mock("boltz-swaps/invoice", async (importOriginal) => {
    const actual = await importOriginal<typeof InvoiceModule>();
    const fixtures = await import("../fixtures/invoices");
    return {
        ...actual,
        decodeInvoice: vi.fn((input: string) => {
            const decoded = (satoshis: number) => ({
                type: actual.InvoiceType.Bolt11,
                satoshis,
                preimageHash: "00".repeat(32),
            });
            switch (input) {
                case fixtures.blake2bInvoice:
                    return decoded(fixtures.invoiceAmount);
                case fixtures.sha256Invoice:
                    throw new actual.MissingBlake2bFeatureError();
                case "lnbcrt1zeroamount":
                    return decoded(0);
                case "lnbcrt1stalequote":
                    return decoded(1000);
                default:
                    throw new Error("invalid invoice");
            }
        }),
    };
});

afterEach(() => {
    localStorage.clear();
});

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(signals.pair().pairs, fromAsset, toAsset));
};

describe("InvoiceInput", () => {
    test.each`
        expected | invoice
        ${true}  | ${blake2bInvoice}
        ${true}  | ${`${invoicePrefix}${blake2bInvoice}`}
        ${true}  | ${blake2bInvoice.toUpperCase()}
        ${false} | ${sha256Invoice}
        ${false} | ${"m@some.domain"}
        ${false} | ${"lnurl1dp68gurn8ghj7mrww4exctndd93ksct9dscnqvf39eshgtmpwp5j7mrww4excuqgy84zh"}
        ${false} | ${"invalid"}
        ${false} | ${""}
    `("should validate invoice $invoice", async ({ invoice, expected }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );
        setPairAssets(BTC, LN);
        fireEvent.input(await screen.findByTestId("invoice"), {
            target: { value: invoice },
        });

        await waitFor(() => {
            expect(signals.invoiceValid()).toEqual(expected);
        });
    });

    test.each`
        lnurl
        ${"m@some.domain"}
        ${"lnurl1dp68gurn8ghj7mrww4exctndd93ksct9dscnqvf39eshgtmpwp5j7mrww4excuqgy84zh"}
    `("should not clear lnurl $lnurl on amount change", async ({ lnurl }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );
        setPairAssets(BTC, LN);

        const input = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(input, {
            target: { value: lnurl },
        });

        await waitFor(() => {
            expect(signals.lnurl()).toEqual(lnurl.toLowerCase());
        });

        signals.setSendAmount(signals.sendAmount().plus(1));

        expect(input.value).toEqual(lnurl);
    });

    test.each`
        lnurl
        ${`${invoicePrefix}m@some.domain`}
        ${`${invoicePrefix}lnurl1dp68gurn8ghj7mrww4exctndd93ksct9dscnqvf39eshgtmpwp5j7mrww4excuqgy84zh`}
    `("should remove prefix of lnurl $lnurl", async ({ lnurl }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );
        setPairAssets(BTC, LN);

        const input = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(input, {
            target: { value: lnurl },
        });

        await waitFor(() => {
            expect(signals.lnurl()).toEqual(extractInvoice(lnurl));
        });
    });

    test.each`
        asset  | input
        ${BTC} | ${"bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3"}
        ${BTC} | ${"2NDkcnHAnugU1aQ5bv522MeZTgv6tQs2rt8"}
    `("should switch asset based on input $input", async ({ asset, input }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(invoiceInput, {
            target: { value: input },
        });

        await waitFor(() => {
            expect(signals.pair().fromAsset).toEqual(LN);
            expect(signals.pair().toAsset).toEqual(asset);
        });
        expect(signals.onchainAddress()).toEqual(input);
    });

    test("should extract the lightning invoice from a BIP21 URI", async () => {
        const bip21Uri = `bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.00001&label=lunch&lightning=${blake2bInvoice}`;

        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(BTC, LN);

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(invoiceInput, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(blake2bInvoice);
            expect(signals.invoiceValid()).toEqual(true);
            expect(signals.receiveAmount()).toEqual(BigNumber(invoiceAmount));
        });
    });

    test("should reject a SHA256-chain invoice inside a BIP21 URI", async () => {
        const bip21Uri = `bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?lightning=${sha256Invoice}`;

        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(BTC, LN);

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(invoiceInput, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.invoiceError()).toEqual("invoice_missing_blake2b");
            expect(signals.invoiceValid()).toEqual(false);
        });
        // The lightning invoice takes precedence over the on-chain address
        expect(signals.pair().toAsset).toEqual(LN);
    });

    test("should extract address from BIP21 URI and switch to on-chain", async () => {
        const bip21Uri = "bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm";
        const expectedAddress = "bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm";

        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(BTC, LN);

        signals.setReceiveAmount(BigNumber(5000));

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(invoiceInput, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.onchainAddress()).toEqual(expectedAddress);
            expect(signals.pair().toAsset).toEqual(BTC);
        });
        // An amountless BIP21 URI must not reset the amounts
        expect(signals.receiveAmount().toNumber()).toEqual(5000);
    });

    test.each`
        amount
        ${BigNumber(0)}
        ${BigNumber(50_000)}
    `(
        "should show invalid_0_amount for amountless invoice with receiveAmount=$amount",
        async ({ amount }) => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <InvoiceInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );

            setPairAssets(BTC, LN);
            signals.setReceiveAmount(amount);

            const input = (await screen.findByTestId(
                "invoice",
            )) as HTMLInputElement;

            fireEvent.input(input, {
                target: { value: zeroAmountInvoice },
            });

            await waitFor(() => {
                expect(signals.invoiceValid()).toEqual(false);
                expect(signals.invoiceError()).toEqual("invalid_0_amount");
                expect(input.value).not.toEqual("");
            });
        },
    );

    test.each`
        input
        ${"bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"}
        ${"not an invoice"}
    `("should reject $input without switching direction", async ({ input }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(BTC, LN);

        const invoiceInput = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(invoiceInput, {
            target: { value: input },
        });

        await waitFor(() => {
            expect(signals.pair().fromAsset).toEqual(BTC);
            expect(signals.pair().toAsset).toEqual(LN);
            expect(signals.onchainAddress()).toEqual("");
            expect(signals.invoiceValid()).toEqual(false);
            expect(signals.invoiceError()).toEqual("invalid_invoice");
            expect(invoiceInput.className).toContain("invalid");
        });
    });

    describe("BLAKE2b feature bit", () => {
        const renderInput = async () => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <InvoiceInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );
            setPairAssets(BTC, LN);

            return (await screen.findByTestId("invoice")) as HTMLInputElement;
        };

        test("rejects a pasted SHA256-chain invoice with invoice_missing_blake2b", async () => {
            const input = await renderInput();

            fireEvent.input(input, {
                target: { value: sha256Invoice },
            });

            await waitFor(() => {
                expect(signals.invoiceError()).toEqual(
                    "invoice_missing_blake2b",
                );
            });
            expect(signals.invoiceValid()).toEqual(false);
            expect(input.className).toContain("invalid");
            expect(input.validationMessage).toEqual(
                dict.en.invoice_missing_blake2b,
            );
            // The pasted invoice stays visible so the user sees what was wrong
            expect(input.value).toEqual(sha256Invoice);
        });

        test("rejects a SHA256-chain invoice with a lightning: prefix", async () => {
            const input = await renderInput();

            fireEvent.input(input, {
                target: { value: `${invoicePrefix}${sha256Invoice}` },
            });

            await waitFor(() => {
                expect(signals.invoiceError()).toEqual(
                    "invoice_missing_blake2b",
                );
            });
            expect(signals.invoiceValid()).toEqual(false);
        });

        test("accepts a pasted BLAKE2b-chain invoice", async () => {
            const input = await renderInput();

            fireEvent.input(input, {
                target: { value: blake2bInvoice },
            });

            await waitFor(() => {
                expect(signals.invoiceValid()).toEqual(true);
            });
            expect(signals.invoiceError()).toBeUndefined();
            expect(signals.invoice()).toEqual(blake2bInvoice);
            expect(signals.receiveAmount()).toEqual(BigNumber(invoiceAmount));
            expect(input.className).not.toContain("invalid");
            expect(input.validationMessage).toEqual("");
        });

        test("clears the error when a SHA256-chain invoice is replaced by a BLAKE2b one", async () => {
            const input = await renderInput();

            fireEvent.input(input, {
                target: { value: sha256Invoice },
            });
            await waitFor(() => {
                expect(signals.invoiceError()).toEqual(
                    "invoice_missing_blake2b",
                );
            });

            fireEvent.input(input, {
                target: { value: blake2bInvoice },
            });
            await waitFor(() => {
                expect(signals.invoiceValid()).toEqual(true);
            });
            expect(signals.invoiceError()).toBeUndefined();
            expect(input.className).not.toContain("invalid");
        });
    });

    test("should ignore stale quote results when invoice validation reruns", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(BTC, LN);

        const currentPair = signals.pair();
        const pendingZeroFeeQuotes: Array<(value: BigNumber) => void> = [];

        currentPair.calculateSendAmount = vi.fn((amount, fee) => {
            if (fee === 0) {
                return new Promise((resolve) => {
                    pendingZeroFeeQuotes.push(resolve);
                });
            }

            if (fee === 1) {
                return Promise.resolve(BigNumber(2_222));
            }

            return Promise.resolve(amount);
        });

        const input = (await screen.findByTestId(
            "invoice",
        )) as HTMLInputElement;

        fireEvent.input(input, {
            target: { value: staleQuoteInvoice },
        });

        await waitFor(() => {
            expect(pendingZeroFeeQuotes.length).toBeGreaterThan(0);
        });

        signals.setMinerFee(1);

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(1000));
            expect(signals.sendAmount()).toEqual(BigNumber(2_222));
        });

        pendingZeroFeeQuotes.forEach((resolve) => {
            resolve(BigNumber(1_111));
        });

        await waitFor(() => {
            expect(signals.receiveAmount()).toEqual(BigNumber(1000));
            expect(signals.sendAmount()).toEqual(BigNumber(2_222));
        });
    });
});
