import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import type * as SolidRouter from "@solidjs/router";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { OutputType } from "boltz-core";
import type {
    RestorableSwap,
    ReversePairTypeTaproot,
    SwapStatusResponse,
} from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import { vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import dict from "../../src/i18n/i18n";
import ClaimRescue, {
    mapClaimableSwap,
    verifyClaimPreimage,
} from "../../src/pages/ClaimRescue";
import { TestComponent, contextWrapper } from "../helper";

const swapId = "claimRescueSwap";

vi.mock("@solidjs/router", async () => {
    const actual = await vi.importActual<typeof SolidRouter>("@solidjs/router");
    return {
        ...actual,
        useParams: () => ({ id: swapId }),
    };
});

describe("ClaimRescue", () => {
    test("verifies a rescue-derived claim preimage against the restored hash", () => {
        const preimage = Uint8Array.from({ length: 32 }, (_, index) => index);
        const expectedHash = hex.encode(sha256(preimage));

        expect(() =>
            verifyClaimPreimage(preimage, `0x${expectedHash.toUpperCase()}`),
        ).not.toThrow();
        expect(() => verifyClaimPreimage(preimage, "00".repeat(32))).toThrow(
            "derived claim preimage does not match restored swap",
        );
    });

    const tree = {
        claimLeaf: { output: "claim", version: 0xc0 },
        refundLeaf: { output: "refund", version: 0xc0 },
    };
    const pair = {
        fees: { minerFees: { claim: 2, lockup: 3 } },
    } as ReversePairTypeTaproot;
    const makeSwap = (
        overrides: Partial<RestorableSwap> = {},
    ): RestorableSwap &
        Pick<SwapStatusResponse, "transaction"> & { preimage: string } => ({
        id: swapId,
        type: SwapType.Reverse,
        status: "transaction.confirmed",
        createdAt: 1,
        from: LN,
        to: BTC,
        preimage: "11".repeat(32),
        transaction: { id: "server-lock", hex: "00" },
        claimDetails: {
            amount: 10_000,
            keyIndex: 7,
            lockupAddress: "bcrt1claim",
            serverPublicKey: `02${"33".repeat(32)}`,
            timeoutBlockHeight: 1_000,
            tree,
        },
        ...overrides,
    });

    test("constructs a reverse swap claim from the restored claim details", () => {
        const swap = makeSwap();

        expect(mapClaimableSwap({ swap, pair })).toMatchObject({
            id: swapId,
            type: SwapType.Reverse,
            assetSend: LN,
            assetReceive: BTC,
            version: OutputType.Taproot,
            claimPrivateKeyIndex: 7,
            refundPublicKey: swap.claimDetails!.serverPublicKey,
            swapTree: tree,
            receiveAmount: 10_000 - 2,
            preimage: swap.preimage,
            transaction: { id: "server-lock", hex: "00" },
        });
    });

    test("returns undefined without claim details or a claim amount", () => {
        expect(
            mapClaimableSwap({
                swap: makeSwap({ claimDetails: undefined }),
                pair,
            }),
        ).toBeUndefined();
        expect(
            mapClaimableSwap({
                swap: makeSwap({
                    claimDetails: {
                        ...makeSwap().claimDetails!,
                        amount: undefined,
                    },
                }),
                pair,
            }),
        ).toBeUndefined();
    });

    test("returns undefined for submarine swaps", () => {
        expect(
            mapClaimableSwap({
                swap: makeSwap({ type: SwapType.Submarine, from: BTC, to: LN }),
                pair,
            }),
        ).toBeUndefined();
    });

    test("renders the error UI without crashing when the swap cannot be constructed", async () => {
        // No rescue file in the default context, so the fetcher throws
        render(
            () => (
                <>
                    <TestComponent />
                    <ClaimRescue />
                </>
            ),
            { wrapper: contextWrapper },
        );

        await waitFor(() => {
            expect(
                screen.getByText(
                    dict.en.failed_get_swap.replace("{{ id }}", swapId),
                ),
            ).toBeInTheDocument();
        });
        expect(screen.getByText(dict.en.error)).toBeInTheDocument();

        // Reading an errored resource rethrows; the binding must be state-guarded
        expect(document.querySelector(".frame")).not.toHaveAttribute(
            "data-status",
        );
    });
});
