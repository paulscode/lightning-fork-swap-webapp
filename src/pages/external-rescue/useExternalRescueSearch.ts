import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal, onCleanup } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

import type {
    RescueFileError,
    RescueFileResult,
} from "../../components/RescueFileUpload";
import { useGlobalContext } from "../../context/Global";
import { useRescueContext } from "../../context/Rescue";
import type { DictKey } from "../../i18n/i18n";
import { formatError } from "../../utils/errors";
import {
    RescueAction,
    RescueNoAction,
    createRescueList,
} from "../../utils/rescue";
import type { RescueFile } from "../../utils/rescueFile";
import type { SomeSwap } from "../../utils/swapCreator";
import {
    fetchPaginatedRestorableSwaps,
    getSwapDate,
    mapRestorableSwaps,
    sortResults,
} from "./scan";
import { BtcSearchState, type RescueResult } from "./types";

type FileState = {
    rescueFile?: RescueFile;
    rescueFileName?: string;
    rescueFileNameKey?: DictKey;
    refundInvalid?: RescueFileError;
};

type SearchState = {
    hasSearched: boolean;
    isSearching: boolean;
    error?: string;
};

type BtcState = {
    loadedSwaps: number;
    searchState: BtcSearchState;
    error?: string;
    swaps: Partial<SomeSwap>[];
    listLoading: boolean;
};

type RescueSearchState = {
    file: FileState;
    search: SearchState;
    btc: BtcState;
};

const initialState = (): RescueSearchState => ({
    file: {},
    search: {
        hasSearched: false,
        isSearching: false,
    },
    btc: {
        loadedSwaps: 0,
        searchState: BtcSearchState.Idle,
        swaps: [],
        listLoading: false,
    },
});

export const useExternalRescueSearch = () => {
    const { t } = useGlobalContext();
    const navigate = useNavigate();
    const { setRescuableSwaps, setRescueFile: setContextRescueFile } =
        useRescueContext();

    const [state, setState] = createStore<RescueSearchState>(initialState());
    const [currentResults, setCurrentResultsStore] = createStore<
        RescueResult[]
    >([]);
    const setCurrentResults = (results: RescueResult[]) => {
        setCurrentResultsStore(reconcile(results, { key: "key" }));
    };
    const [currentResultPage, setCurrentResultPage] = createSignal(1);

    let scanAbort: AbortController | undefined;

    const setFileState = (file: FileState) => setState("file", file);
    const setSearchState = (search: Partial<SearchState>) =>
        setState("search", (current) => ({ ...current, ...search }));
    const setBtcState = (btc: Partial<BtcState>) =>
        setState("btc", (current) => ({ ...current, ...btc }));

    const [btcRescueList] = createResource(
        () => state.btc.swaps,
        async (swaps) => {
            setBtcState({ listLoading: true });
            return await createRescueList(swaps as SomeSwap[], true).finally(
                () => setBtcState({ listLoading: false }),
            );
        },
    );

    const results = createMemo(() =>
        sortResults(
            (btcRescueList() ?? []).map((swap): RescueResult => {
                const action = swap.action ?? RescueAction.Pending;
                return {
                    key: swap.id,
                    action,
                    actionable: !RescueNoAction.includes(action),
                    sortValue: getSwapDate(swap),
                    swap,
                };
            }),
        ),
    );

    const canSearch = () => state.file.rescueFile !== undefined;
    const showResultsPage = () =>
        state.search.hasSearched || state.search.isSearching;
    const hasAnyResults = () => state.btc.swaps.length > 0;

    const searchText = () => {
        if (state.search.isSearching) {
            return t("stop_scanning");
        }
        if (!canSearch()) {
            return t("rescue_external_select_method");
        }
        return t("rescue");
    };

    const rescueFileDisplayName = () =>
        state.file.rescueFileName ??
        (state.file.rescueFileNameKey !== undefined
            ? t(state.file.rescueFileNameKey)
            : undefined);

    const fileErrorKey = (): DictKey | undefined =>
        state.file.refundInvalid !== undefined
            ? "invalid_refund_file"
            : undefined;

    const resetSearchResults = () => {
        setSearchState({ hasSearched: false, error: undefined });
        setBtcState({
            loadedSwaps: 0,
            searchState: BtcSearchState.Idle,
            error: undefined,
            swaps: [],
        });
        setCurrentResults([]);
        setCurrentResultPage(1);
        setRescuableSwaps([]);
    };

    const stopSearch = () => {
        if (scanAbort) {
            scanAbort.abort("scan stopped");
            scanAbort = undefined;
        }
        if (state.btc.searchState === BtcSearchState.Loading) {
            setBtcState({ searchState: BtcSearchState.Idle });
        }
        if (!hasAnyResults()) {
            setSearchState({ hasSearched: false });
        }
        setSearchState({ isSearching: false });
    };

    const backToMethodSelection = () => {
        stopSearch();
        resetSearchResults();
    };

    const handleFileValidated = (result: RescueFileResult) => {
        resetSearchResults();
        setFileState({
            refundInvalid: undefined,
            rescueFile: result.data,
            rescueFileName: result.fileName,
            rescueFileNameKey: result.fileNameKey,
        });
        setContextRescueFile(result.data);
    };

    const handleFileError = (error: RescueFileError) => {
        resetSearchResults();
        setFileState({ refundInvalid: error });
    };

    const handleReset = () => {
        stopSearch();
        resetSearchResults();
        setFileState({});
    };

    const runBtcRestore = async (
        currentRescueFile: RescueFile,
        signal: AbortSignal,
    ) => {
        setBtcState({
            searchState: BtcSearchState.Loading,
            error: undefined,
        });

        try {
            const restorableSwaps = await fetchPaginatedRestorableSwaps(
                currentRescueFile,
                (loadedSwaps) => setBtcState({ loadedSwaps }),
                signal,
            );
            if (signal.aborted) {
                return;
            }

            setRescuableSwaps(restorableSwaps);
            setBtcState({
                searchState: BtcSearchState.Ready,
                swaps: mapRestorableSwaps(restorableSwaps),
            });
        } catch (e) {
            if (signal.aborted) {
                return;
            }
            setBtcState({
                searchState: BtcSearchState.Errored,
                error: formatError(e),
            });
        }
    };

    const startSearch = async () => {
        if (state.search.isSearching) {
            stopSearch();
            return;
        }

        const currentRescueFile = state.file.rescueFile;
        if (currentRescueFile === undefined) {
            return;
        }

        stopSearch();
        resetSearchResults();
        setSearchState({
            hasSearched: true,
            isSearching: true,
        });

        scanAbort = new AbortController();
        const signal = scanAbort.signal;

        try {
            await runBtcRestore(currentRescueFile, signal);
        } catch (e) {
            if (!signal.aborted) {
                setSearchState({ error: formatError(e) });
            }
        } finally {
            if (!signal.aborted) {
                setSearchState({ isSearching: false });
                scanAbort = undefined;
            }
        }
    };

    const openResult = (result: RescueResult) => {
        if (!result.actionable) {
            return;
        }

        stopSearch();

        if (result.action === RescueAction.Claim) {
            navigate(`/rescue/claim/${result.swap.id}`);
            return;
        }

        navigate(`/rescue/refund/${result.swap.id}`, {
            state: {
                waitForSwapTimeout: result.swap.waitForSwapTimeout,
            },
        });
    };

    onCleanup(() => {
        stopSearch();
    });

    return {
        state,
        actions: {
            backToMethodSelection,
            handleFileError,
            handleFileValidated,
            handleReset,
            startSearch,
        },
        results: {
            all: results,
            current: () => currentResults,
            currentPage: currentResultPage,
            displaySlotCount: () => results().length,
            hasAny: hasAnyResults,
            open: openResult,
            setCurrent: setCurrentResults,
            setCurrentPage: setCurrentResultPage,
        },
        selection: {
            canSearch,
            fileErrorKey,
            rescueFileDisplayName,
            searchText,
            showResultsPage,
        },
    };
};

export type ExternalRescueSearch = ReturnType<typeof useExternalRescueSearch>;
