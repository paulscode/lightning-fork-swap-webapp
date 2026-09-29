import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";

import { BTC } from "../../src/consts/Assets";
import {
    Errors,
    type RescueFile,
    derivationPath,
    deriveKey,
    derivePreimage,
    derivePreimageFromRescueKey,
    generateRescueFile,
    getXpub,
    mnemonicToHDKey,
    validateRescueFile,
} from "../../src/utils/rescueFile";

describe("rescueFile", () => {
    const rescueFile: RescueFile = {
        mnemonic:
            "invite smile evidence shield frost source truly ball odor unfold example nuclear",
    } as const;

    describe("getXpub", () => {
        test("should derive xpub from mnemonic", () => {
            const xpub = getXpub(rescueFile);
            expect(xpub).toEqual(
                "xpub661MyMwAqRbcG5eD5Hh9EddaCEik4rxpJA1RDEsxjujXzGsJDg4kT7EXC8GPM4ZZLVCoNA8fArGbjqKmo6M6khKTaTmYBJNTQXCFrejsgCi",
            );
        });

        test("should throw error if mnemonic is invalid", () => {
            expect(() =>
                getXpub({
                    mnemonic: "invalid",
                }),
            ).toThrow();
        });
    });

    describe("derivationPath", () => {
        test("should be the expected BIP44 path", () => {
            expect(derivationPath).toBe("m/44/0/0/0");
        });
    });

    describe("mnemonicToHDKey", () => {
        test("should derive an HDKey from a mnemonic", () => {
            const hdKey = mnemonicToHDKey(rescueFile.mnemonic);
            expect(hdKey).toBeDefined();
            expect(hdKey.publicExtendedKey).toBeDefined();
            expect(hdKey.privateExtendedKey).toBeDefined();
        });

        test("should produce the same key for the same mnemonic", () => {
            const key1 = mnemonicToHDKey(rescueFile.mnemonic);
            const key2 = mnemonicToHDKey(rescueFile.mnemonic);
            expect(key1.publicExtendedKey).toEqual(key2.publicExtendedKey);
        });

        test("should produce different keys for different mnemonics", () => {
            const other = generateRescueFile();
            const key1 = mnemonicToHDKey(rescueFile.mnemonic);
            const key2 = mnemonicToHDKey(other.mnemonic);
            expect(key1.publicExtendedKey).not.toEqual(key2.publicExtendedKey);
        });
    });

    describe("generateRescueFile", () => {
        test("should generate a valid rescue file", () => {
            const rescueFile = generateRescueFile();

            expect(rescueFile).toHaveProperty("mnemonic");
            expect(typeof rescueFile.mnemonic).toBe("string");

            // Verify the mnemonic is valid by deriving an xpub from it
            expect(() => getXpub(rescueFile)).not.toThrow();
        });
    });

    describe("deriveKey", () => {
        test.each`
            index | expected
            ${0}  | ${"cb9774710e1d1eaa747a38fff23b20cbb5847e1586e97ebdca36489f3a0105d8"}
            ${1}  | ${"72a43f69c3a4cc4a2ebae6c8b12e7b56ebec3423c0acb40eba422792c8d27d6a"}
            ${2}  | ${"217c41a6670f1a104b5f0b17b0e1b60da97339c259a215825b85aed654537efc"}
        `(
            "should derive a BTC key at specified index",
            ({ index, expected }) => {
                const derivedKey = deriveKey(rescueFile, index, BTC);

                expect(derivedKey).toBeDefined();
                expect(derivedKey.privateKey).toBeDefined();
                expect(
                    Buffer.from(derivedKey.privateKey!).toString("hex"),
                ).toEqual(expected);
            },
        );

        test("should derive the same key regardless of the asset", () => {
            const withAsset = deriveKey(rescueFile, 0, BTC);
            const withoutAsset = deriveKey(rescueFile, 0);

            expect(hex.encode(withAsset.privateKey!)).toEqual(
                hex.encode(withoutAsset.privateKey!),
            );
        });

        test("should derive the same key when hdKey is provided", () => {
            const hdKey = mnemonicToHDKey(rescueFile.mnemonic);
            const withoutHdKey = deriveKey(rescueFile, 0, BTC);
            const withHdKey = deriveKey(rescueFile, 0, BTC, hdKey);

            expect(
                Buffer.from(withoutHdKey.privateKey!).toString("hex"),
            ).toEqual(Buffer.from(withHdKey.privateKey!).toString("hex"));
        });
    });

    describe("derivePreimageFromRescueKey", () => {
        test("should be the sha256 of the derived private key", () => {
            const privateKey = deriveKey(rescueFile, 3, BTC).privateKey!;
            const preimage = derivePreimageFromRescueKey(rescueFile, 3, BTC);

            expect(hex.encode(preimage)).toEqual(
                hex.encode(sha256(privateKey)),
            );
            expect(hex.encode(derivePreimage(privateKey))).toEqual(
                hex.encode(preimage),
            );
        });

        test("should return a 32-byte sha256 hash", () => {
            const preimage = derivePreimageFromRescueKey(rescueFile, 0, BTC);
            expect(preimage).toBeInstanceOf(Uint8Array);
            expect(preimage.length).toBe(32);
        });

        test("should be deterministic", () => {
            const p1 = derivePreimageFromRescueKey(rescueFile, 0, BTC);
            const p2 = derivePreimageFromRescueKey(rescueFile, 0, BTC);
            expect(hex.encode(p1)).toEqual(hex.encode(p2));
        });

        test("should derive different preimages for different indices", () => {
            const p0 = derivePreimageFromRescueKey(rescueFile, 0, BTC);
            const p1 = derivePreimageFromRescueKey(rescueFile, 1, BTC);
            expect(hex.encode(p0)).not.toEqual(hex.encode(p1));
        });

        test("should produce same result with and without hdKey", () => {
            const hdKey = mnemonicToHDKey(rescueFile.mnemonic);
            const without = derivePreimageFromRescueKey(rescueFile, 0, BTC);
            const with_ = derivePreimageFromRescueKey(
                rescueFile,
                0,
                BTC,
                hdKey,
            );
            expect(hex.encode(without)).toEqual(hex.encode(with_));
        });
    });

    describe("validateRescueFile", () => {
        test("should accept valid rescue file", () => {
            expect(validateRescueFile(rescueFile)).toEqual(rescueFile);
        });

        test("should throw error for invalid rescue file", () => {
            const data = {
                id: "uYZcNe",
                asset: "BTC",
                privateKey:
                    "def0a13214538650fb84a7545c9b81128a639f55147cdd61c46d5ea0f70045a3",
            };

            expect(() => validateRescueFile(data)).toThrow(Errors.InvalidFile);
        });

        test("should throw error if mnemonic is invalid", () => {
            const data = {
                mnemonic: "invalid",
            };

            expect(() => validateRescueFile(data)).toThrow(
                Errors.InvalidMnemonic,
            );
        });
    });
});
