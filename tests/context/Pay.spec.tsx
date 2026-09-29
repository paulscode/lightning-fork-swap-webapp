import { render } from "@solidjs/testing-library";
import type * as ClientModule from "boltz-swaps/client";
import { getReverseTransaction } from "boltz-swaps/client";
import { SwapType } from "boltz-swaps/types";
import type * as UtxoModule from "boltz-swaps/utxo";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BTC, LN } from "../../src/consts/Assets";
import {
    swapStatusPending,
    swapStatusSuccess,
} from "../../src/consts/SwapStatus";
import type { PayContextType } from "../../src/context/Pay";
import { getTransactionOutSpend } from "../../src/utils/blockchain";
import {
    claim,
    createSubmarineSignature,
    findSwapOutputVout,
} from "../../src/utils/claim";
import type {
    ReverseSwap,
    SomeSwap,
    SubmarineSwap,
} from "../../src/utils/swapCreator";
import { pairs as testPairs } from "../pairs";

const getSwap = vi.fn<(id: string) => Promise<SomeSwap | null>>();
const getSwaps = vi.fn((): Promise<SomeSwap[]> => Promise.resolve([]));
const notify = vi.fn();
const deriveKey = vi.fn();
const modifySwapStorage = vi.fn();
const pairs = vi.fn();
const zeroConf = vi.fn(() => false);

vi.mock("../../src/context/Global", () => ({
    useGlobalContext: () => ({
        t: (key: string) => key,
        deriveKey,
        getSwap,
        getSwaps,
        privacyMode: () => false,
        notify,
        pairs,
        modifySwapStorage,
        zeroConf,
    }),
}));

vi.mock("../../src/utils/claim", () => ({
    claim: vi.fn(),
    createSubmarineSignature: vi.fn(),
    findSwapOutputVout: vi.fn(),
}));

vi.mock("../../src/utils/blockchain", () => ({
    getTransactionOutSpend: vi.fn(),
}));

vi.mock("boltz-swaps/client", async (importOriginal) => ({
    ...(await importOriginal<typeof ClientModule>()),
    getReverseTransaction: vi.fn(),
}));

vi.mock("boltz-swaps/utxo", async (importOriginal) => ({
    ...(await importOriginal<typeof UtxoModule>()),
    parseTransaction: vi.fn(() => ({})),
}));

const { PayProvider, usePayContext } = await import("../../src/context/Pay");

const reverseSwap = {
    id: "reverse-1",
    type: SwapType.Reverse,
    assetSend: LN,
    assetReceive: BTC,
    receiveAmount: 991,
} as unknown as ReverseSwap;

const submarineSwap = {
    id: "submarine-1",
    type: SwapType.Submarine,
    assetSend: BTC,
    assetReceive: LN,
    receiveAmount: 100_000,
} as unknown as SubmarineSwap;

const lockup = { id: "lockuptxid", hex: "lockuphex" };

const confirmedData = (id = reverseSwap.id) => ({
    id,
    status: swapStatusPending.TransactionConfirmed,
    transaction: { ...lockup },
});

const lockQueues = new Map<string, Promise<unknown>>();
const requestLock = <T,>(name: string, callback: () => Promise<T>) => {
    const previous = lockQueues.get(name) ?? Promise.resolve();
    const current = previous.then(callback);
    lockQueues.set(
        name,
        current.catch(() => undefined),
    );
    return current;
};

let stored: Record<string, SomeSwap>;

const renderPayContext = () => {
    let context!: PayContextType;
    const Child = () => {
        context = usePayContext();
        return null;
    };
    render(() => (
        <PayProvider>
            <Child />
        </PayProvider>
    ));
    return context;
};

describe("PayProvider claimSwap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        lockQueues.clear();
        Object.defineProperty(navigator, "locks", {
            configurable: true,
            value: { request: vi.fn(requestLock) },
        });
        zeroConf.mockReturnValue(false);
        pairs.mockReturnValue(testPairs);

        stored = {
            [reverseSwap.id]: { ...reverseSwap },
            [submarineSwap.id]: { ...submarineSwap },
        };
        getSwap.mockImplementation((id) =>
            Promise.resolve(stored[id] ? { ...stored[id] } : null),
        );
        modifySwapStorage.mockImplementation(
            (id: string, mutator: (swap: SomeSwap) => void) => {
                if (stored[id] === undefined) {
                    return Promise.resolve(null);
                }
                const swap = { ...stored[id] };
                mutator(swap);
                stored[id] = swap;
                return Promise.resolve(swap);
            },
        );
        vi.mocked(claim).mockImplementation((_deriveKey, swap) =>
            Promise.resolve({ ...swap, claimTx: "claimtxid" }),
        );
    });

    describe("reverse swaps", () => {
        test("claims a confirmed lockup and persists the claim transaction", async () => {
            const context = renderPayContext();
            context.setSwap({ ...reverseSwap });

            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(claim).toHaveBeenCalledTimes(1);
            expect(claim).toHaveBeenCalledWith(
                deriveKey,
                expect.objectContaining({ id: reverseSwap.id }),
                lockup,
                true,
            );
            expect(stored[reverseSwap.id].claimTx).toEqual("claimtxid");
            expect(context.swap()?.claimTx).toEqual("claimtxid");
            expect(context.isSwapClaiming(reverseSwap.id)).toEqual(false);
            expect(notify).toHaveBeenCalledWith("success", "swap_completed");
        });

        test("does not claim swaps that already have a claim transaction", async () => {
            stored[reverseSwap.id] = {
                ...reverseSwap,
                claimTx: "existing",
            } as SomeSwap;

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(claim).not.toHaveBeenCalled();
            expect(notify).not.toHaveBeenCalled();
        });

        test("does nothing for unknown swaps", async () => {
            const context = renderPayContext();
            await context.claimSwap("unknown", confirmedData("unknown"));

            expect(claim).not.toHaveBeenCalled();
            expect(notify).not.toHaveBeenCalled();
        });

        test("does not claim a mempool lockup without zero-conf", async () => {
            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, {
                ...confirmedData(),
                status: swapStatusPending.TransactionMempool,
            });

            expect(getReverseTransaction).not.toHaveBeenCalled();
            expect(claim).not.toHaveBeenCalled();
        });

        test("fetches the lockup and claims a mempool lockup with zero-conf", async () => {
            zeroConf.mockReturnValue(true);
            vi.mocked(getReverseTransaction).mockResolvedValue({
                id: "fetched",
                hex: "fetchedhex",
                timeoutBlockHeight: 123,
            });

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, {
                id: reverseSwap.id,
                status: swapStatusPending.TransactionMempool,
            });

            expect(getReverseTransaction).toHaveBeenCalledWith(reverseSwap.id);
            expect(claim).toHaveBeenCalledWith(
                deriveKey,
                expect.objectContaining({ id: reverseSwap.id }),
                expect.objectContaining({ hex: "fetchedhex" }),
                true,
            );
        });

        test("fetches the lockup of settled swaps that were never claimed", async () => {
            vi.mocked(getReverseTransaction).mockResolvedValue({
                id: "fetched",
                hex: "fetchedhex",
                timeoutBlockHeight: 123,
            });

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, {
                id: reverseSwap.id,
                status: swapStatusSuccess.InvoiceSettled,
            });

            expect(getReverseTransaction).toHaveBeenCalledWith(reverseSwap.id);
            expect(claim).toHaveBeenCalledTimes(1);
            expect(stored[reverseSwap.id].claimTx).toEqual("claimtxid");
        });

        test("refuses to claim with an invalid persisted receive amount", async () => {
            stored[reverseSwap.id] = {
                ...reverseSwap,
                receiveAmount: 0,
            } as SomeSwap;

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(claim).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledWith("error", "claim_fail");
            expect(context.isSwapClaiming(reverseSwap.id)).toEqual(false);
        });

        test("notifies when claiming fails", async () => {
            vi.mocked(claim).mockRejectedValue(new Error("broadcast failed"));

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(notify).toHaveBeenCalledWith("error", "claim_fail");
            expect(stored[reverseSwap.id].claimTx).toBeUndefined();
        });

        test("marks the swap as claiming while the claim is in flight", async () => {
            let finishClaim!: () => void;
            const claimPending = new Promise<void>((resolve) => {
                finishClaim = resolve;
            });
            vi.mocked(claim).mockImplementation(async (_deriveKey, swap) => {
                await claimPending;
                return { ...swap, claimTx: "claimtxid" };
            });

            const context = renderPayContext();
            const claiming = context.claimSwap(reverseSwap.id, confirmedData());
            await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
            expect(context.isSwapClaiming(reverseSwap.id)).toEqual(true);

            // A second delivery while claiming is ignored
            await context.claimSwap(reverseSwap.id, confirmedData());
            expect(claim).toHaveBeenCalledTimes(1);

            finishClaim();
            await claiming;

            expect(context.isSwapClaiming(reverseSwap.id)).toEqual(false);
            expect(claim).toHaveBeenCalledTimes(1);
        });

        test("records the claim of a lockup that was already spent", async () => {
            vi.mocked(claim).mockRejectedValue(
                "bad-txns-inputs-missingorspent",
            );
            vi.mocked(findSwapOutputVout).mockReturnValue(0);
            vi.mocked(getTransactionOutSpend).mockResolvedValue({
                spent: true,
                txid: "spendingtxid",
            });

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(getTransactionOutSpend).toHaveBeenCalledWith(
                BTC,
                lockup.id,
                0,
            );
            expect(stored[reverseSwap.id].claimTx).toEqual("spendingtxid");
            expect(notify).not.toHaveBeenCalled();
        });

        test("notifies when a missing input is not actually spent", async () => {
            vi.mocked(claim).mockRejectedValue(
                "bad-txns-inputs-missingorspent",
            );
            vi.mocked(findSwapOutputVout).mockReturnValue(0);
            vi.mocked(getTransactionOutSpend).mockResolvedValue({
                spent: false,
            });

            const context = renderPayContext();
            await context.claimSwap(reverseSwap.id, confirmedData());

            expect(stored[reverseSwap.id].claimTx).toBeUndefined();
            expect(notify).toHaveBeenCalledWith("error", "claim_fail");
        });
    });

    describe("submarine swaps", () => {
        const claimPendingData = {
            id: submarineSwap.id,
            status: swapStatusPending.TransactionClaimPending,
        };

        test("signs the cooperative claim", async () => {
            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, claimPendingData);

            expect(createSubmarineSignature).toHaveBeenCalledWith(
                deriveKey,
                expect.objectContaining({ id: submarineSwap.id }),
            );
            expect(claim).not.toHaveBeenCalled();
            expect(notify).toHaveBeenCalledWith("success", "swap_completed");
        });

        test("does not sign for other statuses", async () => {
            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, {
                id: submarineSwap.id,
                status: swapStatusPending.TransactionMempool,
            });

            expect(createSubmarineSignature).not.toHaveBeenCalled();
        });

        test("does not sign swaps below the pair minimum", async () => {
            stored[submarineSwap.id] = {
                ...submarineSwap,
                receiveAmount: 1_000,
            } as SomeSwap;

            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, claimPendingData);

            expect(createSubmarineSignature).not.toHaveBeenCalled();
        });

        test("does not sign without pair data", async () => {
            pairs.mockReturnValue(undefined);

            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, claimPendingData);

            expect(createSubmarineSignature).not.toHaveBeenCalled();
        });

        test("stays quiet when the server does not want a signature", async () => {
            vi.mocked(createSubmarineSignature).mockRejectedValue(
                "swap not eligible for a cooperative claim",
            );

            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, claimPendingData);

            expect(notify).not.toHaveBeenCalled();
        });

        test("notifies when signing fails", async () => {
            vi.mocked(createSubmarineSignature).mockRejectedValue(
                new Error("invalid preimage"),
            );

            const context = renderPayContext();
            await context.claimSwap(submarineSwap.id, claimPendingData);

            expect(notify).toHaveBeenCalledWith(
                "error",
                "creating cooperative signature for submarine swap claim failed",
            );
        });
    });

    test("claims pending swaps when zero-conf gets enabled", async () => {
        zeroConf.mockReturnValue(true);
        stored[reverseSwap.id] = {
            ...reverseSwap,
            status: swapStatusPending.TransactionMempool,
        } as SomeSwap;
        getSwaps.mockResolvedValue([
            stored[reverseSwap.id],
            { ...submarineSwap, status: swapStatusPending.TransactionMempool },
        ] as SomeSwap[]);
        vi.mocked(getReverseTransaction).mockResolvedValue({
            id: "fetched",
            hex: "fetchedhex",
            timeoutBlockHeight: 123,
        });

        renderPayContext();

        await vi.waitFor(() => expect(claim).toHaveBeenCalledTimes(1));
        expect(getReverseTransaction).toHaveBeenCalledWith(reverseSwap.id);
        expect(createSubmarineSignature).not.toHaveBeenCalled();
    });
});
