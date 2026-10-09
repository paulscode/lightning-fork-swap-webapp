import { render } from "@solidjs/testing-library";
import type * as BoltzClientModule from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";

import { BTC } from "../../src/consts/Assets";
import type { SomeSwap } from "../../src/utils/swapCreator";

const { getPairsMock } = vi.hoisted(() => ({
    getPairsMock: vi.fn<typeof BoltzClientModule.getPairs>(),
}));

vi.mock("../../packages/boltz-swaps/src/client.ts", async () => {
    const actual = await vi.importActual<typeof BoltzClientModule>(
        "../../packages/boltz-swaps/src/client.ts",
    );

    return {
        ...actual,
        getPairs: getPairsMock,
    };
});

vi.mock("../../src/utils/migration", () => ({
    migrateStorage: vi.fn().mockResolvedValue(undefined),
}));

const { GlobalProvider, useGlobalContext } =
    await import("../../src/context/Global");

const emptyPairs = {
    [SwapType.Submarine]: {},
    [SwapType.Reverse]: {},
} as unknown as Awaited<ReturnType<typeof BoltzClientModule.getPairs>>;

describe("Global context", () => {
    let globalSignals: ReturnType<typeof useGlobalContext>;

    const Probe = () => {
        globalSignals = useGlobalContext();
        return null;
    };

    beforeEach(() => {
        getPairsMock.mockReset();
    });

    afterEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    describe("pair fetching", () => {
        test("fetchPairs stores the pairs and marks the backend online", async () => {
            getPairsMock.mockResolvedValue(emptyPairs);

            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));

            globalSignals.setOnline(false);
            await globalSignals.fetchPairs();

            expect(getPairsMock).toHaveBeenCalledTimes(1);
            expect(getPairsMock).toHaveBeenCalledWith();
            expect(globalSignals.pairs()).toEqual(emptyPairs);
            expect(globalSignals.online()).toBe(true);
        });

        test("fetchPairs marks the backend offline and throws on failure", async () => {
            getPairsMock.mockRejectedValue(new Error("backend down"));

            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));

            await expect(globalSignals.fetchPairs()).rejects.toEqual(
                "backend down",
            );
            expect(globalSignals.online()).toBe(false);
            expect(globalSignals.pairs()).toBeUndefined();
        });
    });

    describe("embeddedMode", () => {
        test("defaults to false when initialEmbeddedMode is not provided", () => {
            getPairsMock.mockResolvedValue(emptyPairs);

            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));

            expect(globalSignals.embeddedMode()).toBe(false);
        });

        test("seeds from initialEmbeddedMode prop when true", () => {
            getPairsMock.mockResolvedValue(emptyPairs);

            render(() => (
                <GlobalProvider initialEmbeddedMode={true}>
                    <Probe />
                </GlobalProvider>
            ));

            expect(globalSignals.embeddedMode()).toBe(true);
        });

        test("setter toggles the signal", () => {
            getPairsMock.mockResolvedValue(emptyPairs);

            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));

            expect(globalSignals.embeddedMode()).toBe(false);
            globalSignals.setEmbeddedMode(true);
            expect(globalSignals.embeddedMode()).toBe(true);
        });
    });

    describe("swap storage", () => {
        const renderProvider = () => {
            getPairsMock.mockResolvedValue(emptyPairs);
            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));
        };

        const storeSwap = (id: string, status: string) =>
            globalSignals.setSwapStorage({ id, status } as unknown as SomeSwap);

        test("modifySwapStorage applies the mutator and persists", async () => {
            renderProvider();
            await storeSwap("s1", "a");

            const updated = await globalSignals.modifySwapStorage("s1", (s) => {
                (s as unknown as { status: string }).status = "b";
            });

            expect(
                (updated as unknown as { status: string } | null)?.status,
            ).toBe("b");
            const stored = await globalSignals.getSwap<{ status: string }>(
                "s1",
            );
            expect(stored?.status).toBe("b");
        });

        test("modifySwapStorage returns null for a missing swap", async () => {
            renderProvider();
            const result = await globalSignals.modifySwapStorage(
                "missing",
                () => {},
            );
            expect(result).toBeNull();
        });

        test("updateSwapStatus persists through the lock and reports changes", async () => {
            renderProvider();
            await storeSwap("s2", "old");

            expect(await globalSignals.updateSwapStatus("s2", "new")).toBe(
                true,
            );
            const stored = await globalSignals.getSwap<{ status: string }>(
                "s2",
            );
            expect(stored?.status).toBe("new");

            expect(await globalSignals.updateSwapStatus("s2", "new")).toBe(
                false,
            );
        });

        test("updateSwapStatus returns false for a missing swap", async () => {
            renderProvider();
            expect(await globalSignals.updateSwapStatus("nope", "x")).toBe(
                false,
            );
        });
    });

    describe("keys across tabs", () => {
        const renderProvider = () => {
            getPairsMock.mockResolvedValue(emptyPairs);
            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));
        };

        test("newKey continues from an index another tab used", async () => {
            renderProvider();
            const first = await globalSignals.newKey(BTC);
            // Another tab handed out indexes up to 6 meanwhile
            localStorage.setItem("lastUsedKey", "7");

            const second = await globalSignals.newKey(BTC);

            expect(first.index).toEqual(0);
            expect(second.index).toEqual(7);
            expect(localStorage.getItem("lastUsedKey")).toEqual("8");
        });
    });

    describe("persistent storage", () => {
        test("asks once, when a swap is first stored", async () => {
            const persist = vi.fn(() => Promise.resolve(true));
            const persisted = vi.fn(() => Promise.resolve(false));
            Object.defineProperty(navigator, "storage", {
                value: { persist, persisted },
                configurable: true,
            });
            getPairsMock.mockResolvedValue(emptyPairs);
            render(() => (
                <GlobalProvider>
                    <Probe />
                </GlobalProvider>
            ));
            expect(persist).not.toHaveBeenCalled();

            await globalSignals.setSwapStorage({ id: "a" } as SomeSwap);
            await globalSignals.setSwapStorage({ id: "b" } as SomeSwap);
            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(persist).toHaveBeenCalledTimes(1);
        });
    });
});
