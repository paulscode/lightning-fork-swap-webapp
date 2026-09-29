import { hex } from "@scure/base";

import {
    type ReverseCreatedResponse,
    broadcastApiTransaction,
    getReverseTransaction,
} from "./client.ts";
import { getConfiguredNetwork } from "./config.ts";
import type { ECKeys } from "./utxo/index.ts";

export type ReverseExecuteArgs<A extends string = string> = {
    createdSwap: ReverseCreatedResponse;
    to: A;
    preimage: string;
    // Net amount to the claim address; the gap to the gross lockup funds the fee.
    receiveAmount: number;
    claimAddress: string;
    claimKeys?: ECKeys;
    cooperative?: boolean;
};

export type ReverseExecuteResult = {
    claimTransactionId: string;
    receiveAmount?: bigint;
};

const stripHexPrefix = (value: string): string =>
    value.startsWith("0x") ? value.slice(2) : value;

export const executeReverseSwap = async <A extends string = string>(
    args: ReverseExecuteArgs<A>,
): Promise<ReverseExecuteResult> => {
    const {
        createdSwap,
        to,
        preimage,
        receiveAmount,
        claimAddress,
        claimKeys,
        cooperative,
    } = args;

    if (claimKeys === undefined) {
        throw new Error(
            `executeReverseSwap: UTXO destination "${to}" requires claimKeys`,
        );
    }
    if (createdSwap.refundPublicKey === undefined) {
        throw new Error(
            `reverse swap ${createdSwap.id} is missing a refundPublicKey for a UTXO claim`,
        );
    }

    const { hex: lockupTxHex } = await getReverseTransaction(createdSwap.id);

    // Dynamic import keeps the optional UTXO peer deps out of the main entry.
    const { claimReverseUtxo } = await import("./utxo/claim.ts");
    const result = await claimReverseUtxo({
        id: createdSwap.id,
        network: getConfiguredNetwork(),
        serverPublicKey: createdSwap.refundPublicKey,
        swapTree: createdSwap.swapTree as never,
        claimKeys,
        preimage: hex.decode(stripHexPrefix(preimage)),
        claimAddress,
        receiveAmount,
        lockupTxHex,
        cooperative,
    });

    await broadcastApiTransaction(to, result.transactionHex);
    return {
        claimTransactionId: result.transactionId,
        receiveAmount: BigInt(receiveAmount),
    };
};
