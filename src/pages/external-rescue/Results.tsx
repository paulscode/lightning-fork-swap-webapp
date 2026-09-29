import { For, Show } from "solid-js";

import LoadingSpinner from "../../components/LoadingSpinner";
import Pagination, {
    desktopItemsPerPage,
    mobileItemsPerPage,
} from "../../components/Pagination";
import { SwapIcons, getSwapIconAssets } from "../../components/SwapIcons";
import { getSwapListHeight } from "../../components/SwapList";
import { hiddenInformation } from "../../components/settings/PrivacyMode";
import { useGlobalContext } from "../../context/Global";
import { isMobile } from "../../utils/helper";
import { RescueAction } from "../../utils/rescue";
import type { SomeSwap } from "../../utils/swapCreator";
import { getSwapDate } from "./scan";
import { BtcSearchState, type RescueResult } from "./types";
import type { ExternalRescueSearch } from "./useExternalRescueSearch";

const resultActionLabel = (
    action: RescueAction,
    t: ReturnType<typeof useGlobalContext>["t"],
) => {
    switch (action) {
        case RescueAction.Pending:
            return t("in_progress");
        case RescueAction.Claim:
            return t("claim");
        case RescueAction.Refund:
            return t("refund");
        case RescueAction.Failed:
            return t("failed");
        case RescueAction.Successful:
        default:
            return t("completed");
    }
};

const formatResultDate = (result: RescueResult) => {
    const date = new Date();
    date.setTime(getSwapDate(result.swap));
    return date.toLocaleDateString();
};

type ResultsProps = {
    state: ExternalRescueSearch["state"];
    results: ExternalRescueSearch["results"];
};

const RescueList = (props: { results: ExternalRescueSearch["results"] }) => {
    const { t, privacyMode } = useGlobalContext();

    return (
        <div id="swaplist" class="rescue-external-result-list">
            <hr />
            <For each={props.results.current()}>
                {(result, index) => (
                    <>
                        <div
                            data-testid={`swaplist-item-${result.swap.id}`}
                            class={`swaplist-item ${
                                !result.actionable ? "disabled" : ""
                            }`}
                            onClick={() => props.results.open(result)}>
                            <a
                                class="btn-small swaplist-action"
                                href="#"
                                onClick={(e) => e.preventDefault()}>
                                {resultActionLabel(result.action, t)}
                            </a>
                            <SwapIcons assets={getSwapIconAssets(result.swap)} />
                            <span class="swaplist-asset-id">
                                {t("id")}:&nbsp;
                                <Show
                                    when={!privacyMode()}
                                    fallback={hiddenInformation}>
                                    <span class="monospace">
                                        {result.swap.id}
                                    </span>
                                </Show>
                            </span>
                            <span class="swaplist-asset-date hidden-mobile">
                                {t("created")}:&nbsp;
                                <span class="monospace">
                                    {formatResultDate(result)}
                                </span>
                            </span>
                        </div>
                        <Show
                            when={index() < props.results.current().length - 1}>
                            <hr />
                        </Show>
                    </>
                )}
            </For>
            <hr />
        </div>
    );
};

export const Results = (props: ResultsProps) => {
    const { t } = useGlobalContext();
    const layoutSlots = () =>
        Array.from({
            length: props.results.displaySlotCount(),
        }) as never as SomeSwap[];

    return (
        <>
            <Show when={props.state.btc.searchState === BtcSearchState.Loading}>
                <p class="restore-loading-progress">
                    {t("swaps_found", {
                        count: props.state.btc.loadedSwaps,
                    })}
                </p>
                <LoadingSpinner class="restore-loading-spinner" />
            </Show>
            <Show when={props.state.btc.searchState === BtcSearchState.Errored}>
                <h3 class="frame-text-spaced">
                    {t("error")}: {props.state.btc.error}
                </h3>
            </Show>

            <Show
                when={
                    props.state.btc.listLoading &&
                    props.results.all().length === 0
                }>
                <LoadingSpinner />
            </Show>

            <Show when={props.results.all().length > 0}>
                <div class="rescue-external-results">
                    <div style={getSwapListHeight(layoutSlots(), isMobile())}>
                        <RescueList results={props.results} />
                    </div>
                    <Pagination
                        items={props.results.all}
                        setDisplayedItems={props.results.setCurrent}
                        totalItems={props.results.all().length}
                        itemsPerPage={
                            isMobile()
                                ? mobileItemsPerPage
                                : desktopItemsPerPage
                        }
                        currentPage={props.results.currentPage}
                        setCurrentPage={props.results.setCurrentPage}
                    />
                </div>
            </Show>

            <Show when={props.state.search.error}>
                <h3 class="frame-text-spaced">
                    {t("error")}: {props.state.search.error}
                </h3>
            </Show>
            <Show
                when={
                    props.state.search.hasSearched &&
                    !props.state.search.isSearching &&
                    !props.results.hasAny()
                }>
                <h3>{t("no_swaps_found")}</h3>
            </Show>
        </>
    );
};
