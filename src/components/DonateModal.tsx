import { BigNumber } from "bignumber.js";
import { IoClose } from "solid-icons/io";
import {
    For,
    Show,
    createMemo,
    createResource,
    createSignal,
    onCleanup,
    onMount,
} from "solid-js";

import { config } from "../config";
import { BTC } from "../consts/Assets";
import { Denomination } from "../consts/Enums";
import { useGlobalContext } from "../context/Global";
import "../style/donate.scss";
import {
    getAddressMempoolTxids,
    getAddressStats,
    hasBlockExplorer,
} from "../utils/blockchain";
import {
    convertAmount,
    formatAmount,
    formatDenomination,
} from "../utils/denomination";
import {
    type DonateTab,
    closeDonate,
    donateTab,
    donationAddress,
    donationBip21,
    donationPresets,
    nodeUri,
    openChannelCommand,
    openDonate,
    splitAddress,
} from "../utils/donate";
import { isMobile } from "../utils/helper";
import {
    type ReplayVerdict,
    getReplayVerdict,
    isFinalVerdict,
} from "../utils/replay";
import Accordion from "./Accordion";
import CopyButton from "./CopyButton";
import ExternalLink from "./ExternalLink";
import QrCode from "./QrCode";

export const donationPollMs = 15_000;
// How long a donation's replay verdict is asked for after it is seen
const replayPollLimitMs = 10 * 60_000;

// The most a donation amount may be: 21 million coins, in sat
const maxSat = 21_000_000 * 100_000_000;

const tabs = (): DonateTab[] => [
    ...(donationAddress() ? (["onchain"] as DonateTab[]) : []),
    ...(config.ourNode ? (["channel"] as DonateTab[]) : []),
];

export const donationAvailable = () => tabs().length > 0;

const focusable = (root: HTMLElement) =>
    Array.from(
        root.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);

const DonateOnChain = (props: { address: string }) => {
    const { t, denomination, separator } = useGlobalContext();
    const [amountSat, setAmountSat] = createSignal(0);
    const [custom, setCustom] = createSignal("");
    const [customInvalid, setCustomInvalid] = createSignal(false);
    const [howOpen, setHowOpen] = createSignal(false);
    const [received, setReceived] = createSignal<string | undefined>();
    const [verdict, setVerdict] = createSignal<ReplayVerdict | undefined>();

    const bip21 = createMemo(() => donationBip21(props.address, amountSat()));
    const unit = () => formatDenomination(denomination(), BTC);
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);
    const parts = createMemo(() => splitAddress(props.address));

    const chooseCustom = (value: string) => {
        setCustom(value);
        const trimmed = value.trim().replace(",", ".");
        if (trimmed === "") {
            setCustomInvalid(false);
            setAmountSat(0);
            return;
        }
        const parsed = BigNumber(trimmed);
        const sat = parsed.isFinite()
            ? convertAmount(BTC, parsed, denomination())
            : BigNumber(NaN);
        if (
            !sat.isFinite() ||
            sat.lte(0) ||
            !sat.isInteger() ||
            sat.gt(maxSat)
        ) {
            setCustomInvalid(true);
            setAmountSat(0);
            return;
        }
        setCustomInvalid(false);
        setAmountSat(sat.toNumber());
    };

    const [stats] = createResource(async () => {
        if (!hasBlockExplorer(BTC)) {
            return undefined;
        }
        try {
            return await getAddressStats(BTC, props.address);
        } catch {
            return undefined;
        }
    });

    // The thank-you: a transaction to the address that was not in the
    // mempool when the window opened. Nothing is stored
    let known: Set<string> | undefined;
    let seenAt = 0;
    const poll = async () => {
        if (!hasBlockExplorer(BTC)) {
            return;
        }
        try {
            const txids = await getAddressMempoolTxids(BTC, props.address);
            if (known === undefined) {
                known = new Set(txids);
                return;
            }
            const fresh = txids.find((txid) => !known!.has(txid));
            if (fresh !== undefined && received() === undefined) {
                setReceived(fresh);
                seenAt = Date.now();
            }
        } catch {
            // The explorer may be down: no thank-you, nothing else changes
        }
        const txid = received();
        const current = verdict();
        if (
            txid !== undefined &&
            (current === undefined || !isFinalVerdict(current.verdict)) &&
            Date.now() - seenAt < replayPollLimitMs
        ) {
            const found = await getReplayVerdict(txid);
            if (found !== undefined) {
                setVerdict(found);
            }
        }
    };
    onMount(() => void poll());
    const timer = setInterval(() => void poll(), donationPollMs);
    onCleanup(() => clearInterval(timer));

    return (
        <div class="donate-onchain" data-testid="donate-onchain">
            <p class="donate-intro">{t("donate_intro")}</p>

            <div
                class="donate-amounts"
                role="radiogroup"
                aria-label={t("donate_amount")}>
                <button
                    type="button"
                    role="radio"
                    aria-checked={amountSat() === 0 && custom() === ""}
                    class="donate-chip"
                    onClick={() => {
                        setCustom("");
                        setCustomInvalid(false);
                        setAmountSat(0);
                    }}>
                    {t("donate_any_amount")}
                </button>
                <For each={donationPresets}>
                    {(sat) => (
                        <button
                            type="button"
                            role="radio"
                            aria-checked={
                                amountSat() === sat && custom() === ""
                            }
                            class="donate-chip"
                            data-testid={`donate-preset-${sat}`}
                            onClick={() => {
                                setCustom("");
                                setCustomInvalid(false);
                                setAmountSat(sat);
                            }}>
                            {show(sat)} {unit()}
                        </button>
                    )}
                </For>
                <input
                    class="donate-custom"
                    classList={{ invalid: customInvalid() }}
                    data-testid="donate-custom"
                    inputmode={
                        denomination() === Denomination.Btc
                            ? "decimal"
                            : "numeric"
                    }
                    autocomplete="off"
                    aria-label={t("donate_custom_placeholder", {
                        denomination: unit(),
                    })}
                    aria-invalid={customInvalid()}
                    placeholder={t("donate_custom_placeholder", {
                        denomination: unit(),
                    })}
                    value={custom()}
                    onInput={(e) => chooseCustom(e.currentTarget.value)}
                />
            </div>

            <div class="donate-qr">
                <a href={bip21()} aria-label={t("donate_open_wallet")}>
                    <QrCode data={bip21()} asset={BTC} />
                </a>
            </div>

            <p class="donate-address" data-testid="donate-address">
                <strong>{parts()[0]}</strong>
                <span>{parts()[1]}</span>
                <strong>{parts()[2]}</strong>
            </p>
            <p class="donate-address-hint">{t("donate_address_hint")}</p>

            <div class="btns donate-actions">
                <CopyButton label="copy_address" data={props.address} />
                <Show when={amountSat() > 0}>
                    <CopyButton
                        label="copy_amount"
                        data={() =>
                            formatAmount(
                                BigNumber(amountSat()),
                                denomination(),
                                ".",
                                BTC,
                            )
                        }
                    />
                </Show>
                <CopyButton label="copy_bip21" data={bip21} />
            </div>
            <Show when={isMobile()}>
                <a class="btn btn-light donate-open-wallet" href={bip21()}>
                    {t("donate_open_wallet")}
                </a>
            </Show>

            <Show when={received()}>
                <div
                    class="donate-thanks"
                    role="status"
                    data-testid="donate-thanks">
                    <span class="donate-thanks-bolt" aria-hidden="true">
                        ⚡
                    </span>
                    <div>
                        <strong>{t("donate_thanks")}</strong>
                        <p>{t("donate_thanks_detail")}</p>
                    </div>
                </div>
            </Show>
            <Show
                when={
                    verdict()?.verdict === "at_risk" ||
                    verdict()?.verdict === "replayed"
                }>
                <div
                    class="donate-replay"
                    role="alert"
                    data-testid="donate-replay">
                    <Show
                        when={verdict()?.verdict === "at_risk"}
                        fallback={<p>{t("donate_replay_replayed")}</p>}>
                        <p>{t("donate_replay_at_risk")}</p>
                        <ul>
                            <For each={verdict()?.atRiskAddresses ?? []}>
                                {(address) => <li>{address}</li>}
                            </For>
                        </ul>
                    </Show>
                    <p>
                        {t("donate_replay_contact")}{" "}
                        <ExternalLink href={config.contactUrl}>
                            {t("contact")}
                        </ExternalLink>
                    </p>
                </div>
            </Show>

            <Accordion
                title={t("donate_how_title")}
                isOpen={howOpen()}
                onClick={() => setHowOpen(!howOpen())}>
                <ul class="donate-how">
                    <li>{t("donate_how_reverse")}</li>
                    <li>{t("donate_how_submarine")}</li>
                    <li>{t("donate_how_balance")}</li>
                </ul>
                <p>{t("donate_how_promise")}</p>
            </Accordion>

            <Show when={stats()}>
                <p class="donate-stats" data-testid="donate-stats">
                    {t(
                        stats()!.txCount === 1
                            ? "donate_received_so_far_one"
                            : "donate_received_so_far",
                        {
                            amount: show(stats()!.receivedSat),
                            denomination: unit(),
                            count: String(stats()!.txCount),
                        },
                    )}
                </p>
            </Show>
            <Show when={config.assets?.[BTC]?.blockExplorerUrl}>
                <p class="donate-explorer">
                    <ExternalLink
                        href={`${config.assets![BTC].blockExplorerUrl!.normal}/address/${props.address}`}>
                        {t("donate_view_explorer")}
                    </ExternalLink>
                </p>
            </Show>

            <p class="donate-small-print">{t("donate_small_print")}</p>
            <p class="donate-small-print">{t("donate_replay_hint")}</p>
        </div>
    );
};

const OpenChannel = (props: { pubkey: string; uris: string[] }) => {
    const { t, separator } = useGlobalContext();
    const min = () =>
        formatAmount(
            BigNumber(config.channelMinSat),
            Denomination.Sat,
            separator(),
            BTC,
        );

    return (
        <div class="donate-channel" data-testid="donate-channel">
            <p class="donate-intro">{t("channel_intro")}</p>
            <p>{t("channel_min", { amount: min() })}</p>
            <For each={props.uris}>
                {(uri) => (
                    <div class="donate-uri">
                        <code>{nodeUri(props.pubkey, uri)}</code>
                        <CopyButton
                            label="copy_node"
                            btnClass="btn btn-small"
                            data={nodeUri(props.pubkey, uri)}
                        />
                    </div>
                )}
            </For>
            <p class="donate-command-title">{t("channel_command")}</p>
            <div class="donate-uri">
                <code>
                    {openChannelCommand(
                        props.pubkey,
                        props.uris[0],
                        config.channelMinSat,
                    )}
                </code>
                <CopyButton
                    label="copy_command"
                    btnClass="btn btn-small"
                    removeSpaces={false}
                    data={openChannelCommand(
                        props.pubkey,
                        props.uris[0],
                        config.channelMinSat,
                    )}
                />
            </div>
        </div>
    );
};

const DonateWindow = () => {
    const { t } = useGlobalContext();
    let panel!: HTMLDivElement;
    const opener = document.activeElement as HTMLElement | null;

    const tab = () => {
        const wanted = donateTab();
        return wanted !== undefined && tabs().includes(wanted)
            ? wanted
            : tabs()[0];
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "Escape") {
            event.preventDefault();
            closeDonate();
            return;
        }
        if (event.key === "Tab") {
            const items = focusable(panel);
            if (items.length === 0) {
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        }
    };
    const onTabKeys = (event: KeyboardEvent) => {
        if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") {
            return;
        }
        const all = tabs();
        const step = event.key === "ArrowRight" ? 1 : all.length - 1;
        const next = all[(all.indexOf(tab()) + step) % all.length];
        openDonate(next);
        document.getElementById(`donate-tab-${next}`)?.focus();
    };

    onMount(() => {
        document.addEventListener("keydown", onKeyDown);
        document.body.classList.add("donate-open");
        document.getElementById(`donate-tab-${tab()}`)?.focus();
    });
    onCleanup(() => {
        document.removeEventListener("keydown", onKeyDown);
        document.body.classList.remove("donate-open");
        opener?.focus?.();
    });

    return (
        <div
            id="donate-modal"
            data-testid="donate-modal"
            onClick={() => closeDonate()}>
            <div
                ref={panel}
                class="frame donate-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby="donate-title"
                onClick={(e) => e.stopPropagation()}>
                <div class="donate-header">
                    <h2 id="donate-title">{t("donate_title")}</h2>
                    <button
                        type="button"
                        class="donate-close"
                        aria-label={t("close")}
                        data-testid="donate-close"
                        onClick={() => closeDonate()}>
                        <IoClose />
                    </button>
                </div>
                <Show when={tabs().length > 1}>
                    <div
                        class="donate-tabs"
                        role="tablist"
                        onKeyDown={onTabKeys}>
                        <For each={tabs()}>
                            {(name) => (
                                <button
                                    type="button"
                                    role="tab"
                                    id={`donate-tab-${name}`}
                                    data-testid={`donate-tab-${name}`}
                                    aria-selected={tab() === name}
                                    aria-controls="donate-tabpanel"
                                    tabIndex={tab() === name ? 0 : -1}
                                    class="donate-tab"
                                    classList={{ active: tab() === name }}
                                    onClick={() => openDonate(name)}>
                                    {t(
                                        name === "onchain"
                                            ? "donate_tab_onchain"
                                            : "donate_tab_channel",
                                    )}
                                </button>
                            )}
                        </For>
                    </div>
                </Show>
                <div
                    id="donate-tabpanel"
                    class="donate-scroll"
                    role="tabpanel"
                    // Reachable by keyboard, so it can be scrolled without a
                    // mouse (the tabs pattern's tabpanel)
                    tabIndex={0}
                    aria-labelledby={`donate-tab-${tab()}`}>
                    <Show when={tab() === "onchain" && donationAddress()}>
                        <DonateOnChain address={donationAddress()!} />
                    </Show>
                    <Show when={tab() === "channel" && config.ourNode}>
                        <OpenChannel
                            pubkey={config.ourNode!.pubkey}
                            uris={config.ourNode!.uris}
                        />
                    </Show>
                </div>
            </div>
        </div>
    );
};

const DonateModal = () => (
    <Show when={donateTab() !== undefined && donationAvailable()}>
        <DonateWindow />
    </Show>
);

export default DonateModal;
