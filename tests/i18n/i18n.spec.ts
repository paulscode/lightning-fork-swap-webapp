import { config } from "../../src/config";
import dict, { rawDict } from "../../src/i18n/i18n";

const extractPlaceholders = (text: string): Set<string> => {
    const placeholders = new Set<string>();
    const regex = /\{\{\s*(\w+)\s*\}\}/g;

    let match: ReturnType<typeof regex.exec>;
    while ((match = regex.exec(text)) !== null) {
        placeholders.add(match[1]);
    }

    return placeholders;
};

const findEmptyValues = (
    obj: Record<string, unknown>,
    path: string = "",
): string[] => {
    const emptyPaths: string[] = [];

    for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;

        if (typeof value === "object" && value !== null) {
            emptyPaths.push(
                ...findEmptyValues(value as Record<string, unknown>, fullPath),
            );
        } else if (
            value === "" ||
            value === null ||
            value === undefined ||
            (typeof value === "string" && value.trim() === "")
        ) {
            emptyPaths.push(fullPath);
        }
    }

    return emptyPaths;
};

const collectAllPlaceholders = (
    obj: Record<string, unknown>,
    path: string = "",
): Map<string, Set<string>> => {
    const placeholders = new Map<string, Set<string>>();

    for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;

        if (typeof value === "object" && value !== null) {
            const nested = collectAllPlaceholders(
                value as Record<string, unknown>,
                fullPath,
            );
            nested.forEach((placeholderSet, nestedPath) => {
                placeholders.set(nestedPath, placeholderSet);
            });
        } else if (typeof value === "string") {
            const extracted = extractPlaceholders(value);
            if (extracted.size > 0) {
                placeholders.set(fullPath, extracted);
            }
        }
    }

    return placeholders;
};

const collectStrings = (
    obj: Record<string, unknown>,
    path: string = "",
): Map<string, string> => {
    const strings = new Map<string, string>();

    for (const [key, value] of Object.entries(obj)) {
        const fullPath = path ? `${path}.${key}` : key;

        if (typeof value === "object" && value !== null) {
            collectStrings(value as Record<string, unknown>, fullPath).forEach(
                (str, nestedPath) => strings.set(nestedPath, str),
            );
        } else if (typeof value === "string") {
            strings.set(fullPath, value);
        }
    }

    return strings;
};

describe("i18n", () => {
    test("should only ship English", () => {
        expect(Object.keys(rawDict)).toEqual(["en"]);
        expect(Object.keys(dict)).toEqual(["en"]);
    });

    test("should include the default language", () => {
        expect(Object.keys(dict)).toContain(config.defaultLanguage);
    });

    test("should export the raw dictionary unchanged", () => {
        expect(rawDict.en).toEqual(dict.en);
    });

    test("should not have empty or undefined values", () => {
        expect(findEmptyValues(rawDict.en)).toEqual([]);
    });

    test("should only use well-formed placeholders", () => {
        const placeholders = collectAllPlaceholders(rawDict.en);
        const malformed: string[] = [];

        collectStrings(rawDict.en).forEach((str, path) => {
            const opening = str.split("{{").length - 1;
            const closing = str.split("}}").length - 1;
            const parsed = placeholders.get(path)?.size ?? 0;

            if (opening !== closing || (opening > 0 && parsed === 0)) {
                malformed.push(path);
            }
        });

        expect(malformed).toEqual([]);
    });

    test("should explain invoices without the BLAKE2b feature bit", () => {
        expect(dict.en.invoice_missing_blake2b).toContain("BLAKE2b");
        expect(dict.en.invoice_missing_blake2b).toContain("512");
    });
});
