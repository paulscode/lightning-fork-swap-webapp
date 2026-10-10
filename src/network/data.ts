// The network sky's data: the files the graph generator writes (served at
// /graph/), shape-checked before anything is drawn from them.

export type GraphMeta = {
    version: number;
    generatedAt: string;
    checkedAt: string;
    nodes: number;
    channels: number;
    capacity: number;
    communities: number;
    bounds: [[number, number, number], [number, number, number]];
    ours: { pubkey: string; uris: string[] };
    path: string;
    overview: string;
    cells: {
        id: string;
        level: number;
        lo: number[];
        hi: number[];
        nodes: number;
        file: string;
    }[];
    nodeShards: string;
    search: string;
};

// One file's nodes and channels, columnar (as written)
export type Tile = {
    nodes: {
        ids: string[];
        alias: string[];
        pos: number[];
        cap: number[];
        deg: number[];
        comm: number[];
        color: string[];
    };
    refs: { ids: string[]; pos: number[] };
    edges: { a: number[]; b: number[]; cap: number[]; seed: number[] };
    aggregates?: {
        pos: number[];
        cap: number[];
        count: number[];
        comm: number[];
    };
};

export type NodeInfo = {
    alias: string;
    color: string;
    addresses: string[];
    capacity: number;
    degree: number;
    lastUpdate: number;
    comm: number;
    pos: [number, number, number];
    channels: [string, number][];
};

const pubkeyPattern = /^0[23][0-9a-f]{64}$/;
const isNumberArray = (v: unknown, length?: number): v is number[] =>
    Array.isArray(v) &&
    (length === undefined || v.length === length) &&
    v.every((x) => typeof x === "number" && Number.isFinite(x));
const isStringArray = (v: unknown, length?: number): v is string[] =>
    Array.isArray(v) &&
    (length === undefined || v.length === length) &&
    v.every((x) => typeof x === "string");

// Where the files are (the same origin as the app)
export const graphBase = "/graph/";

const fetchJson = async (path: string): Promise<unknown> => {
    const res = await fetch(`${graphBase}${path}`, {
        signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
        throw new Error(`graph: ${path}: HTTP ${res.status}`);
    }
    return res.json();
};

const safePath = (p: unknown): p is string =>
    typeof p === "string" &&
    /^[A-Za-z0-9_/.{}-]{1,100}$/.test(p) &&
    !p.includes("..");

export const parseMeta = (v: unknown): GraphMeta | undefined => {
    if (typeof v !== "object" || v === null) {
        return undefined;
    }
    const m = v as Record<string, unknown>;
    const ours = m.ours as Record<string, unknown> | undefined;
    if (
        typeof m.version !== "number" ||
        !safePath(m.path) ||
        !safePath(m.overview) ||
        !safePath(m.nodeShards) ||
        !safePath(m.search) ||
        typeof m.nodes !== "number" ||
        typeof m.channels !== "number" ||
        typeof ours !== "object" ||
        ours === null ||
        typeof ours.pubkey !== "string" ||
        !isStringArray(ours.uris) ||
        !Array.isArray(m.cells) ||
        !(m.cells as unknown[]).every(
            (c) =>
                typeof c === "object" &&
                c !== null &&
                safePath((c as Record<string, unknown>).file),
        )
    ) {
        return undefined;
    }
    return m as unknown as GraphMeta;
};

export const parseTile = (v: unknown): Tile | undefined => {
    if (typeof v !== "object" || v === null) {
        return undefined;
    }
    const t = v as Record<string, Record<string, unknown>>;
    const n = t.nodes;
    const r = t.refs;
    const e = t.edges;
    if (!n || !r || !e || !isStringArray(n.ids)) {
        return undefined;
    }
    const count = n.ids.length;
    if (
        !n.ids.every((id) => pubkeyPattern.test(id)) ||
        !isStringArray(n.alias, count) ||
        !isNumberArray(n.pos, 3 * count) ||
        !isNumberArray(n.cap, count) ||
        !isNumberArray(n.deg, count) ||
        !isNumberArray(n.comm, count) ||
        !isStringArray(n.color, count) ||
        !isStringArray(r.ids) ||
        !isNumberArray(r.pos, 3 * r.ids.length) ||
        !isNumberArray(e.a) ||
        !isNumberArray(e.b, e.a.length) ||
        !isNumberArray(e.cap, e.a.length) ||
        !isNumberArray(e.seed, e.a.length)
    ) {
        return undefined;
    }
    const total = count + r.ids.length;
    // Channels index the file's nodes, then its refs
    const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < total;
    if (!e.a.every(inRange) || !e.b.every(inRange)) {
        return undefined;
    }
    return v as Tile;
};

export const parseShard = (
    v: unknown,
): Record<string, NodeInfo> | undefined => {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
        return undefined;
    }
    const out: Record<string, NodeInfo> = {};
    for (const [key, info] of Object.entries(v as Record<string, unknown>)) {
        const i = info as Record<string, unknown>;
        if (
            !pubkeyPattern.test(key) ||
            typeof i !== "object" ||
            i === null ||
            typeof i.alias !== "string" ||
            typeof i.capacity !== "number" ||
            !isNumberArray(i.pos, 3) ||
            !Array.isArray(i.channels) ||
            !(i.channels as unknown[]).every(
                (c) =>
                    Array.isArray(c) &&
                    typeof c[0] === "string" &&
                    pubkeyPattern.test(c[0]) &&
                    typeof c[1] === "number",
            )
        ) {
            return undefined;
        }
        out[key] = i as unknown as NodeInfo;
    }
    return out;
};

export const shardOf = (pubkey: string) => pubkey.slice(2, 4);

export const loadMeta = async (): Promise<GraphMeta> => {
    const meta = parseMeta(await fetchJson("meta.json"));
    if (meta === undefined) {
        throw new Error("graph: bad meta.json");
    }
    return meta;
};

export const loadTile = async (
    meta: GraphMeta,
    file: string,
): Promise<Tile> => {
    const tile = parseTile(await fetchJson(meta.path + file));
    if (tile === undefined) {
        throw new Error(`graph: bad ${file}`);
    }
    return tile;
};

const shardCache = new Map<string, Promise<Record<string, NodeInfo>>>();

// A node's full record (its channels), from its shard; shards are cached
export const loadNode = async (
    meta: GraphMeta,
    pubkey: string,
): Promise<NodeInfo | undefined> => {
    if (!pubkeyPattern.test(pubkey)) {
        return undefined;
    }
    const file = meta.nodeShards.replace("{shard}", shardOf(pubkey));
    const key = `${meta.version}:${file}`;
    let shard = shardCache.get(key);
    if (shard === undefined) {
        shard = fetchJson(meta.path + file).then((v) => {
            const parsed = parseShard(v);
            if (parsed === undefined) {
                throw new Error(`graph: bad ${file}`);
            }
            return parsed;
        });
        shard.catch(() => shardCache.delete(key));
        shardCache.set(key, shard);
    }
    return (await shard)[pubkey];
};

// Search by alias (its shard) or by key (the node's shard)
export const searchNodes = async (
    meta: GraphMeta,
    query: string,
): Promise<{ alias: string; pubkey: string; capacity: number }[]> => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) {
        return [];
    }
    if (/^0[23][0-9a-f]{2,}$/.test(q)) {
        if (q.length < 4) {
            return [];
        }
        const file = meta.nodeShards.replace("{shard}", q.slice(2, 4));
        try {
            const shard = parseShard(await fetchJson(meta.path + file)) ?? {};
            return Object.entries(shard)
                .filter(([key]) => key.startsWith(q))
                .map(([pubkey, n]) => ({
                    alias: n.alias,
                    pubkey,
                    capacity: n.capacity,
                }))
                .slice(0, 20);
        } catch {
            return [];
        }
    }
    const prefix = Array.from(q.slice(0, 2))
        .map((c) => (/[a-z0-9]/.test(c) ? c : "_"))
        .join("");
    try {
        const entries = (await fetchJson(
            meta.path + meta.search.replace("{prefix}", prefix),
        )) as unknown;
        if (!Array.isArray(entries)) {
            return [];
        }
        return entries
            .filter(
                (e): e is [string, string, number] =>
                    Array.isArray(e) &&
                    typeof e[0] === "string" &&
                    typeof e[1] === "string" &&
                    pubkeyPattern.test(e[1]) &&
                    typeof e[2] === "number",
            )
            .filter(([alias]) => alias.toLowerCase().startsWith(q))
            .sort((a, b) => b[2] - a[2])
            .slice(0, 20)
            .map(([alias, pubkey, capacity]) => ({ alias, pubkey, capacity }));
    } catch {
        return [];
    }
};
