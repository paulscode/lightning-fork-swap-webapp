import { SwapType } from "boltz-swaps/types";
import log from "loglevel";

import {
    broadcastTransaction,
    getTransactionConfirmed,
    hasBlockExplorer,
} from "./blockchain";
import type { SomeSwap } from "./swapCreator";

export const claimWatchIntervalMs = 10 * 60 * 1000;

type Storage = {
    getSwaps: () => Promise<SomeSwap[]>;
    modifySwap: (
        id: string,
        mutator: (swap: SomeSwap) => void,
    ) => Promise<SomeSwap | null>;
};

/**
 * A reverse swap's claim pays the user only once it confirms; after the
 * preimage is out, the server refunds its lockup at the timeout if the
 * claim never made it (dropped from mempools, or a broadcaster that said
 * yes and did not). Until a claim confirms, it is broadcast again: the same
 * transaction, so a copy still in a mempool is merely known already.
 */
export const watchClaims = async ({ getSwaps, modifySwap }: Storage) => {
    const swaps = (await getSwaps()).filter(
        (swap) =>
            swap.type === SwapType.Reverse &&
            swap.claimTx !== undefined &&
            swap.claimConfirmed !== true &&
            hasBlockExplorer(swap.assetReceive),
    );

    for (const swap of swaps) {
        let confirmed = false;
        try {
            confirmed = await getTransactionConfirmed(
                swap.assetReceive,
                swap.claimTx!,
            );
        } catch (e) {
            // Not known to the explorer, or the explorer is down
            log.debug(`Claim ${swap.claimTx} of swap ${swap.id} not found`, e);
        }

        if (confirmed) {
            await modifySwap(swap.id, (s) => {
                s.claimConfirmed = true;
            });
            continue;
        }

        if (swap.claimTxHex === undefined) {
            continue;
        }
        try {
            await broadcastTransaction(swap.assetReceive, swap.claimTxHex);
            log.info(
                `Broadcast claim ${swap.claimTx} of swap ${swap.id} again`,
            );
        } catch (e) {
            log.debug(`Claim ${swap.claimTx} of swap ${swap.id}: ${String(e)}`);
        }
    }
};
