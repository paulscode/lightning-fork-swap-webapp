import { fireEvent, render, screen } from "@solidjs/testing-library";
import { Explorer, SwapType } from "boltz-swaps/types";

import { config } from "../../src/config";
import { BTC, LN } from "../../src/consts/Assets";
import i18n from "../../src/i18n/i18n";
import SwapRefunded from "../../src/status/SwapRefunded";
import type { SomeSwap } from "../../src/utils/swapCreator";
import { TestComponent, contextWrapper, payContext } from "../helper";

const navigate = vi.fn();

vi.mock("@solidjs/router", async () => {
    const actual = await vi.importActual("@solidjs/router");
    return {
        ...actual,
        useNavigate: () => navigate,
    };
});

const refundTxId = "refundtxid";
const explorerUrl = "https://explorer.example";

const swap = {
    id: "refunded",
    type: SwapType.Submarine,
    assetSend: BTC,
    assetReceive: LN,
    refundTx: refundTxId,
} as unknown as SomeSwap;

const renderRefunded = (refunded: SomeSwap | null) => {
    render(
        () => (
            <>
                <TestComponent />
                <SwapRefunded refundTxId={refundTxId} />
            </>
        ),
        { wrapper: contextWrapper },
    );
    payContext.setSwap(refunded);
};

describe("SwapRefunded", () => {
    const originalExplorer = config.assets![BTC].blockExplorerUrl;

    beforeEach(() => {
        navigate.mockClear();
        config.assets![BTC].blockExplorerUrl = {
            id: Explorer.Esplora,
            normal: explorerUrl,
        };
    });

    afterEach(() => {
        config.assets![BTC].blockExplorerUrl = originalExplorer;
    });

    test("links the refund transaction on the lockup chain explorer", async () => {
        renderRefunded(swap);

        expect(await screen.findByRole("link")).toHaveAttribute(
            "href",
            `${explorerUrl}/tx/${refundTxId}`,
        );
        expect(screen.getByText(i18n.en.refunded)).toBeInTheDocument();
    });

    test("renders no explorer link without an explorer configured", () => {
        config.assets![BTC].blockExplorerUrl = undefined;
        renderRefunded(swap);

        expect(screen.getByText(i18n.en.refunded)).toBeInTheDocument();
        expect(screen.queryByRole("link")).toBeNull();
    });

    test("renders no explorer link without a swap", () => {
        renderRefunded(null);

        expect(screen.queryByRole("link")).toBeNull();
    });

    test("navigates to a new swap", () => {
        renderRefunded(swap);

        fireEvent.click(screen.getByText(i18n.en.new_swap));
        expect(navigate).toHaveBeenCalledWith("/swap");
    });
});
