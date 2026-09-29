import { Networks } from "boltz-core";

import { BTC, LN } from "../../src/consts/Assets";
import {
    decodeAddress,
    getNetwork,
    probeUserInput,
    validateAddress,
} from "../../src/utils/compat";
import { blake2bInvoice, sha256Invoice } from "../fixtures/invoices";

describe("parse network correctly", () => {
    test.each`
        network      | expected
        ${"mainnet"} | ${Networks.bitcoin}
        ${"testnet"} | ${Networks.testnet}
        ${"regtest"} | ${Networks.regtest}
    `("$network", ({ network, expected }) => {
        expect(getNetwork(BTC, network)).toEqual(expected);
    });

    test("defaults to the configured network", () => {
        expect(getNetwork(BTC)).toEqual(Networks.regtest);
    });

    test.each`
        asset  | input
        ${BTC} | ${"bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad"}
        ${BTC} | ${"bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc"}
        ${BTC} | ${"2NDkcnHAnugU1aQ5bv522MeZTgv6tQs2rt8"}
        ${BTC} | ${"mpSn4rFm3zmDesvNi2N2Fp86ae3wSFAUG4"}
        ${BTC} | ${"bitcoin:bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad?amount=0.0001"}
        ${LN}  | ${blake2bInvoice}
        ${LN}  | ${sha256Invoice}
        ${LN}  | ${`lightning:${blake2bInvoice}`}
        ${LN}  | ${"LNURL1DP68GURN8GHJ7MRWW4EXCTNDD93KSCT9DSCNQVF39ESHGTMPWP5J7MRWW4EXCUQGY84ZH"}
        ${LN}  | ${"admin@bol.tz"}
    `("should probe user input for $input", ({ input, asset }) => {
        for (const expectedAsset of ["", BTC, LN]) {
            expect(probeUserInput(expectedAsset, input)).toEqual(asset);
        }
    });

    test.each`
        input
        ${"bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"}
        ${"el1qq2yjqfz9evc3c5m0rzw0cdtfcdfl5kmcf9xsskpsgza34zhezxzq7y6y4dnldxhtd935k8dn63n8cywy3jlzuvftycsmytjmu"}
        ${"ert1qzdz2kelknt4kjc6trkeagenuz8zge03wc88dqw"}
        ${"0xd8da6bf26964af9d7eed9e03e53415d37aa96045"}
        ${"not an address"}
    `("should not detect an asset for $input", ({ input }) => {
        for (const expectedAsset of ["", BTC, LN]) {
            expect(probeUserInput(expectedAsset, input)).toEqual(null);
        }
    });

    test("should return null for non-string input", () => {
        expect(probeUserInput(BTC, undefined as never)).toEqual(null);
    });
});

describe("addresses", () => {
    test("validateAddress accepts a regtest address", () => {
        expect(
            validateAddress(
                BTC,
                "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            ),
        ).toEqual(true);
    });

    test("validateAddress rejects a mainnet address on regtest", () => {
        expect(
            validateAddress(BTC, "bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"),
        ).toEqual(false);
    });

    test("decodeAddress returns the output script", () => {
        const { script } = decodeAddress(
            BTC,
            "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
        );
        // P2WPKH: OP_0 <20 bytes>
        expect(script.length).toEqual(22);
        expect(script[0]).toEqual(0);
    });
});
