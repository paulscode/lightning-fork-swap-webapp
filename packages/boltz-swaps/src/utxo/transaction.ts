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

export const constructClaim = (
    utxos: ClaimDetails[],
    destinationScript: Uint8Array,
    fee: number,
    isRbf?: boolean,
) => constructClaimTransaction(utxos, destinationScript, BigInt(fee), isRbf);

export const constructRefund = (
    refundDetails: RefundDetails[],
    outputScript: Uint8Array,
    timeoutBlockHeight: number,
    feePerVbyte: number,
    isRbf: boolean,
) =>
    targetFee(feePerVbyte, (fee) =>
        constructRefundTransaction(
            refundDetails,
            outputScript,
            timeoutBlockHeight,
            fee,
            isRbf,
        ),
    );

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
