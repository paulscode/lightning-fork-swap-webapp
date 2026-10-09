import { SwapType } from "boltz-swaps/types";

import { BTC, LN } from "../../src/consts/Assets";
import {
    broadcastTransaction,
    getTransactionConfirmed,
} from "../../src/utils/blockchain";
import { watchClaims } from "../../src/utils/claimWatcher";
import type { SomeSwap } from "../../src/utils/swapCreator";

vi.mock("../../src/utils/blockchain", () => ({
    broadcastTransaction: vi.fn(),
    getTransactionConfirmed: vi.fn(),
    hasBlockExplorer: vi.fn(() => true),
}));

const claimTx = "c".repeat(64);
const reverse = {
    id: "rev",
    type: SwapType.Reverse,
    assetSend: LN,
    assetReceive: BTC,
    claimTx,
    claimTxHex: "claimhex",
} as unknown as SomeSwap;

const run = async (swaps: SomeSwap[]) => {
    const stored = new Map(swaps.map((s) => [s.id, { ...s }]));
    await watchClaims({
        getSwaps: () => Promise.resolve([...stored.values()]),
        modifySwap: (id, mutator) => {
            const swap = stored.get(id)!;
            mutator(swap);
            return Promise.resolve(swap);
        },
    });
    return stored;
};

describe("watchClaims", () => {
    beforeEach(() => {
        vi.mocked(broadcastTransaction).mockReset();
        vi.mocked(getTransactionConfirmed).mockReset();
    });

    test("marks a confirmed claim and stops there", async () => {
        vi.mocked(getTransactionConfirmed).mockResolvedValue(true);

        const stored = await run([reverse]);

        expect(stored.get("rev")!.claimConfirmed).toEqual(true);
        expect(broadcastTransaction).not.toHaveBeenCalled();
    });

    test.each([
        ["in a mempool", () => Promise.resolve(false)],
        ["unknown to the explorer", () => Promise.reject(new Error("404"))],
    ])("broadcasts a claim %s again", async (_, status) => {
        vi.mocked(getTransactionConfirmed).mockImplementation(status);
        vi.mocked(broadcastTransaction).mockRejectedValue("txn-already-known");

        const stored = await run([reverse]);

        expect(broadcastTransaction).toHaveBeenCalledWith(BTC, "claimhex");
        expect(stored.get("rev")!.claimConfirmed).toBeUndefined();
    });

    test("leaves swaps without a claim, confirmed claims and submarine swaps", async () => {
        await run([
            { ...reverse, id: "a", claimTx: undefined },
            { ...reverse, id: "b", claimConfirmed: true },
            { ...reverse, id: "c", type: SwapType.Submarine },
        ] as SomeSwap[]);

        expect(getTransactionConfirmed).not.toHaveBeenCalled();
        expect(broadcastTransaction).not.toHaveBeenCalled();
    });

    test("only checks a claim it has no transaction of", async () => {
        vi.mocked(getTransactionConfirmed).mockResolvedValue(false);

        await run([{ ...reverse, claimTxHex: undefined }]);

        expect(getTransactionConfirmed).toHaveBeenCalledTimes(1);
        expect(broadcastTransaction).not.toHaveBeenCalled();
    });
});
