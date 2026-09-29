import BigNumber from "bignumber.js";
import { getConfiguredNetwork } from "boltz-swaps/config";

import { BTC, LN } from "../../src/consts/Assets";
import { Denomination, InvoiceValidation } from "../../src/consts/Enums";
import { formatAmount, formatDenomination } from "../../src/utils/denomination";
import {
    extractAddress,
    extractBip21Amount,
    extractInvoice,
    getAssetByBip21Prefix,
    invoiceAmountLabel,
    isBip21,
    isInvoice,
    isLnurl,
} from "../../src/utils/invoice";
import { blake2bInvoice, sha256Invoice } from "../fixtures/invoices";

describe("invoice", () => {
    test.each`
        expected | data
        ${true}  | ${"m@lnurl.some.domain"}
        ${true}  | ${"lightning:m@lnurl.some.domain"}
        ${true}  | ${"LNURL1DP68GURN8GHJ7MRWW4EXCTNDD93KSCT9DSCNQVF39ESHGTMPWP5J7MRWW4EXCUQGY84ZH"}
        ${true}  | ${"lightning:LNURL1DP68GURN8GHJ7MRWW4EXCTNDD93KSCT9DSCNQVF39ESHGTMPWP5J7MRWW4EXCUQGY84ZH"}
        ${true}  | ${"m@boltz.exchange"}
        ${true}  | ${"lightning:m@boltz.exchange"}
        ${false} | ${"m@lnurl@bol.tz"}
        ${false} | ${"m@lnurl"}
        ${false} | ${"m@lnurl."}
        ${false} | ${"lnurl.some.domain"}
        ${false} | ${"LNURL1DP6fasdklfjasdf"}
    `(
        "should determine if $data is lnurl ($expected)",
        ({ data, expected }) => {
            expect(isLnurl(data)).toEqual(expected);
        },
    );

    test("should trim lightning: prefix of invoices", () => {
        const invoice = "lnbcrt4986620n1pjgkj07pp5zl";

        expect(extractInvoice(invoice)).toEqual(invoice);
        expect(extractInvoice(`lightning:${invoice}`)).toEqual(invoice);
        expect(extractInvoice(`LIGHTNING:${invoice}`)).toEqual(invoice);
        expect(extractInvoice(`lightning:${invoice}?label=test`)).toEqual(
            invoice,
        );
    });

    test.each`
        result   | prefix
        ${true}  | ${"bitcoin:"}
        ${true}  | ${"BITCOIN:"}
        ${false} | ${"liquidnetwork:"}
        ${false} | ${"liquid:"}
        ${false} | ${"boltz:"}
    `("should be bip21 $prefix -> $result", ({ result, prefix }) => {
        expect(isBip21(prefix)).toEqual(result);
    });

    test.each`
        bip21                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | invoice
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount=0.00001&label=sbddesign%3A%20For%20lunch%20Tuesday&message=For%20lunch%20Tuesday&lightning=LNBC10U1P3PJ257PP5YZTKWJCZ5FTL5LAXKAV23ZMZEKAW37ZK6KMV80PK4XAEV5QHTZ7QDPDWD3XGER9WD5KWM36YPRX7U3QD36KUCMGYP282ETNV3SHJCQZPGXQYZ5VQSP5USYC4LK9CHSFP53KVCNVQ456GANH60D89REYKDNGSMTJ6YW3NHVQ9QYYSSQJCEWM5CJWZ4A6RFJX77C490YCED6PEMK0UPKXHY89CMM7SCT66K8GNEANWYKZGDRWRFJE69H9U5U0W57RRCSYSAS7GADWMZXC8C6T0SPJAZUP6"} | ${"lnbc10u1p3pj257pp5yztkwjcz5ftl5laxkav23zmzekaw37zk6kmv80pk4xaev5qhtz7qdpdwd3xger9wd5kwm36yprx7u3qd36kucmgyp282etnv3shjcqzpgxqyz5vqsp5usyc4lk9chsfp53kvcnvq456ganh60d89reykdngsmtj6yw3nhvq9qyyssqjcewm5cjwz4a6rfjx77c490yced6pemk0upkxhy89cmm7sct66k8gneanwykzgdrwrfje69h9u5u0w57rrcsysas7gadwmzxc8c6t0spjazup6"}
    `("should trim bip21 lightning invoice", ({ bip21, invoice }) => {
        expect(extractInvoice(bip21)).toEqual(invoice);
    });

    test.each`
        bip21                                                                                                                                             | address
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount=0.00001&label=sbddesign%3A%20For%20lunch%20Tuesday&message=For%20lunch%20Tuesday"} | ${"BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5"}
        ${"bitcoin:2NDkcnHAnugU1aQ5bv522MeZTgv6tQs2rt8?amount=0.00183723&label=Send%20to%20BTC%20lightning"}                                              | ${"2NDkcnHAnugU1aQ5bv522MeZTgv6tQs2rt8"}
    `("should trim bip21 address: $bip21", ({ bip21, address }) => {
        expect(extractAddress(bip21)).toEqual(address);
    });

    test.each`
        bip21
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount=0.00001&label=sbddesign%3A%20For%20lunch%20Tuesday&message=For%20lunch%20Tuesday"}
    `("should not return invoice on bip21 address: $bip21", ({ bip21 }) => {
        expect(extractInvoice(bip21)).toEqual(null);
    });

    test.each`
        data                                                                                 | amount
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount=0.00001&label=lunch"} | ${BigNumber("0.00001")}
        ${"BITCOIN:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?AMOUNT=0.00001&LABEL=LUNCH"} | ${BigNumber("0.00001")}
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?label=lunch"}                | ${null}
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5"}                            | ${null}
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount="}                    | ${null}
        ${"bitcoin:BCRT1Q78QTNJRT53GAUK6H2W32WANE62JJG2GVVAL6W5?amount=junk"}                | ${null}
        ${"bcrt1q78qtnjrt53gauk6h2w32wane62jjg2gvval6w5"}                                    | ${null}
        ${"lnbcrt4986620n1pjgkj07pp5zl"}                                                     | ${null}
    `("should extract bip21 amount of $data -> $amount", ({ data, amount }) => {
        expect(extractBip21Amount(data)).toEqual(amount);
    });

    describe("isInvoice", () => {
        const mainnetInvoice =
            "lnbc678450n1pj8hf4kpp5kxh4x93kvxt43q0k0q6t3fp6gfhgusqxsajj6lcexsrg4lzm7rrqdq5g9kxy7fqd9h8vmmfvdjscqzzsxqyz5vqsp5n4rzwr2lzw68082ws4tjjerp2t5eluny75xx54jr530x073tvvzs9qyyssq3f43e2mzqx07zzt529ux480nj00908p3u5qdwhyuk3qrcepaqsjxqjhcnfde4ta74c3dkxkhwscxfhdm5v0y7qh7np22v9xc220taacqjanm3m";
        const regtestInvoice = blake2bInvoice;

        test("accepts bolt11 invoices for the configured network", () => {
            const network = getConfiguredNetwork();
            const configuredInvoice =
                network === "regtest" ? regtestInvoice : mainnetInvoice;
            const otherNetworkInvoice =
                network === "regtest" ? mainnetInvoice : regtestInvoice;

            expect(isInvoice(configuredInvoice)).toBe(true);
            expect(isInvoice(otherNetworkInvoice)).toBe(false);
        });
    });

    describe("getAssetByBip21Prefix", () => {
        test.each`
            prefix              | expected
            ${"bitcoin:"}       | ${BTC}
            ${"liquidnetwork:"} | ${""}
            ${"lightning:"}     | ${LN}
            ${"unknown:"}       | ${""}
        `("maps $prefix to its asset", ({ prefix, expected }) => {
            expect(getAssetByBip21Prefix(prefix)).toBe(expected);
        });
    });

    describe("isInvoice extra cases", () => {
        test("does not treat a bolt12 invoice (lni prefix) as an invoice", () => {
            expect(isInvoice("lni1qqgypua5")).toBe(false);
        });

        test("recognizes both BLAKE2b and SHA256-chain invoices by prefix", () => {
            // isInvoice only checks the format; the BLAKE2b feature bit is
            // enforced when the invoice is decoded
            expect(isInvoice(blake2bInvoice)).toBe(true);
            expect(isInvoice(sha256Invoice)).toBe(true);
            expect(isInvoice(blake2bInvoice.toUpperCase())).toBe(true);
        });

        test("does not treat a Lightning address with an lnbcrt user as an invoice", () => {
            expect(isInvoice("lnbcrt@example.com")).toBe(false);
        });

        test("returns false for non-string input", () => {
            expect(isInvoice(undefined as never)).toBe(false);
            expect(isInvoice(null as never)).toBe(false);
            expect(isInvoice(123 as never)).toBe(false);
        });
    });

    describe("invoiceAmountLabel", () => {
        const options = {
            denomination: Denomination.Sat,
            separator: " ",
            asset: BTC,
        };

        test("maps an exact-amount mismatch to the required-amount label", () => {
            const requiredSats = 1529;
            const error = new Error(InvoiceValidation.ExactAmount, {
                cause: requiredSats,
            });

            expect(invoiceAmountLabel(error, options)).toEqual({
                key: "exact_amount_destination",
                params: {
                    amount: formatAmount(
                        BigNumber(requiredSats),
                        options.denomination,
                        options.separator,
                        options.asset,
                    ),
                    denomination: formatDenomination(
                        options.denomination,
                        options.asset,
                    ),
                },
            });
        });

        test("ignores errors that are not invoice validation errors", () => {
            expect(
                invoiceAmountLabel(new Error("invalid_invoice"), options),
            ).toBeUndefined();
        });
    });
});
