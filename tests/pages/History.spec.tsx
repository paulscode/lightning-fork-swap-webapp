import { render, screen, waitFor } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";
import { SwapType } from "boltz-swaps/types";

import { BTC, LN } from "../../src/consts/Assets";
import dict from "../../src/i18n/i18n";
import History from "../../src/pages/History";
import { latestStorageVersion } from "../../src/utils/migration";
import { RescueAction } from "../../src/utils/rescue";
import type { SomeSwap } from "../../src/utils/swapCreator";
import { blake2bInvoice } from "../fixtures/invoices";
import { TestComponent, contextWrapper } from "../helper";

const {
    clearStoreMock,
    createRescueListMock,
    downloadJsonMock,
    iterateStoreMock,
} = vi.hoisted(() => ({
    clearStoreMock: vi.fn(),
    createRescueListMock: vi.fn(),
    downloadJsonMock: vi.fn(),
    iterateStoreMock: vi.fn(),
}));

let storedSwaps: unknown[] = [];

vi.mock("../../src/utils/migration", async () => {
    const actual = await vi.importActual("../../src/utils/migration");
    return {
        ...actual,
        migrateStorage: vi.fn().mockResolvedValue(undefined),
    };
});

vi.mock("../../src/utils/download", async () => {
    const actual = await vi.importActual("../../src/utils/download");
    return {
        ...actual,
        downloadJson: downloadJsonMock,
        getExportFileName: vi.fn(() => "history-export"),
    };
});

vi.mock("../../src/utils/rescue", async () => {
    const actual = await vi.importActual("../../src/utils/rescue");
    return {
        ...actual,
        createRescueList: createRescueListMock,
    };
});

vi.mock("localforage", () => ({
    default: {
        INDEXEDDB: "INDEXEDDB",
        LOCALSTORAGE: "LOCALSTORAGE",
        config: vi.fn(),
        createInstance: vi.fn((config?: { name?: string }) => ({
            getItem: vi.fn().mockResolvedValue(null),
            setItem: vi.fn().mockResolvedValue(undefined),
            removeItem: vi.fn().mockResolvedValue(undefined),
            clear: vi.fn(() => {
                clearStoreMock(config?.name);
                return Promise.resolve();
            }),
            keys: vi.fn().mockResolvedValue([]),
            iterate: vi.fn(
                (callback: (value: unknown, key: string) => void) => {
                    iterateStoreMock(config?.name, callback);
                },
            ),
        })),
    },
}));

const sampleSwap = {
    id: "swap-1",
    type: SwapType.Submarine,
    assetSend: BTC,
    assetReceive: LN,
    sendAmount: 1,
    receiveAmount: 1,
    version: 1,
    date: Date.now(),
    invoice: blake2bInvoice,
    refundPrivateKeyIndex: 7,
};

const renderHistory = () =>
    render(
        () => (
            <>
                <TestComponent />
                <History />
            </>
        ),
        {
            wrapper: contextWrapper,
        },
    );

describe("History", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        storedSwaps = [];
        createRescueListMock.mockImplementation((swaps: SomeSwap[]) =>
            Promise.resolve(
                swaps.map((swap) => ({
                    ...swap,
                    action: RescueAction.Pending,
                })),
            ),
        );
        iterateStoreMock.mockImplementation(
            (
                name: string | undefined,
                callback: (value: unknown, key: string) => void,
            ) => {
                if (name === "swaps") {
                    storedSwaps.forEach((swap, index) => {
                        callback(
                            swap,
                            (swap as { id?: string }).id ?? `swap-${index}`,
                        );
                    });
                }
            },
        );
    });

    test("should not show import actions when history is empty", async () => {
        renderHistory();

        expect(
            await screen.findByText(dict.en.history_no_swaps),
        ).toBeInTheDocument();
        expect(
            document.querySelector(
                'input[type="file"][accept="application/json"]',
            ),
        ).toBeNull();
    });

    test("should show export action for existing swaps", async () => {
        storedSwaps = [sampleSwap];

        renderHistory();

        expect(
            await screen.findByRole("button", {
                name: dict.en.history_export,
            }),
        ).toBeInTheDocument();
    });

    test("should show rescue states, prioritize actions, and omit the date label", async () => {
        const actions = new Map([
            ["completed", RescueAction.Successful],
            ["failed", RescueAction.Failed],
            ["pending", RescueAction.Pending],
            ["refund", RescueAction.Refund],
            ["claim", RescueAction.Claim],
        ]);
        storedSwaps = Array.from(actions.keys()).map((id, index) => ({
            ...sampleSwap,
            id,
            date: index + 1,
        }));
        createRescueListMock.mockImplementation((swaps: SomeSwap[]) =>
            Promise.resolve(
                swaps.map((swap) => ({
                    ...swap,
                    action: actions.get(swap.id),
                })),
            ),
        );

        renderHistory();

        for (const label of [
            dict.en.completed,
            dict.en.failed,
            dict.en.in_progress,
            dict.en.refund,
            dict.en.claim,
        ]) {
            expect(await screen.findByText(label)).toBeInTheDocument();
        }

        const rows = screen.getAllByTestId(/^swaplist-item-/);
        expect(rows[0]).toHaveAttribute("data-testid", "swaplist-item-claim");
        expect(rows[1]).toHaveAttribute("data-testid", "swaplist-item-refund");
        expect(screen.getByTestId("swaplist-item-completed")).not.toHaveClass(
            "disabled",
        );
        expect(screen.getByTestId("swaplist-item-refund")).not.toHaveClass(
            "disabled",
        );
        expect(screen.getByTestId("swaplist-item-claim")).not.toHaveTextContent(
            `${dict.en.created}:`,
        );
        expect(screen.getByTestId("delete-swap-completed")).toHaveClass(
            "btn-danger",
        );
    });

    test("should only check rescue state for swaps on the current page", async () => {
        const user = userEvent.setup();
        storedSwaps = Array.from({ length: 16 }, (_, index) => ({
            ...sampleSwap,
            id: `swap-${index + 1}`,
            date: 16 - index,
        }));

        renderHistory();

        await waitFor(() => {
            expect(createRescueListMock).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ id: "swap-1" }),
                ]),
                true,
            );
            expect(createRescueListMock.mock.calls.at(-1)?.[0]).toHaveLength(
                10,
            );
        });

        await user.click(screen.getByTestId("next-page"));

        await waitFor(() => {
            expect(createRescueListMock.mock.calls.at(-1)?.[0]).toHaveLength(6);
            expect(createRescueListMock.mock.calls.at(-1)?.[0]).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ id: "swap-11" }),
                    expect.objectContaining({ id: "swap-16" }),
                ]),
            );
        });
    });

    test("should export swaps without mnemonic data", async () => {
        const user = userEvent.setup();
        storedSwaps = [sampleSwap];

        renderHistory();

        await user.click(
            await screen.findByRole("button", {
                name: dict.en.history_export,
            }),
        );

        await waitFor(() => {
            expect(downloadJsonMock).toHaveBeenCalledOnce();
        });

        const exportPayload = downloadJsonMock.mock.calls[0]?.[1];

        expect(downloadJsonMock).toHaveBeenCalledWith(
            "history-export",
            expect.any(Object),
        );
        expect(exportPayload).toEqual({
            version: latestStorageVersion,
            swaps: [sampleSwap],
        });
        expect(exportPayload).not.toHaveProperty("mnemonic");
    });

    test("should clear the swap history after confirmation", async () => {
        const user = userEvent.setup();
        storedSwaps = [sampleSwap];
        clearStoreMock.mockImplementation((name?: string) => {
            if (name === "swaps") {
                storedSwaps = [];
            }
        });
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

        renderHistory();

        await user.click(
            await screen.findByRole("button", { name: dict.en.refund_clear }),
        );

        expect(confirmSpy).toHaveBeenCalledWith(dict.en.delete_storage);
        expect(
            await screen.findByText(dict.en.history_no_swaps),
        ).toBeInTheDocument();
        confirmSpy.mockRestore();
    });

    test("should keep the swap history when the confirmation is declined", async () => {
        const user = userEvent.setup();
        storedSwaps = [sampleSwap];
        const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

        renderHistory();

        await user.click(
            await screen.findByRole("button", { name: dict.en.refund_clear }),
        );

        expect(clearStoreMock).not.toHaveBeenCalledWith("swaps");
        expect(screen.queryByText(dict.en.history_no_swaps)).toBeNull();
        confirmSpy.mockRestore();
    });
});
