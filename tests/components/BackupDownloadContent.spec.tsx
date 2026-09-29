import { render, screen } from "@solidjs/testing-library";
import userEvent from "@testing-library/user-event";

import BackupDownloadContent from "../../src/components/BackupDownloadContent";
import i18n from "../../src/i18n/i18n";
import { downloadRescueFile } from "../../src/utils/backup";
import { isMobile } from "../../src/utils/helper";
import { TestComponent, contextWrapper, globalSignals } from "../helper";

vi.mock("../../src/utils/backup", () => ({
    downloadRescueFile: vi.fn(),
}));

vi.mock("../../src/utils/helper", async () => {
    const actual = await vi.importActual("../../src/utils/helper");
    return {
        ...actual,
        isMobile: vi.fn(),
    };
});

describe("BackupDownloadContent", () => {
    const onFileDownloaded = vi.fn();
    const onMnemonicRequested = vi.fn();

    const renderComponent = () =>
        render(
            () => (
                <>
                    <TestComponent />
                    <BackupDownloadContent
                        onFileDownloaded={onFileDownloaded}
                        onMnemonicRequested={onMnemonicRequested}
                    />
                </>
            ),
            {
                wrapper: contextWrapper,
            },
        );

    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();

        vi.mocked(isMobile).mockReturnValue(false);
    });

    test("should download the rescue key without showing mnemonic alternative on desktop", async () => {
        const user = userEvent.setup();

        renderComponent();
        globalSignals.setRescueFile({
            mnemonic:
                "horse olympic laundry marriage material private arch civil theory crew alone thank",
        });

        expect(screen.queryByText(i18n.en.show_rescue_key_instead)).toBeNull();
        expect(screen.queryByTestId("show-mnemonic-backup")).toBeNull();

        await user.click(
            screen.getByRole("button", { name: i18n.en.download_new_key }),
        );

        expect(downloadRescueFile).toHaveBeenCalledOnce();
        expect(onFileDownloaded).toHaveBeenCalledOnce();
        expect(onMnemonicRequested).not.toHaveBeenCalled();
    });

    test("should notify and not advance when the download fails", async () => {
        const user = userEvent.setup();
        vi.mocked(downloadRescueFile).mockImplementationOnce(() => {
            throw new Error("download failed");
        });

        renderComponent();

        await user.click(
            screen.getByRole("button", { name: i18n.en.download_new_key }),
        );

        expect(onFileDownloaded).not.toHaveBeenCalled();
        expect(globalSignals.notificationType()).toBe("error");
        expect(globalSignals.notification()).toContain("download failed");
    });

    test("should show a mnemonic alternative on mobile while keeping download as the primary action", async () => {
        vi.mocked(isMobile).mockReturnValue(true);

        renderComponent();

        expect(
            await screen.findByRole("button", {
                name: i18n.en.download_new_key,
            }),
        ).toBeVisible();
        expect(screen.getByTestId("show-mnemonic-backup")).toHaveTextContent(
            i18n.en.show_rescue_key_instead,
        );
    });

    test("should open the mnemonic flow from the secondary mobile action", async () => {
        const user = userEvent.setup();

        vi.mocked(isMobile).mockReturnValue(true);

        renderComponent();

        await user.click(screen.getByTestId("show-mnemonic-backup"));

        expect(onMnemonicRequested).toHaveBeenCalledOnce();
        expect(downloadRescueFile).not.toHaveBeenCalled();
        expect(onFileDownloaded).not.toHaveBeenCalled();
    });
});
