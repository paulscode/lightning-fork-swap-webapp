import type * as SolidRouter from "@solidjs/router";
import { render, screen } from "@solidjs/testing-library";

import i18n from "../../src/i18n/i18n";
import Error from "../../src/pages/Error";
import { contextWrapper } from "../helper";

let state: unknown;
vi.mock("@solidjs/router", async () => {
    const actual = await vi.importActual<typeof SolidRouter>("@solidjs/router");
    return { ...actual, useLocation: () => ({ state }) };
});

describe("Error", () => {
    test("a swap stopped for its cost says what it cost, and that nothing was paid", async () => {
        state = {
            swapId: "AbCdEf123456",
            check: "cost",
            cost: 40_154,
            paid: 2_000_000,
        };
        render(() => <Error />, { wrapper: contextWrapper });
        expect(await screen.findByText(i18n.en.swap_stopped)).toBeTruthy();
        const reason = screen.getByTestId("swap-stopped-reason").textContent!;
        expect(reason).toContain("40");
        expect(reason).toContain("2");
        expect(reason).toContain("smaller amount");
        expect(
            screen.getByText(i18n.en.swap_stopped_nothing_paid),
        ).toBeTruthy();
        expect(screen.getByText(/AbCdEf123456/)).toBeTruthy();
        expect(screen.queryByText(i18n.en.error_subline)).toBeNull();
    });

    test("a swap stopped for its timeout, or for anything else", async () => {
        state = { swapId: "AbCdEf123456", check: "timeout" };
        const { unmount } = render(() => <Error />, {
            wrapper: contextWrapper,
        });
        expect(
            (await screen.findByTestId("swap-stopped-reason")).textContent,
        ).toEqual(i18n.en.swap_stopped_timeout);
        unmount();

        state = { swapId: "AbCdEf123456" };
        render(() => <Error />, { wrapper: contextWrapper });
        expect(
            (await screen.findByTestId("swap-stopped-reason")).textContent,
        ).toEqual(i18n.en.swap_stopped_other);
    });

    test("without a swap, the general error", async () => {
        state = undefined;
        render(() => <Error />, { wrapper: contextWrapper });
        expect(await screen.findByText(i18n.en.error_subline)).toBeTruthy();
    });
});
