import { hex } from "@scure/base";
import { signSubmarineClaim } from "boltz-swaps/submarine";
import { SwapType } from "boltz-swaps/types";
import type * as UtxoModule from "boltz-swaps/utxo";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import type { ReverseSwap, SubmarineSwap } from "../../src/utils/swapCreator";

vi.mock("boltz-swaps/submarine", () => ({
    signSubmarineClaim: vi.fn(),
}));

vi.mock("boltz-swaps/utxo", async (importOriginal) => ({
    ...(await importOriginal<typeof UtxoModule>()),
    claimReverseUtxo: vi.fn(() =>
        Promise.resolve({ transactionHex: "claimhex" }),
    ),
    parseTransaction: vi.fn((txHex: string) => ({ txHex })),
    txToHex: vi.fn((tx: { txHex: string }) => tx.txHex),
    txToId: vi.fn(() => "a".repeat(64)),
}));

vi.mock("../../src/utils/blockchain", () => ({
    broadcastTransaction: vi.fn(),
    getRawTransaction: vi.fn(),
    getBlockTipHeight: vi.fn(),
}));

const { broadcastTransaction, getBlockTipHeight, getRawTransaction } =
    await import("../../src/utils/blockchain");
const { claim, createSubmarineSignature, lockupCheckRetry } =
    await import("../../src/utils/claim");
const { claimReverseUtxo } = await import("boltz-swaps/utxo");

const privateKeyHex = "11".repeat(32);

const baseSwap = {
    id: "submarine-swap",
    type: SwapType.Submarine,
    assetSend: BTC,
    assetReceive: LN,
    claimPublicKey: "02" + "22".repeat(32),
    swapTree: { claimLeaf: {}, refundLeaf: {} },
    invoice: "lnbcrt-invoice",
} as unknown as SubmarineSwap;

describe("createSubmarineSignature", () => {
    beforeEach(() => {
        vi.mocked(signSubmarineClaim).mockReset();
    });

    test("signs with the derived key when the swap has a key index", async () => {
        const keys = { publicKey: new Uint8Array(33) };
        const deriveKey = vi.fn().mockReturnValue(keys);
        const swap = { ...baseSwap, refundPrivateKeyIndex: 7 };

        await createSubmarineSignature(deriveKey, swap);

        expect(deriveKey).toHaveBeenCalledWith(7, BTC);
        expect(signSubmarineClaim).toHaveBeenCalledTimes(1);
        expect(signSubmarineClaim).toHaveBeenCalledWith({
            id: swap.id,
            swapTree: swap.swapTree,
            claimPublicKey: swap.claimPublicKey,
            refundKeys: keys,
            invoice: swap.invoice,
        });
    });

    test("signs with the stored private key when there is no key index", async () => {
        const deriveKey = vi.fn();
        const swap = { ...baseSwap, refundPrivateKey: privateKeyHex };

        await createSubmarineSignature(deriveKey, swap);

        expect(deriveKey).not.toHaveBeenCalled();
        const args = vi.mocked(signSubmarineClaim).mock.calls[0][0];
        expect(hex.encode(args.refundKeys.privateKey)).toEqual(privateKeyHex);
    });

    test("throws when the swap has no refund key at all", async () => {
        await expect(
            createSubmarineSignature(vi.fn(), baseSwap),
        ).rejects.toThrow("missing private key for parsePrivateKey");
        expect(signSubmarineClaim).not.toHaveBeenCalled();
    });

    test("propagates signing errors", async () => {
        vi.mocked(signSubmarineClaim).mockRejectedValueOnce(
            new Error("invalid preimage"),
        );

        await expect(
            createSubmarineSignature(vi.fn(), {
                ...baseSwap,
                refundPrivateKey: privateKeyHex,
            }),
        ).rejects.toThrow("invalid preimage");
    });
});

describe("claim", () => {
    beforeEach(() => {
        lockupCheckRetry.delayMs = 0;
        vi.mocked(claimReverseUtxo).mockClear();
        vi.mocked(broadcastTransaction).mockReset();
        vi.mocked(getRawTransaction).mockReset().mockResolvedValue("lockuphex");
        // timeoutBlockHeight 1000: 100 blocks to go
        vi.mocked(getBlockTipHeight).mockReset().mockResolvedValue("900");
    });

    const reverseSwap = {
        id: "reverse-swap",
        type: SwapType.Reverse,
        assetSend: LN,
        assetReceive: BTC,
        refundPublicKey: "02" + "22".repeat(32),
        claimPrivateKey: privateKeyHex,
        preimage: "33".repeat(32),
        claimAddress: "bcrt1qclaim",
        receiveAmount: 10_000,
        timeoutBlockHeight: 1000,
        swapTree: { claimLeaf: {}, refundLeaf: {} },
    } as unknown as ReverseSwap;

    test.each([
        ["another txid", { id: "b".repeat(64) }],
        ["no txid", {}],
    ])(
        "records the claim it built when the broadcaster returns %s",
        async (_, broadcastResult) => {
            vi.mocked(broadcastTransaction).mockResolvedValueOnce(
                broadcastResult as { id: string },
            );

            const claimed = await claim(
                vi.fn(),
                { ...reverseSwap },
                { hex: "lockuphex" },
                true,
            );

            expect(broadcastTransaction).toHaveBeenCalledWith(BTC, "claimhex");
            expect(claimed.claimTx).toEqual("a".repeat(64));
        },
    );

    const refused = async (invoiceSettled = false) => {
        await expect(
            claim(
                vi.fn(),
                { ...reverseSwap },
                { hex: "lockuphex" },
                true,
                invoiceSettled,
            ),
        ).rejects.toThrow();
        expect(claimReverseUtxo).not.toHaveBeenCalled();
        expect(broadcastTransaction).not.toHaveBeenCalled();
    };

    test("keeps the preimage when the explorer does not know the lockup", async () => {
        vi.mocked(getRawTransaction).mockRejectedValue(new Error("404"));
        await refused();
        expect(getRawTransaction).toHaveBeenCalledTimes(
            lockupCheckRetry.attempts,
        );
    });

    test("waits for an explorer that has not seen the lockup yet", async () => {
        vi.mocked(getRawTransaction)
            .mockRejectedValueOnce(new Error("404"))
            .mockResolvedValue("LOCKUPHEX\n");
        vi.mocked(broadcastTransaction).mockResolvedValueOnce({ id: "" });

        await claim(vi.fn(), { ...reverseSwap }, { hex: "lockuphex" }, true);
        expect(claimReverseUtxo).toHaveBeenCalledTimes(1);
    });

    test("keeps the preimage when the explorer has another transaction", async () => {
        vi.mocked(getRawTransaction).mockResolvedValue("otherhex");
        await refused();
    });

    test.each([
        ["29 blocks", "971"],
        ["past the timeout", "1001"],
    ])("keeps the preimage when the timeout is %s away", async (_, tip) => {
        vi.mocked(getBlockTipHeight).mockResolvedValue(tip);
        await refused();
    });

    test("keeps the preimage when the tip is unknown", async () => {
        vi.mocked(getBlockTipHeight).mockRejectedValue(new Error("down"));
        await refused();
    });

    test("claims without the check once the invoice is settled", async () => {
        vi.mocked(getRawTransaction).mockRejectedValue(new Error("404"));
        vi.mocked(broadcastTransaction).mockResolvedValueOnce({ id: "" });

        await claim(
            vi.fn(),
            { ...reverseSwap },
            { hex: "lockuphex" },
            true,
            true,
        );
        expect(getRawTransaction).not.toHaveBeenCalled();
        expect(claimReverseUtxo).toHaveBeenCalledTimes(1);
    });
});
