import { render, screen } from "@solidjs/testing-library";

import Asset from "../../src/components/Asset";
import { BTC, LN } from "../../src/consts/Assets";
import { Side } from "../../src/consts/Enums";
import { TestComponent, contextWrapper } from "../helper";

describe("Asset", () => {
    test.each`
        side            | asset
        ${Side.Send}    | ${BTC}
        ${Side.Receive} | ${LN}
        ${Side.Send}    | ${LN}
        ${Side.Receive} | ${BTC}
    `("should render $asset statically on side $side", ({ side, asset }) => {
        render(
            () => (
                <>
                    <TestComponent />
                    <Asset side={side as Side} signal={() => asset as string} />
                </>
            ),
            { wrapper: contextWrapper },
        );

        const el = screen.getByTestId(`asset-${side}`);
        expect(el.className).toContain(`asset-${asset}`);
        expect(el.closest(".asset-wrap")?.className).toContain("no-select");
    });

    test("should not render a selector button", () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <Asset side={Side.Receive} signal={() => BTC} />
                </>
            ),
            { wrapper: contextWrapper },
        );

        expect(screen.queryByRole("button")).toBeNull();
    });
});
