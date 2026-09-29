import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import { render, screen, waitFor } from "@solidjs/testing-library";
import type * as ClientModule from "boltz-swaps/client";
import { getSubmarinePreimage } from "boltz-swaps/client";
import type * as InvoiceModule from "boltz-swaps/invoice";
import { decodeInvoice } from "boltz-swaps/invoice";
import { SwapType } from "boltz-swaps/types";
import { Show, createSignal } from "solid-js";

import { BTC, LN } from "../../src/consts/Assets";
import i18n from "../../src/i18n/i18n";
import TransactionClaimed from "../../src/status/TransactionClaimed";
import type { SomeSwap } from "../../src/utils/swapCreator";
import { TestComponent, contextWrapper, payContext } from "../helper";

vi.mock("boltz-swaps/client", async (importOriginal) => ({
    ...(await importOriginal<typeof ClientModule>()),
    getSubmarinePreimage: vi.fn(),
}));

vi.mock("boltz-swaps/invoice", async (importOriginal) => ({
    ...(await importOriginal<typeof InvoiceModule>()),
    decodeInvoice: vi.fn(),
}));

const preimage = "aa".repeat(32);

// The Pay page sets the swap before it mounts a status view, and the
// preimage lookup only runs on mount, so mirror that order here
const renderClaimed = (swap: SomeSwap) => {
    const [mounted, setMounted] = createSignal(false);
    render(
        () => (
            <>
                <TestComponent />
                <Show when={mounted()}>
                    <TransactionClaimed />
                </Show>
            </>
        ),
        {
            wrapper: contextWrapper,
        },
    );
    payContext.setSwap(swap);
    setMounted(true);
};

describe("TransactionClaimed", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test.each`
        name                                              | swap
        ${"submarine swaps with a preimage"}              | ${{ id: "sub", type: SwapType.Submarine, assetSend: BTC, assetReceive: LN, preimage }}
        ${"reverse swaps to BTC with claim transactions"} | ${{ id: "rev", type: SwapType.Reverse, assetSend: LN, assetReceive: BTC, claimTx: "txid" }}
    `("should show success for $name", async ({ swap }) => {
        renderClaimed({ ...swap, receiveAmount: 100_000 } as SomeSwap);

        await expect(
            screen.findByText(i18n.en.congrats),
        ).resolves.not.toBeUndefined();
        expect(
            screen.getByText(/You successfully received/u),
        ).toBeInTheDocument();
        expect(getSubmarinePreimage).not.toHaveBeenCalled();
    });

    test("should show broadcasting for reverse swaps without a claim transaction", async () => {
        renderClaimed({
            id: "rev",
            type: SwapType.Reverse,
            assetSend: LN,
            assetReceive: BTC,
        } as SomeSwap);

        await expect(
            screen.findByText(i18n.en.broadcasting_claim),
        ).resolves.not.toBeUndefined();
        expect(screen.queryByText(i18n.en.congrats)).toBeNull();
    });

    test("should show copy preimage button for submarine swaps", async () => {
        renderClaimed({
            id: "sub",
            type: SwapType.Submarine,
            assetSend: BTC,
            assetReceive: LN,
            preimage,
        } as SomeSwap);

        await expect(
            screen.findByText(i18n.en.copy_preimage),
        ).resolves.not.toBeUndefined();
    });

    test("should not show copy preimage button for reverse swaps", async () => {
        renderClaimed({
            id: "rev",
            type: SwapType.Reverse,
            assetSend: LN,
            assetReceive: BTC,
            claimTx: "txid",
        } as SomeSwap);

        await screen.findByText(i18n.en.congrats);
        expect(screen.queryByText(i18n.en.copy_preimage)).toBeNull();
    });

    test("should fetch and verify the preimage of submarine swaps", async () => {
        vi.mocked(getSubmarinePreimage).mockResolvedValue({ preimage });
        vi.mocked(decodeInvoice).mockReturnValue({
            preimageHash: hex.encode(sha256(hex.decode(preimage))),
        } as ReturnType<typeof decodeInvoice>);

        renderClaimed({
            id: "sub-fetch",
            type: SwapType.Submarine,
            assetSend: BTC,
            assetReceive: LN,
            invoice: "invoice",
        } as SomeSwap);

        await expect(
            screen.findByText(i18n.en.copy_preimage),
        ).resolves.not.toBeUndefined();
        expect(getSubmarinePreimage).toHaveBeenCalledWith("sub-fetch");
    });

    test("should not show a preimage that does not match the invoice", async () => {
        vi.mocked(getSubmarinePreimage).mockResolvedValue({ preimage });
        vi.mocked(decodeInvoice).mockReturnValue({
            preimageHash: "00".repeat(32),
        } as ReturnType<typeof decodeInvoice>);

        renderClaimed({
            id: "sub-mismatch",
            type: SwapType.Submarine,
            assetSend: BTC,
            assetReceive: LN,
            invoice: "invoice",
        } as SomeSwap);

        await waitFor(() => {
            expect(getSubmarinePreimage).toHaveBeenCalledWith("sub-mismatch");
        });
        await screen.findByText(i18n.en.congrats);
        expect(screen.queryByText(i18n.en.copy_preimage)).toBeNull();
    });
});
