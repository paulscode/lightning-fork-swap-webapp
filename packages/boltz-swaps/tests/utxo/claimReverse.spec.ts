import { hex } from "@scure/base";
import type * as BoltzCoreModule from "boltz-core";

import type * as ClientModule from "../../src/client.ts";
import { type Logger, setLogger } from "../../src/logger.ts";
import {
    type ReverseUtxoClaimParams,
    claimReverseUtxo,
} from "../../src/utxo/claim.ts";
import type * as MusigModule from "../../src/utxo/musig.ts";
import type * as TransactionModule from "../../src/utxo/transaction.ts";

const mocks = vi.hoisted(() => ({
    getPartialReverseClaimSignature: vi.fn(),
    createMusig: vi.fn(),
    tweakMusig: vi.fn(),
    hashForWitnessV1: vi.fn(),
    decodeAddress: vi.fn(),
    constructClaim: vi.fn(),
    getOutputAmount: vi.fn(),
    parseTransaction: vi.fn(),
    setCooperativeWitness: vi.fn(),
    txToHex: vi.fn(),
    txToId: vi.fn(),
    detectSwap: vi.fn(),
    deserializeSwapTree: vi.fn(),
}));

vi.mock("../../src/client.ts", async (importActual) => ({
    ...(await importActual<typeof ClientModule>()),
    getPartialReverseClaimSignature: mocks.getPartialReverseClaimSignature,
}));

vi.mock("../../src/utxo/musig.ts", async (importActual) => ({
    ...(await importActual<typeof MusigModule>()),
    createMusig: mocks.createMusig,
    tweakMusig: mocks.tweakMusig,
    hashForWitnessV1: mocks.hashForWitnessV1,
}));

vi.mock("../../src/utxo/transaction.ts", async (importActual) => ({
    ...(await importActual<typeof TransactionModule>()),
    decodeAddress: mocks.decodeAddress,
    constructClaim: mocks.constructClaim,
    getOutputAmount: mocks.getOutputAmount,
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

const SERVER_PUBLIC_KEY = "02ab";
const PREIMAGE = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

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
let claimTx: { id: string };
let logger: Logger;

const baseParams = (
    overrides: Partial<ReverseUtxoClaimParams> = {},
): ReverseUtxoClaimParams => ({
    id: "rev-1",
    network: "regtest",
    serverPublicKey: SERVER_PUBLIC_KEY,
    swapTree: {} as never,
    claimKeys: {
        privateKey: new Uint8Array(32).fill(1),
        publicKey: new Uint8Array(33).fill(2),
    },
    preimage: PREIMAGE,
    claimAddress: "bcrt1quser",
    receiveAmount: 50_000,
    lockupTxHex: "deadbeef",
    ...overrides,
});

beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());

    tweaked = makeMusigStub();
    claimTx = { id: "claim-tx" };

    mocks.createMusig.mockReturnValue({ aggPubkey: new Uint8Array([0x55]) });
    mocks.tweakMusig.mockReturnValue(tweaked);
    mocks.deserializeSwapTree.mockReturnValue({ tree: { stub: true } });
    mocks.detectSwap.mockReturnValue({
        vout: 0,
        type: 3,
        script: new Uint8Array([0x51]),
    });
    mocks.parseTransaction.mockReturnValue({ kind: "lockupTx" });
    mocks.getOutputAmount.mockReturnValue(60_000);
    mocks.decodeAddress.mockReturnValue({
        script: new Uint8Array([0x76, 0xa9]),
    });
    mocks.constructClaim.mockReturnValue(claimTx);
    mocks.txToHex.mockImplementation((tx: unknown) =>
        tx === claimTx ? "cohex" : "othertxhex",
    );
    mocks.txToId.mockImplementation((tx: unknown) =>
        tx === claimTx ? "coid" : "othertxid",
    );
    mocks.hashForWitnessV1.mockReturnValue(new Uint8Array([0x77]));
    mocks.getPartialReverseClaimSignature.mockResolvedValue({
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

describe("claimReverseUtxo cooperative happy path", () => {
    test("requests the reverse claim signature, aggregates it and sets the witness", async () => {
        const result = await claimReverseUtxo(baseParams());

        expect(mocks.getPartialReverseClaimSignature).toHaveBeenCalledTimes(1);
        const args = mocks.getPartialReverseClaimSignature.mock.calls[0];
        expect(args[0]).toBe("rev-1");
        expect(args[1]).toEqual(PREIMAGE);
        expect(args[2]).toEqual(tweaked.publicNonce);
        expect(args[3]).toBe("cohex");
        expect(args[4]).toBe(0);

        const boltzPublicKey = hex.decode(SERVER_PUBLIC_KEY);
        expect(tweaked.addPartial).toHaveBeenCalledWith(
            boltzPublicKey,
            new Uint8Array([0x0c, 0x0d]),
        );
        expect(mocks.setCooperativeWitness).toHaveBeenCalledWith(
            claimTx,
            0,
            new Uint8Array([0xaa, 0xbb]),
        );
        expect(result).toEqual({
            transactionHex: "cohex",
            transactionId: "coid",
        });
    });
});

describe("claimReverseUtxo uncooperative fallback", () => {
    test("falls back to a non-cooperative claim when the signature fails", async () => {
        mocks.getPartialReverseClaimSignature.mockRejectedValueOnce(
            new Error("claim denied"),
        );

        const result = await claimReverseUtxo(baseParams());

        expect(logger.warn).toHaveBeenCalledTimes(1);
        expect(mocks.setCooperativeWitness).not.toHaveBeenCalled();
        expect(mocks.constructClaim).toHaveBeenCalledTimes(2);
        expect(result).toEqual({
            transactionHex: "cohex",
            transactionId: "coid",
        });
    });
});

describe("claimReverseUtxo non-cooperative branch", () => {
    test("returns immediately without requesting a signature", async () => {
        const result = await claimReverseUtxo(
            baseParams({ cooperative: false }),
        );

        expect(mocks.getPartialReverseClaimSignature).not.toHaveBeenCalled();
        expect(mocks.setCooperativeWitness).not.toHaveBeenCalled();
        expect(result).toEqual({
            transactionHex: "cohex",
            transactionId: "coid",
        });
    });
});

describe("claimReverseUtxo guards", () => {
    test("throws when the swap output cannot be located", async () => {
        mocks.detectSwap.mockReturnValue(undefined);

        await expect(claimReverseUtxo(baseParams())).rejects.toThrow(
            /could not find swap output/,
        );
        expect(mocks.constructClaim).not.toHaveBeenCalled();
    });

    test("throws when the receive amount is zero", async () => {
        await expect(
            claimReverseUtxo(baseParams({ receiveAmount: 0 })),
        ).rejects.toThrow(/amount to be received is 0/);
        expect(mocks.constructClaim).not.toHaveBeenCalled();
    });

    test("throws when the receive amount exceeds the input sum", async () => {
        mocks.getOutputAmount.mockReturnValue(60_000);

        await expect(
            claimReverseUtxo(baseParams({ receiveAmount: 70_000 })),
        ).rejects.toThrow(/exceeds available input sum/);
        expect(mocks.constructClaim).not.toHaveBeenCalled();
    });
});

describe("claimReverseUtxo cooperative aggregation", () => {
    test("aggregates the server nonce and applies the fee budget", async () => {
        await claimReverseUtxo(baseParams());

        const boltzPublicKey = hex.decode(SERVER_PUBLIC_KEY);
        const noncesArg = (tweaked.aggregateNonces as ReturnType<typeof vi.fn>)
            .mock.calls[0][0];
        expect(noncesArg[0][0]).toEqual(boltzPublicKey);
        expect(noncesArg[0][1]).toEqual(new Uint8Array([0x0a, 0x0b]));

        // inputSum (getOutputAmount 60_000) - receiveAmount (50_000)
        expect(mocks.constructClaim.mock.calls[0][2]).toBe(10_000);
        expect(mocks.constructClaim.mock.calls[0][3]).toBe(true);
        expect(mocks.constructClaim.mock.calls[0]).toHaveLength(4);
    });

    test("uses the tweaked aggregate key to find the output and decodes the claim address for the network", async () => {
        await claimReverseUtxo(baseParams());

        expect(mocks.parseTransaction).toHaveBeenCalledWith("deadbeef");
        expect(mocks.detectSwap).toHaveBeenCalledWith(tweaked.aggPubkey, {
            kind: "lockupTx",
        });
        expect(mocks.decodeAddress).toHaveBeenCalledWith(
            "bcrt1quser",
            "regtest",
        );
        expect(mocks.tweakMusig).toHaveBeenCalledWith(expect.anything(), {
            stub: true,
        });
        expect(mocks.constructClaim.mock.calls[0][1]).toEqual(
            new Uint8Array([0x76, 0xa9]),
        );
    });

    test("pins server-first MuSig ordering with the hex-decoded server key", async () => {
        await claimReverseUtxo(baseParams());

        expect(mocks.createMusig).toHaveBeenCalledWith(
            expect.objectContaining({
                privateKey: expect.any(Uint8Array),
                publicKey: expect.any(Uint8Array),
            }),
            hex.decode(SERVER_PUBLIC_KEY),
        );
    });
});
