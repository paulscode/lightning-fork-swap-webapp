import {
    closeDonate,
    donateTab,
    donationBip21,
    isDonateTab,
    nodeUri,
    openChannelCommand,
    openDonate,
    openDonateFromLink,
    splitAddress,
} from "../../src/utils/donate";

describe("donate utils", () => {
    test("BIP21 with and without an amount, always labelled", () => {
        expect(donationBip21("bc1qabc", 0)).toEqual(
            "bitcoin:bc1qabc?label=Lightning%20Fork%20Swap%20donation",
        );
        expect(donationBip21("bc1qabc", 100_000)).toEqual(
            "bitcoin:bc1qabc?amount=0.001&label=Lightning%20Fork%20Swap%20donation",
        );
        expect(donationBip21("bc1qabc", 1)).toContain("amount=0.00000001&");
    });

    test("an address split into its start, middle and end", () => {
        expect(splitAddress("bc1qabcdefghijklmnop")).toEqual([
            "bc1qab",
            "cdefghij",
            "klmnop",
        ]);
        expect(splitAddress("short")).toEqual(["short", "", ""]);
        expect(splitAddress("bc1qabcdefghijklmnop").join("")).toEqual(
            "bc1qabcdefghijklmnop",
        );
    });

    test("connection strings and the open command", () => {
        expect(nodeUri("03ab", "1.2.3.4:9735")).toEqual("03ab@1.2.3.4:9735");
        expect(openChannelCommand("03ab", "1.2.3.4:9735", 1_000_000)).toEqual(
            "lncli openchannel --node_key 03ab --connect 1.2.3.4:9735 --local_amt 1000000",
        );
    });

    test("the window's tab", () => {
        expect(donateTab()).toBeUndefined();
        openDonate();
        expect(donateTab()).toEqual("onchain");
        openDonate("channel");
        expect(donateTab()).toEqual("channel");
        closeDonate();
        expect(donateTab()).toBeUndefined();
        expect(isDonateTab("channel")).toBe(true);
        expect(isDonateTab("x")).toBe(false);
    });

    test("a link opens the window and leaves the address bar clean", () => {
        window.history.replaceState({}, "", "/swap?donate=channel&x=1#h");
        openDonateFromLink();
        expect(donateTab()).toEqual("channel");
        expect(
            window.location.pathname +
                window.location.search +
                window.location.hash,
        ).toEqual("/swap?x=1#h");

        closeDonate();
        window.history.replaceState({}, "", "/?donate=whatever");
        openDonateFromLink();
        expect(donateTab()).toEqual("onchain");
        expect(window.location.search).toEqual("");

        closeDonate();
        window.history.replaceState({}, "", "/history");
        openDonateFromLink();
        expect(donateTab()).toBeUndefined();
    });
});
