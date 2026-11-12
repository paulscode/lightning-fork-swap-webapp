import { getFeeEstimations } from "boltz-swaps/client";
import { Explorer } from "boltz-swaps/types";
import log from "loglevel";

import { config } from "../config";
import { BTC } from "../consts/Assets";
import { getFeeEstimations as getFeeEstimationsFromExplorer } from "./blockchain";
import { formatError } from "./errors";

// HTLCs are time sensitive, so we need to add a floor to the fee estimations
const feeFloors = {
    [BTC]: 2,
};

const blockExplorerFeePriority = [Explorer.Mempool, Explorer.Esplora];

const priorityOfBlockExplorer = (id: Explorer) => {
    const idx = blockExplorerFeePriority.indexOf(id);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
};

const getExplorerFeeEstimations = async (asset: string) => {
    const apis = config.assets?.[asset]?.blockExplorerApis ?? [];
    for (const api of [...apis].sort(
        (a, b) => priorityOfBlockExplorer(a.id) - priorityOfBlockExplorer(b.id),
    )) {
        log.debug(`trying to get ${asset} fee estimations from ${api.id}`);

        try {
            const feeEstimation = await getFeeEstimationsFromExplorer(api);
            if (typeof feeEstimation !== "number") {
                throw new Error(`invalid response`);
            }

            return addFloor(asset, feeEstimation);
        } catch (e) {
            log.warn(
                `failed to get fee estimations via ${api.id} API for ${asset}: ${formatError(e)}`,
            );
        }
    }

    throw new Error(`could not get fallback fee estimations for ${asset}`);
};

const addFloor = (asset: string, fee: number) => {
    const floor = feeFloors[asset as keyof typeof feeFloors];
    if (floor) {
        return Math.max(floor, fee);
    }

    return fee;
};

export const getFeeEstimationsFailover = async (asset: string) => {
    try {
        const feeEstimations = await getFeeEstimations();
        const fee = feeEstimations[asset];
        if (typeof fee !== "number" || !Number.isFinite(fee) || fee <= 0) {
            throw new Error(`invalid fee estimation: ${String(fee)}`);
        }
        // The same floor as the explorer's: a refund below it never relays
        return addFloor(asset, fee);
    } catch (e) {
        log.warn(
            `failed to get fee estimations via the API for ${asset}: ${formatError(e)}`,
        );
    }

    return await getExplorerFeeEstimations(asset);
};

// Below this no node relays a transaction
const relayFloorRate = 1;

const explorerFeeRate = async (asset: string): Promise<number> => {
    const apis = config.assets?.[asset]?.blockExplorerApis ?? [];
    for (const api of [...apis].sort(
        (a, b) => priorityOfBlockExplorer(a.id) - priorityOfBlockExplorer(b.id),
    )) {
        try {
            const fee = await getFeeEstimationsFromExplorer(api);
            if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
                return fee;
            }
        } catch (e) {
            log.warn(`no fee rate from ${api.id}: ${formatError(e)}`);
        }
    }
    throw new Error(`no fee rate from an explorer for ${asset}`);
};

// The least rate a reverse swap's claim pays, so that it relays once the
// preimage is out: the explorer's (it does not belong to the swap's
// server), else the API's, never under the relay floor. A server that
// leaves the claim less than that cannot get a claim stuck.
export const minClaimFeeRate = async (asset: string): Promise<number> => {
    let rate: number | undefined;
    try {
        rate = await explorerFeeRate(asset);
    } catch {
        try {
            const fee = (await getFeeEstimations())[asset];
            if (typeof fee === "number" && Number.isFinite(fee) && fee > 0) {
                rate = fee;
            }
        } catch (e) {
            log.warn(`no fee rate for the claim: ${formatError(e)}`);
        }
    }
    return Math.max(relayFloorRate, rate ?? relayFloorRate);
};
