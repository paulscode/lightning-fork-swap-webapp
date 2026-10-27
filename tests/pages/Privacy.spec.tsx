import { render, screen } from "@solidjs/testing-library";

import Privacy from "../../src/pages/Privacy";

// The periods are what the service's configuration does (deploy/: nginx's
// logs, the journal, the retention job): this test is a reminder to change
// both together
describe("Privacy", () => {
    test("says what is kept, and for how long", () => {
        const { container } = render(() => <Privacy />);
        const text = container.textContent!;
        expect(text).toContain("Last updated:");
        // Each row's last cell: how long it is kept
        const rows = Array.from(container.querySelectorAll("tbody tr"));
        const kept = (what: string) =>
            rows
                .find((row) => row.textContent!.includes(what))!
                .querySelector("td:last-child")!.textContent!;
        expect(kept("Request log")).toContain("10 days");
        expect(kept("Threat log")).toContain("30 days");
        expect(kept("error log")).toContain("10 days");
        expect(kept("Each swap")).toContain(
            "90 days after the swap is settled",
        );
        expect(text).toContain("Your IP address is not stored with your swaps");
        expect(text).toContain("Tor Browser");
        // Never calls the SHA256 chain Bitcoin
        expect(text).not.toMatch(/Bitcoin \(SHA256\)|SHA256 Bitcoin/);
        expect(text).toContain("SHA256 chain");
        const contact = screen.getByText("contact us");
        expect(contact.getAttribute("href")).toEqual("https://paulscode.com");
    });
});
