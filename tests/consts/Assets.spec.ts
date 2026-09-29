import { AssetKind } from "boltz-swaps/types";

import {
    BTC,
    LN,
    assets,
    getAssetDisplaySymbol,
    getAssetNetwork,
    getKindForAsset,
    refundableAssets,
} from "../../src/consts/Assets";

describe("Assets", () => {
    test("should offer Lightning and BTC only", () => {
        expect(assets).toEqual([LN, BTC]);
    });

    test("should only refund BTC", () => {
        expect(refundableAssets).toEqual([BTC]);
    });

    describe("getAssetNetwork", () => {
        test.each`
            input          | expected
            ${BTC}         | ${"Bitcoin (BLAKE2b)"}
            ${LN}          | ${"Lightning"}
            ${"L-BTC"}     | ${null}
            ${"not-a-key"} | ${null}
        `("$input -> $expected", ({ input, expected }) => {
            expect(getAssetNetwork(input)).toBe(expected);
        });
    });

    describe("getAssetDisplaySymbol", () => {
        test.each`
            input  | expected
            ${BTC} | ${"BTC"}
            ${LN}  | ${"LN"}
        `("$input -> $expected", ({ input, expected }) => {
            expect(getAssetDisplaySymbol(input)).toBe(expected);
        });
    });

    describe("getKindForAsset", () => {
        test.each`
            input          | expected
            ${BTC}         | ${AssetKind.UTXO}
            ${LN}          | ${AssetKind.UTXO}
            ${"not-a-key"} | ${AssetKind.UTXO}
        `("$input -> $expected", ({ input, expected }) => {
            expect(getKindForAsset(input)).toBe(expected);
        });
    });
});
