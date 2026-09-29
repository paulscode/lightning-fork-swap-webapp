import { config } from "../../src/config";
import { detectLanguage, getNavigatorLanguage } from "../../src/i18n/detect";

describe("detect", () => {
    test.each`
        navigatorLanguage | expected
        ${"en-US"}        | ${"en"}
        ${"en-UK"}        | ${"en"}
        ${"en"}           | ${"en"}
        ${"de-DE"}        | ${config.defaultLanguage}
        ${"es-ES"}        | ${config.defaultLanguage}
        ${"de"}           | ${config.defaultLanguage}
        ${"none-DE"}      | ${config.defaultLanguage}
        ${"ro-RO"}        | ${config.defaultLanguage}
        ${undefined}      | ${config.defaultLanguage}
    `(
        "getNavigatorLanguage $navigatorLanguage => $expected",
        ({ navigatorLanguage, expected }) => {
            expect(getNavigatorLanguage(navigatorLanguage)).toEqual(expected);
        },
    );

    describe("detectLanguage", () => {
        test.each(["en", "de", "something"])(
            "should prefer configured language",
            (lang) => {
                const setter = vi.fn();
                expect(detectLanguage(lang, null, setter)).toEqual(lang);
                expect(setter).toHaveBeenCalledTimes(0);
            },
        );

        test.each(["en"])("should use valid language URL param %s", (lang) => {
            Object.defineProperty(window, "location", {
                value: {
                    search: `?lang=${lang}`,
                },
                writable: true,
            });

            const setter = vi.fn();
            expect(detectLanguage(null, "not used", setter)).toEqual(lang);

            expect(setter).toHaveBeenCalledTimes(1);
            expect(setter).toHaveBeenCalledWith(lang);
        });

        test("should use last used URL params over browser default", () => {
            Object.defineProperty(window, "location", {
                value: {
                    search: "",
                },
                writable: true,
            });

            const lastParam = "asdf";
            const setter = vi.fn();

            expect(detectLanguage(null, lastParam, setter)).toEqual(lastParam);
            expect(setter).toHaveBeenCalledTimes(0);
        });

        test.each(["invalid", "de", "zh"])(
            "should default to browser language for unsupported language URL param %s",
            (lang) => {
                Object.defineProperty(window, "location", {
                    value: {
                        search: `?lang=${lang}`,
                    },
                    writable: true,
                });

                const setter = vi.fn();
                expect(detectLanguage(null, null, setter)).toEqual("en");

                expect(setter).toHaveBeenCalledTimes(0);
            },
        );

        test("should use the browser language without a URL language", () => {
            const setter = vi.fn();
            expect(detectLanguage(null, undefined, setter)).toEqual("en");
            expect(setter).toHaveBeenCalledTimes(0);
        });
    });
});
