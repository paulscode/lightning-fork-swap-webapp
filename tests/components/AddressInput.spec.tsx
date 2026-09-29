import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import BigNumber from "bignumber.js";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { vi } from "vitest";

import AddressInput from "../../src/components/AddressInput";
import InvoiceInput from "../../src/components/InvoiceInput";
import { BTC, LN } from "../../src/consts/Assets";
import dict from "../../src/i18n/i18n";
import Pair from "../../src/utils/Pair";
import {
    blake2bInvoice,
    invoiceAmount,
    sha256Invoice,
} from "../fixtures/invoices";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    signals,
} from "../helper";

const zeroAmountInvoice = "lnbcrt1zeroamount";

// bolt11 cannot verify invoice signatures under jsdom (its Buffers fail the
// secp256k1 Uint8Array check across realms), so decodeInvoice is replaced by
// a stand-in that behaves like the SDK for the fixtures. The real decoding is
// covered in tests/utils/validation.spec.ts.
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
    signals.setPair(new Pair(globalSignals.pairs(), fromAsset, toAsset));
};

describe("AddressInput", () => {
    test.each`
        valid    | address
        ${true}  | ${"mv5v8C3e1SySwqe6r2fq9Fh6DbZr8ddjsX"}
        ${true}  | ${"2N17VNGbi4yUHtkD7vhrc8cpi9JGVmC8scn"}
        ${true}  | ${"bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3"}
        ${true}  | ${"bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc"}
        ${false} | ${"02d96eadea3d780104449aca5c93461ce67c1564e2e1d73225fa67dd3b997a6018"}
        ${false} | ${"bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"}
        ${false} | ${"bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr4"}
    `(
        "should validate address $address -> $valid",
        async ({ valid, address }) => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <AddressInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );

            setPairAssets(LN, BTC);

            const input = (await screen.findByPlaceholderText(
                globalSignals.t("onchain_address", { asset: BTC }),
            )) as HTMLInputElement;

            fireEvent.input(input, {
                target: { value: address },
            });

            if (valid) {
                await waitFor(() => {
                    expect(signals.addressValid()).toBe(true);
                    expect(signals.onchainAddress()).toBeTruthy();
                });
                expect(signals.onchainAddress()).toEqual(address);
            } else {
                await waitFor(() => {
                    expect(signals.addressValid()).toBe(false);
                    expect(input.className).toContain("invalid");
                });
            }
        },
    );

    test.each`
        startTo | asset  | input
        ${BTC}  | ${BTC} | ${"bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3"}
        ${BTC}  | ${LN}  | ${"admin@bol.tz"}
        ${BTC}  | ${LN}  | ${blake2bInvoice}
        ${LN}   | ${BTC} | ${"bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3"}
    `(
        "should switch to $asset from $startTo destination based on input $input",
        async ({ startTo, asset, input }) => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <AddressInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );

            setPairAssets(startTo === LN ? BTC : LN, startTo);

            const addressInput = (await screen.findByTestId(
                "onchainAddress",
            )) as HTMLInputElement;

            fireEvent.input(addressInput, {
                target: { value: input },
            });

            await waitFor(() => {
                expect(signals.pair().toAsset).toEqual(asset);
            });

            if (asset === LN) {
                expect(signals.invoice()).toEqual(input);
            } else {
                await waitFor(() => {
                    expect(signals.addressValid()).toEqual(true);
                });
                expect(signals.onchainAddress()).toEqual(input);
            }
        },
    );

    test.each`
        asset  | bip21Uri                                                                                                                                          | expectedAddress
        ${BTC} | ${"bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.00001&label=sbddesign%3A%20For%20lunch%20Tuesday&message=For%20lunch%20Tuesday"} | ${"bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm"}
    `(
        "should extract address from BIP21 URI for $asset",
        async ({ asset, bip21Uri, expectedAddress }) => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <AddressInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );

            setPairAssets(LN, asset);

            const addressInput = (await screen.findByTestId(
                "onchainAddress",
            )) as HTMLInputElement;

            fireEvent.input(addressInput, {
                target: { value: bip21Uri },
            });

            await waitFor(() => {
                expect(signals.addressValid()).toEqual(true);
            });
            expect(signals.onchainAddress()).toEqual(expectedAddress);
            expect(signals.pair().toAsset).toEqual(asset);
            expect(signals.receiveAmount().toNumber()).toEqual(1000);
        },
    );

    test("should prioritize lightning over address when both are present", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <AddressInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(LN, BTC);
        const currentPair = signals.pair();
        currentPair.calculateSendAmount = vi
            .fn()
            .mockResolvedValue(BigNumber(9_999_999));

        const addressInput = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(addressInput, {
            target: {
                value: `bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.00001&lightning=${zeroAmountInvoice}`,
            },
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(zeroAmountInvoice);
            expect(signals.pair().toAsset).toEqual(LN);
            expect(signals.receiveAmount()).toEqual(BigNumber(1000));
        });

        const expectedSendAmount = await signals
            .pair()
            .calculateSendAmount(BigNumber(1000), signals.minerFee());

        // The amount is quoted on the switched pair, not the old one
        expect(currentPair.calculateSendAmount).not.toHaveBeenCalled();
        expect(signals.pair().fromAsset).toEqual(BTC);
        expect(signals.onchainAddress()).toEqual("");
        expect(signals.sendAmount()).toEqual(expectedSendAmount);
    });

    test.each`
        input
        ${"bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"}
        ${"el1qq2yjqfz9evc3c5m0rzw0cdtfcdfl5kmcf9xsskpsgza34zhezxzq7y6y4dnldxhtd935k8dn63n8cywy3jlzuvftycsmytjmu"}
    `(
        "should reject $input without switching direction",
        async ({ input: value }) => {
            render(
                () => (
                    <>
                        <TestComponent />
                        <AddressInput />
                    </>
                ),
                { wrapper: contextWrapper },
            );

            setPairAssets(LN, BTC);

            const input = (await screen.findByTestId(
                "onchainAddress",
            )) as HTMLInputElement;

            fireEvent.input(input, {
                target: { value },
            });

            await waitFor(() => {
                expect(signals.pair().fromAsset).toEqual(LN);
                expect(signals.pair().toAsset).toEqual(BTC);
                expect(signals.addressValid()).toEqual(false);
                expect(input.className).toContain("invalid");
            });
            expect(input.validationMessage).toEqual(
                globalSignals.t("invalid_address", { asset: BTC }),
            );
        },
    );

    test("should reject a pasted SHA256-chain invoice with invoice_missing_blake2b", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <AddressInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(LN, BTC);

        const input = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(input, {
            target: { value: sha256Invoice },
        });

        await waitFor(() => {
            expect(input.className).toContain("invalid");
        });
        expect(input.validationMessage).toEqual(
            dict.en.invoice_missing_blake2b,
        );
        expect(signals.addressValid()).toEqual(false);
        expect(signals.invoice()).toEqual("");
        expect(signals.pair().toAsset).toEqual(BTC);
    });

    test("should keep fixed lightning invoice amount over BIP21 amount", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                    <AddressInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(LN, BTC);

        const invoice = blake2bInvoice;
        const bip21Uri = `bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.002&lightning=${invoice}`;

        const addressInput = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(addressInput, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(invoice);
            expect(signals.pair().toAsset).toEqual(LN);
            expect(signals.receiveAmount()).toEqual(BigNumber(invoiceAmount));
        });
    });

    test("should apply BIP21 amount when lightning invoice has no fixed amount", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <InvoiceInput />
                    <AddressInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(LN, BTC);

        const invoice = zeroAmountInvoice;
        const bip21Uri = `bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.002&lightning=${invoice}`;

        const addressInput = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(addressInput, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(invoice);
            expect(signals.pair().toAsset).toEqual(LN);
            expect(signals.receiveAmount()).toEqual(BigNumber(200_000));
        });
    });

    test("should reject BIP21 when the embedded invoice fails to decode", async () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <AddressInput />
                </>
            ),
            { wrapper: contextWrapper },
        );

        setPairAssets(LN, BTC);

        const bip21Uri =
            "bitcoin:bcrt1q0zjymfy94ctjdegxascl8l253p0ppl5fzz46qm?amount=0.001&lightning=lnbcrt1baddata";

        const input = (await screen.findByTestId(
            "onchainAddress",
        )) as HTMLInputElement;

        fireEvent.input(input, {
            target: { value: bip21Uri },
        });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(false);
            expect(input.className).toContain("invalid");
        });
        expect(input.validationMessage).toEqual(
            globalSignals.t("invalid_address", { asset: BTC }),
        );
    });
});
