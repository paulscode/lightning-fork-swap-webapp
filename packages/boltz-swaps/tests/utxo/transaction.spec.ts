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
        const utxos = [{ marker: "utxo" }] as never;
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
    });

    describe("getOutputAmount", () => {
        test("returns the numeric output amount", () => {
            const output = { amount: 123_456n } as never;
            expect(getOutputAmount(output)).toBe(123_456);
        });
    });

    describe("constructRefund", () => {
        const refundDetails = [{ marker: "refund" }] as never;
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
