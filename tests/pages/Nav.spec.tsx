import { fireEvent, render, screen } from "@solidjs/testing-library";

import Nav from "../../src/components/Nav";
import i18n from "../../src/i18n/i18n";
import { contextWrapper } from "../helper";

describe("Nav", () => {
    test.each(["testnet", "regtest", "random"])(
        "should show network on network %s",
        (network) => {
            render(() => <Nav network={network} />, {
                wrapper: contextWrapper,
            });

            const networkLabel = screen.queryAllByText(network.toUpperCase());
            expect(networkLabel.length).toBe(1);
        },
    );

    test("should not show network on mainnet", () => {
        const network = "mainnet";

        render(() => <Nav network={network} />, { wrapper: contextWrapper });

        const networkLabel = screen.queryAllByText(network);
        expect(networkLabel.length).toBe(0);
    });

    test("should link to swap, rescue, history, the network and the contact forum", () => {
        render(() => <Nav network="mainnet" />, {
            wrapper: contextWrapper,
        });

        const links = Array.from(
            document.querySelectorAll<HTMLAnchorElement>("#collapse a"),
        ).map((link) => [link.textContent, link.getAttribute("href")]);
        expect(links).toEqual([
            [i18n.en.swap, "/swap"],
            [i18n.en.rescue, "/rescue"],
            [i18n.en.history, "/history"],
            [i18n.en.network, "/network"],
            [i18n.en.contact, "https://paulscode.com"],
        ]);
    });

    test("should toggle the hamburger menu", () => {
        render(() => <Nav network="mainnet" />, {
            wrapper: contextWrapper,
        });

        const hamburger = screen.getByLabelText("Menu");
        const collapse = document.getElementById("collapse")!;
        expect(collapse.classList.contains("active")).toBe(false);

        fireEvent.click(hamburger);
        expect(collapse.classList.contains("active")).toBe(true);

        fireEvent.click(screen.getByText(i18n.en.history));
        expect(collapse.classList.contains("active")).toBe(false);
    });
});
