import {
    connectableAddresses,
    loadMeta,
    loadNode,
    loadTile,
    parseMeta,
    parseShard,
    parseTile,
    searchNodes,
    shardOf,
} from "../../src/network/data";

const key = (n: number) => "02" + n.toString(16).padStart(64, "0");
const fetchMock = vi.fn();

const meta = {
    version: 4,
    generatedAt: "2026-10-10T00:00:00Z",
    checkedAt: "2026-10-10T00:00:00Z",
    nodes: 2,
    channels: 1,
    capacity: 5_000_000,
    communities: 1,
    bounds: [
        [0, 0, 0],
        [1, 1, 1],
    ],
    ours: { pubkey: key(1), uris: [] },
    path: "v4/",
    overview: "overview.json",
    cells: [],
    nodeShards: "node/{shard}.json",
    search: "search/{prefix}.json",
};

const tile = {
    nodes: {
        ids: [key(1), key(2)],
        alias: ["ours", "Paperclip"],
        pos: [0, 0, 0, 1, 1, 1],
        cap: [5e6, 5e6],
        deg: [1, 1],
        comm: [0, 0],
        color: ["#3399ff", "#ff0000"],
    },
    refs: { ids: [], pos: [] },
    edges: { a: [0], b: [1], cap: [5e6], seed: [9] },
};

const shard = {
    [key(2)]: {
        alias: "Paperclip",
        color: "#ff0000",
        addresses: [],
        capacity: 5e6,
        degree: 1,
        lastUpdate: 1,
        comm: 0,
        pos: [1, 1, 1],
        channels: [[key(1), 5e6]],
    },
};

const json = (v: unknown, status = 200) =>
    new Response(JSON.stringify(v), { status });

describe("the sky's data", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    test("meta, tiles and shards as the generator writes them", () => {
        expect(parseMeta(meta)?.version).toEqual(4);
        expect(parseTile(tile)?.nodes.ids.length).toEqual(2);
        expect(parseShard(shard)?.[key(2)].alias).toEqual("Paperclip");
        expect(shardOf(key(2))).toEqual("00");
    });

    test.each([
        ["a path that climbs", { ...meta, path: "../x/" }],
        ["no ours", { ...meta, ours: undefined }],
        [
            "a cell file with a scheme",
            { ...meta, cells: [{ file: "https://evil/x" }] },
        ],
    ])("meta refused: %s", (_, bad) => {
        expect(parseMeta(bad)).toBeUndefined();
    });

    test.each([
        [
            "a short position list",
            { ...tile, nodes: { ...tile.nodes, pos: [0, 0] } },
        ],
        ["a channel to nowhere", { ...tile, edges: { ...tile.edges, b: [7] } }],
        [
            "a bad key",
            { ...tile, nodes: { ...tile.nodes, ids: ["x", key(2)] } },
        ],
        ["a fractional index", { ...tile, edges: { ...tile.edges, a: [0.5] } }],
        ["NaN", { ...tile, nodes: { ...tile.nodes, cap: [NaN, 1] } }],
    ])("tile refused: %s", (_, bad) => {
        expect(parseTile(bad)).toBeUndefined();
    });

    test("a shard with a bad channel is refused", () => {
        expect(
            parseShard({
                [key(2)]: { ...shard[key(2)], channels: [["x", 1]] },
            }),
        ).toBeUndefined();
        expect(parseShard([])).toBeUndefined();
    });

    test("loading: meta, then the version's files; shards cached", async () => {
        fetchMock.mockImplementation((url: string) => {
            if (url.endsWith("/graph/meta.json"))
                return Promise.resolve(json(meta));
            if (url.endsWith("/graph/v4/overview.json"))
                return Promise.resolve(json(tile));
            if (url.endsWith("/graph/v4/node/00.json"))
                return Promise.resolve(json(shard));
            if (url.endsWith("/graph/v4/search/pa.json"))
                return Promise.resolve(
                    json([
                        ["Paperclip", key(2), 5e6],
                        ["Pancake", key(3), 9e6],
                        ["<b>", "nope", 1],
                    ]),
                );
            return Promise.resolve(json({}, 404));
        });
        const m = await loadMeta();
        expect((await loadTile(m, m.overview)).edges.a).toEqual([0]);
        expect((await loadNode(m, key(2)))?.channels).toEqual([[key(1), 5e6]]);
        await loadNode(m, key(2));
        expect(
            fetchMock.mock.calls.filter(([u]) => String(u).includes("node/00"))
                .length,
        ).toEqual(1);
        expect(await loadNode(m, "nonsense")).toBeUndefined();
        expect((await searchNodes(m, "Pap")).map((r) => r.alias)).toEqual([
            "Paperclip",
        ]);
        expect((await searchNodes(m, "pa")).map((r) => r.alias)).toEqual([
            "Pancake",
            "Paperclip",
        ]);
        expect(
            (await searchNodes(m, key(2).slice(0, 8))).map((r) => r.pubkey),
        ).toEqual([key(2)]);
        expect(await searchNodes(m, "x")).toEqual([]);
        fetchMock.mockResolvedValue(json({}, 500));
        await expect(loadMeta()).rejects.toThrow();
    });
});

describe("connectableAddresses", () => {
    test("keeps host:port addresses and drops anything else", () => {
        const onion =
            "uo4swnsgfzlstnyx44eimndqkykz5aqbep7bqmwwg42foofgr7h2pqyd.onion:9735";
        expect(
            connectableAddresses([
                "91.190.100.60:9735",
                onion,
                "[2a01:4f8:c0c:1::1]:9735",
                "lightning.example.com:9735",
                "no-port.example.com",
                "<b>x</b>:9735",
                "a b:9735",
                "x".repeat(100) + ":9735",
                42,
                null,
            ]),
        ).toEqual([
            "91.190.100.60:9735",
            onion,
            "[2a01:4f8:c0c:1::1]:9735",
            "lightning.example.com:9735",
        ]);
        expect(connectableAddresses(undefined)).toEqual([]);
        expect(connectableAddresses("1.2.3.4:9735")).toEqual([]);
    });
});
