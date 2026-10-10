import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import DonateModal from "../../src/components/DonateModal";
import { config } from "../../src/config";
import i18n from "../../src/i18n/i18n";
import type * as BlockchainModule from "../../src/utils/blockchain";
import type * as ChannelModule from "../../src/utils/channelDonation";
import {
    ChannelApiError,
    createChannelDonation,
    getChannelInfo,
    storedDonations,
} from "../../src/utils/channelDonation";
import { closeDonate, donateTab, openDonate } from "../../src/utils/donate";
import { TestComponent, contextWrapper } from "../helper";

vi.mock("../../src/utils/blockchain", async (importOriginal) => ({
    ...(await importOriginal<typeof BlockchainModule>()),
    hasBlockExplorer: vi.fn(() => false),
}));
vi.mock("../../src/utils/channelDonation", async (importOriginal) => ({
    ...(await importOriginal<typeof ChannelModule>()),
    getChannelInfo: vi.fn(),
    createChannelDonation: vi.fn(),
}));

const key =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const id = "AbCdEfGhIjKlMnOpQrSt_-";
const info = {
    available: true,
    minSat: 1_000_310,
    maxSat: 16_777_215,
    feeRate: 2,
    confirmations: 3,
    expiryHours: 24,
    maxPerNode: 2,
    disclaimerVersion: "2026-10-1",
    powBits: 8,
    challenge: "c",
};

const renderModal = () =>
    render(
        () => (
            <>
                <TestComponent />
                <DonateModal />
            </>
        ),
        { wrapper: contextWrapper },
    );

describe("channel donations in the Donate tab", () => {
    beforeEach(() => {
        config.donation = {
            address:
                "bcrt1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqc8gma6",
        };
        vi.mocked(getChannelInfo).mockResolvedValue(info);
        vi.mocked(createChannelDonation).mockReset();
        localStorage.clear();
        // A test that created a donation navigated to its page
        window.history.pushState({}, "", "/");
    });
    afterEach(() => {
        closeDonate();
        config.donation = undefined;
    });

    test("no switch when the service has no channel donations", async () => {
        vi.mocked(getChannelInfo).mockResolvedValue(undefined);
        renderModal();
        openDonate();
        await screen.findByTestId("donate-onchain");
        await new Promise((r) => setTimeout(r, 10));
        expect(screen.queryByTestId("channel-switch")).toBeNull();
    });

    test("off by default; on shows the form in place of the address", async () => {
        renderModal();
        openDonate();
        const toggle = (await screen.findByTestId(
            "channel-switch",
        )) as HTMLInputElement;
        expect(toggle.checked).toBe(false);
        expect(screen.getByTestId("donate-address")).toBeTruthy();
        fireEvent.change(toggle, { target: { checked: true } });
        expect(await screen.findByTestId("channel-form")).toBeTruthy();
        expect(screen.queryByTestId("donate-address")).toBeNull();
        // The short and the full terms, before anything is paid
        expect(screen.getByTestId("channel-short").textContent).toContain(
            i18n.en.channel_short_title,
        );
        expect(screen.getByTestId("channel-terms").textContent).toContain(
            i18n.en.channel_full_gift_title,
        );
        expect(screen.getByTestId("channel-sizes").textContent).toContain(
            "1 000 310",
        );
    });

    test("paused when the worker is not running", async () => {
        vi.mocked(getChannelInfo).mockResolvedValue({
            ...info,
            available: false,
        });
        renderModal();
        openDonate();
        fireEvent.change(await screen.findByTestId("channel-switch"), {
            target: { checked: true },
        });
        expect(await screen.findByTestId("channel-paused")).toBeTruthy();
        expect(screen.queryByTestId("channel-form")).toBeNull();
    });

    test("the button waits for a valid node and the ticked box", async () => {
        vi.mocked(createChannelDonation).mockResolvedValue({
            id,
            secret: "s".repeat(43),
        });
        renderModal();
        openDonate();
        fireEvent.change(await screen.findByTestId("channel-switch"), {
            target: { checked: true },
        });
        const create = (await screen.findByTestId(
            "channel-create",
        )) as HTMLButtonElement;
        const node = screen.getByTestId("channel-node") as HTMLInputElement;
        const accept = screen.getByTestId("channel-accept") as HTMLInputElement;
        expect(create.disabled).toBe(true);
        fireEvent.input(node, { target: { value: "02nope" } });
        expect(node.getAttribute("aria-invalid")).toEqual("true");
        fireEvent.change(accept, { target: { checked: true } });
        expect(create.disabled).toBe(true);
        fireEvent.input(node, { target: { value: `${key}@node.example.com` } });
        expect(create.disabled).toBe(false);
        fireEvent.change(accept, { target: { checked: false } });
        expect(create.disabled).toBe(true);
        fireEvent.change(accept, { target: { checked: true } });
        fireEvent.click(create);
        await waitFor(() => expect(donateTab()).toBeUndefined());
        expect(vi.mocked(createChannelDonation).mock.calls[0][0]).toEqual(
            `${key}@node.example.com`,
        );
        expect(storedDonations()[0]).toMatchObject({
            id,
            secret: "s".repeat(43),
        });
        await waitFor(() =>
            expect(window.location.pathname).toEqual(`/donate/channel/${id}`),
        );
    });

    test("a refusal is worded, the window stays", async () => {
        vi.mocked(createChannelDonation).mockRejectedValue(
            new ChannelApiError(422, "not_public"),
        );
        renderModal();
        openDonate();
        fireEvent.change(await screen.findByTestId("channel-switch"), {
            target: { checked: true },
        });
        fireEvent.input(await screen.findByTestId("channel-node"), {
            target: { value: `${key}@10.0.0.1` },
        });
        fireEvent.change(screen.getByTestId("channel-accept"), {
            target: { checked: true },
        });
        fireEvent.click(screen.getByTestId("channel-create"));
        expect(
            (await screen.findByTestId("channel-error")).textContent,
        ).toEqual(i18n.en.channel_error_not_public);
        expect(donateTab()).toEqual("onchain");
        expect(storedDonations()).toEqual([]);
    });
});
