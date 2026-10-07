// Node environment: under jsdom, bolt11's signature recovery fails its
// Uint8Array check (Buffer and the jsdom globals come from different realms),
// so real invoices cannot be decoded there.
// @vitest-environment node
import { hex } from "@scure/base";
import bolt11 from "bolt11";
import type * as InvoiceModule from "boltz-swaps/invoice";
import {
    InvoiceType,
    MissingBlake2bFeatureError,
    decodeInvoice,
} from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";
import log from "loglevel";

import { BTC, LN } from "../../src/consts/Assets";
import { decodeAddress } from "../../src/utils/compat";
import { ECPair } from "../../src/utils/ecpair";
import {
    swapBip21,
    validateInvoice,
    validateResponse,
} from "../../src/utils/validation";
import {
    blake2bInvoice,
    invoiceAmount,
    sha256Invoice,
} from "../fixtures/invoices";

const realDecode = vi.hoisted(() => ({
    decodeInvoice: undefined as unknown as typeof InvoiceModule.decodeInvoice,
}));

vi.mock("boltz-swaps/invoice", async (importOriginal) => {
    const actual = await importOriginal<typeof InvoiceModule>();
    realDecode.decodeInvoice = actual.decodeInvoice;
    return {
        ...actual,
        decodeInvoice: vi.fn(actual.decodeInvoice),
    };
});

const decodeInvoiceMock = vi.mocked(decodeInvoice);

// The swap fixtures below carry real regtest invoices from a stock lnd, which
// lack the BLAKE2b feature bit. For the swap validation tests the invoice only
// has to yield its amount and payment hash, so decode it without that check.
const decodeWithoutFeatureCheck = (invoice: string) => {
    const decoded = bolt11.decode(invoice);
    return {
        type: InvoiceType.Bolt11,
        satoshis: decoded.satoshis ?? 0,
        preimageHash: decoded.tags.find((tag) => tag.tagName === "payment_hash")
            ?.data as string,
    };
};

describe("validate responses", () => {
    beforeAll(() => {
        log.disableAll();
    });

    beforeEach(() => {
        decodeInvoiceMock.mockImplementation(decodeWithoutFeatureCheck);
    });

    afterAll(() => {
        decodeInvoiceMock.mockImplementation(realDecode.decodeInvoice);
    });

    describe("normal swap", () => {
        const swapBtc = {
            refundPrivateKeyIndex: 0,
            assetSend: BTC,
            assetReceive: LN,
            type: SwapType.Submarine,
            sendAmount: 100540,
            expectedAmount: 100540,
            invoice:
                "lnbcrt1m1pjek2zzpp52j2wjxuvnrrxc0wxlr0fhzvumsp6r34pf9gqsnawh4rnj6uk6rksdqqcqzzsxqyz5vqsp5cav7v3r4jf04ek0rs2e68kmtfnaww0f49j5vjdk4vrhkh9dcu4ns9qyyssqrtpxz8a8f07zkmf3g4dq3l8qfje55jkvl6pv7xlvs96kagcx0yzhjgy5navzztc8knksyf4sk2hp0eg33legnjfdcptp5ajcmhjg0ugqv88q6c",
            refundPrivateKey:
                "0c3b158328907b428b26da5587365289f2d7db694a2551ca5cc181334b34f4bf",
            bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054&label=Send%20to%20BTC%20lightning",
            address:
                "bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc",
            swapTree: {
                claimLeaf: {
                    version: 192,
                    output: "a91437890f1e6054af6b288db22f5cc15a2e0af0b5ae8820cdcc8fdcd40f6f78ce600bdbec4b45b320d0d6a3331b61d1bbe986638738fb51ac",
                },
                refundLeaf: {
                    version: 192,
                    output: "206718c390c8b02d6974090ab773432f62eb3ff32f7d5f2980883d9f98cd5cf9e4ad028204b1",
                },
            },
            claimPublicKey:
                "02cdcc8fdcd40f6f78ce600bdbec4b45b320d0d6a3331b61d1bbe986638738fb51",
            acceptZeroConf: false,
            timeoutBlockHeight: 1154,
        };

        test.each`
            desc                                   | valid    | swap
            ${"BTC valid"}                         | ${true}  | ${swapBtc}
            ${"BTC invalid send amount"}           | ${false} | ${{ ...swapBtc, sendAmount: 12313123 }}
            ${"BTC invalid refund key"}            | ${false} | ${{ ...swapBtc, refundPrivateKey: "6321bb238f0678fb4c971024193f650eebe69fb891788e1af70184b2dd5d1d5f" }}
            ${"BTC invalid swap tree"}             | ${false} | ${{ ...swapBtc, swapTree: { claimLeaf: { version: 192, output: "a91437890f1e6054af6b288db22f5cc15a2e0af0b5ae8820cdcc8fdcd40f6f78ce600bdbec4b45b320d0d6a3331b61d1bbe986638738fb51ac" }, refundLeaf: { version: 192, output: "207718c390c8b02d6974090ab773432f62eb3ff32f7d5f2980883d9f98cd5cf9e4ad028204b1" } } }}
            ${"BTC invalid swap tree version"}     | ${false} | ${{ ...swapBtc, swapTree: { claimLeaf: { version: 196, output: "a91437890f1e6054af6b288db22f5cc15a2e0af0b5ae8820cdcc8fdcd40f6f78ce600bdbec4b45b320d0d6a3331b61d1bbe986638738fb51ac" }, refundLeaf: { version: 192, output: "207718c390c8b02d6974090ab773432f62eb3ff32f7d5f2980883d9f98cd5cf9e4ad028204b1" } } }}
            ${"BTC invalid claimPublicKey"}        | ${false} | ${{ ...swapBtc, claimPublicKey: "0256845c09bbf978cf8564e996036bfb96fc8deb49b9c83f362b5b20ca5a1c28cc" }}
            ${"BTC invalid invoice preimage hash"} | ${false} | ${{ ...swapBtc, invoice: "lnbcrt1m1pj87krqpp508n5tj4ur4em04k9r0lg2nwm6jy0tvta6h3zrhvtypz8srhzapgqdqqcqzzsxqyz5vqsp5admanudc6jgftclpxh0wt8tzcd3qumhjhlnnhgmw57nagygrvjas9qyyssqfpaxy85h53v4cv4merj3fequfpfy3pry5tpazupv8v2wmcnh2vu463m44pgw3zlhyj3z6mkgnuat8eyrsr0p9zgq2w6fc0gacytgsmgpr8wa3v" }}
            ${"BTC invalid invalid address"}       | ${false} | ${{ ...swapBtc, address: "2NGVzk8fgA8zHRkLBwkAgZKnBn3aYG6wwSx" }}
            ${"BTC invalid BIP21 amount"}          | ${false} | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0210054&label=Send%20to%20BTC%20lightning" }}
            ${"BTC invalid BIP21 address"}         | ${false} | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pn67yl0hqj6g2unq943y6yyheyg3pk0hn23snrq3tpz6vqz2exfsqggkv9y?amount=0.0010054&label=Send%20to%20BTC%20lightning" }}
            ${"BTC BIP21 as a javascript: link"}   | ${false} | ${{ ...swapBtc, bip21: "javascript:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc:alert(1)//?amount=0.0010054" }}
            ${"BTC BIP21 with another scheme"}     | ${false} | ${{ ...swapBtc, bip21: "litecoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054" }}
            ${"BTC BIP21 with a lightning param"}  | ${false} | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054&lightning=lnbcrt1" }}
            ${"BTC BIP21 with two amounts"}        | ${false} | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054&amount=0.5" }}
            ${"BTC BIP21 with a second query"}     | ${false} | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054?x=1" }}
            ${"BTC BIP21 without a label"}         | ${true}  | ${{ ...swapBtc, bip21: "bitcoin:bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc?amount=0.0010054" }}
        `("$desc", async ({ valid, swap }) => {
            const promise = validateResponse(swap, () =>
                ECPair.fromPrivateKey(hex.decode(swap.refundPrivateKey)),
            );
            if (valid) {
                await expect(promise).resolves.toBeUndefined();
            } else {
                await expect(promise).rejects.toThrow();
            }
        });
    });

    describe("reverse swap", () => {
        const reverseSwapBtc = {
            claimPrivateKeyIndex: 0,
            assetSend: LN,
            assetReceive: BTC,
            type: SwapType.Reverse,
            sendAmount: 100000,
            onchainAmount: 99295,
            receiveAmount: 99294,
            timeoutBlockHeight: 290,
            claimPrivateKey:
                "8febdccb245af0b98ea16331904db5eeec0a1e3960e310979b2f7b390917e9f6",
            preimage:
                "030487ee34943293978e8fc90e68934f6e8d5a6a9bfc78916fcf108d42a00307",
            swapTree: {
                claimLeaf: {
                    version: 192,
                    output: "82012088a91497f8b7e6d94bbc653dbe8f821fe86d9d6033ed7588208bc602b6ea0b51407bea00fc89a1fa5f115bec5ec488a8446b70fad753abafd3ac",
                },
                refundLeaf: {
                    version: 192,
                    output: "20c4360fec19c88d697622c0db14dc003e65787739e28278e39b937b9867eebdc3ad022201b1",
                },
            },
            refundPublicKey:
                "02c4360fec19c88d697622c0db14dc003e65787739e28278e39b937b9867eebdc3",
            lockupAddress:
                "bcrt1pj9serg8uxmtfgyccdx6tslcl7rev266lfjfq0rm4jr7pwyg9kp7qjjlz5l",
            invoice:
                "lnbcrt1m1pjektdwsp5j5c8cyxgvsxlff4t62kynqsxhzfap5fh4y484l5tf3t56y9c8ckqpp5tvq0q4q2nctc4hyskuu8eugce3u6jcrzrczfudfjv6nc50dkdhnsdql2djkuepqw3hjqsj5gvsxzerywfjhxucxqztfcqzyl9qxpqysgqquufuqd23c38m05kh6lrd9vdfyczfk0khvj2jkpq86d5thx6kgtx3yv8jve4u9cuwyv20dey0xsc037gq8ju47e6tnmzpm43fhafyesqn5kkjz",
        };

        test.each`
            desc                                   | valid    | swap
            ${"BTC valid"}                         | ${true}  | ${reverseSwapBtc}
            ${"BTC invalid receive amount"}        | ${false} | ${{ ...reverseSwapBtc, onchainAmount: reverseSwapBtc.onchainAmount - 1 }}
            ${"BTC invalid invoice amount"}        | ${false} | ${{ ...reverseSwapBtc, invoice: "lnbcrt1000010n1pj8hjy9pp5ylcun2dmcl0jukwprey0sxpnm6kfurwngvqrglak8www5rm9thqqdqqcqzzsxqyz5vqsp5xas59ytzy77vr7nz3q20ekfp36pahnf7pyp5yu2q6j69s0gf2mzq9qyyssq98vhx0hwngawut2n240ye2j693qh4afptj3fx93kdxdgelhg8w4ntqj6za2txudm2t8ge649h5jcleqrrhk2ef4hymjtmly4mma07lgpru8e9j" }}
            ${"BTC invalid invoice preimage hash"} | ${false} | ${{ ...reverseSwapBtc, invoice: "lnbcrt1m1pj8hjyjpp53ge8f7m79de2q3e4j8amvq9jq3g0eag9vymzyd32gjw3cz3uhjfqdqqcqzzsxqyz5vqsp52vdnu0n3yh8m0sykqk4gl6h9v7l4r736z4qswm8tmahvjet6w7uq9qyyssqytl6pnuel293xmkgnu9hc5f4taekhgl023zceztzy0eugya6908p5y0txdx0p0q448uru6ecqhd78aarr0lkj95h4s7nwrymjvnkdwcq2ds4qy" }}
            ${"BTC invalid swap tree"}             | ${false} | ${{ ...reverseSwapBtc, swapTree: { claimLeaf: { version: 192, output: "82012088a91497f8b7e6d94bbc653dbf8f821fe86d9d6033ed7588208bc602b6ea0b51407bea00fc89a1fa5f115bec5ec488a8446b70fad753abafd3ac" }, refundLeaf: { version: 192, output: "20c4360fec19c88d697622c0db14dc003e65787739e28278e39b937b9867eebdc3ad022201b1" } } }}
            ${"BTC invalid lockupAddress"}         | ${false} | ${{ ...reverseSwapBtc, lockupAddress: "bcrt1qcqyj0mdse8ewusdxgm30ynsnqw4j5700vsdgm8xg0eft5rqdnpgs9ndhwx" }}
            ${"BTC invalid refundPublicKey"}       | ${false} | ${{ ...reverseSwapBtc, refundPublicKey: "02abfe68c69da9e1f3f3c07db115901157dfe865f5263b5b4a9d84edddb756ba2d" }}
        `("$desc", async ({ valid, swap }) => {
            const promise = validateResponse(swap, () =>
                ECPair.fromPrivateKey(hex.decode(swap.claimPrivateKey)),
            );
            if (valid) {
                await expect(promise).resolves.toBeUndefined();
            } else {
                await expect(promise).rejects.toThrow();
            }
        });
    });
});

describe("validate onchain addresses", () => {
    test.each`
        address
        ${"moEsJRFF6y3d5oSjHj6GBocVPw2GEeQ6WY"}
        ${"2NDkcnHAnugU1aQ5bv522MeZTgv6tQs2rt8"}
        ${"bcrt1q78qtnjrt53gauk6h2w32wane62jjg2gvval6w5"}
        ${"bcrt1pp7enx7jean5tp79satht9lz7dn76kcvfmw636d3a62sr2gepj0nqtupeyc"}
    `("should validate $address", ({ address }) => {
        expect(() => decodeAddress(BTC, address)).not.toThrow();
    });

    test.each`
        address
        ${"bc1qylh3u67j673h6y6alv70m0pl2yz53tzhvxgg7u"}
        ${"3G4bhXLN64wGN6efUd4MoHjmxBWrUNacPY"}
        ${"ert1q4k67l66z0nwgcsgzw20638cpm75d6tpl4f4vyrp76fnnutn0ulvqwe7ahr"}
        ${"0xd8da6bf26964af9d7eed9e03e53415d37aa96045"}
        ${"not an address"}
    `("should throw $address", ({ address }) => {
        expect(() => decodeAddress(BTC, address)).toThrow();
    });
});

describe("validateInvoice", () => {
    test("accepts an invoice with the BLAKE2b feature bit", () => {
        expect(validateInvoice(blake2bInvoice)).toEqual(invoiceAmount);
    });

    test("rejects a SHA256-chain invoice with invoice_missing_blake2b", () => {
        let error: unknown;
        try {
            validateInvoice(sha256Invoice);
        } catch (e) {
            error = e;
        }

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toEqual("invoice_missing_blake2b");
        expect((error as Error).cause).toBeInstanceOf(
            MissingBlake2bFeatureError,
        );
    });

    test("rejects an uppercase SHA256-chain invoice (as QR codes carry it)", () => {
        expect(() => validateInvoice(sha256Invoice.toUpperCase())).toThrow(
            "invoice_missing_blake2b",
        );
    });

    test("rejects input that is not an invoice", () => {
        expect(() => validateInvoice("not an invoice")).toThrow(
            "invalid_invoice",
        );
    });

    test("rejects a corrupted invoice with invalid_invoice", () => {
        expect(() =>
            validateInvoice(`${blake2bInvoice.slice(0, -1)}q`),
        ).toThrow("invalid_invoice");
    });
});

describe("swapBip21", () => {
    test("is built from the checked address and amount only", () => {
        expect(swapBip21("bc1paddress", 100540)).toEqual(
            "bitcoin:bc1paddress?amount=0.0010054",
        );
        expect(swapBip21("bc1paddress", 0)).toEqual("bitcoin:bc1paddress");
    });
});
