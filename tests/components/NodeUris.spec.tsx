import { fireEvent, render, screen } from "@solidjs/testing-library";

import NodeUris from "../../src/components/NodeUris";
import i18n from "../../src/i18n/i18n";
import { contextWrapper } from "../helper";

const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
});

const pubkey = "02" + "ab".repeat(32);

describe("NodeUris", () => {
    beforeEach(() => {
        writeText.mockReset();
    });

    test("lists key@address for each address, each with its copy button", () => {
        render(
            () => (
                <NodeUris
                    pubkey={pubkey}
                    addresses={[
                        "1.2.3.4:9735",
                        "<img src=x onerror=alert(1)>",
                        "abc.onion:9737",
                    ]}
                />
            ),
            { wrapper: contextWrapper },
        );
        const box = screen.getByTestId("sky-uris");
        const codes = Array.from(box.querySelectorAll("code")).map(
            (c) => c.textContent,
        );
        expect(codes).toEqual([
            `${pubkey}@1.2.3.4:9735`,
            `${pubkey}@abc.onion:9737`,
        ]);
        expect(box.querySelector("img")).toBeNull();

        const buttons = screen.getAllByRole("button", {
            name: i18n.en.network_copy_uri,
        });
        expect(buttons.length).toEqual(2);
        fireEvent.click(buttons[1]);
        expect(writeText).toHaveBeenCalledWith(`${pubkey}@abc.onion:9737`);
        expect(buttons[1].getAttribute("aria-label")).toEqual(
            i18n.en.network_copied,
        );
    });

    test("says so when the node announces no address", () => {
        render(() => <NodeUris pubkey={pubkey} addresses={[]} />, {
            wrapper: contextWrapper,
        });
        expect(screen.getByText(i18n.en.network_no_address)).toBeDefined();
        expect(screen.queryByRole("button")).toBeNull();
    });
});
