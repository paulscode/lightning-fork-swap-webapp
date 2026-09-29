import {
    type BoltzSwapsConfigInput,
    getBoltzApiUrl,
    getBoltzSwapsConfig,
    getConfiguredNetwork,
    setBoltzSwapsConfig,
} from "boltz-swaps/config";
import { afterEach, describe, expect, test } from "vitest";

describe("boltz-swaps config defaults", () => {
    afterEach(() => {
        setBoltzSwapsConfig({});
    });

    test("round-trips a configured statusSource", () => {
        const statusSource = { subscribe: () => () => {}, close: () => {} };
        setBoltzSwapsConfig({ statusSource });

        expect(getBoltzSwapsConfig().statusSource).toBe(statusSource);
    });

    test("exposes an undefined statusSource when unset", () => {
        setBoltzSwapsConfig({});

        expect(getBoltzSwapsConfig().statusSource).toBeUndefined();
    });

    test("defaults the network to mainnet and honours an override", () => {
        setBoltzSwapsConfig({});
        expect(getConfiguredNetwork()).toBe("mainnet");

        setBoltzSwapsConfig({ network: "regtest" });
        expect(getConfiguredNetwork()).toBe("regtest");
    });

    test("re-reads a live getter on every call", () => {
        let current = "https://first.example";
        const input: BoltzSwapsConfigInput = {
            get boltzApiUrl() {
                return current;
            },
        };
        setBoltzSwapsConfig(input);

        expect(getBoltzApiUrl()).toBe("https://first.example");

        current = "https://second.example";

        expect(getBoltzApiUrl()).toBe("https://second.example");
    });
});
