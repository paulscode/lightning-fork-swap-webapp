import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";
import { userEvent } from "@testing-library/user-event";
import { type RestorableSwap, getRestorableSwaps } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import { vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import { paginationLimit } from "../../src/consts/Pagination";
import i18n from "../../src/i18n/i18n";
import Rescue from "../../src/pages/Rescue";
import { Results } from "../../src/pages/external-rescue/Results";
import {
    getSwapDate,
    mapRestorableSwaps,
    sortResults,
} from "../../src/pages/external-rescue/scan";
import {
    BtcSearchState,
    type RescueResult,
} from "../../src/pages/external-rescue/types";
import { useExternalRescueSearch } from "../../src/pages/external-rescue/useExternalRescueSearch";
import { RescueAction } from "../../src/utils/rescue";
import { getXpub } from "../../src/utils/rescueFile";
import { TestComponent, contextWrapper, globalSignals } from "../helper";

vi.mock("../../packages/boltz-swaps/src/client.ts", () => {
    return {
        getLockupTransaction: vi.fn(),
        getRestorableSwaps: vi.fn(),
    };
});

vi.mock("../../src/utils/rescue", async () => {
    const actual = await vi.importActual("../../src/utils/rescue");
    return {
        ...actual,
        getRescuableUTXOs: vi.fn(),
    };
});

const mockGetRestorableSwaps = vi.mocked(getRestorableSwaps);

const mnemonic =
    "horse olympic laundry marriage material private arch civil theory crew alone thank";

const swapTree = {
    claimLeaf: {
        version: 192,
        output: "a914aa856454ae0e8e8e0bf3e625421e13e168bd9d5d8820395d9749b27c5908e2e8e95237cf8d1c704c48b19e51f915c9986a1973925567ac",
    },
    refundLeaf: {
        version: 192,
        output: "208f7d52e62a440dec6c17cf929889df5abdbe85158834cf5d67e0f957b7ccee53ad02ca04b1",
    },
};

const claimDetails = {
    tree: swapTree,
    keyIndex: 0,
    lockupAddress:
        "bcrt1ptwl8vqkgrxz9ydyv5zx8qluv2mpjkg58qry2xvf2qeek7l9uxpusm4tlgf",
    serverPublicKey:
        "02395d9749b27c5908e2e8e95237cf8d1c704c48b19e51f915c9986a1973925567",
    timeoutBlockHeight: 1226,
    amount: 10_000,
};

const pendingSwap: RestorableSwap = {
    id: "pending-swap",
    type: SwapType.Reverse,
    status: "invoice.set",
    createdAt: 1754409244,
    from: LN,
    to: BTC,
    claimDetails,
};

const claimSwap: RestorableSwap = {
    ...pendingSwap,
    id: "claim-swap",
    status: "transaction.confirmed",
    createdAt: 1754409243,
};

const renderRescue = () =>
    render(
        () => (
            <>
                <TestComponent />
                <Rescue />
            </>
        ),
        {
            wrapper: contextWrapper,
        },
    );

const makeRescueFile = (content: string, name = "rescue.json") => {
    const file = new File(["{}"], name, {
        type: "application/json",
    });
    Object.defineProperty(file, "text", {
        value: () => Promise.resolve(content),
    });
    return file;
};

const uploadRescueKey = async (user: ReturnType<typeof userEvent.setup>) => {
    const uploadInput = await screen.findByTestId("refundUpload");
    await user.upload(
        uploadInput,
        makeRescueFile(JSON.stringify({ mnemonic })),
    );
};

const readyState = {
    btc: {
        loadedSwaps: 0,
        searchState: BtcSearchState.Ready,
        swaps: [],
        listLoading: false,
    },
    file: {},
    search: {
        hasSearched: true,
        isSearching: false,
    },
};

const makeResult = (
    id: string,
    action: RescueAction,
    sortValue = 1,
): RescueResult => ({
    key: id,
    action,
    actionable: ![
        RescueAction.Successful,
        RescueAction.Pending,
        RescueAction.Failed,
    ].includes(action),
    sortValue,
    swap: {
        id,
        type: SwapType.Reverse,
        assetSend: LN,
        assetReceive: BTC,
        date: sortValue,
    } as RescueResult["swap"],
});

beforeEach(() => {
    // Some tests navigate away; the test router only renders "/"
    window.history.replaceState({}, "", "/");
});

describe("Rescue", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockGetRestorableSwaps.mockReset();
    });

    test("should render WASM error", async () => {
        renderRescue();
        globalSignals.setWasmSupported(false);
        expect(
            await screen.findAllByText(i18n.en.error_wasm),
        ).not.toBeUndefined();
    });

    test("should render the rescue key method page", async () => {
        renderRescue();

        expect(
            await screen.findByText(i18n.en.rescue_swaps),
        ).toBeInTheDocument();
        expect(
            screen.getByText(i18n.en.rescue_external_subtitle),
        ).toBeInTheDocument();
        expect(screen.getByTestId("refundUpload")).toBeInTheDocument();

        const searchButton = screen.getByRole("button", {
            name: i18n.en.rescue_external_select_method,
        });
        expect(searchButton).toBeDisabled();
    });

    test("should enable search after rescue key upload without auto-searching", async () => {
        const user = userEvent.setup();

        renderRescue();
        await uploadRescueKey(user);

        expect(mockGetRestorableSwaps).not.toHaveBeenCalled();
        expect(screen.getByText("rescue.json")).toBeInTheDocument();
        expect(
            screen.getByRole("button", { name: i18n.en.rescue }),
        ).toBeEnabled();
    });

    test("should show an error and keep search disabled for an invalid rescue file", async () => {
        const user = userEvent.setup();

        renderRescue();

        const uploadInput = await screen.findByTestId("refundUpload");
        await user.upload(
            uploadInput,
            makeRescueFile(JSON.stringify({ mnemonic: "invalid words" })),
        );

        expect(
            await screen.findByText(i18n.en.invalid_refund_file),
        ).toBeInTheDocument();
        expect(
            screen.getByRole("button", {
                name: i18n.en.rescue_external_select_method,
            }),
        ).toBeDisabled();
    });

    test("should simplify manual rescue key entry on the unified page", async () => {
        const user = userEvent.setup();

        renderRescue();

        await user.click(await screen.findByTestId("enterMnemonicBtn"));

        expect(screen.getByTestId("backBtn")).toHaveTextContent(
            i18n.en.upload_rescue_key,
        );
        expect(screen.queryByTestId("import-key-button")).toBeNull();

        await user.click(screen.getByTestId("backBtn"));
        expect(await screen.findByTestId("refundUpload")).toBeInTheDocument();
    });

    test("should query restorable swaps with the rescue key xpub page by page", async () => {
        const user = userEvent.setup();
        mockGetRestorableSwaps
            .mockResolvedValueOnce([pendingSwap])
            .mockResolvedValueOnce([claimSwap])
            .mockResolvedValueOnce([]);

        renderRescue();
        await uploadRescueKey(user);
        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        await screen.findByTestId("swaplist-item-claim-swap");

        const xpub = getXpub({ mnemonic });
        expect(mockGetRestorableSwaps).toHaveBeenCalledTimes(3);
        expect(mockGetRestorableSwaps.mock.calls.map((c) => c[0])).toEqual([
            xpub,
            xpub,
            xpub,
        ]);
        expect(mockGetRestorableSwaps.mock.calls.map((c) => c[1])).toEqual([
            { startIndex: 0, limit: paginationLimit },
            { startIndex: paginationLimit, limit: paginationLimit },
            { startIndex: 2 * paginationLimit, limit: paginationLimit },
        ]);
    });

    test("should hide recovery inputs while searching and restore them on back", async () => {
        const user = userEvent.setup();
        let resolveRestore!: (swaps: RestorableSwap[]) => void;
        let restoreSignal: AbortSignal | undefined;

        mockGetRestorableSwaps.mockImplementation(
            (_xpub, _pagination, signal) => {
                restoreSignal = signal;
                return new Promise<RestorableSwap[]>((resolve) => {
                    resolveRestore = resolve;
                });
            },
        );

        renderRescue();
        await uploadRescueKey(user);
        expect(screen.getByText("rescue.json")).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        await waitFor(() => {
            expect(screen.queryByTestId("refundUpload")).toBeNull();
        });
        expect(
            screen.getByText(i18n.en.swaps_found.replace("{{ count }}", "0")),
        ).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: i18n.en.back }));

        expect(restoreSignal?.aborted).toBe(true);
        expect(await screen.findByTestId("refundUpload")).toBeInTheDocument();
        expect(screen.getByText("rescue.json")).toBeInTheDocument();
        resolveRestore([]);
    });

    test("should not preserve uploaded rescue key after leaving the page", async () => {
        const user = userEvent.setup();

        const firstRender = renderRescue();
        await uploadRescueKey(user);

        expect(screen.getByText("rescue.json")).toBeInTheDocument();
        firstRender.unmount();

        renderRescue();

        expect(await screen.findByTestId("refundUpload")).toBeInTheDocument();
        expect(screen.queryByText("rescue.json")).toBeNull();
        expect(
            screen.getByRole("button", {
                name: i18n.en.rescue_external_select_method,
            }),
        ).toBeDisabled();
    });

    test("should show a message when no swaps are found", async () => {
        const user = userEvent.setup();
        mockGetRestorableSwaps.mockResolvedValue([]);

        renderRescue();
        await uploadRescueKey(user);
        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        expect(
            await screen.findByText(i18n.en.no_swaps_found),
        ).toBeInTheDocument();
    });

    test("should show the error when restoring swaps fails", async () => {
        const user = userEvent.setup();
        mockGetRestorableSwaps.mockRejectedValue(new Error("backend down"));

        renderRescue();
        await uploadRescueKey(user);
        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        expect(
            await screen.findByText(`${i18n.en.error}: backend down`),
        ).toBeInTheDocument();
    });

    test("should render one action-sorted result list", async () => {
        const user = userEvent.setup();

        mockGetRestorableSwaps
            .mockResolvedValueOnce([pendingSwap, claimSwap])
            .mockResolvedValueOnce([]);

        renderRescue();
        await uploadRescueKey(user);
        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        await waitFor(() => {
            expect(
                screen.getByTestId("swaplist-item-claim-swap"),
            ).toBeInTheDocument();
        });

        const rows = document.querySelectorAll(
            ".rescue-external-result-list .swaplist-item",
        );
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveAttribute(
            "data-testid",
            "swaplist-item-claim-swap",
        );
        expect(rows[0]).toHaveTextContent(i18n.en.claim);
        expect(rows[1]).toHaveClass("disabled");
        expect(rows[1]).toHaveTextContent(i18n.en.in_progress);
    });

    test("should open the claim page for claimable results only", async () => {
        const user = userEvent.setup();

        mockGetRestorableSwaps
            .mockResolvedValueOnce([pendingSwap, claimSwap])
            .mockResolvedValueOnce([]);

        renderRescue();
        await uploadRescueKey(user);
        await user.click(screen.getByRole("button", { name: i18n.en.rescue }));

        const pendingRow = await screen.findByTestId(
            "swaplist-item-pending-swap",
        );
        fireEvent.click(pendingRow);
        expect(window.location.pathname).toBe("/");

        fireEvent.click(screen.getByTestId("swaplist-item-claim-swap"));
        await waitFor(() => {
            expect(window.location.pathname).toBe("/rescue/claim/claim-swap");
        });
    });
});

describe("external rescue scan helpers", () => {
    test("maps restorable swaps and drops the ones without details", () => {
        const mapped = mapRestorableSwaps([
            pendingSwap,
            { ...pendingSwap, id: "no-details", claimDetails: undefined },
        ]);

        expect(mapped).toHaveLength(1);
        expect(mapped[0]).toMatchObject({
            id: "pending-swap",
            type: SwapType.Reverse,
            assetSend: LN,
            assetReceive: BTC,
        });
    });

    test("uses the local date before the restored creation time", () => {
        expect(getSwapDate({ date: 5, createdAt: 1 })).toBe(5);
        expect(getSwapDate({ createdAt: 2 })).toBe(2_000);
        expect(getSwapDate({})).toBe(0);
    });

    test("sorts actionable results first and newest first within a priority", () => {
        const sorted = sortResults([
            makeResult("done", RescueAction.Successful, 5),
            makeResult("pending", RescueAction.Pending, 4),
            makeResult("old-refund", RescueAction.Refund, 1),
            makeResult("claim", RescueAction.Claim, 2),
            makeResult("failed", RescueAction.Failed, 3),
        ]);

        expect(sorted.map((r) => r.key)).toEqual([
            "claim",
            "old-refund",
            "pending",
            "done",
            "failed",
        ]);
    });
});

describe("Results", () => {
    test("should keep result rows clickable while fresh result arrays are pushed", () => {
        const open = vi.fn();
        let setCurrent!: (results: RescueResult[]) => void;

        const Harness = () => {
            const { results } = useExternalRescueSearch();
            setCurrent = results.setCurrent;
            return (
                <Results
                    state={
                        readyState as ReturnType<
                            typeof useExternalRescueSearch
                        >["state"]
                    }
                    results={{
                        ...results,
                        all: () => [makeResult("first", RescueAction.Refund)],
                        open,
                    }}
                />
            );
        };

        render(
            () => (
                <>
                    <TestComponent />
                    <Harness />
                </>
            ),
            {
                wrapper: contextWrapper,
            },
        );

        const row = screen.getByTestId("swaplist-item-first");

        setCurrent([
            makeResult("first", RescueAction.Refund, 1),
            makeResult("second", RescueAction.Refund, 2),
        ]);

        expect(screen.getByTestId("swaplist-item-second")).toBeInTheDocument();
        expect(screen.getByTestId("swaplist-item-first")).toBe(row);

        fireEvent.click(row);
        expect(open).toHaveBeenCalledTimes(1);
        expect((open.mock.calls[0][0] as RescueResult).key).toBe("first");
    });

    test("should show the loading progress while restoring", () => {
        const results = {
            all: () => [] as RescueResult[],
            current: () => [] as RescueResult[],
            currentPage: () => 1,
            displaySlotCount: () => 0,
            hasAny: () => false,
            open: vi.fn(),
            setCurrent: vi.fn(),
            setCurrentPage: vi.fn(),
        };

        render(
            () => (
                <>
                    <TestComponent />
                    <Results
                        state={
                            {
                                ...readyState,
                                btc: {
                                    ...readyState.btc,
                                    loadedSwaps: 3,
                                    searchState: BtcSearchState.Loading,
                                },
                                search: {
                                    hasSearched: true,
                                    isSearching: true,
                                },
                            } as ReturnType<
                                typeof useExternalRescueSearch
                            >["state"]
                        }
                        results={
                            results as unknown as ReturnType<
                                typeof useExternalRescueSearch
                            >["results"]
                        }
                    />
                </>
            ),
            {
                wrapper: contextWrapper,
            },
        );

        expect(
            screen.getByText(i18n.en.swaps_found.replace("{{ count }}", "3")),
        ).toBeInTheDocument();
        expect(screen.queryByText(i18n.en.no_swaps_found)).toBeNull();
    });
});
