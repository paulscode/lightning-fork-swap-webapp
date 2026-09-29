import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { BigNumber } from "bignumber.js";
import { OutputType } from "boltz-core";
import type * as ClientModule from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import { vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import {
    type RescueFile,
    derivePreimageFromRescueKey,
} from "../../src/utils/rescueFile";
import {
    type ReverseSwap,
    type SubmarineSwap,
    createReverse,
    createSubmarine,
    getFinalAssetReceive,
    getFinalAssetSend,
    getRelevantAssetForSwap,
    getSwapAddress,
} from "../../src/utils/swapCreator";
import { blake2bInvoice } from "../fixtures/invoices";

const mocks = vi.hoisted(() => ({
    createSubmarineSwap: vi.fn(),
    createReverseSwap: vi.fn(),
}));

vi.mock("boltz-swaps/client", async (importActual) => ({
    ...(await importActual<typeof ClientModule>()),
    ...mocks,
}));

const submarine = {
    type: SwapType.Submarine,
    assetSend: BTC,
    assetReceive: LN,
};
const reverse = { type: SwapType.Reverse, assetSend: LN, assetReceive: BTC };

describe("getRelevantAssetForSwap", () => {
    test("returns the locked asset of a submarine swap", () => {
        expect(getRelevantAssetForSwap(submarine as never)).toBe(BTC);
    });

    test("returns the received asset of a reverse swap", () => {
        expect(getRelevantAssetForSwap(reverse as never)).toBe(BTC);
    });
});

describe("getSwapAddress", () => {
    test("returns the lockup address of a submarine swap", () => {
        expect(
            getSwapAddress({
                ...submarine,
                address: "bcrt1qsubmarine",
                lockupAddress: "unused",
            } as unknown as SubmarineSwap),
        ).toBe("bcrt1qsubmarine");
    });

    test("returns the lockup address of a reverse swap", () => {
        expect(
            getSwapAddress({
                ...reverse,
                lockupAddress: "bcrt1preverse",
            } as unknown as ReverseSwap),
        ).toBe("bcrt1preverse");
    });
});

describe("getFinalAssetSend", () => {
    test("returns assetSend", () => {
        expect(getFinalAssetSend(submarine)).toBe(BTC);
        expect(getFinalAssetSend(reverse)).toBe(LN);
    });

    test("coalesces to LN for reverse swaps when requested", () => {
        expect(getFinalAssetSend({ ...reverse, assetSend: BTC }, true)).toBe(
            LN,
        );
    });

    test("does not coalesce submarine swaps", () => {
        expect(getFinalAssetSend(submarine, true)).toBe(BTC);
    });
});

describe("getFinalAssetReceive", () => {
    test("returns assetReceive", () => {
        expect(getFinalAssetReceive(submarine)).toBe(LN);
        expect(getFinalAssetReceive(reverse)).toBe(BTC);
    });

    test("coalesces to LN for submarine swaps when requested", () => {
        expect(
            getFinalAssetReceive({ ...submarine, assetReceive: BTC }, true),
        ).toBe(LN);
    });

    test("does not coalesce reverse swaps", () => {
        expect(getFinalAssetReceive(reverse, true)).toBe(BTC);
    });
});

describe("swap creation", () => {
    const rescueFile: RescueFile = {
        mnemonic:
            "invite smile evidence shield frost source truly ball odor unfold example nuclear",
    };

    const publicKey = new Uint8Array(33).fill(2);
    const newKey = vi.fn(() =>
        Promise.resolve({
            index: 7,
            key: { publicKey } as never,
        }),
    );

    beforeEach(() => {
        newKey.mockClear();
        mocks.createSubmarineSwap.mockReset().mockResolvedValue({
            id: "sub",
            address: "bcrt1qsubmarine",
            expectedAmount: 10_000,
        });
        mocks.createReverseSwap.mockReset().mockResolvedValue({
            id: "rev",
            lockupAddress: "bcrt1preverse",
            onchainAmount: 9_950,
        });
    });

    test("createSubmarine sends the invoice and refund key to the backend", async () => {
        const swap = await createSubmarine(
            BTC,
            LN,
            BigNumber(10_000),
            BigNumber(9_900),
            blake2bInvoice,
            "pair-hash",
            newKey,
            "user@example.com",
        );

        expect(newKey).toHaveBeenCalledWith(BTC);
        expect(mocks.createSubmarineSwap).toHaveBeenCalledWith(
            BTC,
            LN,
            blake2bInvoice,
            "pair-hash",
            hex.encode(publicKey),
        );
        expect(swap).toEqual(
            expect.objectContaining({
                id: "sub",
                address: "bcrt1qsubmarine",
                expectedAmount: 10_000,
                type: SwapType.Submarine,
                assetSend: BTC,
                assetReceive: LN,
                sendAmount: 10_000,
                receiveAmount: 9_900,
                version: OutputType.Taproot,
                invoice: blake2bInvoice,
                originalDestination: "user@example.com",
                refundPrivateKeyIndex: 7,
            }),
        );
        expect(typeof swap.date).toBe("number");
    });

    test("createReverse derives the preimage from the rescue file", async () => {
        const swap = await createReverse(
            LN,
            BTC,
            BigNumber(10_000),
            BigNumber(9_900),
            "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
            "pair-hash",
            rescueFile,
            newKey,
        );

        const preimage = derivePreimageFromRescueKey(rescueFile, 7, BTC);
        const preimageHash = hex.encode(sha256(preimage));

        expect(newKey).toHaveBeenCalledWith(BTC);
        expect(mocks.createReverseSwap).toHaveBeenCalledWith(
            LN,
            BTC,
            10_000,
            preimageHash,
            "pair-hash",
            hex.encode(publicKey),
            "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
        );
        expect(swap).toEqual(
            expect.objectContaining({
                id: "rev",
                lockupAddress: "bcrt1preverse",
                onchainAmount: 9_950,
                type: SwapType.Reverse,
                assetSend: LN,
                assetReceive: BTC,
                sendAmount: 10_000,
                receiveAmount: 9_900,
                version: OutputType.Taproot,
                claimAddress: "bcrt1q6agtc4dnjvly869zcgad6u6q2caccvpx83n8ad",
                preimage: hex.encode(preimage),
                claimPrivateKeyIndex: 7,
            }),
        );
        expect(swap.originalDestination).toBeUndefined();
    });

    test("createSubmarine propagates backend errors", async () => {
        mocks.createSubmarineSwap.mockRejectedValue(
            new Error("invalid pair hash"),
        );

        await expect(
            createSubmarine(
                BTC,
                LN,
                BigNumber(10_000),
                BigNumber(9_900),
                blake2bInvoice,
                "pair-hash",
                newKey,
            ),
        ).rejects.toThrow("invalid pair hash");
    });
});
