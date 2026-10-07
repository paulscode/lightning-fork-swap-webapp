import { hex } from "@scure/base";
import {
    Address,
    Transaction as BtcTransaction,
    OutScript,
} from "@scure/btc-signer";
import type { TransactionOutput } from "@scure/btc-signer/psbt.js";
import type { BTC_NETWORK } from "@scure/btc-signer/utils.js";
import {
    type ClaimDetails,
    Networks,
    type RefundDetails,
    constructClaimTransaction,
    constructRefundTransaction,
    targetFee,
} from "boltz-core";

export type UtxoNetwork = "mainnet" | "testnet" | "regtest";

export type DecodedAddress = { script: Uint8Array };

export type TransactionInterface = BtcTransaction;

// The Bitcoin BLAKE2b chain uses the same address and transaction formats as
// Bitcoin, so the Bitcoin network parameters apply unchanged.
export const getNetwork = (network: UtxoNetwork): BTC_NETWORK => {
    switch (network) {
        case "mainnet":
            return Networks.bitcoin;
        case "testnet":
            return Networks.testnet;
        case "regtest":
            return Networks.regtest;
        default:
            throw new Error(`unknown network: ${String(network)}`);
    }
};

export const decodeAddress = (
    addr: string,
    network: UtxoNetwork,
): DecodedAddress => {
    const btcAddr = Address(getNetwork(network));
    const decoded = btcAddr.decode(addr);
    if (decoded === undefined) {
        throw new Error(`could not decode address: ${addr}`);
    }
    return { script: OutScript.encode(decoded) };
};

export const parseTransaction = (hexStr: string): BtcTransaction =>
    BtcTransaction.fromRaw(hex.decode(hexStr), {
        allowUnknownOutputs: true,
        allowUnknownInputs: true,
    });

// The fee rate and the amounts a claim or refund is built from come from the
// API or an explorer. Whatever they say, a transaction never gives more than
// this to miners: 10 % of what it spends, or 3,000 sat for a small swap.
export const maxFeeRate = 1_000; // sat/vbyte
export const maxFee = (inputSum: number): number =>
    Math.max(3_000, Math.floor(inputSum / 10));

export const assertFeeWithinLimit = (fee: number, inputSum: number) => {
    if (!Number.isFinite(fee) || fee < 0) {
        throw new Error(`invalid fee: ${fee}`);
    }
    if (fee > maxFee(inputSum)) {
        throw new Error(
            `fee of ${fee} sat would exceed the limit of ${maxFee(inputSum)} sat for ${inputSum} sat`,
        );
    }
};

const inputSumOf = (details: { amount: bigint | number }[]): number => {
    const sum = details.reduce(
        (total, detail) => total + Number(detail.amount),
        0,
    );
    if (!Number.isFinite(sum)) {
        throw new Error("inputs without an amount");
    }
    return sum;
};

export const constructClaim = (
    utxos: ClaimDetails[],
    destinationScript: Uint8Array,
    fee: number,
    isRbf?: boolean,
) => {
    assertFeeWithinLimit(fee, inputSumOf(utxos as never));
    return constructClaimTransaction(
        utxos,
        destinationScript,
        BigInt(fee),
        isRbf,
    );
};

export const constructRefund = (
    refundDetails: RefundDetails[],
    outputScript: Uint8Array,
    timeoutBlockHeight: number,
    feePerVbyte: number,
    isRbf: boolean,
) => {
    if (
        typeof feePerVbyte !== "number" ||
        !Number.isFinite(feePerVbyte) ||
        feePerVbyte <= 0 ||
        feePerVbyte > maxFeeRate
    ) {
        throw new Error(`invalid fee rate: ${String(feePerVbyte)} sat/vbyte`);
    }

    const inputSum = inputSumOf(refundDetails as never);
    return targetFee(feePerVbyte, (fee) => {
        assertFeeWithinLimit(Number(fee), inputSum);
        return constructRefundTransaction(
            refundDetails,
            outputScript,
            timeoutBlockHeight,
            fee,
            isRbf,
        );
    });
};

export const getOutputAmount = (output: TransactionOutput): number =>
    Number(output.amount);

export const txToHex = (transaction: TransactionInterface): string =>
    transaction.hex;

export const txToId = (transaction: TransactionInterface): string =>
    transaction.id;

export const setCooperativeWitness = (
    tx: TransactionInterface,
    index: number,
    witness: Uint8Array,
) => {
    tx.updateInput(index, {
        finalScriptWitness: [witness],
    });
};
