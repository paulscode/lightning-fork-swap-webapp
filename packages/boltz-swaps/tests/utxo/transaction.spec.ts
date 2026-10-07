import { hex } from "@scure/base";
import { Transaction as BtcTransaction } from "@scure/btc-signer";
import type * as BoltzCore from "boltz-core";

import {
    constructClaim,
    constructRefund,
    decodeAddress,
    getNetwork,
    getOutputAmount,
    parseTransaction,
    setCooperativeWitness,
    txToHex,
    txToId,
} from "../../src/utxo/transaction.ts";

const { btcCCT, btcCRT, targetFeeMock } = vi.hoisted(() => ({
    btcCCT: vi.fn(() => ({ kind: "btc-tx" })),
    btcCRT: vi.fn(() => ({ kind: "btc-refund-tx" })),
    targetFeeMock: vi.fn((feePerVbyte: number, cb: (fee: bigint) => unknown) =>
        cb(BigInt(feePerVbyte)),
    ),
}));

vi.mock("boltz-core", async (importActual) => ({
    ...(await importActual<typeof BoltzCore>()),
    constructClaimTransaction: btcCCT,
    constructRefundTransaction: btcCRT,
    targetFee: targetFeeMock,
}));

const REGTEST_ADDR = "bcrt1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080";
const REGTEST_SCRIPT_HEX = "0014751e76e8199196d454941c45d1b3a323f1433bd6";

const RAW_BTC_TX_HEX =
    "0200000001abababababababababababababababababababababababababababababababab" +
    "0000000000ffffffff010000000000000000016a00000000";
const RAW_BTC_TX_ID =
    "4da07ab29c283e1481b70fd0f182652543c34c1d5c4bb01d5624a09d7501af16";

beforeEach(() => {
    btcCCT.mockClear();
    btcCRT.mockClear();
    targetFeeMock.mockClear();
});

describe("utxo/transaction", () => {
    describe("getNetwork", () => {
        test("selects the boltz-core BTC network", async () => {
            const { Networks } = await import("boltz-core");
            expect(getNetwork("regtest")).toBe(Networks.regtest);
            expect(getNetwork("mainnet")).toBe(Networks.bitcoin);
            expect(getNetwork("testnet")).toBe(Networks.testnet);
        });

        test("throws on an unknown network", () => {
            expect(() => getNetwork("signet" as never)).toThrow(
                "unknown network: signet",
            );
        });
    });

    describe("decodeAddress", () => {
        test("decodes a regtest address to its output script", () => {
            const decoded = decodeAddress(REGTEST_ADDR, "regtest");
            expect(hex.encode(decoded.script)).toBe(REGTEST_SCRIPT_HEX);
        });

        test("throws when the address cannot be decoded", () => {
            expect(() =>
                decodeAddress("not-a-valid-address", "regtest"),
            ).toThrow();
        });

        test("throws when the address is for another network", () => {
            expect(() => decodeAddress(REGTEST_ADDR, "mainnet")).toThrow();
        });
    });

    describe("parseTransaction", () => {
        test("parses a raw hex tx and round-trips via txToHex/txToId", () => {
            const tx = parseTransaction(RAW_BTC_TX_HEX);
            expect(tx).toBeInstanceOf(BtcTransaction);
            expect(txToHex(tx)).toBe(RAW_BTC_TX_HEX);
            expect(txToId(tx)).toBe(RAW_BTC_TX_ID);
        });
    });

    describe("constructClaim", () => {
        const utxos = [{ marker: "utxo", amount: 50_000n }] as never;
        const destinationScript = hex.decode(REGTEST_SCRIPT_HEX);

        test("forwards to boltz-core constructClaimTransaction with a bigint fee", () => {
            const result = constructClaim(utxos, destinationScript, 100, true);

            expect(btcCCT).toHaveBeenCalledTimes(1);
            expect(btcCCT).toHaveBeenCalledWith(
                utxos,
                destinationScript,
                100n,
                true,
            );
            expect(btcCCT.mock.calls[0]).toHaveLength(4);
            expect(result).toEqual({ kind: "btc-tx" });
        });

        test.each`
            amount        | fee        | allowed
            ${10_000n}    | ${3_000}   | ${true}
            ${10_000n}    | ${3_001}   | ${false}
            ${200_000n}   | ${20_000}  | ${true}
            ${200_000n}   | ${20_001}  | ${false}
            ${1_000_000n} | ${100_000} | ${true}
        `(
            "allows a fee of $fee for $amount: $allowed",
            ({ amount, fee, allowed }) => {
                const build = () =>
                    constructClaim(
                        [{ amount }] as never,
                        destinationScript,
                        fee,
                        true,
                    );
                if (allowed) {
                    expect(build).not.toThrow();
                } else {
                    expect(build).toThrow(/would exceed the limit/);
                    expect(btcCCT).not.toHaveBeenCalled();
                }
            },
        );

        test("refuses inputs without an amount", () => {
            expect(() =>
                constructClaim(
                    [{ marker: "utxo" }] as never,
                    destinationScript,
                    100,
                ),
            ).toThrow("inputs without an amount");
        });
    });

    describe("getOutputAmount", () => {
        test("returns the numeric output amount", () => {
            const output = { amount: 123_456n } as never;
            expect(getOutputAmount(output)).toBe(123_456);
        });
    });

    describe("constructRefund", () => {
        const refundDetails = [{ marker: "refund", amount: 100_000n }] as never;
        const outputScript = hex.decode(REGTEST_SCRIPT_HEX);

        test("targets the fee via targetFee and forwards the fee to the builder", () => {
            const result = constructRefund(
                refundDetails,
                outputScript,
                150,
                5,
                true,
            );

            expect(targetFeeMock).toHaveBeenCalledTimes(1);
            expect(targetFeeMock.mock.calls[0]).toHaveLength(2);
            expect(targetFeeMock.mock.calls[0][0]).toBe(5);
            expect(btcCRT).toHaveBeenCalledWith(
                refundDetails,
                outputScript,
                150,
                5n,
                true,
            );
            expect(result).toEqual({ kind: "btc-refund-tx" });
        });

        test.each`
            rate
            ${0}
            ${-1}
            ${1_001}
            ${Number.NaN}
            ${Number.POSITIVE_INFINITY}
            ${"5"}
        `("refuses a fee rate of $rate", ({ rate }) => {
            expect(() =>
                constructRefund(refundDetails, outputScript, 150, rate, true),
            ).toThrow(/invalid fee rate/);
            expect(btcCRT).not.toHaveBeenCalled();
        });

        test("refuses a rate that would spend more than the limit", () => {
            // The mock targets a fee equal to the rate: 1,000 sat on 5,000
            // sat is within 3,000; on a 1,000 sat input, too
            expect(() =>
                constructRefund(
                    [{ amount: 5_000n }] as never,
                    outputScript,
                    150,
                    1_000,
                    true,
                ),
            ).not.toThrow();
            targetFeeMock.mockImplementationOnce((_rate, cb) => cb(4_000n));
            expect(() =>
                constructRefund(
                    [{ amount: 5_000n }] as never,
                    outputScript,
                    150,
                    20,
                    true,
                ),
            ).toThrow(/would exceed the limit of 3000 sat for 5000 sat/);
        });
    });

    describe("setCooperativeWitness", () => {
        test("finalizes the input witness via updateInput", () => {
            const updateInput = vi.fn();
            const tx = { updateInput } as never;
            const witness = new Uint8Array([1, 2, 3]);

            setCooperativeWitness(tx, 0, witness);

            expect(updateInput).toHaveBeenCalledWith(0, {
                finalScriptWitness: [witness],
            });
        });
    });
});
