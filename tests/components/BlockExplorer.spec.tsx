import { render, screen } from "@solidjs/testing-library";
import { type Asset, Explorer } from "boltz-swaps/types";

import BlockExplorer, {
    BlockExplorerTargetKind,
} from "../../src/components/BlockExplorer";
import { config } from "../../src/config";
import i18n from "../../src/i18n/i18n";
import { contextWrapper } from "../helper";

const explorerUrl = "https://explorer.example";

const label = (typeLabel: string) =>
    i18n.en.blockexplorer.replace("{{ typeLabel }}", typeLabel);

describe("BlockExplorer", () => {
    let original: Asset["blockExplorerUrl"];

    beforeEach(() => {
        original = config.assets!["BTC"].blockExplorerUrl;
        config.assets!["BTC"].blockExplorerUrl = {
            id: Explorer.Esplora,
            normal: explorerUrl,
        };
    });

    afterEach(() => {
        config.assets!["BTC"].blockExplorerUrl = original;
        vi.restoreAllMocks();
    });

    test("should link to BTC addresses", async () => {
        const address = "bcrt1qh47qjmkkdxmg8cjxhe7gnnuluwddcw692cfjsv";
        render(
            () => (
                <BlockExplorer
                    asset="BTC"
                    kind={BlockExplorerTargetKind.Address}
                    id={address}
                />
            ),
            {
                wrapper: contextWrapper,
            },
        );

        const button = await screen.findByText(
            label(i18n.en.blockexplorer_lockup_address),
        );
        expect((button as HTMLAnchorElement).href).toEqual(
            `${explorerUrl}/address/${address}`,
        );
    });

    test("should link to BTC transactions", async () => {
        const txId =
            "813c90372c9b774396c66099cf8015f9510a8ba5686cbb78d8e848959fe7bb5d";
        render(
            () => (
                <BlockExplorer
                    asset="BTC"
                    kind={BlockExplorerTargetKind.Tx}
                    id={txId}
                />
            ),
            {
                wrapper: contextWrapper,
            },
        );

        const button = await screen.findByText(
            label(i18n.en.blockexplorer_claim_tx),
        );
        expect((button as HTMLAnchorElement).href).toEqual(
            `${explorerUrl}/tx/${txId}`,
        );
    });

    test.each`
        typeLabel
        ${"lockup_address"}
        ${"lockup_tx"}
        ${"claim_tx"}
        ${"refund_tx"}
    `(
        "should render the $typeLabel label when requested",
        async ({ typeLabel }) => {
            const key = `blockexplorer_${typeLabel}` as keyof typeof i18n.en;
            render(
                () => (
                    <BlockExplorer
                        asset="BTC"
                        kind={BlockExplorerTargetKind.Tx}
                        id="deadbeef"
                        typeLabel={
                            typeLabel as
                                | "lockup_address"
                                | "lockup_tx"
                                | "claim_tx"
                                | "refund_tx"
                        }
                    />
                ),
                {
                    wrapper: contextWrapper,
                },
            );

            const button = (await screen.findByText(
                label(i18n.en[key] as string),
            )) as HTMLAnchorElement;
            expect(button.textContent).not.toContain("{{");
            expect(button.href).toEqual(`${explorerUrl}/tx/deadbeef`);
        },
    );

    test("does not render a link when no explorer base URL is configured", () => {
        const { container } = render(
            () => (
                <BlockExplorer
                    asset="UNKNOWN-ASSET"
                    kind={BlockExplorerTargetKind.Tx}
                    id="deadbeef"
                />
            ),
            {
                wrapper: contextWrapper,
            },
        );

        expect(container.querySelector("a.btn-explorer")).toBeNull();
    });

    test("does not render a link when BTC has no explorer configured", () => {
        config.assets!["BTC"].blockExplorerUrl = undefined;
        const { container } = render(
            () => (
                <BlockExplorer
                    asset="BTC"
                    kind={BlockExplorerTargetKind.Tx}
                    id="deadbeef"
                />
            ),
            {
                wrapper: contextWrapper,
            },
        );

        expect(container.querySelector("a.btn-explorer")).toBeNull();
    });
});
