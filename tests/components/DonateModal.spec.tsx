import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import DonateModal, {
    donationAvailable,
    donationPollMs,
} from "../../src/components/DonateModal";
import Footer from "../../src/components/Footer";
import Nav from "../../src/components/Nav";
import { config } from "../../src/config";
import { Denomination } from "../../src/consts/Enums";
import i18n from "../../src/i18n/i18n";
import type * as BlockchainModule from "../../src/utils/blockchain";
import {
    getAddressMempoolTxids,
    getAddressStats,
} from "../../src/utils/blockchain";
import { closeDonate, donateTab, openDonate } from "../../src/utils/donate";
import type * as ReplayModule from "../../src/utils/replay";
import { getReplayVerdict } from "../../src/utils/replay";
import { TestComponent, contextWrapper, globalSignals } from "../helper";

vi.mock("../../src/utils/blockchain", async (importOriginal) => ({
    ...(await importOriginal<typeof BlockchainModule>()),
    hasBlockExplorer: vi.fn(() => true),
    getAddressStats: vi.fn(),
    getAddressMempoolTxids: vi.fn(),
}));
vi.mock("../../src/utils/replay", async (importOriginal) => ({
    ...(await importOriginal<typeof ReplayModule>()),
    getReplayVerdict: vi.fn(),
}));

const address = "bcrt1pdonationaddressxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const writeText = vi.fn();
Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
});

const renderModal = () =>
    render(
        () => (
            <>
                <TestComponent />
                <button data-testid="opener">open</button>
                <DonateModal />
            </>
        ),
        { wrapper: contextWrapper },
    );

const lastCopied = () => writeText.mock.calls.at(-1)?.[0] as string;

describe("DonateModal", () => {
    beforeEach(() => {
        config.donation = { address };
        config.ourNode = {
            pubkey: "03" + "ab".repeat(32),
            uris: ["1.2.3.4:9735", "abc.onion:9735"],
        };
        vi.mocked(getAddressStats).mockResolvedValue({
            receivedSat: 1_500_000,
            txCount: 3,
        });
        vi.mocked(getAddressMempoolTxids).mockResolvedValue([]);
        vi.mocked(getReplayVerdict).mockResolvedValue(undefined);
        writeText.mockReset();
    });
    afterEach(() => {
        closeDonate();
        vi.useRealTimers();
        config.donation = undefined;
        config.ourNode = undefined;
    });

    test("is closed until opened, then shows the donation tab", async () => {
        renderModal();
        expect(screen.queryByTestId("donate-modal")).toBeNull();
        openDonate();
        expect(await screen.findByTestId("donate-onchain")).toBeTruthy();
        const dialog = screen.getByRole("dialog");
        expect(dialog.getAttribute("aria-modal")).toEqual("true");
        expect(screen.getByText(i18n.en.donate_title)).toBeTruthy();
        expect(screen.getByTestId("donate-address").textContent).toEqual(
            address,
        );
        expect(
            await screen.findByText(
                "Donations so far: 1 500 000 sats in 3 donations",
                { exact: false },
            ),
        ).toBeTruthy();
    });

    test("tabs by click and by arrow keys", async () => {
        renderModal();
        openDonate();
        const channel = await screen.findByTestId("donate-tab-channel");
        fireEvent.click(channel);
        expect(await screen.findByTestId("donate-channel")).toBeTruthy();
        expect(donateTab()).toEqual("channel");
        fireEvent.keyDown(channel, { key: "ArrowRight" });
        expect(await screen.findByTestId("donate-onchain")).toBeTruthy();
        expect(document.activeElement?.id).toEqual("donate-tab-onchain");
    });

    test("Escape, the close button and the backdrop close it; a click inside does not", async () => {
        renderModal();
        openDonate();
        await screen.findByTestId("donate-onchain");
        fireEvent.click(screen.getByRole("dialog"));
        expect(donateTab()).toEqual("onchain");
        fireEvent.keyDown(document, { key: "Escape" });
        expect(donateTab()).toBeUndefined();

        openDonate();
        fireEvent.click(await screen.findByTestId("donate-close"));
        expect(donateTab()).toBeUndefined();

        openDonate();
        fireEvent.click(await screen.findByTestId("donate-modal"));
        expect(donateTab()).toBeUndefined();
    });

    test("focus stays inside and returns to the opener", async () => {
        renderModal();
        const opener = screen.getByTestId("opener");
        opener.focus();
        openDonate();
        await screen.findByTestId("donate-onchain");
        expect(document.activeElement?.id).toEqual("donate-tab-onchain");
        const close = screen.getByTestId("donate-close");
        close.focus();
        // Shift+Tab from the first element goes round to the last
        fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
        expect(
            screen.getByRole("dialog").contains(document.activeElement),
        ).toBe(true);
        closeDonate();
        await waitFor(() => expect(document.activeElement).toBe(opener));
    });

    test("amount chips and a custom amount set the BIP21", async () => {
        renderModal();
        openDonate();
        await screen.findByTestId("donate-onchain");
        const copyBip21 = () =>
            fireEvent.click(screen.getByTestId("copy_bip21"));

        copyBip21();
        expect(lastCopied()).toEqual(
            `bitcoin:${address}?label=Lightning%20Fork%20Swap%20donation`,
        );

        fireEvent.click(screen.getByTestId("donate-preset-100000"));
        copyBip21();
        expect(lastCopied()).toContain("?amount=0.001&");
        expect(screen.getByTestId("copy_amount")).toBeTruthy();

        globalSignals.setDenomination(Denomination.Sat);
        const custom = screen.getByTestId("donate-custom") as HTMLInputElement;
        fireEvent.input(custom, { target: { value: "25000" } });
        copyBip21();
        expect(lastCopied()).toContain("?amount=0.00025&");

        fireEvent.input(custom, { target: { value: "1.5" } });
        expect(custom.classList.contains("invalid")).toBe(true);
        copyBip21();
        expect(lastCopied()).not.toContain("amount=");

        globalSignals.setDenomination(Denomination.Btc);
        fireEvent.input(custom, { target: { value: "0,01" } });
        expect(custom.classList.contains("invalid")).toBe(false);
        copyBip21();
        expect(lastCopied()).toContain("?amount=0.01&");

        fireEvent.input(custom, { target: { value: "-1" } });
        expect(custom.classList.contains("invalid")).toBe(true);
    });

    test("a new transaction to the address is thanked, with a replay notice when at risk", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        const txid = "c".repeat(64);
        vi.mocked(getAddressMempoolTxids).mockResolvedValueOnce([
            "b".repeat(64),
        ]);
        renderModal();
        openDonate();
        await screen.findByTestId("donate-onchain");
        expect(screen.queryByTestId("donate-thanks")).toBeNull();

        vi.mocked(getAddressMempoolTxids).mockResolvedValue([
            "b".repeat(64),
            txid,
        ]);
        vi.mocked(getReplayVerdict).mockResolvedValue({
            verdict: "at_risk",
            atRiskAddresses: ["bc1qdonorcoins00000"],
        });
        await vi.advanceTimersByTimeAsync(donationPollMs);
        expect(await screen.findByTestId("donate-thanks")).toBeTruthy();
        const notice = await screen.findByTestId("donate-replay");
        expect(notice.textContent).toContain("bc1qdonorcoins00000");
        expect(getReplayVerdict).toHaveBeenCalledWith(txid);
        const contact = notice.querySelector("a")!;
        expect(contact.getAttribute("href")).toEqual("https://paulscode.com");
        expect(contact.getAttribute("target")).toEqual("_blank");
    });

    test("an explorer that fails shows no thank-you and no totals", async () => {
        vi.mocked(getAddressMempoolTxids).mockRejectedValue(new Error("down"));
        vi.mocked(getAddressStats).mockRejectedValue(new Error("down"));
        renderModal();
        openDonate();
        await screen.findByTestId("donate-onchain");
        await new Promise((r) => setTimeout(r, 20));
        expect(screen.queryByTestId("donate-thanks")).toBeNull();
        expect(screen.queryByTestId("donate-stats")).toBeNull();
    });

    test("the open-a-channel tab gives our node and the command", async () => {
        renderModal();
        openDonate("channel");
        const panel = await screen.findByTestId("donate-channel");
        const pubkey = config.ourNode!.pubkey;
        expect(panel.textContent).toContain(`${pubkey}@1.2.3.4:9735`);
        expect(panel.textContent).toContain(`${pubkey}@abc.onion:9735`);
        expect(panel.textContent).toContain("1 000 000 sats");
        const commands = screen.getAllByTestId("copy_command");
        fireEvent.click(commands[0]);
        expect(lastCopied()).toEqual(
            `lncli openchannel --node_key ${pubkey} --connect 1.2.3.4:9735 --local_amt 1000000`,
        );
    });

    test("without a donation address only the channel tab, without either nothing", async () => {
        config.donation = undefined;
        renderModal();
        openDonate("onchain");
        expect(await screen.findByTestId("donate-channel")).toBeTruthy();
        expect(screen.queryByTestId("donate-tab-onchain")).toBeNull();
        closeDonate();
        config.ourNode = undefined;
        expect(donationAvailable()).toBe(false);
    });
});

describe("Nav and Footer", () => {
    afterEach(() => {
        closeDonate();
        config.donation = undefined;
        config.ourNode = undefined;
    });

    test("Contact goes to the forum, Donate opens the window", () => {
        config.donation = { address };
        render(
            () => (
                <>
                    <Nav network="mainnet" />
                    <Footer />
                </>
            ),
            { wrapper: contextWrapper },
        );
        const contacts = screen.getAllByText(i18n.en.contact);
        expect(contacts).toHaveLength(2);
        for (const link of contacts) {
            expect(link.getAttribute("href")).toEqual("https://paulscode.com");
            expect(link.getAttribute("rel")).toContain("noopener");
        }
        fireEvent.click(screen.getByTestId("nav-donate"));
        expect(donateTab()).toEqual("onchain");
    });

    test("no Donate button without anything to donate", () => {
        render(() => <Nav network="mainnet" />, { wrapper: contextWrapper });
        expect(screen.queryByTestId("nav-donate")).toBeNull();
        expect(screen.getByText(i18n.en.contact)).toBeTruthy();
    });
});
