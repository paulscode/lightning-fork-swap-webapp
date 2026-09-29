import { fireEvent, render, screen, waitFor } from "@solidjs/testing-library";

import Logs from "../../src/components/settings/Logs";
import { downloadJson } from "../../src/utils/download";
import { clipboard } from "../../src/utils/helper";
import { TestComponent, contextWrapper } from "../helper";

vi.mock("../../src/utils/download", () => ({
    downloadJson: vi.fn(),
}));

vi.mock("../../src/utils/helper", async () => {
    const actual = await vi.importActual("../../src/utils/helper");
    return { ...actual, clipboard: vi.fn() };
});

const renderLogs = () =>
    render(
        () => (
            <>
                <TestComponent />
                <Logs />
            </>
        ),
        { wrapper: contextWrapper },
    );

describe("Logs", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    test("should show download and copy on all platforms", async () => {
        renderLogs();

        await screen.findByTestId("logs-download");
        await screen.findByTestId("logs-copy");
    });

    test("should copy the logs as JSON", async () => {
        renderLogs();

        fireEvent.click(await screen.findByTestId("logs-copy"));

        await waitFor(() => {
            expect(clipboard).toHaveBeenCalledOnce();
        });
        const copied = vi.mocked(clipboard).mock.calls[0][0];
        expect(typeof JSON.parse(copied)).toBe("object");
    });

    test("should download the logs", async () => {
        renderLogs();

        fireEvent.click(await screen.findByTestId("logs-download"));

        await waitFor(() => {
            expect(downloadJson).toHaveBeenCalledOnce();
        });
        expect(vi.mocked(downloadJson).mock.calls[0][0]).toBe(
            "lightning-fork-swap-logs",
        );
    });
});
