import { fireEvent, render, screen } from "@solidjs/testing-library";

import SettingsMenu from "../../src/components/settings/SettingsMenu";
import i18n from "../../src/i18n/i18n";
import { TestComponent, contextWrapper, globalSignals } from "../helper";

describe("SettingsMenu", () => {
    test("should close when Escape key is pressed", () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <SettingsMenu />
                </>
            ),
            { wrapper: contextWrapper },
        );

        globalSignals.setSettingsMenu(true);

        fireEvent.keyDown(document, { key: "Escape" });

        expect(globalSignals.settingsMenu()).toBe(false);
    });

    const renderOpen = () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <SettingsMenu />
                </>
            ),
            { wrapper: contextWrapper },
        );

        globalSignals.setSettingsMenu(true);
    };

    test("should not render when closed", () => {
        render(
            () => (
                <>
                    <TestComponent />
                    <SettingsMenu />
                </>
            ),
            { wrapper: contextWrapper },
        );

        globalSignals.setSettingsMenu(false);
        expect(document.getElementById("settings-menu")).toBeNull();
    });

    test("should render the kept settings", () => {
        renderOpen();

        expect(screen.getByText(i18n.en.settings)).toBeInTheDocument();
        for (const label of [
            i18n.en.denomination,
            i18n.en.decimal_separator,
            i18n.en.hide_wallet_address,
            i18n.en.zero_conf,
            i18n.en.rescue_key,
            i18n.en.logs,
        ]) {
            expect(screen.getByText(`${label}:`)).toBeInTheDocument();
        }
        expect(screen.queryByTestId("bitcoin-only-toggle")).toBeNull();
    });

    test("should toggle zeroConf on click", async () => {
        renderOpen();
        globalSignals.setZeroConf(false);

        const toggle = await screen.findByTestId("zero-conf-toggle");

        fireEvent.click(toggle);
        expect(globalSignals.zeroConf()).toBe(true);
        expect(globalSignals.settingsMenu()).toBe(true);

        fireEvent.click(toggle);
        expect(globalSignals.zeroConf()).toBe(false);
    });

    test("should toggle privacyMode on click", () => {
        renderOpen();
        globalSignals.setPrivacyMode(false);

        const toggle = screen.getByTitle(i18n.en.hide_wallet_address_tooltip);

        fireEvent.click(toggle);
        expect(globalSignals.privacyMode()).toBe(true);

        fireEvent.click(toggle);
        expect(globalSignals.privacyMode()).toBe(false);
    });

    test("should close when clicking the close button", () => {
        renderOpen();

        fireEvent.click(
            document.querySelector(".settings-menu-close") as HTMLElement,
        );
        expect(globalSignals.settingsMenu()).toBe(false);
    });

    test("should close when clicking outside of the panel", () => {
        renderOpen();

        fireEvent.click(
            document.querySelector(".settings-menu-panel") as HTMLElement,
        );
        expect(globalSignals.settingsMenu()).toBe(true);

        fireEvent.click(document.getElementById("settings-menu")!);
        expect(globalSignals.settingsMenu()).toBe(false);
    });
});
