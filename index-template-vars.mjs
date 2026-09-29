/* eslint-disable no-console */
import fs from "fs";
import path from "path";
import process from "process";
import { fileURLToPath } from "url";

const fileNames = Object.freeze({
    template: "index.template.html",
    output: "index.html",
});

const helpFlags = Object.freeze(["--help", "-h"]);

// Accepted for compatibility with older scripts; there is only one variant
const legacyFlags = Object.freeze(["--regular"]);

const siteUrl = "https://lightningfork.com";
const siteTitle = "Lightning Fork Swap";
const siteDescription =
    "Non-custodial swaps between the Bitcoin BLAKE2b chain and its Lightning network.";

const config = {
    siteUrl,
    siteTitle,
    siteDescription,
    themeColor: "#070b16",
    backgroundColor: "#070b16",
    accentColor: "#4e93ff",
    previewImage: `${siteUrl}/lightning-fork-swap-preview.jpg`,
    ldJson: {
        "@context": "https://schema.org",
        "@type": "WebApplication",
        name: siteTitle,
        url: siteUrl,
        image: `${siteUrl}/lightning-fork-swap-preview.jpg`,
        logo: `${siteUrl}/android-chrome-512x512.png`,
        description: siteDescription,
        applicationCategory: "FinanceApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        license: "https://www.gnu.org/licenses/agpl-3.0.html",
    },
};

function usage() {
    const scriptName = path.basename(fileURLToPath(import.meta.url));
    console.log(`
    Usage: ${scriptName}

    Generates index.html from index.template.html. The output is only
    rewritten when the template or this script is newer than it.
  `);
}

function replaceTemplateVariables(template, variables) {
    let result = template;

    // Find all variables in the template (both ${variable} and $variable patterns)
    const variablePatterns = [
        /\$\{([^}]+)\}/g, // ${variable}
        /\$([a-zA-Z_][a-zA-Z0-9_]*)/g, // $variable
    ];

    const foundVariables = new Set();

    for (const pattern of variablePatterns) {
        let match;
        while ((match = pattern.exec(template)) !== null) {
            foundVariables.add(match[1]);
        }
    }

    const undefinedVariables = [...foundVariables].filter(
        (variable) => !(variable in variables),
    );

    if (undefinedVariables.length > 0) {
        throw new Error(
            `Undefined variables found in template: ${undefinedVariables.join(", ")}`,
        );
    }

    for (const [key, value] of Object.entries(variables)) {
        // Handle both ${variable} and $variable patterns
        const regex1 = new RegExp(`\\$\\{${key}\\}`, "g");
        const regex2 = new RegExp(`\\$${key}(?![a-zA-Z0-9_])`, "g");
        result = result.replace(regex1, value);
        result = result.replace(regex2, value);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return result;
}

function validateArgs(args) {
    const unknown = args.filter((arg) => !legacyFlags.includes(arg));
    if (unknown.length > 0) {
        throw new Error(`Unknown arguments: ${unknown.join(", ")}`);
    }
}

function validateFilePaths(templatePath, outputPath) {
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
    }

    try {
        fs.accessSync(templatePath, fs.constants.R_OK);
    } catch {
        throw new Error(`Template file not readable: ${templatePath}`);
    }

    const outputDir = path.dirname(outputPath);
    try {
        fs.accessSync(outputDir, fs.constants.W_OK);
    } catch {
        throw new Error(`Output directory not writable: ${outputDir}`);
    }
}

function needsRegeneration(templatePath, outputPath, scriptPath) {
    if (!fs.existsSync(outputPath)) {
        console.log("Output file does not exist, regenerating...");
        return true;
    }

    const outputStat = fs.statSync(outputPath);

    if (fs.statSync(templatePath).mtimeMs > outputStat.mtimeMs) {
        console.log("Template is newer than output, regenerating...");
        return true;
    }

    if (fs.statSync(scriptPath).mtimeMs > outputStat.mtimeMs) {
        console.log("Generator script is newer than output, regenerating...");
        return true;
    }

    console.log("Output is up to date, skipping regeneration.");
    return false;
}

function main() {
    try {
        const args = process.argv.slice(2);

        if (args.some((arg) => helpFlags.includes(arg))) {
            usage();
            return 0;
        }

        validateArgs(args);

        const __filename = fileURLToPath(import.meta.url);
        const scriptDir = path.dirname(__filename);
        const templatePath = path.join(scriptDir, fileNames.template);
        const outputPath = path.join(scriptDir, fileNames.output);

        validateFilePaths(templatePath, outputPath);

        if (!needsRegeneration(templatePath, outputPath, __filename)) {
            return 0;
        }

        const variables = {
            ...config,
            ldJson: JSON.stringify(config.ldJson, null, 4),
        };

        const template = fs.readFileSync(templatePath, "utf8");
        if (!template || template.trim().length === 0) {
            throw new Error("Template file is empty");
        }

        fs.writeFileSync(
            outputPath,
            replaceTemplateVariables(template, variables),
            "utf8",
        );

        console.log(`Successfully generated ${outputPath}`);
        return 0;
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        console.error("Error:", errorMessage);
        return 1;
    }
}

if (
    process.argv[1] &&
    fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
    process.exit(main());
}
