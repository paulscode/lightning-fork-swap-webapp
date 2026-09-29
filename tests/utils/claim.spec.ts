import { hex } from "@scure/base";
import { signSubmarineClaim } from "boltz-swaps/submarine";
import { SwapType } from "boltz-swaps/types";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import type { SubmarineSwap } from "../../src/utils/swapCreator";

vi.mock("boltz-swaps/submarine", () => ({
    signSubmarineClaim: vi.fn(),
}));

const { createSubmarineSignature } = await import("../../src/utils/claim");

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
