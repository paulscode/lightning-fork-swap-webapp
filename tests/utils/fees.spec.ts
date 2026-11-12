import { type Asset, Explorer } from "boltz-swaps/types";
import { afterEach, beforeEach, vi } from "vitest";

import { config } from "../../src/config";
import { BTC } from "../../src/consts/Assets";
import {
    getFeeEstimationsFailover,
    minClaimFeeRate,
} from "../../src/utils/fees";

const mockGetFeeEstimationsFromBoltz = vi.fn();
const mockGetFeeEstimationsFromBlockchain = vi.fn();

vi.mock("../../packages/boltz-swaps/src/client.ts", () => ({
    getFeeEstimations: () => mockGetFeeEstimationsFromBoltz() as unknown,
}));

vi.mock("../../src/utils/blockchain", () => ({
    getFeeEstimations: (api: unknown) =>
        mockGetFeeEstimationsFromBlockchain(api) as unknown,
}));

describe("fees", () => {
    describe("getFeeEstimationsFailover", () => {
        let originalApis: Asset["blockExplorerApis"];

        beforeEach(() => {
            vi.clearAllMocks();
            originalApis = config.assets![BTC].blockExplorerApis;
            config.assets![BTC].blockExplorerApis = [
                { id: Explorer.Esplora, normal: "https://esplora.example" },
            ];
        });

        afterEach(() => {
            config.assets![BTC].blockExplorerApis = originalApis;
        });

        test("should prefer Boltz API", async () => {
            const expected = 21.21;
            mockGetFeeEstimationsFromBoltz.mockResolvedValue({
                [BTC]: expected,
            });

            const feeEstimations = await getFeeEstimationsFailover(BTC);
            expect(feeEstimations).toEqual(expected);
            expect(mockGetFeeEstimationsFromBoltz).toHaveBeenCalled();
            expect(mockGetFeeEstimationsFromBlockchain).not.toHaveBeenCalled();
        });

        test.each`
            value
            ${undefined}
            ${"5000"}
            ${0}
            ${-3}
            ${Number.NaN}
        `(
            "should fall back to the explorer when the API answers $value",
            async ({ value }) => {
                mockGetFeeEstimationsFromBoltz.mockResolvedValue({
                    [BTC]: value,
                });
                mockGetFeeEstimationsFromBlockchain.mockResolvedValue(4);

                await expect(getFeeEstimationsFailover(BTC)).resolves.toEqual(
                    4,
                );
                expect(mockGetFeeEstimationsFromBlockchain).toHaveBeenCalled();
            },
        );

        test("should fallback to explorer when Boltz API fails", async () => {
            mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                new Error("boltz down"),
            );

            const expected = 5.55;
            mockGetFeeEstimationsFromBlockchain.mockResolvedValue(expected);

            const feeEstimations = await getFeeEstimationsFailover(BTC);
            expect(feeEstimations).toEqual(expected);
            expect(mockGetFeeEstimationsFromBoltz).toHaveBeenCalled();
            expect(mockGetFeeEstimationsFromBlockchain).toHaveBeenCalled();
            expect(mockGetFeeEstimationsFromBlockchain).toHaveBeenCalledWith({
                id: Explorer.Esplora,
                normal: "https://esplora.example",
            });
        });

        test.each`
            asset  | explorerFee | expectedFee
            ${BTC} | ${1}        | ${2}
            ${BTC} | ${3.5}      | ${3.5}
        `(
            "should apply floor for $asset on explorer fallback ($explorerFee)",
            async ({ asset, explorerFee, expectedFee }) => {
                mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                    new Error("boltz down"),
                );

                mockGetFeeEstimationsFromBlockchain.mockResolvedValue(
                    explorerFee,
                );

                const feeEstimations = await getFeeEstimationsFailover(asset);
                expect(feeEstimations).toEqual(expectedFee);
            },
        );

        test("should skip invalid explorer response and try next", async () => {
            const originalApis = config.assets![BTC].blockExplorerApis!;
            try {
                config.assets![BTC].blockExplorerApis = [
                    { id: Explorer.Mempool, normal: "https://mempool.example" },
                    { id: Explorer.Esplora, normal: "https://esplora.example" },
                ];

                mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                    new Error("boltz down"),
                );

                mockGetFeeEstimationsFromBlockchain
                    .mockResolvedValueOnce("invalid" as unknown as number)
                    .mockResolvedValueOnce(1);

                const fee = await getFeeEstimationsFailover(BTC);
                expect(fee).toEqual(2);
                expect(
                    mockGetFeeEstimationsFromBlockchain,
                ).toHaveBeenCalledTimes(2);
            } finally {
                config.assets![BTC].blockExplorerApis = originalApis;
            }
        });

        test("should query mempool before esplora", async () => {
            config.assets![BTC].blockExplorerApis = [
                { id: Explorer.Esplora, normal: "https://esplora.example" },
                { id: Explorer.Mempool, normal: "https://mempool.example" },
            ];
            mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                new Error("boltz down"),
            );
            mockGetFeeEstimationsFromBlockchain.mockResolvedValue(4);

            await expect(getFeeEstimationsFailover(BTC)).resolves.toEqual(4);
            expect(mockGetFeeEstimationsFromBlockchain).toHaveBeenCalledTimes(
                1,
            );
            expect(mockGetFeeEstimationsFromBlockchain).toHaveBeenCalledWith({
                id: Explorer.Mempool,
                normal: "https://mempool.example",
            });
        });

        test("should throw when no explorer is configured", async () => {
            config.assets![BTC].blockExplorerApis = [];
            mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                new Error("boltz down"),
            );

            await expect(getFeeEstimationsFailover(BTC)).rejects.toThrow(
                /could not get fallback fee estimations/i,
            );
            expect(mockGetFeeEstimationsFromBlockchain).not.toHaveBeenCalled();
        });

        test("should throw when all explorers fail", async () => {
            const originalApis = config.assets![BTC].blockExplorerApis!;
            try {
                config.assets![BTC].blockExplorerApis = [
                    { id: Explorer.Mempool, normal: "https://mempool.example" },
                    { id: Explorer.Esplora, normal: "https://esplora.example" },
                ];

                mockGetFeeEstimationsFromBoltz.mockRejectedValue(
                    new Error("boltz down"),
                );

                mockGetFeeEstimationsFromBlockchain
                    .mockResolvedValueOnce("invalid" as unknown as number)
                    .mockRejectedValueOnce(new Error("explorer error"));

                await expect(getFeeEstimationsFailover(BTC)).rejects.toThrow(
                    /could not get fallback fee estimations/i,
                );
            } finally {
                config.assets![BTC].blockExplorerApis = originalApis;
            }
        });
    });

    describe("the floors", () => {
        let originalApis: Asset["blockExplorerApis"];

        beforeEach(() => {
            vi.clearAllMocks();
            originalApis = config.assets![BTC].blockExplorerApis;
            config.assets![BTC].blockExplorerApis = [
                { id: Explorer.Esplora, normal: "https://esplora.example" },
            ];
        });

        afterEach(() => {
            config.assets![BTC].blockExplorerApis = originalApis;
        });

        test("a refund rate from the API is floored as the explorer's is", async () => {
            mockGetFeeEstimationsFromBoltz.mockResolvedValue({ [BTC]: 0.0001 });
            expect(await getFeeEstimationsFailover(BTC)).toEqual(2);
        });

        test("a claim's rate is the explorer's, whatever the API says", async () => {
            mockGetFeeEstimationsFromBoltz.mockResolvedValue({ [BTC]: 500 });
            mockGetFeeEstimationsFromBlockchain.mockResolvedValue(7);
            expect(await minClaimFeeRate(BTC)).toEqual(7);
            expect(mockGetFeeEstimationsFromBoltz).not.toHaveBeenCalled();
        });

        test("a claim's rate falls back to the API, and never under 1", async () => {
            mockGetFeeEstimationsFromBlockchain.mockRejectedValue(
                new Error("down"),
            );
            mockGetFeeEstimationsFromBoltz.mockResolvedValue({ [BTC]: 0.2 });
            expect(await minClaimFeeRate(BTC)).toEqual(1);
            mockGetFeeEstimationsFromBoltz.mockRejectedValue(new Error("down"));
            expect(await minClaimFeeRate(BTC)).toEqual(1);
        });
    });
});
