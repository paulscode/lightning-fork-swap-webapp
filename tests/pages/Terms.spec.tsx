import { render, screen } from "@solidjs/testing-library";

import Terms from "../../src/pages/Terms";

describe("Terms", () => {
    test("donations: a gift, no refunds, the contact forum", () => {
        render(() => <Terms />);
        const heading = screen.getByText("5. Donations");
        const section = heading.nextElementSibling!.textContent!;
        expect(section).toContain("A donation is a gift");
        expect(section).toContain("not refunded");
        expect(section).toContain("creates no contract or obligation");
        const contact = screen.getByText("contact us");
        expect(contact.getAttribute("href")).toEqual("https://paulscode.com");
        expect(screen.getByText("6. Open source")).toBeTruthy();
    });
});
