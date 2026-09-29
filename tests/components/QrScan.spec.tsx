import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import BigNumber from "bignumber.js";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { vi } from "vitest";

import QrScan from "../../src/components/QrScan";
import { BTC, LN } from "../../src/consts/Assets";
import Pair from "../../src/utils/Pair";
import { blake2bInvoice, sha256Invoice } from "../fixtures/invoices";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    signals,
} from "../helper";

const qrScannerMock = vi.hoisted(() => ({
    destroy: vi.fn(),
    hasCamera: vi.fn(() => Promise.resolve(true)),
    scan: undefined as ((result: { data: string }) => void) | undefined,
    start: vi.fn(() => Promise.resolve()),
}));

vi.mock("qr-scanner", () => {
    const QrScanner = vi.fn().mockImplementation(function (_video, scan) {
        qrScannerMock.scan = scan;

        return {
            destroy: qrScannerMock.destroy,
            start: qrScannerMock.start,
        };
    });

    return {
        default: Object.assign(QrScanner, {
            hasCamera: qrScannerMock.hasCamera,
        }),
    };
});

// Real bolt11 decoding does not work in jsdom (the signature check fails
// across realms), so this stand-in behaves like the SDK's decodeInvoice for
// the fixtures: the BLAKE2b-chain invoice decodes and the SHA256-chain one
// throws MissingBlake2bFeatureError. The real decoding of both is covered in
// tests/utils/validation.spec.ts.
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
    qrScannerMock.destroy.mockClear();
    qrScannerMock.hasCamera.mockClear();
    qrScannerMock.scan = undefined;
    qrScannerMock.start.mockClear();
});

const setPairAssets = (fromAsset: string, toAsset: string) => {
    signals.setPair(new Pair(globalSignals.pairs(), fromAsset, toAsset));
};

const renderQrScan = () => {
    render(
        () => (
            <>
                <TestComponent />
                <QrScan />
            </>
        ),
        { wrapper: contextWrapper },
    );
};

const startScanner = async () => {
    fireEvent.click(await screen.findByText(globalSignals.t("scan_qr_code")));

    await waitFor(() => {
        expect(qrScannerMock.start).toHaveBeenCalled();
    });
};

describe("QrScan", () => {
    const address = "bcrt1q7vq47xpsg4t080205edaulc3sdsjpdxy9svhr3";
    const invoice = blake2bInvoice;

    test("validates scanned onchain addresses", async () => {
        renderQrScan();
        setPairAssets(LN, BTC);
        await startScanner();

        qrScannerMock.scan?.({ data: address });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(true);
        });
        expect(signals.onchainAddress()).toEqual(address);
    });

    test("applies amounts of scanned BIP21 QR codes", async () => {
        renderQrScan();
        setPairAssets(LN, BTC);
        await startScanner();

        qrScannerMock.scan?.({
            data: `bitcoin:${address}?amount=0.00001&label=lunch`,
        });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(true);
        });
        expect(signals.onchainAddress()).toEqual(address);
        expect(signals.receiveAmount().toNumber()).toEqual(1000);

        const expectedSendAmount = await signals
            .pair()
            .calculateSendAmount(BigNumber(1000), signals.minerFee());
        expect(signals.sendAmount()).toEqual(expectedSendAmount);
    });

    test("applies amounts of all-uppercase BIP21 QR codes", async () => {
        renderQrScan();
        setPairAssets(LN, BTC);
        await startScanner();

        const upperAddress = address.toUpperCase();
        qrScannerMock.scan?.({
            data: `BITCOIN:${upperAddress}?AMOUNT=0.00001`,
        });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(true);
        });
        expect(signals.onchainAddress()).toEqual(upperAddress);
        expect(signals.receiveAmount().toNumber()).toEqual(1000);
    });

    test("keeps amounts when scanned BIP21 QR code has no amount", async () => {
        renderQrScan();
        setPairAssets(LN, BTC);
        await startScanner();

        signals.setReceiveAmount(BigNumber(5000));

        qrScannerMock.scan?.({
            data: `bitcoin:${address}?label=lunch`,
        });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(true);
        });
        expect(signals.onchainAddress()).toEqual(address);
        expect(signals.receiveAmount().toNumber()).toEqual(5000);
    });

    test("sets invoice for scanned lightning invoices", async () => {
        renderQrScan();
        setPairAssets(BTC, LN);
        await startScanner();

        qrScannerMock.scan?.({ data: invoice });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(invoice);
        });
        expect(signals.onchainAddress()).toEqual("");
    });

    test("keeps fixed invoice amount over BIP21 amount for unified QR codes", async () => {
        renderQrScan();
        setPairAssets(BTC, LN);
        await startScanner();

        signals.setReceiveAmount(BigNumber(5000));

        qrScannerMock.scan?.({
            data: `bitcoin:${address}?amount=0.00001&lightning=${invoice}`,
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(invoice);
        });
        expect(signals.receiveAmount().toNumber()).toEqual(5000);
    });

    test("applies BIP21 amount when invoice of unified QR code has no amount", async () => {
        renderQrScan();
        setPairAssets(BTC, LN);
        await startScanner();

        const zeroAmountInvoice = "lnbcrt1zeroamount";
        qrScannerMock.scan?.({
            data: `bitcoin:${address}?amount=0.00001&lightning=${zeroAmountInvoice}`,
        });

        await waitFor(() => {
            expect(signals.invoice()).toEqual(zeroAmountInvoice);
        });
        expect(signals.receiveAmount().toNumber()).toEqual(1000);
    });

    test("notifies an error for invoices that fail to decode", async () => {
        renderQrScan();
        setPairAssets(BTC, LN);
        await startScanner();

        qrScannerMock.scan?.({ data: "lnbcrt1corruptedinvoice" });

        await waitFor(() => {
            expect(globalSignals.notification()).toEqual(
                globalSignals.t("invalid_address", { asset: LN }),
            );
        });
        expect(globalSignals.notificationType()).toEqual("error");
        expect(signals.invoice()).toEqual("");
    });

    test("switches to a reverse swap when scanning an address in lightning mode", async () => {
        renderQrScan();
        setPairAssets(BTC, LN);
        await startScanner();

        qrScannerMock.scan?.({ data: address });

        await waitFor(() => {
            expect(signals.addressValid()).toBe(true);
        });
        expect(signals.pair().fromAsset).toEqual(LN);
        expect(signals.pair().toAsset).toEqual(BTC);
        expect(signals.onchainAddress()).toEqual(address);
        expect(globalSignals.notification()).toEqual(
            globalSignals.t("switch_paste"),
        );
    });

    test("notifies an error and invalidates the address for invalid scans", async () => {
        renderQrScan();
        setPairAssets(LN, BTC);
        await startScanner();

        // A previously validated destination must not stay submittable
        // after an invalid scan
        signals.setOnchainAddress(address);
        signals.setAddressValid(true);

        qrScannerMock.scan?.({ data: "invalid qr code content" });

        await waitFor(() => {
            expect(globalSignals.notification()).toEqual(
                globalSignals.t("invalid_address", { asset: BTC }),
            );
        });
        expect(globalSignals.notificationType()).toEqual("error");
        expect(signals.addressValid()).toBe(false);
        // The raw scanned value must not leak into the address input
        expect(signals.onchainAddress()).toEqual(address);
    });

    describe("BLAKE2b feature bit", () => {
        test.each`
            desc                             | data
            ${"a plain invoice"}             | ${sha256Invoice}
            ${"an uppercase lightning: URI"} | ${`LIGHTNING:${sha256Invoice.toUpperCase()}`}
            ${"a unified BIP21 QR code"}     | ${`bitcoin:${address}?amount=0.00001&lightning=${sha256Invoice}`}
        `(
            "notifies invoice_missing_blake2b for a SHA256-chain invoice in $desc",
            async ({ data }) => {
                renderQrScan();
                setPairAssets(BTC, LN);
                await startScanner();

                qrScannerMock.scan?.({ data });

                await waitFor(() => {
                    expect(globalSignals.notification()).toEqual(
                        globalSignals.t("invoice_missing_blake2b"),
                    );
                });
                expect(globalSignals.notificationType()).toEqual("error");
                expect(signals.invoice()).toEqual("");
                expect(signals.onchainAddress()).toEqual("");
                expect(signals.addressValid()).toBe(false);
            },
        );

        test("does not switch direction for a SHA256-chain invoice in on-chain mode", async () => {
            renderQrScan();
            setPairAssets(LN, BTC);
            await startScanner();

            qrScannerMock.scan?.({ data: sha256Invoice });

            await waitFor(() => {
                expect(globalSignals.notification()).toEqual(
                    globalSignals.t("invoice_missing_blake2b"),
                );
            });
            expect(signals.pair().fromAsset).toEqual(LN);
            expect(signals.pair().toAsset).toEqual(BTC);
            expect(signals.invoice()).toEqual("");
        });

        test("accepts a scanned BLAKE2b-chain invoice with a lightning: prefix", async () => {
            renderQrScan();
            setPairAssets(BTC, LN);
            await startScanner();

            qrScannerMock.scan?.({ data: `lightning:${blake2bInvoice}` });

            await waitFor(() => {
                expect(signals.invoice()).toEqual(blake2bInvoice);
            });
            expect(globalSignals.notificationType()).not.toEqual("error");
        });
    });
});
