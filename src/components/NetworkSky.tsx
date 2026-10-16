import { BigNumber } from "bignumber.js";
import {
    For,
    Show,
    createMemo,
    createSignal,
    onCleanup,
    onMount,
} from "solid-js";

import { BTC } from "../consts/Assets";
import { useGlobalContext } from "../context/Global";
import {
    type GraphMeta,
    type NodeInfo,
    type Tile,
    loadMeta,
    loadNode,
    loadTile,
    searchNodes,
} from "../network/data";
import type { Sky } from "../network/sky";
import { prefersReducedMotion, webglAvailable } from "../network/support";
import "../style/network.scss";
import { formatAmount, formatDenomination } from "../utils/denomination";
import { openDonate } from "../utils/donate";
import NodeUris from "./NodeUris";

// The network sky: the background of the home page ("background"), or
// the explorer of /network ("full") with search, the info panel and a
// list of every node
const NetworkSky = (props: {
    mode: "background" | "full";
    // Told the graph's numbers once they are loaded
    onMeta?: (meta: GraphMeta) => void;
}) => {
    const { t, denomination, separator } = useGlobalContext();
    let canvas!: HTMLCanvasElement;
    let labelLayer!: HTMLDivElement;
    const [meta, setMeta] = createSignal<GraphMeta | undefined>();
    const [tile, setTile] = createSignal<Tile | undefined>();
    const [failed, setFailed] = createSignal(false);
    const [selected, setSelected] = createSignal<string | undefined>();
    const [info, setInfo] = createSignal<NodeInfo | undefined>();
    const [query, setQuery] = createSignal("");
    const [results, setResults] = createSignal<
        { alias: string; pubkey: string; capacity: number }[]
    >([]);
    let sky: Sky | undefined;
    let labelFrame = 0;
    let disposed = false;

    const unit = () => formatDenomination(denomination(), BTC);
    const show = (sat: number) =>
        formatAmount(BigNumber(sat), denomination(), separator(), BTC);

    const aliasOf = (pubkey: string) => {
        const tl = tile();
        const i = tl?.nodes.ids.indexOf(pubkey) ?? -1;
        return i >= 0 && tl
            ? tl.nodes.alias[i] || pubkey.slice(0, 12)
            : pubkey.slice(0, 12);
    };

    const choose = async (pubkey: string) => {
        setSelected(pubkey);
        setResults([]);
        const m = meta();
        if (m === undefined) {
            return;
        }
        let record: NodeInfo | undefined;
        try {
            record = await loadNode(m, pubkey);
        } catch {
            record = undefined;
        }
        if (selected() === pubkey) {
            setInfo(record);
            sky?.select(pubkey, record);
        }
    };

    const drawLabels = () => {
        if (disposed) {
            return;
        }
        labelFrame = requestAnimationFrame(drawLabels);
        if (!sky) {
            return;
        }
        const wanted = sky.labels();
        // Reuse spans; text only through textContent
        while (labelLayer.children.length < wanted.length) {
            const span = document.createElement("span");
            span.className = "sky-label";
            labelLayer.appendChild(span);
        }
        Array.from(labelLayer.children).forEach((child, i) => {
            const el = child as HTMLSpanElement;
            const label = wanted[i];
            if (label === undefined) {
                el.style.display = "none";
                return;
            }
            el.style.display = "";
            el.dataset.key = label[0];
            if (el.textContent !== label[1]) {
                el.textContent = label[1];
            }
            el.classList.toggle("selected", label[0] === selected());
            el.style.transform = `translate(${Math.round(label[2])}px, ${Math.round(label[3])}px)`;
        });
    };

    // The info panel covers the bottom of the sky on phones (the CSS's
    // max-height there)
    const phoneLayout = () =>
        props.mode === "full" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia("(max-width: 600px)").matches;
    const fitInset = () =>
        sky?.setInset(phoneLayout() ? canvas.clientHeight * 0.45 : 0);

    // A lost context is not given back when the browser took it for being
    // over its limit: the sky is made again on a new canvas, a few times
    let rebuilds: number[] = [];
    const rebuild = async () => {
        const m = meta();
        const tl = tile();
        if (disposed || m === undefined || tl === undefined) {
            return;
        }
        if (document.visibilityState === "hidden") {
            document.addEventListener(
                "visibilitychange",
                () => void rebuild(),
                { once: true },
            );
            return;
        }
        const now = Date.now();
        rebuilds = rebuilds.filter((at) => now - at < 60_000);
        sky?.dispose();
        sky = undefined;
        if (rebuilds.length >= 3) {
            setFailed(true);
            return;
        }
        rebuilds.push(now);
        const fresh = canvas.cloneNode(false) as HTMLCanvasElement;
        canvas.replaceWith(fresh);
        canvas = fresh;
        let made: Sky | undefined;
        try {
            made = await build(m, tl);
        } catch {
            setFailed(true);
            return;
        }
        const key = selected();
        if (key !== undefined) {
            made?.select(key, info());
        }
    };

    const build = async (m: GraphMeta, tl: Tile): Promise<Sky | undefined> => {
        const { createSky } = await import("../network/sky");
        if (disposed) {
            return undefined;
        }
        const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
        sky = createSky(canvas, m, tl, {
            reducedMotion: prefersReducedMotion(),
            interaction:
                props.mode === "full" ? "full" : phone ? "none" : "orbit",
            onSelect: (key) => void choose(key),
            onLost: () => setTimeout(() => void rebuild(), 250),
        });
        fitInset();
        return sky;
    };

    // A name is easier to tap than its star
    const onLabelClick = (e: MouseEvent) => {
        const key = (e.target as HTMLElement | null)?.closest<HTMLElement>(
            ".sky-label",
        )?.dataset.key;
        if (props.mode === "full" && key !== undefined) {
            void choose(key);
        }
    };

    onMount(async () => {
        let m: GraphMeta;
        let tl: Tile;
        try {
            m = await loadMeta();
            tl = await loadTile(m, m.overview);
        } catch {
            setFailed(true);
            return;
        }
        setMeta(m);
        setTile(tl);
        props.onMeta?.(m);
        if (!webglAvailable()) {
            setFailed(true);
            return;
        }
        try {
            await build(m, tl);
        } catch {
            setFailed(true);
            return;
        }
        if (disposed) {
            return;
        }
        window.addEventListener("resize", onResize);
        drawLabels();
        void choose(m.ours.pubkey);
    });
    const onResize = () => {
        sky?.resize();
        fitInset();
    };
    // The keyboard (on /network): Esc our node, / the search, arrows the
    // selected node's neighbours, one after another
    // The neighbours being cycled, of the node where the cycling began
    let cycle: { from: string; list: string[]; at: number } | undefined;
    const onKey = (e: KeyboardEvent) => {
        if (props.mode !== "full" || !sky || !meta()) {
            return;
        }
        const typing = (e.target as HTMLElement | null)?.tagName === "INPUT";
        if (e.key === "Escape") {
            cycle = undefined;
            void choose(meta()!.ours.pubkey);
        } else if (e.key === "/" && !typing) {
            e.preventDefault();
            document
                .querySelector<HTMLInputElement>("[data-testid=sky-search]")
                ?.focus();
        } else if (
            (e.key === "ArrowRight" || e.key === "ArrowLeft") &&
            !typing
        ) {
            const now = selected();
            if (
                cycle === undefined ||
                (now !== cycle.from && !cycle.list.includes(now ?? ""))
            ) {
                cycle = { from: now ?? "", list: sky.neighbours(), at: -1 };
            }
            if (cycle.list.length === 0) {
                return;
            }
            e.preventDefault();
            const n = cycle.list.length;
            cycle.at = (cycle.at + (e.key === "ArrowRight" ? 1 : n - 1)) % n;
            void choose(cycle.list[cycle.at]);
        }
    };
    document.addEventListener("keydown", onKey);
    onCleanup(() => {
        disposed = true;
        cancelAnimationFrame(labelFrame);
        window.removeEventListener("resize", onResize);
        document.removeEventListener("keydown", onKey);
        sky?.dispose();
    });

    let searchTimer: ReturnType<typeof setTimeout> | undefined;
    const onSearch = (value: string) => {
        setQuery(value);
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
            const m = meta();
            setResults(m ? await searchNodes(m, value) : []);
        }, 200);
    };

    const ours = () => selected() === meta()?.ours.pubkey;
    const share = createMemo(() => {
        const m = meta();
        const i = info();
        // The part of all channel capacity in its channels
        return m && i && m.capacity > 0 ? (100 * i.capacity) / m.capacity : 0;
    });

    // Every node, for the list view (and without WebGL)
    const listed = createMemo(() => {
        const tl = tile();
        if (!tl) {
            return [];
        }
        return tl.nodes.ids
            .map((id, i) => ({
                id,
                alias: tl.nodes.alias[i],
                cap: tl.nodes.cap[i],
                deg: tl.nodes.deg[i],
            }))
            .sort((a, b) => b.cap - a.cap);
    });

    return (
        <div
            class="network-sky"
            classList={{
                full: props.mode === "full",
                background: props.mode === "background",
            }}
            data-testid="network-sky">
            <canvas
                ref={canvas}
                class="sky-canvas"
                role="img"
                aria-label={t("network_description")}
                data-testid="sky-canvas"
            />
            <div
                ref={labelLayer}
                class="sky-labels"
                aria-hidden="true"
                onClick={onLabelClick}
            />

            <Show when={!meta() && !failed()}>
                <p class="sky-status" role="status">
                    {t("network_loading")}
                </p>
            </Show>

            <Show when={props.mode === "full" && meta()}>
                <div class="sky-controls glass" data-testid="sky-controls">
                    <input
                        class="sky-search"
                        data-testid="sky-search"
                        type="search"
                        aria-label={t("network_search")}
                        placeholder={t("network_search")}
                        value={query()}
                        onInput={(e) => onSearch(e.currentTarget.value)}
                    />
                    <Show when={results().length > 0}>
                        <ul class="sky-results" data-testid="sky-results">
                            <For each={results()}>
                                {(r) => (
                                    <li>
                                        <button
                                            type="button"
                                            onClick={() =>
                                                void choose(r.pubkey)
                                            }>
                                            {r.alias || r.pubkey.slice(0, 16)}
                                        </button>
                                    </li>
                                )}
                            </For>
                        </ul>
                    </Show>
                    <div class="sky-buttons">
                        <button
                            type="button"
                            data-testid="sky-home"
                            onClick={() => void choose(meta()!.ours.pubkey)}>
                            {t("network_home")}
                        </button>
                        <button
                            type="button"
                            aria-label={t("network_zoom_in")}
                            onClick={() => sky?.zoom(0.75)}>
                            +
                        </button>
                        <button
                            type="button"
                            aria-label={t("network_zoom_out")}
                            onClick={() => sky?.zoom(1.33)}>
                            −
                        </button>
                    </div>
                    <p class="sky-stats" data-testid="sky-stats">
                        {t("network_stats", {
                            nodes: meta()!.nodes,
                            channels: meta()!.channels,
                            capacity: show(meta()!.capacity),
                            unit: unit(),
                        })}
                    </p>
                </div>
            </Show>

            <Show when={props.mode === "full" && selected() && info()}>
                <aside
                    class="sky-panel glass"
                    data-testid="sky-panel"
                    aria-live="polite">
                    <h2>
                        <span
                            class="sky-swatch"
                            style={{ background: info()!.color }}
                        />
                        {info()!.alias || selected()!.slice(0, 16)}
                    </h2>
                    <Show when={ours()}>
                        <p class="sky-badge">{t("network_ours")}</p>
                    </Show>
                    <p class="sky-key">
                        <code>{selected()}</code>
                    </p>
                    <dl>
                        <dt>{t("network_capacity")}</dt>
                        <dd>
                            {show(info()!.capacity)} {unit()}
                        </dd>
                        <dt>{t("network_channels")}</dt>
                        <dd>{info()!.channels.length}</dd>
                        <dt>{t("network_share")}</dt>
                        <dd>{share().toFixed(1)} %</dd>
                    </dl>
                    <NodeUris
                        pubkey={selected()!}
                        addresses={info()!.addresses}
                    />
                    <Show when={ours()}>
                        <div class="btns">
                            <button
                                type="button"
                                class="btn"
                                onClick={() => openDonate("channel")}>
                                {t("network_open_channel")}
                            </button>
                            <button
                                type="button"
                                class="btn btn-light"
                                onClick={() => openDonate("onchain")}>
                                {t("network_donate")}
                            </button>
                        </div>
                    </Show>
                    <ul class="sky-channels" data-testid="sky-channels">
                        <For
                            each={[...info()!.channels]
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 50)}>
                            {([peer, cap]) => (
                                <li>
                                    <button
                                        type="button"
                                        onClick={() => void choose(peer)}>
                                        {aliasOf(peer)}
                                    </button>{" "}
                                    <span>
                                        {show(cap)} {unit()}
                                    </span>
                                </li>
                            )}
                        </For>
                    </ul>
                </aside>
            </Show>

            {/* The list: always on /network (the facts of the view, and its
                fallback); on the home page the sky is only a backdrop */}
            <Show when={props.mode === "full"}>
                <details
                    class="sky-list glass"
                    open={failed()}
                    data-testid="sky-list">
                    <summary>
                        {failed()
                            ? t("network_unavailable")
                            : t("network_list")}
                    </summary>
                    <table>
                        <thead>
                            <tr>
                                <th>{t("network_list_alias")}</th>
                                <th>{t("network_capacity")}</th>
                                <th>{t("network_channels")}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={listed()}>
                                {(n) => (
                                    <tr
                                        classList={{
                                            ours: n.id === meta()?.ours.pubkey,
                                        }}>
                                        <td>{n.alias || n.id.slice(0, 16)}</td>
                                        <td>
                                            {show(n.cap)} {unit()}
                                        </td>
                                        <td>{n.deg}</td>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </details>
            </Show>
        </div>
    );
};

export default NetworkSky;
