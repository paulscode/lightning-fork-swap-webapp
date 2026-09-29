import { render, screen } from "@solidjs/testing-library";
import { type Asset, Explorer, SwapType } from "boltz-swaps/types";
import { createSignal } from "solid-js";

import BlockExplorerLink from "../../src/components/BlockExplorerLink";
import { config } from "../../src/config";
import { BTC } from "../../src/consts/Assets";
import dict from "../../src/i18n/i18n";
import type { SomeSwap } from "../../src/utils/swapCreator";
import { contextWrapper } from "../helper";

const explorerUrl = "https://explorer.example";

describe("BlockExplorerLink", () => {
    const blockExplorerLabel = (typeLabel: string) =>
        dict.en.blockexplorer.replace("{{ typeLabel }}", typeLabel);
    const lockupAddressLabel = blockExplorerLabel(
        dict.en.blockexplorer_lockup_address,
    );
    const claimTransactionLabel = blockExplorerLabel(
        dict.en.blockexplorer_claim_tx,
    );

    let original: Asset["blockExplorerUrl"];

    beforeEach(() => {
        original = config.assets![BTC].blockExplorerUrl;
        config.assets![BTC].blockExplorerUrl = {
            id: Explorer.Esplora,
            normal: explorerUrl,
        };
    });

    afterEach(() => {
        config.assets![BTC].blockExplorerUrl = original;
    });

    test.each`
        type                  | address     | params
        ${SwapType.Submarine} | ${"bcrt1s"} | ${{ type: SwapType.Submarine, assetSend: BTC, assetReceive: "LN", address: "bcrt1s" }}
        ${SwapType.Reverse}   | ${"bcrt1r"} | ${{ type: SwapType.Reverse, assetSend: "LN", assetReceive: BTC, lockupAddress: "bcrt1r" }}
    `(
        "should show lockup address for $type when not claimed yet",
        async ({ params, address }) => {
            const [swap] = createSignal<SomeSwap>(params as SomeSwap);

            render(
                () => (
                    <BlockExplorerLink
                        swap={swap}
                        swapStatus={() => "transaction.mempool"}
                    />
                ),
                { wrapper: contextWrapper },
            );

            const button = (await screen.findByText(
                lockupAddressLabel,
            )) as HTMLAnchorElement;

            expect(button.href).toEqual(`${explorerUrl}/address/${address}`);
        },
    );

    test.each`
        type                  | params
        ${SwapType.Submarine} | ${{ type: SwapType.Submarine, assetSend: BTC, assetReceive: "LN", address: "bcrt1s", claimTx: "123" }}
        ${SwapType.Reverse}   | ${{ type: SwapType.Reverse, assetSend: "LN", assetReceive: BTC, lockupAddress: "bcrt1r", claimTx: "123" }}
    `("should show claim transaction for $type", async ({ params }) => {
        const [swap] = createSignal<SomeSwap>(params as SomeSwap);

        render(
            () => (
                <BlockExplorerLink
                    swap={swap}
                    swapStatus={() => "transaction.claimed"}
                />
            ),
            { wrapper: contextWrapper },
        );

        const button = (await screen.findByText(
            claimTransactionLabel,
        )) as HTMLAnchorElement;

        expect(button.href).toEqual(`${explorerUrl}/tx/123`);
    });

    test("should reactively show claim transaction", async () => {
        const [swap, setSwap] = createSignal<SomeSwap>({
            type: SwapType.Reverse,
            assetSend: "LN",
            assetReceive: BTC,
            lockupAddress: "bcrt1r",
        } as SomeSwap);

        render(
            () => (
                <BlockExplorerLink
                    swap={swap}
                    swapStatus={() => "transaction.mempool"}
                />
            ),
            { wrapper: contextWrapper },
        );

        const button = (await screen.findByText(
            lockupAddressLabel,
        )) as HTMLAnchorElement;
        expect(button.href).toEqual(`${explorerUrl}/address/bcrt1r`);

        // eslint-disable-next-line solid/reactivity
        setSwap({ ...swap()!, claimTx: "123" } as SomeSwap);

        const claimButton = (await screen.findByText(
            claimTransactionLabel,
        )) as HTMLAnchorElement;
        expect(claimButton.href).toEqual(`${explorerUrl}/tx/123`);
    });

    test.each([null, "invoice.set", "swap.created"])(
        "should not show a link for status %s",
        (status) => {
            const [swap] = createSignal<SomeSwap>({
                type: SwapType.Submarine,
                assetSend: BTC,
                assetReceive: "LN",
                address: "bcrt1s",
            } as SomeSwap);

            const { container } = render(
                () => (
                    <BlockExplorerLink
                        swap={swap}
                        swapStatus={() => status as string}
                    />
                ),
                { wrapper: contextWrapper },
            );

            expect(container.querySelector("a.btn-explorer")).toBeNull();
        },
    );

    test("should not show a link without a swap", () => {
        const { container } = render(
            () => (
                <BlockExplorerLink
                    swap={() => null}
                    swapStatus={() => "transaction.mempool"}
                />
            ),
            { wrapper: contextWrapper },
        );

        expect(container.querySelector("a.btn-explorer")).toBeNull();
    });

    test("should not show a link when no explorer is configured", () => {
        config.assets![BTC].blockExplorerUrl = undefined;
        const [swap] = createSignal<SomeSwap>({
            type: SwapType.Submarine,
            assetSend: BTC,
            assetReceive: "LN",
            address: "bcrt1s",
        } as SomeSwap);

        const { container } = render(
            () => (
                <BlockExplorerLink
                    swap={swap}
                    swapStatus={() => "transaction.mempool"}
                />
            ),
            { wrapper: contextWrapper },
        );

        expect(container.querySelector("a.btn-explorer")).toBeNull();
    });
});
