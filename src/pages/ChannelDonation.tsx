import { useParams } from "@solidjs/router";
import { BigNumber } from "bignumber.js";
import {
    For,
    Show,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
    untrack,
} from "solid-js";

import Accordion from "../components/Accordion";
import { ChannelTerms } from "../components/ChannelDonationForm";
import CopyButton from "../components/CopyButton";
import QrCode from "../components/QrCode";
import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import type { DictKey } from "../i18n/i18n";
import "../style/donate.scss";
import {
    ChannelApiError,
    type ChannelOrder,
    type ChannelState,
    donationLink,
    donationSecret,
    editChannelNode,
    getChannelDonation,
    isSettled,
    orderIdPattern,
    parseNode,
    storeDonation,
} from "../utils/channelDonation";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { donationBip21, splitAddress } from "../utils/donate";

export const visiblePollMs = 5_000;
export const hiddenPollMs = 60_000;

// The usual way, in order
const steps: ChannelState[] = [
    "awaiting_payment",
    "payment_seen",
    "payment_confirmed",
    "connecting",
    "opening",
    "funding_broadcast",
    "open",
];

// Where a state sits on the usual way (side states sit where they happen)
const position = (o: ChannelOrder): number => {
    const i = steps.indexOf(o.state);
    if (i !== -1) {
        return i;
    }
    switch (o.state) {
        case "new":
            return 0;
        case "retrying":
        case "needs_attention":
            return o.confirmedSat > 0 ? steps.indexOf("connecting") : 0;
        case "closed":
            return steps.length;
    }
    return -1;
};

const sideStates: Partial<Record<ChannelState, DictKey>> = {
    retrying: "cd_state_retrying",
    needs_attention: "cd_state_needs_attention",
    fell_back: "cd_state_fell_back",
    closed: "cd_state_closed",
    expired: "cd_state_expired",
    rejected: "cd_state_rejected",
};

const errorText: Record<string, DictKey> = {
    unreachable: "cd_error_unreachable",
    wrong_node: "cd_error_wrong_node",
    not_fork_node: "cd_error_not_fork_node",
    no_address: "cd_error_no_address",
    peer_rejected: "cd_error_peer_rejected",
    peer_too_small: "cd_error_peer_too_small",
    peer_pending: "cd_error_peer_pending",
    disconnected: "cd_error_disconnected",
    our_node: "cd_error_our_node",
    node_limit: "cd_error_node_limit",
    too_little: "cd_error_too_little",
    internal: "cd_error_internal",
    gave_up: "cd_error_gave_up",
    no_edit: "cd_error_no_edit",
    fees_high: "cd_error_fees_high",
    lnd_unavailable: "cd_error_lnd_unavailable",
    operator: "cd_error_operator",
    budget: "cd_error_budget",
};

const EditNode = (props: { order: ChannelOrder; onSaved: () => void }) => {
    const { t } = useGlobalContext();
    const secret = () => donationSecret(props.order.id);
    // Starts from the node as it was; the donor's typing is theirs after
    const [node, setNode] = createSignal(
        untrack(
            () =>
                props.order.node.pubkey +
                (props.order.node.address
                    ? `@${props.order.node.address}`
                    : ""),
        ),
    );
    const [message, setMessage] = createSignal<string | undefined>();
    const [busy, setBusy] = createSignal(false);
    const valid = createMemo(() => parseNode(node()) !== undefined);

    const save = async () => {
        if (!valid() || busy() || secret() === undefined) {
            return;
        }
        setBusy(true);
        try {
            await editChannelNode(props.order.id, secret()!, node().trim());
            setMessage(t("cd_edit_saved"));
            props.onSaved();
        } catch (e) {
            const code = e instanceof ChannelApiError ? e.code : "";
            const key: DictKey =
                (
                    {
                        bad_node: "channel_error_bad_node",
                        not_public: "channel_error_not_public",
                        bad_host: "channel_error_bad_host",
                        our_node: "channel_error_our_node",
                        node_limit: "channel_error_node_limit",
                    } as Record<string, DictKey>
                )[code] ?? "channel_error_unavailable";
            setMessage(t(key));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div class="cd-edit" data-testid="cd-edit">
            <h3>{t("cd_edit_title")}</h3>
            <Show
                when={secret()}
                fallback={<p class="channel-help">{t("cd_edit_no_secret")}</p>}>
                <input
                    class="channel-node"
                    data-testid="cd-edit-node"
                    classList={{ invalid: !valid() }}
                    aria-invalid={!valid()}
                    aria-label={t("cd_your_node")}
                    autocomplete="off"
                    spellcheck={false}
                    value={node()}
                    onInput={(e) => setNode(e.currentTarget.value)}
                />
                <button
                    type="button"
                    class="btn btn-small"
                    data-testid="cd-edit-save"
                    disabled={!valid() || busy()}
                    onClick={() => void save()}>
                    {t("cd_edit_save")}
                </button>
                <Show when={message()}>
                    <p role="status" data-testid="cd-edit-message">
                        {message()}
                    </p>
                </Show>
            </Show>
        </div>
    );
};

const ChannelDonation = () => {
    const params = useParams();
    const id = () => params.id ?? "";
    const { t, denomination, separator } = useGlobalContext();
    const [order, setOrder] = createSignal<ChannelOrder | undefined>();
    const [missing, setMissing] = createSignal(false);
    const [aboutOpen, setAboutOpen] = createSignal(false);
    let etag: string | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const unit = () => formatDenomination(denomination(), BTC);
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);

    const load = async () => {
        if (!orderIdPattern.test(id())) {
            setMissing(true);
            return;
        }
        try {
            const res = await getChannelDonation(id(), etag);
            if (!res.unchanged && res.order !== undefined) {
                setOrder(res.order);
                etag = res.etag;
            }
        } catch (e) {
            if (e instanceof ChannelApiError && e.status === 404) {
                setMissing(true);
                return;
            }
            // Down for a moment: the next poll tries again
        }
    };

    const schedule = () => {
        const current = order();
        if (stopped || missing() || (current && isSettled(current.state))) {
            return;
        }
        timer = setTimeout(
            async () => {
                await load();
                schedule();
            },
            document.visibilityState === "hidden"
                ? hiddenPollMs
                : visiblePollMs,
        );
    };

    const onVisible = () => {
        if (document.visibilityState === "visible" && timer !== undefined) {
            clearTimeout(timer);
            void load().then(schedule);
        }
    };

    onMount(async () => {
        // A secret in the kept link (#...) is stored here and taken out of
        // the address bar; it never goes to a server
        const fromLink = window.location.hash.slice(1);
        if (
            orderIdPattern.test(id()) &&
            /^[A-Za-z0-9_-]{40,60}$/.test(fromLink)
        ) {
            storeDonation({
                id: id(),
                secret: fromLink,
                createdAt: Date.now(),
            });
            history.replaceState(null, "", window.location.pathname);
        }
        document.addEventListener("visibilitychange", onVisible);
        await load();
        schedule();
    });
    onCleanup(() => {
        stopped = true;
        if (timer !== undefined) {
            clearTimeout(timer);
        }
        document.removeEventListener("visibilitychange", onVisible);
    });

    const still = () => {
        const o = order()!;
        return Math.max(0, o.minSat - o.receivedSat);
    };
    const paying = () =>
        order()?.state === "awaiting_payment" ||
        order()?.state === "payment_seen";

    return (
        <div class="frame cd-page" data-testid="cd-page">
            <h2>{t("cd_title")}</h2>
            <Show when={missing()}>
                <p data-testid="cd-missing">{t("cd_not_found")}</p>
            </Show>
            <Show when={order()}>
                <p class="cd-keep" data-testid="cd-keep">
                    {t("cd_keep_link")}{" "}
                    <CopyButton
                        label="cd_copy_link"
                        btnClass="btn btn-small"
                        removeSpaces={false}
                        data={donationLink(
                            order()!.id,
                            donationSecret(order()!.id),
                        )}
                    />
                </p>
                <p class="cd-node" data-testid="cd-node">
                    {t("cd_your_node")}:{" "}
                    <Show when={order()!.node.alias}>
                        <strong>{order()!.node.alias}</strong>{" "}
                    </Show>
                    <code>
                        {order()!.node.pubkey.slice(0, 16)}…
                        {order()!.node.address
                            ? ` @${order()!.node.address}`
                            : ""}
                    </code>
                </p>

                <ol class="cd-steps" data-testid="cd-steps">
                    <For each={steps}>
                        {(step, i) => (
                            <li
                                classList={{
                                    done: i() < position(order()!),
                                    current: i() === position(order()!),
                                }}
                                aria-current={
                                    i() === position(order()!)
                                        ? "step"
                                        : undefined
                                }>
                                {t(`cd_step_${step}` as DictKey)}
                            </li>
                        )}
                    </For>
                </ol>

                <Show when={sideStates[order()!.state]}>
                    <div
                        class="cd-side"
                        classList={{
                            "cd-side-attention":
                                order()!.state === "needs_attention",
                        }}
                        role="status"
                        data-testid="cd-side">
                        <p>
                            {t(sideStates[order()!.state]!, {
                                time: order()!.nextAttempt
                                    ? new Date(
                                          order()!.nextAttempt!,
                                      ).toLocaleTimeString()
                                    : "",
                            })}
                        </p>
                        <Show
                            when={
                                order()!.errorCode &&
                                errorText[order()!.errorCode!]
                            }>
                            <p data-testid="cd-error">
                                {t(errorText[order()!.errorCode!])}
                            </p>
                        </Show>
                    </div>
                </Show>

                <Show when={paying()}>
                    <div class="cd-pay" data-testid="cd-pay">
                        <p>
                            {t("cd_send", { min: show(still()), unit: unit() })}
                        </p>
                        <div class="donate-qr">
                            <QrCode
                                data={donationBip21(order()!.address, still())}
                                asset={BTC}
                            />
                        </div>
                        <p class="donate-address" data-testid="cd-address">
                            <strong>{splitAddress(order()!.address)[0]}</strong>
                            <span>{splitAddress(order()!.address)[1]}</span>
                            <strong>{splitAddress(order()!.address)[2]}</strong>
                        </p>
                        <div class="btns donate-actions">
                            <CopyButton
                                label="copy_address"
                                data={order()!.address}
                            />
                            <CopyButton
                                label="copy_bip21"
                                data={donationBip21(order()!.address, still())}
                            />
                        </div>
                        <p class="cd-max">
                            {t("cd_max", {
                                max: show(order()!.maxSat),
                                unit: unit(),
                            })}
                        </p>
                        <p>
                            {t("cd_expires", {
                                time: new Date(
                                    order()!.expiresAt,
                                ).toLocaleString(),
                            })}
                        </p>
                    </div>
                </Show>

                <Show when={order()!.receivedSat > 0}>
                    <p data-testid="cd-received">
                        {t("cd_received", {
                            amount: show(order()!.receivedSat),
                            confirmed: show(order()!.confirmedSat),
                            n: order()!.confirmationsNeeded,
                            unit: unit(),
                        })}
                    </p>
                </Show>
                <Show when={order()!.capacitySat > 0}>
                    <p data-testid="cd-capacity">
                        {t("cd_channel", {
                            amount: show(order()!.capacitySat),
                            unit: unit(),
                        })}
                    </p>
                </Show>
                <Show when={order()!.state === "funding_broadcast"}>
                    <p data-testid="cd-confs">
                        {t("cd_funding_confs", {
                            n: order()!.fundingConfirmations,
                        })}
                    </p>
                </Show>
                <Show
                    when={
                        order()!.remainderSat > 0 &&
                        (order()!.state === "open" ||
                            order()!.state === "funding_broadcast")
                    }>
                    <p data-testid="cd-remainder">
                        {t("cd_remainder", {
                            amount: show(order()!.remainderSat),
                            unit: unit(),
                        })}
                    </p>
                </Show>

                <Show when={order()!.editable}>
                    <EditNode order={order()!} onSaved={() => void load()} />
                </Show>

                <Accordion
                    title={t("cd_about")}
                    isOpen={aboutOpen()}
                    onClick={() => setAboutOpen(!aboutOpen())}>
                    <ChannelTerms />
                </Accordion>
            </Show>
        </div>
    );
};

export default ChannelDonation;
