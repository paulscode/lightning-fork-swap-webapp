import { LnurlAmountError, LnurlAmountErrorKind } from "boltz-swaps/errors";
import { InvoiceType, MissingBlake2bFeatureError } from "boltz-swaps/invoice";
import { resolveInvoice } from "boltz-swaps/resolveInvoice";

import type * as InvoiceModule from "../src/invoice.ts";
import type * as LnurlModule from "../src/lnurl.ts";

const { decodeInvoiceMock, isLnurlMock, fetchLnurlMock } = vi.hoisted(() => ({
    decodeInvoiceMock: vi.fn(),
    isLnurlMock: vi.fn(),
    fetchLnurlMock: vi.fn(),
}));

vi.mock("../src/invoice.ts", async (importActual) => ({
    ...(await importActual<typeof InvoiceModule>()),
    decodeInvoice: decodeInvoiceMock,
}));

vi.mock("../src/lnurl.ts", async (importActual) => ({
    ...(await importActual<typeof LnurlModule>()),
    isLnurl: isLnurlMock,
    fetchLnurl: fetchLnurlMock,
}));

describe("resolveInvoice", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isLnurlMock.mockReturnValue(false);
        decodeInvoiceMock.mockImplementation(() => ({
            type: InvoiceType.Bolt11,
            satoshis: 1000,
            preimageHash: "",
        }));
    });

    test("refuses an LNURL invoice for another amount than the one asked for", async () => {
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockResolvedValue("lnbc1fromlnurl");
        decodeInvoiceMock.mockImplementation(() => ({
            type: InvoiceType.Bolt11,
            satoshis: 100_000,
            preimageHash: "",
        }));

        await expect(resolveInvoice("lnurl1abc", 1000)).rejects.toThrow(
            "LNURL service returned an invoice for 100000 sat instead of 1000",
        );
    });

    test("passes a plain BOLT11 invoice through", async () => {
        const result = await resolveInvoice("lnbc1plain", 1000);

        expect(result).toEqual({
            invoice: "lnbc1plain",
            type: InvoiceType.Bolt11,
        });
        expect(decodeInvoiceMock).toHaveBeenCalledWith("lnbc1plain");
        expect(fetchLnurlMock).not.toHaveBeenCalled();
    });

    test("strips a lightning: prefix before routing", async () => {
        await resolveInvoice("lightning:lnbc1plain", 1000);
        expect(decodeInvoiceMock).toHaveBeenCalledWith("lnbc1plain");
    });

    test("trims whitespace and strips an uppercase lightning: prefix before routing", async () => {
        const result = await resolveInvoice("  LIGHTNING:LNBC1PLAIN  ", 1000);

        // The prefix check lowercases, but the slice keeps the original
        // casing, so only "LIGHTNING:" is removed.
        expect(isLnurlMock).toHaveBeenCalledWith("LNBC1PLAIN");
        expect(decodeInvoiceMock).toHaveBeenCalledWith("LNBC1PLAIN");
        expect(result).toEqual({
            invoice: "LNBC1PLAIN",
            type: InvoiceType.Bolt11,
        });
    });

    test("resolves a bech32 LNURL and decodes the fetched invoice", async () => {
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockResolvedValue("lnbc1fromlnurl");

        const result = await resolveInvoice("lnurl1abc", 1000);

        expect(result).toEqual({
            invoice: "lnbc1fromlnurl",
            type: InvoiceType.Bolt11,
        });
        expect(fetchLnurlMock).toHaveBeenCalledWith("lnurl1abc", 1000, {
            signal: undefined,
            timeoutMs: undefined,
        });
        expect(decodeInvoiceMock).toHaveBeenCalledWith("lnbc1fromlnurl");
    });

    test("resolves a Lightning address through fetchLnurl", async () => {
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockResolvedValue("lnbc1fromaddress");

        const result = await resolveInvoice("user@example.com", 1000);

        expect(result).toEqual({
            invoice: "lnbc1fromaddress",
            type: InvoiceType.Bolt11,
        });
        expect(fetchLnurlMock).toHaveBeenCalledWith("user@example.com", 1000, {
            signal: undefined,
            timeoutMs: undefined,
        });
    });

    test("passes the caller signal and timeout through to fetchLnurl", async () => {
        const controller = new AbortController();
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockResolvedValue("lnbc1fromlnurl");

        await resolveInvoice("lnurl1abc", 1000, {
            signal: controller.signal,
            timeoutMs: 5,
        });

        expect(fetchLnurlMock).toHaveBeenCalledWith("lnurl1abc", 1000, {
            signal: controller.signal,
            timeoutMs: 5,
        });
    });

    test("propagates a LnurlAmountError from fetchLnurl", async () => {
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockRejectedValue(
            new LnurlAmountError(LnurlAmountErrorKind.Min, 5000),
        );

        await expect(
            resolveInvoice("user@example.com", 1),
        ).rejects.toMatchObject({
            message: "minAmount",
            cause: 5000,
            kind: LnurlAmountErrorKind.Min,
        });
        expect(decodeInvoiceMock).not.toHaveBeenCalled();
    });

    test("refuses an LNURL invoice without the BLAKE2b feature bit", async () => {
        isLnurlMock.mockReturnValue(true);
        fetchLnurlMock.mockResolvedValue("lnbc1sha256chain");
        decodeInvoiceMock.mockImplementation(() => {
            throw new MissingBlake2bFeatureError();
        });

        await expect(resolveInvoice("lnurl1abc", 1000)).rejects.toBeInstanceOf(
            MissingBlake2bFeatureError,
        );
    });

    test("refuses a pasted invoice without the BLAKE2b feature bit", async () => {
        decodeInvoiceMock.mockImplementation(() => {
            throw new MissingBlake2bFeatureError();
        });

        await expect(resolveInvoice("lnbc1plain", 1000)).rejects.toBeInstanceOf(
            MissingBlake2bFeatureError,
        );
    });

    test("rejects input that is neither an LNURL nor an invoice without decoding it", async () => {
        await expect(resolveInvoice("garbage", 1000)).rejects.toThrow(
            "invalid invoice",
        );
        expect(decodeInvoiceMock).not.toHaveBeenCalled();
        expect(fetchLnurlMock).not.toHaveBeenCalled();
    });

    test("rejects a cross-network BOLT11 invoice without decoding it", async () => {
        // The configured network defaults to mainnet; "lntb" is testnet.
        await expect(resolveInvoice("lntb1abc", 1000)).rejects.toThrow(
            "invalid invoice",
        );
        expect(decodeInvoiceMock).not.toHaveBeenCalled();
    });

    test("rejects an '@' string that is neither an LNURL nor an invoice", async () => {
        await expect(resolveInvoice("weird@thing", 1000)).rejects.toThrow(
            "invalid invoice",
        );
        expect(decodeInvoiceMock).not.toHaveBeenCalled();
        expect(fetchLnurlMock).not.toHaveBeenCalled();
    });

    test("rejects when decodeInvoice throws for an invoice-shaped string", async () => {
        decodeInvoiceMock.mockImplementation(() => {
            throw new Error("invalid invoice");
        });

        await expect(resolveInvoice("lnbc1broken", 1000)).rejects.toThrow(
            "invalid invoice",
        );
    });
});
