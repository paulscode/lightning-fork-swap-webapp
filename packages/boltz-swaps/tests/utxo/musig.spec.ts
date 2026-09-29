import { SigHash } from "@scure/btc-signer";
import { Musig, TaprootUtils } from "boltz-core";

import {
    createMusig,
    hashForWitnessV1,
    tweakMusig,
} from "../../src/utxo/musig.ts";

const musigSentinel = { tag: "musig" } as never;
const tweakSentinel = { tag: "tweaked" } as never;
const btcHashSentinel = new Uint8Array([0x11, 0x22, 0x33]);

afterEach(() => {
    vi.restoreAllMocks();
});

describe("createMusig", () => {
    test("forwards our private key first and orders public keys [their, ours]", () => {
        const createSpy = vi
            .spyOn(Musig, "create")
            .mockReturnValue(musigSentinel);

        const ourKeys = {
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(33).fill(2),
        };
        const theirPublicKey = new Uint8Array(33).fill(3);

        const result = createMusig(ourKeys, theirPublicKey);

        expect(result).toBe(musigSentinel);
        expect(createSpy).toHaveBeenCalledTimes(1);

        const [privateKeyArg, publicKeysArg] = createSpy.mock.calls[0];

        expect(privateKeyArg).toBeInstanceOf(Uint8Array);
        expect(Array.from(privateKeyArg as Uint8Array)).toEqual(
            Array.from(ourKeys.privateKey),
        );

        expect(publicKeysArg).toHaveLength(2);
        expect(Array.from(publicKeysArg[0] as Uint8Array)).toEqual(
            Array.from(theirPublicKey),
        );
        expect(Array.from(publicKeysArg[1] as Uint8Array)).toEqual(
            Array.from(ourKeys.publicKey),
        );
    });

    test("does NOT order the public keys as [ours, theirs] (ordering is load-bearing)", () => {
        const createSpy = vi
            .spyOn(Musig, "create")
            .mockReturnValue(musigSentinel);

        const ourKeys = {
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(33).fill(7),
        };
        const theirPublicKey = new Uint8Array(33).fill(9);

        createMusig(ourKeys, theirPublicKey);

        const [, publicKeysArg] = createSpy.mock.calls[0];

        expect(Array.from(publicKeysArg[0] as Uint8Array)).not.toEqual(
            Array.from(ourKeys.publicKey),
        );
        expect(Array.from(publicKeysArg[0] as Uint8Array)).toEqual(
            Array.from(theirPublicKey),
        );
    });

    test("defensively copies the private key (mutating input afterwards does not affect the captured arg)", () => {
        const createSpy = vi
            .spyOn(Musig, "create")
            .mockReturnValue(musigSentinel);

        const ourKeys = {
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(33).fill(2),
        };
        const theirPublicKey = new Uint8Array(33).fill(3);

        createMusig(ourKeys, theirPublicKey);

        const [privateKeyArg] = createSpy.mock.calls[0];

        expect(privateKeyArg).not.toBe(ourKeys.privateKey);

        ourKeys.privateKey.fill(0xff);
        expect(Array.from(privateKeyArg as Uint8Array)).toEqual(
            new Array(32).fill(1),
        );
    });

    test("defensively copies our public key (mutating input afterwards does not affect the captured arg)", () => {
        const createSpy = vi
            .spyOn(Musig, "create")
            .mockReturnValue(musigSentinel);

        const ourKeys = {
            privateKey: new Uint8Array(32).fill(1),
            publicKey: new Uint8Array(33).fill(2),
        };
        const theirPublicKey = new Uint8Array(33).fill(3);

        createMusig(ourKeys, theirPublicKey);

        const [, publicKeysArg] = createSpy.mock.calls[0];
        const capturedOurPublicKey = publicKeysArg[1] as Uint8Array;

        expect(capturedOurPublicKey).not.toBe(ourKeys.publicKey);

        ourKeys.publicKey.fill(0xff);
        expect(Array.from(capturedOurPublicKey)).toEqual(new Array(33).fill(2));
    });

    test("accepts Node Buffers / offset sub-views and copies them into plain Uint8Arrays", () => {
        const createSpy = vi
            .spyOn(Musig, "create")
            .mockReturnValue(musigSentinel);

        const privateKey = Buffer.alloc(32, 1);
        const backing = new Uint8Array(40).fill(0);
        backing.fill(2, 4, 37);
        const publicKey = backing.subarray(4, 37);
        expect(publicKey).toHaveLength(33);

        const theirPublicKey = new Uint8Array(33).fill(3);

        createMusig({ privateKey, publicKey }, theirPublicKey);

        const [privateKeyArg, publicKeysArg] = createSpy.mock.calls[0];

        expect(privateKeyArg).toBeInstanceOf(Uint8Array);
        expect(Array.from(privateKeyArg as Uint8Array)).toEqual(
            new Array(32).fill(1),
        );

        const capturedOurPublicKey = publicKeysArg[1] as Uint8Array;
        expect(capturedOurPublicKey).toBeInstanceOf(Uint8Array);
        expect(Array.from(capturedOurPublicKey)).toEqual(new Array(33).fill(2));

        backing.fill(0xff);
        expect(Array.from(capturedOurPublicKey)).toEqual(new Array(33).fill(2));
    });
});

describe("tweakMusig", () => {
    const tree = { tag: "tree" } as never;

    test("forwards (musig, tree) to TaprootUtils.tweakMusig", () => {
        const btcSpy = vi
            .spyOn(TaprootUtils, "tweakMusig")
            .mockReturnValue(tweakSentinel);

        const result = tweakMusig(musigSentinel, tree);

        expect(result).toBe(tweakSentinel);
        expect(btcSpy).toHaveBeenCalledTimes(1);
        expect(btcSpy).toHaveBeenCalledWith(musigSentinel, tree);
    });
});

describe("hashForWitnessV1", () => {
    test("calls tx.preimageWitnessV1(index, scripts, SigHash.DEFAULT, amounts)", () => {
        const s0 = new Uint8Array([0xa0]);
        const s1 = new Uint8Array([0xa1]);
        const preimageWitnessV1 = vi.fn().mockReturnValue(btcHashSentinel);
        const fakeTx = { preimageWitnessV1 } as never;

        const result = hashForWitnessV1(
            [
                { script: s0, amount: 100n },
                { script: s1, amount: 200n },
            ],
            fakeTx,
            1,
        );

        expect(result).toBe(btcHashSentinel);
        expect(preimageWitnessV1).toHaveBeenCalledTimes(1);
        expect(preimageWitnessV1).toHaveBeenCalledWith(
            1,
            [s0, s1],
            SigHash.DEFAULT,
            [100n, 200n],
        );

        expect(preimageWitnessV1.mock.calls[0][2]).toBe(0);
        expect(preimageWitnessV1.mock.calls[0]).toHaveLength(4);
    });

    test("scripts and amounts arrays stay element-wise aligned across the dual map (3 inputs)", () => {
        const s0 = new Uint8Array([0xb0]);
        const s1 = new Uint8Array([0xb1]);
        const s2 = new Uint8Array([0xb2]);
        const preimageWitnessV1 = vi.fn().mockReturnValue(btcHashSentinel);

        hashForWitnessV1(
            [
                { script: s0, amount: 10n },
                { script: s1, amount: 20n },
                { script: s2, amount: 30n },
            ],
            { preimageWitnessV1 } as never,
            0,
        );

        const [, scripts, , amounts] = preimageWitnessV1.mock.calls[0];
        expect(scripts).toEqual([s0, s1, s2]);
        expect(amounts).toEqual([10n, 20n, 30n]);
        expect(scripts[0]).toBe(s0);
        expect(scripts[1]).toBe(s1);
        expect(scripts[2]).toBe(s2);
    });

    test("empty inputs produce two empty parallel arrays", () => {
        const preimageWitnessV1 = vi.fn().mockReturnValue(btcHashSentinel);

        const result = hashForWitnessV1([], { preimageWitnessV1 } as never, 3);

        expect(result).toBe(btcHashSentinel);
        expect(preimageWitnessV1).toHaveBeenCalledTimes(1);
        expect(preimageWitnessV1).toHaveBeenCalledWith(
            3,
            [],
            SigHash.DEFAULT,
            [],
        );
    });
});
