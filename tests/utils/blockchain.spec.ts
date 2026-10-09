import type * as BoltzClientModule from "boltz-swaps/client";
import { broadcastApiTransaction } from "boltz-swaps/client";
import { type Asset, Explorer, SwapType } from "boltz-swaps/types";

import { config } from "../../src/config";
import { BTC } from "../../src/consts/Assets";
import {
    broadcastToExplorer,
    broadcastTransaction,
    getBlockTipHeight,
    getFeeEstimations,
    getNetworkName,
    getSwapUTXOs,
    getTransactionConfirmed,
    getTransactionOutSpend,
} from "../../src/utils/blockchain";
import type { SubmarineSwap } from "../../src/utils/swapCreator";

vi.mock("boltz-swaps/client", async (importOriginal) => ({
    ...(await importOriginal<typeof BoltzClientModule>()),
    broadcastApiTransaction: vi.fn(),
}));

const mockBroadcastApi = vi.mocked(broadcastApiTransaction);

const jsonResponse = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });

const textResponse = (body: string, status = 200) =>
    new Response(body, {
        status,
        headers: { "content-type": "text/plain" },
    });

const firstApi = "https://esplora-one.example/api";
const secondApi = "https://esplora-two.example/api";

describe("blockchain", () => {
    let originalApis: Asset["blockExplorerApis"];
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        originalApis = config.assets![BTC].blockExplorerApis;
        config.assets![BTC].blockExplorerApis = [
            { id: Explorer.Esplora, normal: firstApi },
            { id: Explorer.Esplora, normal: secondApi },
        ];
        fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);
    });

    afterEach(() => {
        config.assets![BTC].blockExplorerApis = originalApis;
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    test("should name the BTC network", () => {
        expect(getNetworkName(BTC)).toEqual("Bitcoin (BLAKE2b)");
        expect(getNetworkName("LN")).toEqual("");
    });

    describe("getFeeEstimations", () => {
        test("should get the half hour fee from mempool", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({
                    fastestFee: 10,
                    halfHourFee: 5,
                    hourFee: 3,
                    economyFee: 2,
                    minimumFee: 1,
                }),
            );

            await expect(
                getFeeEstimations({
                    id: Explorer.Mempool,
                    normal: "https://mempool.example/api",
                }),
            ).resolves.toEqual(5);
            expect(fetchMock).toHaveBeenCalledWith(
                "https://mempool.example/api/v1/fees/recommended",
                expect.anything(),
            );
        });

        test("should get the 3 block target from esplora", async () => {
            fetchMock.mockResolvedValue(
                jsonResponse({ "1": 20, "3": 7.5, "6": 4 }),
            );

            await expect(
                getFeeEstimations({ id: Explorer.Esplora, normal: firstApi }),
            ).resolves.toEqual(7.5);
            expect(fetchMock).toHaveBeenCalledWith(
                `${firstApi}/fee-estimates`,
                expect.anything(),
            );
        });

        test("should throw on HTTP errors", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ error: "down" }, 500));

            await expect(
                getFeeEstimations({ id: Explorer.Esplora, normal: firstApi }),
            ).rejects.toThrow(/HTTP 500/);
        });

        test("should throw on unknown explorer type", async () => {
            await expect(
                getFeeEstimations({
                    id: "unknown" as Explorer,
                    normal: "https://example",
                }),
            ).rejects.toThrow("unknown explorer type: unknown");
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe("getBlockTipHeight", () => {
        test("should fall back to the next explorer API", async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse({ error: "down" }, 500))
                .mockResolvedValueOnce(textResponse("123"));

            await expect(getBlockTipHeight(BTC)).resolves.toEqual("123");
            expect(fetchMock).toHaveBeenNthCalledWith(
                1,
                `${firstApi}/blocks/tip/height`,
                expect.anything(),
            );
            expect(fetchMock).toHaveBeenNthCalledWith(
                2,
                `${secondApi}/blocks/tip/height`,
                expect.anything(),
            );
        });

        test("should reject a height that is not a number", async () => {
            fetchMock.mockResolvedValue(textResponse("not a number"));

            await expect(getBlockTipHeight(BTC)).rejects.toThrow(
                /invalid block tip height/,
            );
        });

        test("should throw when all explorer APIs fail", async () => {
            fetchMock.mockRejectedValue(new Error("offline"));

            await expect(getBlockTipHeight(BTC)).rejects.toThrow(
                /all block explorer APIs failed/,
            );
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        test("should throw when no explorer API is configured", async () => {
            config.assets![BTC].blockExplorerApis = [];

            await expect(getBlockTipHeight(BTC)).rejects.toThrow(
                /all block explorer APIs failed/,
            );
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    const tx1 = "1".repeat(64);
    const tx2 = "2".repeat(64);

    test("should get the spend status of an output", async () => {
        fetchMock.mockResolvedValue(jsonResponse({ spent: true, txid: tx1 }));

        await expect(getTransactionOutSpend(BTC, "txid", 1)).resolves.toEqual({
            spent: true,
            txid: tx1,
        });
        expect(fetchMock).toHaveBeenCalledWith(
            `${firstApi}/tx/txid/outspend/1`,
            expect.anything(),
        );
    });

    test("should get the lockup transactions of a submarine swap", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/utxo")) {
                return Promise.resolve(
                    jsonResponse([
                        { txid: tx1, vout: 0 },
                        { txid: tx2, vout: 1 },
                    ]),
                );
            }
            const txid = url.split("/").at(-2)!;
            return Promise.resolve(textResponse(`hex-${txid}`));
        });

        const swap = {
            type: SwapType.Submarine,
            assetSend: BTC,
            address: "bcrt1qaddress",
            timeoutBlockHeight: 321,
        } as SubmarineSwap;

        await expect(getSwapUTXOs(swap)).resolves.toEqual([
            { hex: `hex-${tx1}`, id: tx1, timeoutBlockHeight: 321 },
            { hex: `hex-${tx2}`, id: tx2, timeoutBlockHeight: 321 },
        ]);
        expect(fetchMock).toHaveBeenCalledWith(
            `${firstApi}/address/bcrt1qaddress/utxo`,
            expect.anything(),
        );
    });

    describe("an explorer proxied as text/plain", () => {
        const swap = {
            type: SwapType.Submarine,
            assetSend: BTC,
            address: "bcrt1qaddress",
            timeoutBlockHeight: 321,
        } as SubmarineSwap;

        test("should still read its JSON", async () => {
            fetchMock.mockImplementation((url: string) => {
                if (url.endsWith("/utxo")) {
                    return Promise.resolve(
                        textResponse(JSON.stringify([{ txid: tx1, vout: 0 }])),
                    );
                }
                if (url.includes("/outspend/")) {
                    return Promise.resolve(
                        textResponse(JSON.stringify({ spent: false })),
                    );
                }
                return Promise.resolve(textResponse("rawhex"));
            });

            await expect(getSwapUTXOs(swap)).resolves.toEqual([
                { hex: "rawhex", id: tx1, timeoutBlockHeight: 321 },
            ]);
            await expect(getTransactionOutSpend(BTC, tx1, 0)).resolves.toEqual({
                spent: false,
            });
            expect(fetchMock).not.toHaveBeenCalledWith(
                expect.stringContaining("undefined"),
                expect.anything(),
            );
        });

        test("should find no UTXOs in an empty answer", async () => {
            fetchMock.mockResolvedValue(textResponse("[]"));

            await expect(getSwapUTXOs(swap)).resolves.toEqual([]);
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        test.each([
            ["not JSON", "<html>"],
            ["not a list", JSON.stringify({ txid: "1".repeat(64), vout: 0 })],
            [
                "a txid that is a path",
                JSON.stringify([{ txid: "../x", vout: 0 }]),
            ],
            ["no vout", JSON.stringify([{ txid: "1".repeat(64) }])],
        ])("should refuse UTXOs that are %s", async (_, body) => {
            fetchMock.mockResolvedValue(textResponse(body));

            await expect(getSwapUTXOs(swap)).rejects.toThrow();
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        test("should read a transaction's confirmation status", async () => {
            fetchMock.mockResolvedValue(
                textResponse(JSON.stringify({ confirmed: true })),
            );
            await expect(getTransactionConfirmed(BTC, tx1)).resolves.toEqual(
                true,
            );
            fetchMock.mockResolvedValue(textResponse("{}"));
            await expect(getTransactionConfirmed(BTC, tx1)).rejects.toThrow(
                /malformed status/,
            );
        });

        test("should refuse a malformed outspend", async () => {
            fetchMock.mockResolvedValue(
                textResponse(JSON.stringify({ spent: "yes" })),
            );

            await expect(getTransactionOutSpend(BTC, tx1, 0)).rejects.toThrow(
                /malformed outspend/,
            );
        });
    });

    describe("broadcastToExplorer", () => {
        test("should return the first successful response", async () => {
            fetchMock.mockImplementation((url: string) =>
                Promise.resolve(
                    url.startsWith(firstApi)
                        ? jsonResponse({ error: "bad" }, 400)
                        : textResponse("txid"),
                ),
            );

            await expect(broadcastToExplorer(BTC, "rawtx")).resolves.toEqual({
                id: "txid",
            });
            expect(fetchMock).toHaveBeenCalledWith(
                `${secondApi}/tx`,
                expect.objectContaining({ method: "POST", body: "rawtx" }),
            );
        });

        test("should throw when all explorers fail", async () => {
            fetchMock.mockResolvedValue(jsonResponse({ error: "bad" }, 400));

            await expect(broadcastToExplorer(BTC, "rawtx")).rejects.toThrow(
                /all external fetch attempts to \/tx failed/,
            );
        });
    });

    describe("broadcastTransaction", () => {
        test("should use the API result when it succeeds", async () => {
            mockBroadcastApi.mockResolvedValue({ id: "api" });
            fetchMock.mockRejectedValue(new Error("offline"));

            await expect(broadcastTransaction(BTC, "rawtx")).resolves.toEqual({
                id: "api",
            });
            expect(mockBroadcastApi).toHaveBeenCalledWith(BTC, "rawtx");
        });

        test("should use the explorer when the API fails", async () => {
            mockBroadcastApi.mockRejectedValue(new Error("api down"));
            fetchMock.mockResolvedValue(textResponse("explorer"));

            await expect(broadcastTransaction(BTC, "rawtx")).resolves.toEqual({
                id: "explorer",
            });
        });

        test("should throw the API error when both fail", async () => {
            mockBroadcastApi.mockRejectedValue(new Error("api down"));
            fetchMock.mockRejectedValue(new Error("offline"));

            await expect(broadcastTransaction(BTC, "rawtx")).rejects.toThrow(
                "api down",
            );
        });
    });
});
