import { render, screen } from "@solidjs/testing-library";

import AmountDenominator from "../../src/components/AmountDenominator";
import { Denomination } from "../../src/consts/Enums";

describe("AmountDenominator", () => {
    test.each([Denomination.Btc, Denomination.Sat])(
        "renders %s as an icon denominator",
        (value) => {
            const { container } = render(() => (
                <AmountDenominator class="extra" value={value} />
            ));

            const icon = container.querySelector(".denominator.extra");
            expect(icon).not.toBeNull();
            expect(icon).toHaveAttribute("data-denominator", value);
        },
    );

    test("renders other denominators as text", () => {
        render(() => <AmountDenominator class="extra" value="SOL" />);

        const text = screen.getByText("SOL");
        expect(text).toHaveClass("denominator-text");
        expect(text).toHaveClass("extra");
    });
});
