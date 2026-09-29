import {
    createReverseSwap,
    createSubmarineSwap,
    getLockupTransaction,
    getPairs,
    getPartialRefundSignature,
    getSwapStatuses,
    patchSwapMetadata,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import type * as FetcherModule from "../src/http/fetcher.ts";

const { fetcherMock } = vi.hoisted(() => ({
    fetcherMock: vi.fn(),
}));

vi.mock("../src/http/fetcher.ts", async (importActual) => ({
    ...(await importActual<typeof FetcherModule>()),
    fetcher: fetcherMock,
}));

describe("getPairs", () => {
    beforeEach(() => {
        fetcherMock.mockReset();
    });

    test("fetches only the submarine and reverse pairs", async () => {
        const options = { signal: new AbortController().signal };
        fetcherMock.mockImplementation((url: string) =>
            Promise.resolve({ url }),
        );

        const result = await getPairs(options);

        expect(fetcherMock).toHaveBeenCalledTimes(2);
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/submarine",
            undefined,
            options,
        );
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/reverse",
            undefined,
            options,
        );
        expect(result).toEqual({
            [SwapType.Submarine]: { url: "/v2/swap/submarine" },
            [SwapType.Reverse]: { url: "/v2/swap/reverse" },
        });
    });
});

describe("getPartialRefundSignature", () => {
    beforeEach(() => {
        fetcherMock.mockReset();
    });

    test("posts to the submarine refund endpoint and decodes the response", async () => {
        fetcherMock.mockResolvedValue({
            pubNonce: "0a0b",
            partialSignature: "0c0d",
        });

        const result = await getPartialRefundSignature(
            "swap-id",
            new Uint8Array([0x01, 0x02]),
            "txhex",
            3,
        );

        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/submarine/swap-id/refund",
            { index: 3, pubNonce: "0102", transaction: "txhex" },
        );
        expect(result).toEqual({
            pubNonce: new Uint8Array([0x0a, 0x0b]),
            signature: new Uint8Array([0x0c, 0x0d]),
        });
    });
});

describe("getLockupTransaction", () => {
    beforeEach(() => {
        fetcherMock.mockReset();
    });

    test("fetches the submarine lockup transaction", async () => {
        fetcherMock.mockResolvedValue({ id: "tx" });

        await expect(
            getLockupTransaction("swap-id", SwapType.Submarine),
        ).resolves.toEqual({ id: "tx" });
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/submarine/swap-id/transaction",
        );
    });

    test("throws for a reverse swap without a request", () => {
        expect(() => getLockupTransaction("swap-id", SwapType.Reverse)).toThrow(
            "cannot get lockup transaction for swap type reverse",
        );
        expect(fetcherMock).not.toHaveBeenCalled();
    });
});

describe("getSwapStatuses", () => {
    beforeEach(() => {
        fetcherMock.mockReset();
    });

    test("returns an empty map without a request for no ids", async () => {
        const result = await getSwapStatuses([]);
        expect(result).toEqual({});
        expect(fetcherMock).not.toHaveBeenCalled();
    });

    test("builds the ids query and returns the status map", async () => {
        fetcherMock.mockResolvedValue({ a: { status: "swap.created" } });

        const result = await getSwapStatuses(["a", "b"]);

        expect(fetcherMock).toHaveBeenCalledWith("/v2/swap/status?ids=a&ids=b");
        expect(result).toEqual({ a: { status: "swap.created" } });
    });

    test("url-encodes ids", async () => {
        fetcherMock.mockResolvedValue({});
        await getSwapStatuses(["a b", "c/d"]);
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/status?ids=a%20b&ids=c%2Fd",
        );
    });

    test("chunks at 64 ids per request and merges the results", async () => {
        const ids = Array.from({ length: 65 }, (_, i) => `id${i}`);
        fetcherMock
            .mockResolvedValueOnce({ [ids[0]]: { status: "a" } })
            .mockResolvedValueOnce({ [ids[64]]: { status: "b" } });

        const result = await getSwapStatuses(ids);

        expect(fetcherMock).toHaveBeenCalledTimes(2);
        const firstUrl = fetcherMock.mock.calls[0][0] as string;
        expect(firstUrl.split("ids=").length - 1).toBe(64);
        expect(fetcherMock.mock.calls[1][0]).toBe("/v2/swap/status?ids=id64");
        expect(result).toEqual({
            id0: { status: "a" },
            id64: { status: "b" },
        });
    });

    test("sends exactly one request for the 64-id boundary", async () => {
        const ids = Array.from({ length: 64 }, (_, i) => `id${i}`);
        fetcherMock.mockResolvedValue(
            Object.fromEntries(ids.map((id) => [id, { status: "ok" }])),
        );

        const result = await getSwapStatuses(ids);

        expect(fetcherMock).toHaveBeenCalledTimes(1);
        expect(Object.keys(result)).toHaveLength(64);
    });

    test("rejects the whole call when any chunk fails (all-or-nothing)", async () => {
        const ids = Array.from({ length: 65 }, (_, i) => `id${i}`);
        fetcherMock
            .mockResolvedValueOnce({ id0: { status: "a" } })
            .mockRejectedValueOnce(new Error("could not find swap"));

        await expect(getSwapStatuses(ids)).rejects.toThrow(
            "could not find swap",
        );
        expect(fetcherMock).toHaveBeenCalledTimes(2);
    });
});

describe("boltzClient swap metadata", () => {
    beforeEach(() => {
        fetcherMock.mockReset();
        fetcherMock.mockResolvedValue({});
    });

    test("create requests store encrypted route metadata when provided", async () => {
        await createSubmarineSwap(
            "BTC",
            "BTC",
            "lninvoice",
            "pair-hash",
            "refundpub",
            "encrypted-metadata",
        );

        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/submarine",
            expect.objectContaining({ metadata: "encrypted-metadata" }),
        );

        fetcherMock.mockClear();
        await createReverseSwap(
            "BTC",
            "BTC",
            1_000,
            "preimagehash",
            "pair-hash",
            "claimpub",
            "claimaddr",
            "encrypted-metadata",
        );
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/reverse",
            expect.objectContaining({ metadata: "encrypted-metadata" }),
        );
    });

    test("patches metadata on the metadata endpoint", async () => {
        await patchSwapMetadata("swap-id", "encrypted-metadata");

        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/swap-id/metadata",
            { metadata: "encrypted-metadata" },
            { method: "PATCH" },
        );
    });

    test("includes the submarine refund address when provided", async () => {
        await createSubmarineSwap(
            "BTC",
            "BTC",
            "lninvoice",
            "pair-hash",
            undefined,
            undefined,
            "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
        );

        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/submarine",
            expect.objectContaining({
                refundAddress: "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080",
            }),
        );
    });
});
