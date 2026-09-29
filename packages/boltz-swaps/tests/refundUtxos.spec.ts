import type * as BoltzCoreModule from "boltz-core";

import type * as ClientModule from "../src/client.ts";
import { type Logger, setLogger } from "../src/logger.ts";
import type * as MusigModule from "../src/utxo/musig.ts";
import { type RefundUtxosParams, refundUtxos } from "../src/utxo/refund.ts";
import type * as TransactionModule from "../src/utxo/transaction.ts";

const mocks = vi.hoisted(() => ({
    getPartialRefundSignature: vi.fn(),
    createMusig: vi.fn(),
    tweakMusig: vi.fn(),
    hashForWitnessV1: vi.fn(),
    decodeAddress: vi.fn(),
    constructRefund: vi.fn(),
    parseTransaction: vi.fn(),
    setCooperativeWitness: vi.fn(),
    txToHex: vi.fn(),
    txToId: vi.fn(),
    detectSwap: vi.fn(),
    deserializeSwapTree: vi.fn(),
}));

vi.mock("../src/client.ts", async (importActual) => ({
    ...(await importActual<typeof ClientModule>()),
    getPartialRefundSignature: mocks.getPartialRefundSignature,
}));

vi.mock("../src/utxo/musig.ts", async (importActual) => ({
    ...(await importActual<typeof MusigModule>()),
    createMusig: mocks.createMusig,
    tweakMusig: mocks.tweakMusig,
    hashForWitnessV1: mocks.hashForWitnessV1,
}));

vi.mock("../src/utxo/transaction.ts", async (importActual) => ({
    ...(await importActual<typeof TransactionModule>()),
    decodeAddress: mocks.decodeAddress,
    constructRefund: mocks.constructRefund,
    parseTransaction: mocks.parseTransaction,
    setCooperativeWitness: mocks.setCooperativeWitness,
    txToHex: mocks.txToHex,
    txToId: mocks.txToId,
}));

vi.mock("boltz-core", async (importActual) => {
    const actual = await importActual<typeof BoltzCoreModule>();
    return {
        ...actual,
        detectSwap: mocks.detectSwap,
        SwapTreeSerializer: {
            ...actual.SwapTreeSerializer,
            deserializeSwapTree: mocks.deserializeSwapTree,
        },
    };
});

const CLAIM_PUBLIC_KEY = "02ab";

const makeMusigStub = () => {
    const stub: Record<string, unknown> = {
        aggPubkey: new Uint8Array([0x99]),
        publicNonce: new Uint8Array([0x01, 0x02]),
        message: vi.fn(() => stub),
        generateNonce: vi.fn(() => stub),
        aggregateNonces: vi.fn(() => stub),
        initializeSession: vi.fn(() => stub),
        signPartial: vi.fn(() => stub),
        addPartial: vi.fn(() => stub),
        aggregatePartials: vi.fn(() => new Uint8Array([0xaa, 0xbb])),
    };
    return stub;
};

let tweaked: ReturnType<typeof makeMusigStub>;
let refundTx: { id: string };
let logger: Logger;

const baseParams = (
    overrides: Partial<RefundUtxosParams> = {},
): RefundUtxosParams => ({
    id: "refund-1",
    network: "regtest",
    swapTree: {} as never,
    claimPublicKey: CLAIM_PUBLIC_KEY,
    refundKeys: {
        privateKey: new Uint8Array(32).fill(1),
        publicKey: new Uint8Array(33).fill(2),
    },
    lockups: [{ lockupTxHex: "deadbeef", timeoutBlockHeight: 150 }],
    refundAddress: "bcrt1quser",
    feePerVbyte: 2,
    nLockTime: 150,
    ...overrides,
});

beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());

    tweaked = makeMusigStub();
    refundTx = { id: "refund-tx" };

    mocks.createMusig.mockReturnValue({ aggPubkey: new Uint8Array([0x55]) });
    mocks.tweakMusig.mockReturnValue(tweaked);
    mocks.deserializeSwapTree.mockReturnValue({ tree: { stub: true } });
    mocks.detectSwap.mockReturnValue({
        vout: 0,
        type: 3,
        script: new Uint8Array([0x51]),
    });
    mocks.parseTransaction.mockImplementation((h: string) => ({
        kind: "lockupTx",
        h,
    }));
    mocks.decodeAddress.mockReturnValue({
        script: new Uint8Array([0x76, 0xa9]),
    });
    mocks.constructRefund.mockReturnValue(refundTx);
    mocks.txToHex.mockReturnValue("refundhex");
    mocks.txToId.mockReturnValue("refundid");
    mocks.hashForWitnessV1.mockReturnValue(new Uint8Array([0x77]));
    mocks.getPartialRefundSignature.mockResolvedValue({
        pubNonce: new Uint8Array([0x0a, 0x0b]),
        signature: new Uint8Array([0x0c, 0x0d]),
    });

    logger = {
        trace: vi.fn(),
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
    };
    setLogger(logger);
});

afterEach(() => {
    setLogger({
        trace: () => {},
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        log: () => {},
    });
});

describe("refundUtxos multi-input", () => {
    test("builds one detail per lockup and signs each input in its own session", async () => {
        const result = await refundUtxos(
            baseParams({
                lockups: [
                    { lockupTxHex: "aa", timeoutBlockHeight: 100 },
                    { lockupTxHex: "bb", timeoutBlockHeight: 110 },
                    { lockupTxHex: "cc", timeoutBlockHeight: 120 },
                ],
            }),
        );

        // one input per lockup
        expect(mocks.constructRefund.mock.calls[0][0]).toHaveLength(3);

        // a partial signature requested for every ascending input index
        expect(mocks.getPartialRefundSignature).toHaveBeenCalledTimes(3);
        expect(
            mocks.getPartialRefundSignature.mock.calls.map(
                (c) => c[3] as number,
            ),
        ).toEqual([0, 1, 2]);

        // a fresh musig session per input (plus the initial detect-swap musig)
        expect(mocks.tweakMusig.mock.calls.length).toBeGreaterThanOrEqual(4);

        // witness set per input
        expect(mocks.setCooperativeWitness).toHaveBeenCalledTimes(3);
        expect(
            mocks.setCooperativeWitness.mock.calls.map((c) => c[1] as number),
        ).toEqual([0, 1, 2]);

        expect(result).toEqual({
            transactionHex: "refundhex",
            transactionId: "refundid",
        });
    });

    test("parses every lockup transaction and hashes each input against all inputs", async () => {
        await refundUtxos(
            baseParams({
                lockups: [
                    { lockupTxHex: "aa", timeoutBlockHeight: 100 },
                    { lockupTxHex: "bb", timeoutBlockHeight: 110 },
                ],
            }),
        );

        expect(
            mocks.parseTransaction.mock.calls.map((c) => c[0] as string),
        ).toEqual(["aa", "bb"]);
        expect(mocks.hashForWitnessV1).toHaveBeenCalledTimes(2);
        expect(mocks.hashForWitnessV1.mock.calls[0][0]).toHaveLength(2);
        expect(
            mocks.hashForWitnessV1.mock.calls.map((c) => c[2] as number),
        ).toEqual([0, 1]);
        expect(mocks.getPartialRefundSignature.mock.calls[0][0]).toBe(
            "refund-1",
        );
    });
});

describe("refundUtxos cooperative failure", () => {
    test("falls back to a timelocked refund and surfaces the cooperative error", async () => {
        mocks.getPartialRefundSignature
            .mockResolvedValueOnce({
                pubNonce: new Uint8Array([0x0a, 0x0b]),
                signature: new Uint8Array([0x0c, 0x0d]),
            })
            .mockRejectedValueOnce(new Error("refund denied"));

        const result = await refundUtxos(
            baseParams({
                lockups: [
                    { lockupTxHex: "aa", timeoutBlockHeight: 100 },
                    { lockupTxHex: "bb", timeoutBlockHeight: 200 },
                ],
                nLockTime: 200,
            }),
        );

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(mocks.constructRefund).toHaveBeenCalledTimes(2);
        // uncooperative fallback uses the single nLockTime
        expect(mocks.constructRefund.mock.calls[1][2]).toBe(200);
        expect(result.transactionHex).toBe("refundhex");
        expect(result.cooperativeError).toBe("refund denied");
    });
});

describe("refundUtxos uncooperative", () => {
    test("uses nLockTime regardless of per-lockup timeouts and never signs", async () => {
        const result = await refundUtxos(
            baseParams({
                cooperative: false,
                lockups: [
                    { lockupTxHex: "aa", timeoutBlockHeight: 100 },
                    { lockupTxHex: "bb", timeoutBlockHeight: 200 },
                ],
                nLockTime: 999,
            }),
        );

        expect(mocks.getPartialRefundSignature).not.toHaveBeenCalled();
        expect(mocks.setCooperativeWitness).not.toHaveBeenCalled();
        expect(mocks.constructRefund.mock.calls[0][2]).toBe(999);
        expect(result).toEqual({
            transactionHex: "refundhex",
            transactionId: "refundid",
        });
    });
});
