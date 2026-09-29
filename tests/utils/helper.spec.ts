import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hex } from "@scure/base";
import type { Pairs } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import { BTC, LN } from "../../src/consts/Assets";
import { ECPair } from "../../src/utils/ecpair";
import {
    coalesceLn,
    cropString,
    formatAddress,
    getDestinationAddress,
    getPair,
    getReferral,
    parsePrivateKey,
} from "../../src/utils/helper";
import type { ReverseSwap, SubmarineSwap } from "../../src/utils/swapCreator";

vi.mock("../../src/utils/ecpair", () => {
    return {
        ECPair: {
            fromWIF: vi.fn().mockReturnValue({ key: "data" }),
            fromPrivateKey: vi.fn().mockReturnValue({ key: "data" }),
        },
    };
});

describe("helper", () => {
    test.each`
        swapType       | assetSend     | assetReceive  | expected
        ${"submarine"} | ${"notFound"} | ${"notFound"} | ${undefined}
        ${"submarine"} | ${BTC}        | ${LN}         | ${{ pair: 1 }}
        ${"submarine"} | ${BTC}        | ${BTC}        | ${{ pair: 1 }}
        ${"submarine"} | ${LN}         | ${BTC}        | ${{ pair: 1 }}
        ${"submarine"} | ${BTC}        | ${"other"}    | ${undefined}
        ${"reverse"}   | ${LN}         | ${BTC}        | ${{ pair: 2 }}
        ${"reverse"}   | ${"other"}    | ${BTC}        | ${undefined}
        ${"chain"}     | ${BTC}        | ${BTC}        | ${undefined}
    `(
        "should get pair from config, expect: `$expected` from `$swapType: $assetSend > $assetReceive`",
        ({ swapType, assetSend, assetReceive, expected }) => {
            const config = {
                submarine: {
                    BTC: {
                        BTC: {
                            pair: 1,
                        },
                    },
                },
                reverse: {
                    BTC: {
                        BTC: {
                            pair: 2,
                        },
                    },
                },
            } as unknown as Pairs;

            expect(getPair(config, swapType, assetSend, assetReceive)).toEqual(
                expected,
            );
        },
    );

    test("getPair returns undefined without pairs", () => {
        expect(getPair(undefined, SwapType.Submarine, BTC, LN)).toBeUndefined();
    });

    test("coalesceLn maps LN to BTC and leaves other assets alone", () => {
        expect(coalesceLn(LN)).toEqual(BTC);
        expect(coalesceLn(BTC)).toEqual(BTC);
        expect(coalesceLn("other")).toEqual("other");
    });

    test("cropString keeps short strings and crops long ones", () => {
        expect(cropString("short")).toEqual("short");
        const long = "a".repeat(20) + "b".repeat(20);
        expect(cropString(long)).toEqual(
            `${"a".repeat(19)}...${"b".repeat(19)}`,
        );
    });

    describe("parsePrivateKey", () => {
        test("should use derive function when keyIndex is provided", () => {
            const keyIndex = 42;
            const key = { key: "data" };
            const mockDerive = vi.fn().mockReturnValue(key);

            expect(parsePrivateKey(mockDerive, BTC, keyIndex)).toBe(key);
            expect(mockDerive).toHaveBeenCalledTimes(1);
            expect(mockDerive).toHaveBeenCalledWith(keyIndex, BTC);
        });

        test("should parse hex private key", () => {
            const privateKeyHex = hex.encode(secp256k1.utils.randomSecretKey());
            const mockResult = { key: "data" };
            vi.mocked(ECPair.fromPrivateKey).mockReturnValueOnce(
                mockResult as never,
            );

            const mockDerive = vi.fn();

            expect(
                parsePrivateKey(mockDerive, BTC, undefined, privateKeyHex),
            ).toEqual(mockResult);

            // Verify derive function wasn't called
            expect(mockDerive).not.toHaveBeenCalled();
            expect(ECPair.fromPrivateKey).toHaveBeenCalledTimes(1);
        });
    });

    describe("formatAddress", () => {
        test.each`
            groupSize    | expected
            ${undefined} | ${["bcrt1", "qrhg8", "z3ccu", "8vmnz", "7xvwx", "8t92m", "ykw6r", "u64k9", "6e4v"]}
            ${5}         | ${["bcrt1", "qrhg8", "z3ccu", "8vmnz", "7xvwx", "8t92m", "ykw6r", "u64k9", "6e4v"]}
            ${4}         | ${["bcrt", "1qrh", "g8z3", "ccu8", "vmnz", "7xvw", "x8t9", "2myk", "w6ru", "64k9", "6e4v"]}
        `(
            "should format address in groups of $groupSize characters",
            ({ groupSize, expected }) => {
                const address = "bcrt1qrhg8z3ccu8vmnz7xvwx8t92mykw6ru64k96e4v";
                expect(formatAddress(address, groupSize)).toEqual(expected);
            },
        );

        test("should handle empty string", () => {
            expect(formatAddress("")).toEqual([]);
        });

        test("should format short addresses", () => {
            expect(formatAddress("abc")).toEqual(["abc"]);
            expect(formatAddress("abcde")).toEqual(["abcde"]);
            expect(formatAddress("abcdef")).toEqual(["abcde", "f"]);
        });

        test("should handle null or undefined gracefully", () => {
            expect(formatAddress(null)).toEqual([]);
            expect(formatAddress(undefined)).toEqual([]);
        });
    });

    describe("getDestinationAddress", () => {
        test("should return originalDestination for submarine swap (Lightning address/LNURL)", () => {
            const swap = {
                type: SwapType.Submarine,
                assetReceive: "BTC",
                invoice: "lnbcrt1234567890abcdefghijklmnopqrstuvwxyz1234567890",
                originalDestination: "user@example.com",
            } as SubmarineSwap;

            expect(getDestinationAddress(swap)).toBe("user@example.com");
        });

        test("should fallback to invoice for submarine swap without originalDestination", () => {
            const swap = {
                type: SwapType.Submarine,
                assetReceive: "BTC",
                invoice: "lnbcrt1234567890abcdefghijklmnopqrstuvwxyz1234567890",
            } as SubmarineSwap;

            expect(getDestinationAddress(swap)).toBe(
                "lnbcrt1234567890abcdefghijklmnopqrstuvwxyz1234567890",
            );
        });

        test("should return originalDestination for a reverse swap", () => {
            const swap = {
                type: SwapType.Reverse,
                assetReceive: BTC,
                claimAddress: "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
                originalDestination:
                    "bitcoin:bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            } as ReverseSwap;

            expect(getDestinationAddress(swap)).toBe(
                "bitcoin:bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            );
        });

        test("should fallback to claimAddress for a reverse swap", () => {
            const swap = {
                type: SwapType.Reverse,
                assetReceive: BTC,
                claimAddress: "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            } as ReverseSwap;

            expect(getDestinationAddress(swap)).toBe(
                "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            );
        });

        test("returns empty string for null/undefined swap", () => {
            expect(getDestinationAddress(null)).toBe("");
            expect(getDestinationAddress(undefined)).toBe("");
        });
    });

    describe("referral helpers", () => {
        const originalUserAgent = navigator.userAgent;

        const setUserAgent = (ua: string) => {
            Object.defineProperty(navigator, "userAgent", {
                configurable: true,
                value: ua,
            });
        };

        afterEach(() => {
            setUserAgent(originalUserAgent);
        });

        test("getReferral returns desktop referral on desktop", () => {
            setUserAgent("Mozilla/5.0 (X11; Linux x86_64)");
            expect(getReferral()).toBe("lightning_fork_swap_desktop");
        });

        test("getReferral returns mobile referral on Android", () => {
            setUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36");
            expect(getReferral()).toBe("lightning_fork_swap_mobile");
        });

        test("getReferral returns mobile referral on iOS", () => {
            setUserAgent(
                "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
            );
            expect(getReferral()).toBe("lightning_fork_swap_mobile");
        });
    });
});
