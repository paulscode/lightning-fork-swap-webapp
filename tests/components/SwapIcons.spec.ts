import type { RestorableSwap } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import { describe, expect, test } from "vitest";

import { getRestoredSwapIconAssets } from "../../src/components/SwapIcons";
import { BTC, LN } from "../../src/consts/Assets";

const baseSwap = {
    id: "restored-swap",
    status: "transaction.confirmed",
    createdAt: 1,
    from: BTC,
    to: BTC,
} satisfies Omit<RestorableSwap, "type">;

describe("getRestoredSwapIconAssets", () => {
    test("shows Lightning as the send asset of a restored reverse swap", () => {
        expect(
            getRestoredSwapIconAssets({
                ...baseSwap,
                type: SwapType.Reverse,
            }),
        ).toEqual({ send: LN, receive: BTC });
    });

    test("shows Lightning as the receive asset of a restored submarine swap", () => {
        expect(
            getRestoredSwapIconAssets({
                ...baseSwap,
                type: SwapType.Submarine,
            }),
        ).toEqual({ send: BTC, receive: LN });
    });
});
