import { type Asset, Explorer } from "boltz-swaps/types";

import { config } from "../../src/config";
import { blockExplorerLink } from "../../src/utils/explorerLink";

const explorerUrl = "https://explorer.example";
const explorerTorUrl = "http://explorerexample.onion";

describe("explorerLink", () => {
    let original: Asset["blockExplorerUrl"];

    beforeEach(() => {
        original = config.assets!["BTC"].blockExplorerUrl;
        config.assets!["BTC"].blockExplorerUrl = {
            id: Explorer.Esplora,
            normal: explorerUrl,
            tor: explorerTorUrl,
        };
    });

    afterEach(() => {
        config.assets!["BTC"].blockExplorerUrl = original;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe("blockExplorerLink", () => {
        test("links to asset addresses", () => {
            const address = "bcrt1qh47qjmkkdxmg8cjxhe7gnnuluwddcw692cfjsv";
            expect(blockExplorerLink("BTC", false, address)).toBe(
                `${explorerUrl}/address/${address}`,
            );
        });

        test("links to asset transactions", () => {
            const txId =
                "813c90372c9b774396c66099cf8015f9510a8ba5686cbb78d8e848959fe7bb5d";
            expect(blockExplorerLink("BTC", true, txId)).toBe(
                `${explorerUrl}/tx/${txId}`,
            );
        });

        test("uses the onion explorer when served over Tor", () => {
            vi.stubGlobal("location", {
                ...window.location,
                hostname: "swapexample.onion",
            });
            expect(blockExplorerLink("BTC", true, "deadbeef")).toBe(
                `${explorerTorUrl}/tx/deadbeef`,
            );
        });

        test("returns undefined when no explorer base URL is configured", () => {
            expect(
                blockExplorerLink("UNKNOWN-ASSET", true, "deadbeef"),
            ).toBeUndefined();
        });

        test("returns undefined when BTC has no explorer configured", () => {
            config.assets!["BTC"].blockExplorerUrl = undefined;
            expect(blockExplorerLink("BTC", true, "deadbeef")).toBeUndefined();
        });

        test("returns undefined for Lightning", () => {
            expect(blockExplorerLink("LN", true, "deadbeef")).toBeUndefined();
        });
    });
});
