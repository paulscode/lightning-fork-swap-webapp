import { A, useNavigate } from "@solidjs/router";
import { BigNumber } from "bignumber.js";
import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";

import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import type { DictKey } from "../i18n/i18n";
import {
    ChannelApiError,
    type ChannelInfo,
    createChannelDonation,
    getChannelInfo,
    parseNode,
    storeDonation,
} from "../utils/channelDonation";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { closeDonate } from "../utils/donate";

const errorKeys: Record<string, DictKey> = {
    bad_node: "channel_error_bad_node",
    not_public: "channel_error_not_public",
    bad_host: "channel_error_bad_host",
    our_node: "channel_error_our_node",
    node_limit: "channel_error_node_limit",
    budget: "channel_error_budget",
    disclaimer: "channel_error_disclaimer",
    work: "channel_error_work",
};

// The full terms of a channel donation; the same words wherever shown
export const ChannelTerms = () => {
    const { t } = useGlobalContext();
    const points = [
        ["channel_full_gift_title", "channel_full_gift"],
        ["channel_full_effort_title", "channel_full_effort"],
        ["channel_full_stays_title", "channel_full_stays"],
        ["channel_full_ours_title", "channel_full_ours"],
        ["channel_full_send_title", "channel_full_send"],
    ] as const;
    return (
        <ul class="channel-terms" data-testid="channel-terms">
            <For each={points}>
                {([title, text]) => (
                    <li>
                        <strong>{t(title)}</strong> {t(text)}
                    </li>
                )}
            </For>
        </ul>
    );
};

// The channel donation's part of the Donate tab: the node, the sizes, the
// terms with their checkbox, and the button that makes the address
const ChannelDonationForm = (props: { info: ChannelInfo }) => {
    const { t, denomination, separator } = useGlobalContext();
    const navigate = useNavigate();
    const [node, setNode] = createSignal("");
    const [accepted, setAccepted] = createSignal(false);
    const [busy, setBusy] = createSignal(false);
    const [error, setError] = createSignal<string | undefined>();
    const parsed = createMemo(() => parseNode(node()));
    const controller = new AbortController();
    onCleanup(() => controller.abort());

    const unit = () => formatDenomination(denomination(), BTC);
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);
    // The server's minimum is the smallest channel plus the fee of opening
    // it from one coin (its FundingVsize(1), 155 vbytes)
    const fee = () => props.info.feeRate * 155;
    const channelMin = () => Math.max(0, props.info.minSat - fee());

    const submit = async () => {
        if (parsed() === undefined || !accepted() || busy()) {
            return;
        }
        setBusy(true);
        setError(undefined);
        try {
            // A fresh challenge: the one shown may have expired
            const info = (await getChannelInfo()) ?? props.info;
            if (!info.available) {
                throw new ChannelApiError(503, "unavailable");
            }
            const created = await createChannelDonation(
                node().trim(),
                info,
                controller.signal,
            );
            storeDonation({
                id: created.id,
                secret: created.secret,
                createdAt: Date.now(),
            });
            closeDonate();
            navigate(`/donate/channel/${created.id}`);
        } catch (e) {
            if (controller.signal.aborted) {
                return;
            }
            const code = e instanceof ChannelApiError ? e.code : "";
            setError(t(errorKeys[code] ?? "channel_error_unavailable"));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div class="channel-form" data-testid="channel-form">
            <p class="channel-short" data-testid="channel-short">
                <strong>{t("channel_short_title")}</strong>{" "}
                {t("channel_short_text")}{" "}
                <A href="/terms" onClick={() => closeDonate()}>
                    {t("channel_terms_link")}
                </A>
            </p>
            <label class="channel-node-label" for="channel-node">
                {t("channel_node_label")}
            </label>
            <input
                id="channel-node"
                data-testid="channel-node"
                class="channel-node"
                classList={{ invalid: node() !== "" && parsed() === undefined }}
                aria-invalid={node() !== "" && parsed() === undefined}
                aria-describedby="channel-node-help"
                autocomplete="off"
                spellcheck={false}
                placeholder={t("channel_node_placeholder")}
                value={node()}
                onInput={(e) => setNode(e.currentTarget.value)}
            />
            <p id="channel-node-help" class="channel-help">
                <Show
                    when={node() === "" || parsed() !== undefined}
                    fallback={t("channel_node_invalid")}>
                    {t("channel_node_help")}
                </Show>
            </p>
            <p class="channel-sizes" data-testid="channel-sizes">
                {t("channel_sizes", {
                    min: show(props.info.minSat),
                    channel: show(channelMin()),
                    fee: show(fee()),
                    max: show(props.info.maxSat),
                    unit: unit(),
                })}
            </p>
            <div class="channel-full">
                <h3>{t("channel_full_title")}</h3>
                <ChannelTerms />
                <label class="channel-accept">
                    <input
                        type="checkbox"
                        data-testid="channel-accept"
                        checked={accepted()}
                        onChange={(e) => setAccepted(e.currentTarget.checked)}
                    />
                    <span>{t("channel_accept")}</span>
                </label>
            </div>
            <Show when={error()}>
                <p
                    class="channel-error"
                    role="alert"
                    data-testid="channel-error">
                    {error()}
                </p>
            </Show>
            <button
                type="button"
                class="btn"
                data-testid="channel-create"
                disabled={!accepted() || parsed() === undefined || busy()}
                onClick={() => void submit()}>
                {busy() ? t("channel_working") : t("channel_create")}
            </button>
        </div>
    );
};

export default ChannelDonationForm;
