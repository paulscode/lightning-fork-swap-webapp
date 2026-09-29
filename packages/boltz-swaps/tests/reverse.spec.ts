import {
    type ReverseExecuteArgs,
    executeReverseSwap,
    setBoltzSwapsConfig,
} from "boltz-swaps";

import type * as FetcherModule from "../src/http/fetcher.ts";

const { fetcherMock, claimReverseUtxoMock } = vi.hoisted(() => ({
    fetcherMock: vi.fn(),
    claimReverseUtxoMock: vi.fn(),
}));

vi.mock("../src/http/fetcher.ts", async (importActual) => ({
    ...(await importActual<typeof FetcherModule>()),
    fetcher: fetcherMock,
}));

vi.mock("../src/utxo/claim.ts", () => ({
    claimReverseUtxo: claimReverseUtxoMock,
}));

const createdReverseUtxo = {
    id: "rev-utxo",
    invoice: "lnbcrt2",
    swapTree: {} as never,
    lockupAddress: "bcrt1qlock",
    timeoutBlockHeight: 100,
    onchainAmount: 50_000,
    refundPublicKey: "02ab",
};

const claimKeys = {
    privateKey: new Uint8Array(32).fill(1),
    publicKey: new Uint8Array(33).fill(2),
};

const utxoArgs = (
    overrides: Partial<ReverseExecuteArgs> = {},
): ReverseExecuteArgs => ({
    createdSwap: createdReverseUtxo,
    to: "BTC",
    preimage: "11".repeat(32),
    receiveAmount: 49_800,
    claimAddress: "bcrt1quser",
    claimKeys,
    ...overrides,
});

beforeEach(() => {
    fetcherMock.mockReset();
    claimReverseUtxoMock.mockReset();

    fetcherMock.mockImplementation(async (url: string) => {
        if (url.includes("/v2/swap/reverse/") && url.endsWith("/transaction")) {
            return { id: "lock-id", hex: "deadbeef", timeoutBlockHeight: 100 };
        }
        if (url.includes("/v2/chain/") && url.endsWith("/transaction")) {
            return { id: "broadcast-id" };
        }
        return {};
    });
    claimReverseUtxoMock.mockResolvedValue({
        transactionHex: "rawtxhex",
        transactionId: "claim-txid",
    });

    setBoltzSwapsConfig({ network: "regtest" });
});

afterEach(() => {
    setBoltzSwapsConfig({});
});

describe("executeReverseSwap", () => {
    test("claims via the reverse UTXO module and broadcasts the claim tx", async () => {
        const result = await executeReverseSwap(utxoArgs());

        expect(result).toEqual({
            claimTransactionId: "claim-txid",
            receiveAmount: 49_800n,
        });
        expect(fetcherMock).toHaveBeenCalledWith(
            "/v2/swap/reverse/rev-utxo/transaction",
        );
        expect(claimReverseUtxoMock).toHaveBeenCalledTimes(1);
        expect(claimReverseUtxoMock).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "rev-utxo",
                network: "regtest",
                serverPublicKey: "02ab",
                claimAddress: "bcrt1quser",
                receiveAmount: 49_800,
                lockupTxHex: "deadbeef",
                claimKeys,
            }),
        );
        expect(fetcherMock).toHaveBeenCalledWith("/v2/chain/BTC/transaction", {
            hex: "rawtxhex",
        });
    });

    test("requires claimKeys", async () => {
        await expect(
            executeReverseSwap(utxoArgs({ claimKeys: undefined })),
        ).rejects.toThrow(/requires claimKeys/);
        expect(claimReverseUtxoMock).not.toHaveBeenCalled();
    });

    test("throws when the created response lacks a refundPublicKey", async () => {
        await expect(
            executeReverseSwap(
                utxoArgs({
                    createdSwap: {
                        ...createdReverseUtxo,
                        refundPublicKey: undefined,
                    },
                }),
            ),
        ).rejects.toThrow(/missing a refundPublicKey/);
        expect(claimReverseUtxoMock).not.toHaveBeenCalled();
    });
});

describe("executeReverseSwap: claim parameter forwarding", () => {
    test("forwards the cooperative flag and the decoded preimage bytes", async () => {
        await executeReverseSwap(utxoArgs({ cooperative: false }));
        expect(claimReverseUtxoMock).toHaveBeenCalledWith(
            expect.objectContaining({
                cooperative: false,
                preimage: new Uint8Array(32).fill(0x11),
            }),
        );

        claimReverseUtxoMock.mockClear();
        await executeReverseSwap(utxoArgs({ cooperative: true }));
        expect(claimReverseUtxoMock).toHaveBeenCalledWith(
            expect.objectContaining({ cooperative: true }),
        );
    });

    test("strips a 0x prefix from the preimage", async () => {
        await executeReverseSwap(
            utxoArgs({ preimage: `0x${"22".repeat(32)}` }),
        );
        expect(claimReverseUtxoMock).toHaveBeenCalledWith(
            expect.objectContaining({
                preimage: new Uint8Array(32).fill(0x22),
            }),
        );
    });

    test("defaults the network to mainnet when none is configured", async () => {
        setBoltzSwapsConfig({});

        await executeReverseSwap(utxoArgs());

        expect(claimReverseUtxoMock).toHaveBeenCalledWith(
            expect.objectContaining({ network: "mainnet" }),
        );
    });
});

describe("executeReverseSwap: failure propagation", () => {
    test("propagates a reverse lockup-transaction fetch failure", async () => {
        fetcherMock.mockImplementation(async (url: string) => {
            if (
                url.includes("/v2/swap/reverse/") &&
                url.endsWith("/transaction")
            ) {
                throw new Error("lockup tx unavailable");
            }
            return {};
        });

        await expect(executeReverseSwap(utxoArgs())).rejects.toThrow(
            /lockup tx unavailable/,
        );
        expect(claimReverseUtxoMock).not.toHaveBeenCalled();
    });

    test("propagates a broadcast failure after a successful claim", async () => {
        fetcherMock.mockImplementation(async (url: string) => {
            if (
                url.includes("/v2/swap/reverse/") &&
                url.endsWith("/transaction")
            ) {
                return {
                    id: "lock-id",
                    hex: "deadbeef",
                    timeoutBlockHeight: 100,
                };
            }
            if (url.includes("/v2/chain/") && url.endsWith("/transaction")) {
                throw new Error("broadcast rejected");
            }
            return {};
        });

        await expect(executeReverseSwap(utxoArgs())).rejects.toThrow(
            /broadcast rejected/,
        );
        expect(claimReverseUtxoMock).toHaveBeenCalledTimes(1);
    });

    test("propagates a claim failure without broadcasting", async () => {
        claimReverseUtxoMock.mockRejectedValueOnce(new Error("claim failed"));

        await expect(executeReverseSwap(utxoArgs())).rejects.toThrow(
            /claim failed/,
        );
        expect(fetcherMock).not.toHaveBeenCalledWith(
            "/v2/chain/BTC/transaction",
            expect.anything(),
        );
    });
});
