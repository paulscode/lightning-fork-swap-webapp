import { fireEvent, render, screen } from "@solidjs/testing-library";

import { config } from "../../src/config";
import i18n from "../../src/i18n/i18n";
import type * as DataModule from "../../src/network/data";
import { loadMeta, loadTile } from "../../src/network/data";
import Hero from "../../src/pages/Hero";
import { closeDonate, donateTab } from "../../src/utils/donate";
import { TestComponent, contextWrapper } from "../helper";

vi.mock("../../src/network/data", async (importOriginal) => ({
    ...(await importOriginal<typeof DataModule>()),
    loadMeta: vi.fn(),
    loadTile: vi.fn(),
}));

const renderHome = () =>
    render(
        () => (
            <>
                <TestComponent />
                <Hero />
            </>
        ),
        { wrapper: contextWrapper },
    );

describe("the home page", () => {
    afterEach(() => {
        closeDonate();
        config.donation = undefined;
    });

    test("the words, the swap card, how it works, questions", async () => {
        vi.mocked(loadMeta).mockRejectedValue(new Error("no graph yet"));
        renderHome();
        expect(screen.getByRole("heading", { level: 1 }).textContent).toEqual(
            i18n.en.home_headline,
        );
        expect(document.querySelector("#create-overlay")).not.toBeNull();
        expect(screen.getByText(i18n.en.hero_refund_title)).toBeTruthy();
        // Without the graph's numbers, no stats line, nothing else missing
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByTestId("home-stats")).toBeNull();
        // Questions open one at a time
        fireEvent.click(screen.getByText(i18n.en.faq_fees_q));
        expect(screen.getByText(i18n.en.faq_fees_a)).toBeTruthy();
        fireEvent.click(screen.getByText(i18n.en.faq_chain_q));
        expect(screen.getByText(i18n.en.faq_chain_a)).toBeTruthy();
        expect(screen.queryByText(i18n.en.faq_fees_a)).toBeNull();
        // No donations configured: no help section
        expect(screen.queryByTestId("home-donate")).toBeNull();
    });

    test("the network's numbers, and the way to help", async () => {
        config.donation = {
            address:
                "bcrt1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqc8gma6",
        };
        vi.mocked(loadMeta).mockResolvedValue({
            version: 1,
            generatedAt: "",
            checkedAt: "",
            nodes: 34,
            channels: 407,
            capacity: 2_018_704_496,
            communities: 11,
            bounds: [
                [0, 0, 0],
                [1, 1, 1],
            ],
            ours: { pubkey: "03" + "ab".repeat(32), uris: [] },
            path: "v1/",
            overview: "overview.json",
            cells: [],
            nodeShards: "node/{shard}.json",
            search: "search/{prefix}.json",
        });
        vi.mocked(loadTile).mockResolvedValue({
            nodes: {
                ids: [],
                alias: [],
                pos: [],
                cap: [],
                deg: [],
                comm: [],
                color: [],
            },
            refs: { ids: [], pos: [] },
            edges: { a: [], b: [], cap: [], seed: [] },
        });
        renderHome();
        const stats = await screen.findByTestId("home-stats");
        expect(stats.textContent).toContain(
            "34 nodes · 407 channels · 2 018 704 496",
        );
        fireEvent.click(screen.getByTestId("home-donate"));
        expect(donateTab()).toEqual("onchain");
    });
});
