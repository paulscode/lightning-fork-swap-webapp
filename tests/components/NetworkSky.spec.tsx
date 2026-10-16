import { render, screen } from "@solidjs/testing-library";

import NetworkSky from "../../src/components/NetworkSky";
import i18n from "../../src/i18n/i18n";
import type * as DataModule from "../../src/network/data";
import { loadMeta, loadNode, loadTile } from "../../src/network/data";
import { type Sky, type SkyOptions, createSky } from "../../src/network/sky";
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

vi.mock("../../src/network/sky", () => ({ createSky: vi.fn() }));

const key = (n: number) => "02" + n.toString(16).padStart(64, "0");

const graph = () => {
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
};

describe("the network sky without WebGL", () => {
    beforeEach(graph);

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

describe("the network sky on /network", () => {
    type Made = { canvas: HTMLCanvasElement; options: SkyOptions; sky: Sky };
    let made: Made[];
    const phone = (yes: boolean) =>
        vi.stubGlobal(
            "matchMedia",
            vi.fn((q: string) => ({
                matches: yes && q === "(max-width: 600px)",
            })),
        );

    beforeEach(() => {
        graph();
        vi.mocked(webglAvailable).mockReturnValue(true);
        made = [];
        vi.mocked(createSky).mockImplementation((canvas, _m, _t, options) => {
            const sky = {
                select: vi.fn(),
                home: vi.fn(),
                zoom: vi.fn(),
                resize: vi.fn(),
                setInset: vi.fn(),
                dispose: vi.fn(),
                neighbours: () => [],
                labels: () =>
                    [[key(2), "Second", 50, 60]] as [
                        string,
                        string,
                        number,
                        number,
                    ][],
            };
            made.push({ canvas, options, sky });
            return sky;
        });
        Object.defineProperty(HTMLCanvasElement.prototype, "clientHeight", {
            configurable: true,
            get: () => 800,
        });
        phone(false);
    });

    afterEach(() => {
        delete (HTMLCanvasElement.prototype as { clientHeight?: number })
            .clientHeight;
        vi.unstubAllGlobals();
        vi.useRealTimers();
    });

    test("a name can be tapped to choose its node", async () => {
        render(() => <NetworkSky mode="full" />, { wrapper: contextWrapper });
        const label = await vi.waitFor(() => {
            const el = document.querySelector<HTMLElement>(".sky-label");
            expect(el?.textContent).toEqual("Second");
            return el!;
        });
        label.click();
        await vi.waitFor(() =>
            expect(vi.mocked(loadNode)).toHaveBeenCalledWith(
                expect.anything(),
                key(2),
            ),
        );
        await vi.waitFor(() =>
            expect(made[0].sky.select).toHaveBeenCalledWith(key(2), undefined),
        );
    });

    test("on a phone the view is centred above the info panel", async () => {
        phone(true);
        render(() => <NetworkSky mode="full" />, { wrapper: contextWrapper });
        await vi.waitFor(() => expect(made).toHaveLength(1));
        // The panel's max-height there: 45% of the sky
        expect(made[0].sky.setInset).toHaveBeenLastCalledWith(360);
    });

    test("elsewhere nothing is covered", async () => {
        render(() => <NetworkSky mode="full" />, { wrapper: contextWrapper });
        await vi.waitFor(() => expect(made).toHaveLength(1));
        expect(made[0].sky.setInset).toHaveBeenLastCalledWith(0);
    });

    test("a lost context makes the sky again on a new canvas, a few times", async () => {
        render(() => <NetworkSky mode="full" />, { wrapper: contextWrapper });
        await vi.waitFor(() => expect(made).toHaveLength(1));
        // The node chosen at the start is chosen again in the new sky
        await vi.waitFor(() => expect(made[0].sky.select).toHaveBeenCalled());

        for (let i = 1; i <= 3; i++) {
            made[i - 1].options.onLost?.();
            await vi.waitFor(() => expect(made).toHaveLength(i + 1));
            const now = made[i];
            expect(made[i - 1].sky.dispose).toHaveBeenCalled();
            expect(now.canvas).not.toBe(made[i - 1].canvas);
            expect(now.canvas.isConnected).toBe(true);
            expect(made[i - 1].canvas.isConnected).toBe(false);
            expect(screen.getByTestId("sky-canvas")).toBe(now.canvas);
            await vi.waitFor(() =>
                expect(now.sky.select).toHaveBeenCalledWith(key(1), undefined),
            );
        }

        // A fourth loss within the minute: the page falls back to the list
        made[3].options.onLost?.();
        await screen.findByText(i18n.en.network_unavailable);
        expect(made).toHaveLength(4);
        expect(made[3].sky.dispose).toHaveBeenCalled();
    });
});
