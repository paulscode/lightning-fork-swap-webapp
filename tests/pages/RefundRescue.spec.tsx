import type * as SolidRouter from "@solidjs/router";
import { render, screen, waitFor } from "@solidjs/testing-library";
import { OutputType } from "boltz-core";
import type { RestorableSwap } from "boltz-swaps/client";
import { type Asset, Explorer, SwapType } from "boltz-swaps/types";
import type { JSX } from "solid-js";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { config } from "../../src/config";
import { BTC, LN } from "../../src/consts/Assets";
import type * as RescueContextModule from "../../src/context/Rescue";
import dict from "../../src/i18n/i18n";
import RefundRescue, { mapSwap } from "../../src/pages/RefundRescue";
import type { RescueFile } from "../../src/utils/rescueFile";
import type { SubmarineSwap } from "../../src/utils/swapCreator";
import {
    TestComponent,
    contextWrapper,
    globalSignals,
    payContext,
} from "../helper";

const {
    mockGetCurrentBlockHeight,
    mockGetSwapStatus,
    mockGetRescuableUTXOs,
    restorableSwaps,
    waitForSwapTimeoutState,
    pageSwapId,
    lockupTxId,
} = vi.hoisted(() => ({
    mockGetCurrentBlockHeight: vi.fn(),
    mockGetSwapStatus: vi.fn(),
    mockGetRescuableUTXOs: vi.fn(),
    restorableSwaps: { current: [] as RestorableSwap[] },
    waitForSwapTimeoutState: { current: false },
    pageSwapId: "refundRescuePage",
    lockupTxId:
        "813c90372c9b774396c66099cf8015f9510a8ba5686cbb78d8e848959fe7bb5d",
}));

vi.mock("@solidjs/router", async () => {
    const actual = await vi.importActual<typeof SolidRouter>("@solidjs/router");
    return {
        ...actual,
        useParams: () => ({ id: pageSwapId }),
        useLocation: () => ({
            state: waitForSwapTimeoutState.current
                ? { waitForSwapTimeout: true }
                : undefined,
        }),
    };
});

vi.mock("boltz-swaps/client", async () => {
    const actual = await vi.importActual("boltz-swaps/client");
    return {
        ...actual,
        getSwapStatus: mockGetSwapStatus,
    };
});

vi.mock("../../src/utils/rescue", async () => {
    const actual = await vi.importActual("../../src/utils/rescue");
    return {
        ...actual,
        getCurrentBlockHeight: mockGetCurrentBlockHeight,
        getRescuableUTXOs: mockGetRescuableUTXOs,
    };
});

vi.mock("../../src/context/Rescue", async () => {
    const actual = await vi.importActual<typeof RescueContextModule>(
        "../../src/context/Rescue",
    );
    // Signal-backed so writes after render are reactive
    const { createSignal } = await import("solid-js");
    const [swaps, setSwaps] = createSignal<RestorableSwap[]>(
        restorableSwaps.current,
    );
    Object.defineProperty(restorableSwaps, "current", {
        get: () => swaps(),
        set: setSwaps,
    });
    return {
        ...actual,
        RescueProvider: (props: { children: JSX.Element }) => (
            <>{props.children}</>
        ),
        useRescueContext: () => ({
            rescuableSwaps: () => restorableSwaps.current,
            rescueFile: () => ({ mnemonic: "test" }) as RescueFile,
        }),
    };
});

const tree = {
    claimLeaf: { output: "claim", version: 0xc0 },
    refundLeaf: { output: "refund", version: 0xc0 },
};

const baseDetails = {
    tree,
    keyIndex: 7,
    lockupAddress: "bcrt1qlockup",
    serverPublicKey: "02aabbcc",
    timeoutBlockHeight: 123_456,
};

const baseSwap = {
    id: "swap-id",
    status: "pending",
    createdAt: 1700000000,
};

const failedRestorable: RestorableSwap = {
    ...baseSwap,
    id: pageSwapId,
    status: "transaction.lockupFailed",
    type: SwapType.Submarine,
    from: BTC,
    to: LN,
    refundDetails: {
        ...baseDetails,
        transaction: { id: lockupTxId, vout: 0 },
    },
};

const openLockupTxLabel = dict.en.blockexplorer.replace(
    "{{ typeLabel }}",
    dict.en.blockexplorer_lockup_tx,
);
const openLockupAddressLabel = dict.en.blockexplorer.replace(
    "{{ typeLabel }}",
    dict.en.blockexplorer_lockup_address,
);

describe("mapSwap", () => {
    test("returns undefined for missing swap", () => {
        expect(mapSwap(undefined)).toBeUndefined();
    });

    test("returns undefined when refundDetails are missing for submarine", () => {
        const swap: RestorableSwap = {
            ...baseSwap,
            type: SwapType.Submarine,
            from: BTC,
            to: BTC,
        };
        expect(mapSwap(swap)).toBeUndefined();
    });

    test("returns undefined when claimDetails are missing for reverse", () => {
        const swap: RestorableSwap = {
            ...baseSwap,
            type: SwapType.Reverse,
            from: BTC,
            to: BTC,
        };
        expect(mapSwap(swap)).toBeUndefined();
    });

    test("submarine output maps refund details onto the swap", () => {
        const swap: RestorableSwap = {
            ...baseSwap,
            type: SwapType.Submarine,
            from: BTC,
            to: LN,
            refundDetails: { ...baseDetails },
        };

        const mapped = mapSwap(swap);
        expect(mapped).toMatchObject({
            type: SwapType.Submarine,
            assetSend: BTC,
            assetReceive: LN,
            version: OutputType.Taproot,
            address: baseDetails.lockupAddress,
            swapTree: tree,
            refundPrivateKeyIndex: baseDetails.keyIndex,
            claimPublicKey: baseDetails.serverPublicKey,
            timeoutBlockHeight: baseDetails.timeoutBlockHeight,
        });
    });

    test("reverse output renames address to lockupAddress and exposes claim metadata", () => {
        const swap: RestorableSwap = {
            ...baseSwap,
            type: SwapType.Reverse,
            from: BTC,
            to: BTC,
            claimDetails: { ...baseDetails, amount: 4242 },
        };

        const mapped = mapSwap(swap);
        expect(mapped).toMatchObject({
            type: SwapType.Reverse,
            assetSend: BTC,
            assetReceive: BTC,
            version: OutputType.Taproot,
            lockupAddress: baseDetails.lockupAddress,
            timeoutBlockHeight: baseDetails.timeoutBlockHeight,
            claimPrivateKeyIndex: baseDetails.keyIndex,
            sendAmount: 4242,
        });
        // The legacy "address" key is gone — reverse swaps now expose lockupAddress.
        expect(mapped).not.toHaveProperty("address");
    });

    test("returns undefined for unknown swap types", () => {
        const swap = {
            ...baseSwap,
            type: "chain",
            from: BTC,
            to: BTC,
            claimDetails: { ...baseDetails },
            refundDetails: { ...baseDetails },
        } as unknown as RestorableSwap;
        expect(mapSwap(swap)).toBeUndefined();
    });
});

describe("RefundRescue", () => {
    let originalExplorer: Asset["blockExplorerUrl"];

    const renderPage = () =>
        render(
            () => (
                <>
                    <TestComponent />
                    <RefundRescue />
                </>
            ),
            { wrapper: contextWrapper },
        );

    beforeEach(() => {
        vi.clearAllMocks();
        restorableSwaps.current = [];
        waitForSwapTimeoutState.current = false;
        mockGetSwapStatus.mockResolvedValue({
            status: failedRestorable.status,
            failureReason: "invoice expired",
            transaction: { id: lockupTxId, hex: "00" },
        });
        mockGetRescuableUTXOs.mockResolvedValue([{ id: lockupTxId }]);
        originalExplorer = config.assets!["BTC"].blockExplorerUrl;
        config.assets!["BTC"].blockExplorerUrl = {
            id: Explorer.Esplora,
            normal: "https://explorer.example",
        };
    });

    afterEach(() => {
        config.assets!["BTC"].blockExplorerUrl = originalExplorer;
    });

    test("shows failure details, status, and the lockup link for a failed restored swap", async () => {
        restorableSwaps.current = [failedRestorable];

        renderPage();

        await waitFor(() => {
            expect(document.querySelector(".frame-header")).toHaveTextContent(
                `Swap: ${pageSwapId}`,
            );
        });

        expect(document.querySelector(".frame")).toHaveAttribute(
            "data-status",
            "transaction.lockupFailed",
        );
        expect(document.querySelector(".swap-status")).toHaveTextContent(
            "transaction.lockupFailed",
        );
        expect(
            document.querySelectorAll(".frame-header .swaplist-asset .asset"),
        ).toHaveLength(2);

        expect(screen.getByText(dict.en.lockup_failed)).toBeInTheDocument();
        expect(
            screen.getByText(`${dict.en.failure_reason}: invoice expired`),
        ).toBeInTheDocument();

        expect(
            screen.getByRole("link", { name: openLockupTxLabel }),
        ).toBeInTheDocument();
    });

    test("stays alive when the swap list populates after mount and swap() is still null", async () => {
        renderPage();

        await waitFor(() => {
            expect(screen.getByText(dict.en.pay_swap_404)).toBeInTheDocument();
        });

        // The mount resource already ran with an empty list, so swap() stays null
        restorableSwaps.current = [failedRestorable];

        await waitFor(() => {
            expect(document.querySelector(".frame-header")).toHaveTextContent(
                `Swap: ${pageSwapId}`,
            );
        });

        expect(screen.getByTestId("refundButton")).toBeInTheDocument();
        // Hidden rather than dereferencing the null swap()
        expect(
            screen.queryByRole("link", { name: openLockupTxLabel }),
        ).not.toBeInTheDocument();
    });

    test("links the lockup address while waiting for the timeout and switches to the lockup tx", async () => {
        waitForSwapTimeoutState.current = true;
        restorableSwaps.current = [
            {
                ...baseSwap,
                id: pageSwapId,
                type: SwapType.Submarine,
                from: BTC,
                to: LN,
                refundDetails: { ...baseDetails },
            },
        ];
        mockGetCurrentBlockHeight.mockResolvedValue({ [BTC]: 100 });

        renderPage();

        expect(
            await screen.findByRole("link", {
                name: openLockupAddressLabel,
            }),
        ).toHaveAttribute(
            "href",
            `https://explorer.example/address/${baseDetails.lockupAddress}`,
        );
        expect(mockGetCurrentBlockHeight).toHaveBeenCalledTimes(1);
        expect(screen.getByTestId("backBtn")).toBeInTheDocument();
        expect(screen.queryByTestId("refundButton")).not.toBeInTheDocument();

        payContext.setSwap({
            ...payContext.swap()!,
            lockupTx: lockupTxId,
        } as SubmarineSwap);

        expect(
            await screen.findByRole("link", { name: openLockupTxLabel }),
        ).toHaveAttribute("href", `https://explorer.example/tx/${lockupTxId}`);
        expect(
            screen.queryByRole("link", { name: openLockupAddressLabel }),
        ).not.toBeInTheDocument();
    });

    test("allows the refund anyway when the block height is unavailable", async () => {
        waitForSwapTimeoutState.current = true;
        restorableSwaps.current = [failedRestorable];
        mockGetCurrentBlockHeight.mockRejectedValue(new Error("explorer down"));

        renderPage();

        expect(await screen.findByTestId("refundButton")).toBeInTheDocument();
        expect(screen.queryByTestId("backBtn")).not.toBeInTheDocument();
    });

    test("notifies when no refundable UTXOs are found", async () => {
        restorableSwaps.current = [failedRestorable];
        mockGetRescuableUTXOs.mockResolvedValue([]);

        renderPage();

        await waitFor(() => {
            expect(globalSignals.notification()).toBe(
                dict.en.get_refundable_error,
            );
        });
    });
});
