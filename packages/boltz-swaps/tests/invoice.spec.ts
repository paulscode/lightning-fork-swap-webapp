import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import bolt11 from "bolt11";
import { setBoltzSwapsConfig } from "boltz-swaps/config";
import {
    InvoiceType,
    MissingBlake2bFeatureError,
    assertPreimageHash,
    decodeInvoice,
    hasBlake2bFeature,
    isInvoice,
    isMissingBlake2bFeatureError,
    missingBlake2bFeatureMessage,
} from "boltz-swaps/invoice";
import { resolveInvoice } from "boltz-swaps/resolveInvoice";

// Real regtest invoices. The first comes from a Lightning Fork (BLAKE2b chain)
// lnd and sets the required feature bit 512 (`option_blake2b`); the second
// comes from a stock lnd on the SHA256 chain and does not.
const blake2bInvoice =
    "lnbcrt12340n1p4tktmzpp5ggdr84f68a08yqlz6yh06l0ul92n9jmq84nxun4geuxp7a309jnsdq8w3jhxaqcqzzsxqyz5vqsp55g06tmkp8nrh99hywklkstyn3u4sd4nqd9x2wp5ykuxy5sq2uzhq9r8yqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqpqysgq7je49q3ts6mf8h88wflj0977evmj4kunrt5h3xep29lcmmvp63k9ypt5p6u68g45dj2clcnthfe459sqf2wamuz2ty9l4rtj9vhel0qquxjkn5";
const sha256Invoice =
    "lnbcrt12340n1p4tkt6jpp59qm9ghv5e3302uk3z4l5c7mz7cg8x6zpmz7uyc2yt92ttf8qtd8sdqqcqzzsxqyz5vqsp5vt9hhkrtnlhewm00wt0m6curu4ak5k5ky66zwh99urdfata77xfs9qxpqysgqxfq2taljltqeky5nhy34l3ak7mmrvzsgd8m5y93v4m4str6wsw63rhvqaqfgu42uw0j9hfwq0r25njxktpy2eq2alxja2y7ngdhvz8gq4hwatk";

// bolt11 reports feature bits from 20 upwards in `extra_bits`
const featureBitsTag = (setBits: number[]) => {
    const startBit = 20;
    const bits: boolean[] = new Array<boolean>(520 - startBit).fill(false);
    for (const bit of setBits) {
        bits[bit - startBit] = true;
    }

    return {
        tagName: "feature_bits",
        data: {
            extra_bits: {
                start_bit: startBit,
                bits,
                has_required: setBits.some((bit) => bit % 2 === 0),
            },
        },
    };
};

describe("BLAKE2b feature bit", () => {
    afterEach(() => {
        vi.restoreAllMocks();
        setBoltzSwapsConfig({});
    });

    test("bolt11 exposes bit 512 of a BLAKE2b-chain invoice in extra_bits", () => {
        const decoded = bolt11.decode(blake2bInvoice);
        const features = decoded.tags.find(
            (tag) => tag.tagName === "feature_bits",
        )?.data as { extra_bits: { start_bit: number; bits: boolean[] } };

        expect(features.extra_bits.start_bit).toBe(20);
        expect(features.extra_bits.bits[512 - 20]).toBe(true);
        expect(hasBlake2bFeature(decoded)).toBe(true);
    });

    test("a SHA256-chain invoice has no BLAKE2b feature bit", () => {
        expect(hasBlake2bFeature(bolt11.decode(sha256Invoice))).toBe(false);
    });

    test("decodes a BLAKE2b-chain invoice", () => {
        const decoded = decodeInvoice(blake2bInvoice);
        expect(decoded.type).toBe(InvoiceType.Bolt11);
        expect(decoded.satoshis).toBe(1234);
        expect(decoded.preimageHash).toHaveLength(64);
    });

    test("refuses a SHA256-chain invoice with a clear message", () => {
        let thrown: unknown;
        try {
            decodeInvoice(sha256Invoice);
        } catch (e) {
            thrown = e;
        }

        expect(thrown).toBeInstanceOf(MissingBlake2bFeatureError);
        expect(isMissingBlake2bFeatureError(thrown)).toBe(true);
        expect((thrown as Error).message).toBe(missingBlake2bFeatureMessage);
        expect(missingBlake2bFeatureMessage).toBe(
            "This invoice was not made by a Lightning node on the Bitcoin BLAKE2b chain (it lacks feature bit 512). Paying it would fail.",
        );
    });

    test("accepts the optional variant, bit 513", () => {
        vi.spyOn(bolt11, "decode").mockReturnValue({
            satoshis: 1,
            tags: [
                { tagName: "payment_hash", data: "mock_hash" },
                featureBitsTag([25, 513]),
            ],
        } as unknown as ReturnType<typeof bolt11.decode>);

        expect(decodeInvoice("lnbc1mock").satoshis).toBe(1);
    });

    test("refuses an invoice with other high feature bits only", () => {
        vi.spyOn(bolt11, "decode").mockReturnValue({
            satoshis: 1,
            tags: [
                { tagName: "payment_hash", data: "mock_hash" },
                featureBitsTag([25, 510, 514]),
            ],
        } as unknown as ReturnType<typeof bolt11.decode>);

        expect(() => decodeInvoice("lnbc1mock")).toThrow(
            MissingBlake2bFeatureError,
        );
    });

    test("refuses an invoice without a features field", () => {
        vi.spyOn(bolt11, "decode").mockReturnValue({
            satoshis: 1,
            tags: [{ tagName: "payment_hash", data: "mock_hash" }],
        } as unknown as ReturnType<typeof bolt11.decode>);

        expect(() => decodeInvoice("lnbc1mock")).toThrow(
            MissingBlake2bFeatureError,
        );
    });

    describe("resolveInvoice on regtest", () => {
        beforeEach(() => {
            setBoltzSwapsConfig({ network: "regtest" });
        });

        test("resolves a pasted BLAKE2b-chain invoice", async () => {
            await expect(
                resolveInvoice(`lightning:${blake2bInvoice}`, 1234),
            ).resolves.toEqual({
                invoice: blake2bInvoice,
                type: InvoiceType.Bolt11,
            });
        });

        test("refuses a pasted SHA256-chain invoice", async () => {
            await expect(resolveInvoice(sha256Invoice, 1234)).rejects.toThrow(
                missingBlake2bFeatureMessage,
            );
        });
    });
});

describe("decodeInvoice bolt11 millisatoshi rounding", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test.each`
        millisatoshis | expectedSats | description
        ${1509895001} | ${1509895}   | ${"1 msat remainder - round down"}
        ${1509895499} | ${1509895}   | ${"499 msat remainder - round down"}
        ${1509895500} | ${1509896}   | ${"500 msat remainder - round up"}
        ${1509895999} | ${1509896}   | ${"999 msat remainder - round up"}
        ${1000}       | ${1}         | ${"exact conversion"}
        ${0}          | ${0}         | ${"zero amount"}
    `(
        "rounds $millisatoshis msat to $expectedSats sats ($description)",
        ({ millisatoshis, expectedSats }) => {
            vi.spyOn(bolt11, "decode").mockReturnValue({
                millisatoshis: millisatoshis.toString(),
                tags: [
                    { tagName: "payment_hash", data: "mock_hash" },
                    featureBitsTag([512]),
                ],
            } as unknown as ReturnType<typeof bolt11.decode>);

            expect(decodeInvoice("lnbc1mock").satoshis).toBe(expectedSats);
        },
    );
});

describe("decodeInvoice error handling", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    test("throws 'invalid invoice' when bolt11 cannot decode", () => {
        vi.spyOn(bolt11, "decode").mockImplementation(() => {
            throw new Error("bad bolt11");
        });

        let thrown: unknown;
        try {
            decodeInvoice("garbage");
        } catch (e) {
            thrown = e;
        }
        expect((thrown as Error).message).toBe("invalid invoice");
        expect(((thrown as Error).cause as Error).message).toBe("bad bolt11");
    });

    test("throws 'invalid invoice' when the payment hash is missing", () => {
        vi.spyOn(bolt11, "decode").mockReturnValue({
            satoshis: 1,
            tags: [featureBitsTag([512])],
        } as unknown as ReturnType<typeof bolt11.decode>);

        expect(() => decodeInvoice("lnbc1mock")).toThrow("invalid invoice");
    });
});

describe("assertPreimageHash", () => {
    const preimage = new Uint8Array([1, 2, 3, 4]);

    test("accepts a preimage matching the expected hash", () => {
        expect(() =>
            assertPreimageHash(hex.encode(sha256(preimage)), preimage),
        ).not.toThrow();
    });

    test("throws on a mismatched preimage", () => {
        expect(() => assertPreimageHash("00".repeat(32), preimage)).toThrow(
            /invalid preimage/,
        );
    });
});

describe("isInvoice", () => {
    afterEach(() => {
        setBoltzSwapsConfig({});
    });

    describe("regtest network", () => {
        beforeEach(() => {
            setBoltzSwapsConfig({ network: "regtest" });
        });

        test("accepts a regtest bolt11 prefix", () => {
            expect(isInvoice("lnbcrt1abc")).toBe(true);
        });

        test("rejects a mainnet bolt11 prefix that is not regtest", () => {
            expect(isInvoice("lnbc1abc")).toBe(false);
        });

        test("rejects a testnet bolt11 prefix", () => {
            expect(isInvoice("lntb1abc")).toBe(false);
        });

        test("is case-insensitive for the regtest prefix", () => {
            expect(isInvoice("LNBCRT1ABC")).toBe(true);
        });
    });

    describe("mainnet network", () => {
        beforeEach(() => {
            setBoltzSwapsConfig({ network: "mainnet" });
        });

        test("accepts a mainnet bolt11 prefix", () => {
            expect(isInvoice("lnbc1abc")).toBe(true);
        });

        test("accepts an amount before the HRP separator", () => {
            expect(isInvoice("lnbc2500u1pvjluez")).toBe(true);
        });

        test("rejects the bare prefix without an HRP separator", () => {
            expect(isInvoice("lnbc")).toBe(false);
            expect(isInvoice("lnbc1")).toBe(false);
        });

        test("rejects a Lightning address starting with the prefix", () => {
            expect(isInvoice("lnbc@example.com")).toBe(false);
        });

        test("rejects a regtest invoice that overlaps the mainnet prefix", () => {
            expect(isInvoice("lnbcrt1abc")).toBe(false);
        });

        test("rejects a testnet bolt11 prefix", () => {
            expect(isInvoice("lntb1abc")).toBe(false);
        });
    });

    describe("testnet network", () => {
        beforeEach(() => {
            setBoltzSwapsConfig({ network: "testnet" });
        });

        test("accepts a testnet bolt11 prefix", () => {
            expect(isInvoice("lntb1abc")).toBe(true);
        });

        test("rejects a mainnet bolt11 prefix", () => {
            expect(isInvoice("lnbc1abc")).toBe(false);
        });
    });

    test("rejects a bolt12 invoice", () => {
        setBoltzSwapsConfig({ network: "mainnet" });
        expect(isInvoice("lni1abc")).toBe(false);
    });

    describe("non-string input", () => {
        test("returns false for undefined", () => {
            expect(isInvoice(undefined as never)).toBe(false);
        });

        test("returns false for null", () => {
            expect(isInvoice(null as never)).toBe(false);
        });

        test("returns false for a number", () => {
            expect(isInvoice(123 as never)).toBe(false);
        });
    });
});
