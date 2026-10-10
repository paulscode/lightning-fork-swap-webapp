import { render, screen } from "@solidjs/testing-library";

import NetworkSky from "../../src/components/NetworkSky";
import i18n from "../../src/i18n/i18n";
import type * as DataModule from "../../src/network/data";
import { loadMeta, loadNode, loadTile } from "../../src/network/data";
import type * as SupportModule from "../../src/network/support";
import { webglAvailable } from "../../src/network/support";
import { contextWrapper } from "../helper";

vi.mock("../../src/network/data", async (importOriginal) => ({
    ...(await importOriginal<typeof DataModule>()),
    loadMeta: vi.fn(),
    loadTile: vi.fn(),
    loadNode: vi.fn(),
}));
vi.mock("../../src/network/support", async (importOriginal) => ({
    ...(await importOriginal<typeof SupportModule>()),
    webglAvailable: vi.fn(() => false),
}));

const key = (n: number) => "02" + n.toString(16).padStart(64, "0");

describe("the network sky without WebGL", () => {
    beforeEach(() => {
        vi.mocked(loadMeta).mockResolvedValue({
            version: 1,
            generatedAt: "",
            checkedAt: "",
            nodes: 2,
            channels: 1,
            capacity: 5e6,
            communities: 1,
            bounds: [
                [0, 0, 0],
                [1, 1, 1],
            ],
            ours: { pubkey: key(1), uris: [] },
            path: "v1/",
            overview: "overview.json",
            cells: [],
            nodeShards: "node/{shard}.json",
            search: "search/{prefix}.json",
        });
        vi.mocked(loadTile).mockResolvedValue({
            nodes: {
                ids: [key(1), key(2)],
                alias: ["Lightning Fork Swap", "<img src=x onerror=alert(1)>"],
                pos: [0, 0, 0, 1, 1, 1],
                cap: [2e6, 9e6],
                deg: [1, 1],
                comm: [0, 0],
                color: ["#3399ff", "#ff0000"],
            },
            refs: { ids: [], pos: [] },
            edges: { a: [0], b: [1], cap: [5e6], seed: [1] },
        });
        vi.mocked(loadNode).mockResolvedValue(undefined);
        vi.mocked(webglAvailable).mockReturnValue(false);
    });

    test("falls back to the list of nodes, largest first, as text", async () => {
        render(() => <NetworkSky mode="full" />, {
            wrapper: contextWrapper,
        });
        // The fallback replaces the list's usual summary once WebGL is found
        // missing
        await screen.findByText(i18n.en.network_unavailable);
        const list = screen.getByTestId("sky-list");
        expect(list.querySelector("summary")?.textContent).toEqual(
            i18n.en.network_unavailable,
        );
        const rows = list.querySelectorAll("tbody tr");
        expect(rows.length).toEqual(2);
        // The alias is text, never markup
        expect(rows[0].textContent).toContain("<img src=x onerror=alert(1)>");
        expect(list.querySelector("img")).toBeNull();
        expect(rows[1].classList.contains("ours")).toBe(true);
        expect(
            screen.getByTestId("sky-canvas").getAttribute("aria-label"),
        ).toEqual(i18n.en.network_description);
    });

    test("as the home page's backdrop, a failure shows nothing", async () => {
        vi.mocked(loadMeta).mockRejectedValue(new Error("404"));
        render(() => <NetworkSky mode="background" />, {
            wrapper: contextWrapper,
        });
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByTestId("sky-list")).toBeNull();
        expect(screen.queryByTestId("sky-controls")).toBeNull();
    });

    test("when the files cannot load, the page says so", async () => {
        vi.mocked(loadMeta).mockRejectedValue(new Error("404"));
        render(() => <NetworkSky mode="full" />, { wrapper: contextWrapper });
        expect(
            (await screen.findByTestId("sky-list")).querySelector("summary")
                ?.textContent,
        ).toEqual(i18n.en.network_unavailable);
        expect(screen.queryByTestId("sky-controls")).toBeNull();
    });
});
