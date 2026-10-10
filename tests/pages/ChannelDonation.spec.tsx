import { Route, Router } from "@solidjs/router";
import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import { GlobalProvider } from "../../src/context/Global";
import i18n from "../../src/i18n/i18n";
import ChannelDonation, {
    visiblePollMs,
} from "../../src/pages/ChannelDonation";
import type * as ChannelModule from "../../src/utils/channelDonation";
import {
    ChannelApiError,
    type ChannelOrder,
    donationSecret,
    editChannelNode,
    getChannelDonation,
    storeDonation,
} from "../../src/utils/channelDonation";

vi.mock("../../src/utils/channelDonation", async (importOriginal) => ({
    ...(await importOriginal<typeof ChannelModule>()),
    getChannelDonation: vi.fn(),
    editChannelNode: vi.fn(),
}));

const key =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const id = "AbCdEfGhIjKlMnOpQrSt_-";
const secret = "S".repeat(43);

const order = (over: Partial<ChannelOrder> = {}): ChannelOrder => ({
    id,
    state: "awaiting_payment",
    address: "bcrt1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqc8gma6",
    node: { pubkey: key, alias: "", address: "node.example.com" },
    minSat: 1_000_310,
    maxSat: 16_777_215,
    receivedSat: 0,
    confirmedSat: 0,
    confirmationsNeeded: 3,
    createdAt: "2026-10-10T12:00:00Z",
    expiresAt: "2026-10-11T12:00:00Z",
    capacitySat: 0,
    remainderSat: 0,
    feeSat: 0,
    fundingConfirmations: 0,
    editable: true,
    timeline: [],
    ...over,
});

const page = (path = `/donate/channel/${id}`) => {
    window.history.pushState({}, "", path);
    return render(() => (
        <GlobalProvider>
            <Router>
                <Route path="/donate/channel/:id" component={ChannelDonation} />
            </Router>
        </GlobalProvider>
    ));
};

describe("the channel donation page", () => {
    beforeEach(() => {
        vi.mocked(getChannelDonation).mockReset();
        vi.mocked(editChannelNode).mockReset();
        localStorage.clear();
    });
    afterEach(() => vi.useRealTimers());

    test("waiting for the payment: what to send, where, until when", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order(),
            etag: '"a"',
            unchanged: false,
        });
        page();
        const pay = await screen.findByTestId("cd-pay");
        expect(pay.textContent).toContain("1 000 310");
        expect(screen.getByTestId("cd-address").textContent).toEqual(
            order().address,
        );
        const current = screen
            .getByTestId("cd-steps")
            .querySelector(".current");
        expect(current?.textContent).toEqual(i18n.en.cd_step_awaiting_payment);
        expect(screen.queryByTestId("cd-side")).toBeNull();
    });

    test("a top-up asks only for the rest", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order({ state: "payment_seen", receivedSat: 600_000 }),
            unchanged: false,
        });
        page();
        expect((await screen.findByTestId("cd-pay")).textContent).toContain(
            "400 310",
        );
        expect(screen.getByTestId("cd-received").textContent).toContain(
            "600 000",
        );
    });

    test("needing the donor: the reason and the edit, with the secret", async () => {
        storeDonation({ id, secret, createdAt: 1 });
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order({
                state: "needs_attention",
                errorCode: "not_fork_node",
                confirmedSat: 2_000_000,
            }),
            unchanged: false,
        });
        vi.mocked(editChannelNode).mockResolvedValue();
        page();
        expect((await screen.findByTestId("cd-error")).textContent).toEqual(
            i18n.en.cd_error_not_fork_node,
        );
        const current = screen
            .getByTestId("cd-steps")
            .querySelector(".current");
        expect(current?.textContent).toEqual(i18n.en.cd_step_connecting);
        const input = screen.getByTestId("cd-edit-node") as HTMLInputElement;
        expect(input.value).toEqual(`${key}@node.example.com`);
        fireEvent.input(input, {
            target: { value: `${key}@91.190.100.60:9735` },
        });
        fireEvent.click(screen.getByTestId("cd-edit-save"));
        expect(
            (await screen.findByTestId("cd-edit-message")).textContent,
        ).toEqual(i18n.en.cd_edit_saved);
        expect(vi.mocked(editChannelNode).mock.calls[0]).toEqual([
            id,
            secret,
            `${key}@91.190.100.60:9735`,
        ]);
    });

    test("without the secret the edit says how to get it", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order({ state: "retrying", errorCode: "unreachable" }),
            unchanged: false,
        });
        page();
        expect((await screen.findByTestId("cd-edit")).textContent).toContain(
            i18n.en.cd_edit_no_secret,
        );
        expect(screen.queryByTestId("cd-edit-node")).toBeNull();
    });

    test("the kept link's secret is stored and leaves the address bar", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order(),
            unchanged: false,
        });
        page(`/donate/channel/${id}#${secret}`);
        await screen.findByTestId("cd-pay");
        expect(donationSecret(id)).toEqual(secret);
        expect(window.location.hash).toEqual("");
    });

    test("open: the channel and what stayed", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order({
                state: "open",
                capacitySat: 16_777_215,
                remainderSat: 3_000_000,
                editable: false,
            }),
            unchanged: false,
        });
        page();
        expect(
            (await screen.findByTestId("cd-capacity")).textContent,
        ).toContain("16 777 215");
        expect(screen.getByTestId("cd-remainder").textContent).toContain(
            "3 000 000",
        );
        expect(screen.queryByTestId("cd-edit")).toBeNull();
        expect(screen.queryByTestId("cd-pay")).toBeNull();
    });

    test("fell back: said plainly", async () => {
        vi.mocked(getChannelDonation).mockResolvedValue({
            order: order({
                state: "fell_back",
                errorCode: "gave_up",
                editable: false,
            }),
            unchanged: false,
        });
        page();
        const side = await screen.findByTestId("cd-side");
        expect(side.textContent).toContain(i18n.en.cd_state_fell_back);
        expect(side.textContent).toContain(i18n.en.cd_error_gave_up);
    });

    test("it polls with the ETag until settled", async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        vi.mocked(getChannelDonation)
            .mockResolvedValueOnce({
                order: order(),
                etag: '"1"',
                unchanged: false,
            })
            .mockResolvedValueOnce({ etag: '"1"', unchanged: true })
            .mockResolvedValueOnce({
                order: order({
                    state: "open",
                    capacitySat: 2_000_000,
                    editable: false,
                }),
                etag: '"2"',
                unchanged: false,
            });
        page();
        await screen.findByTestId("cd-pay");
        await vi.advanceTimersByTimeAsync(visiblePollMs);
        expect(vi.mocked(getChannelDonation).mock.calls[1]).toEqual([
            id,
            '"1"',
        ]);
        await vi.advanceTimersByTimeAsync(visiblePollMs);
        await screen.findByTestId("cd-capacity");
        await vi.advanceTimersByTimeAsync(visiblePollMs * 3);
        expect(vi.mocked(getChannelDonation)).toHaveBeenCalledTimes(3);
    });

    test("an unknown donation", async () => {
        vi.mocked(getChannelDonation).mockRejectedValue(
            new ChannelApiError(404, "not_found"),
        );
        page();
        expect((await screen.findByTestId("cd-missing")).textContent).toEqual(
            i18n.en.cd_not_found,
        );
        page("/donate/channel/not-an-id");
        await waitFor(() =>
            expect(screen.getAllByTestId("cd-missing").length).toBe(2),
        );
    });
});
