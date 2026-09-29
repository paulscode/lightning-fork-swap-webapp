import type { Transaction as BtcTransaction } from "@scure/btc-signer";
import { equalBytes } from "@scure/btc-signer/utils.js";
import {
    type UtxoNetwork,
    decodeAddress as utxoDecodeAddress,
    getNetwork as utxoGetNetwork,
} from "boltz-swaps/utxo";

import { config } from "../config";
import { BTC, LN } from "../consts/Assets";
import { extractAddress, extractInvoice, isInvoice, isLnurl } from "./invoice";

const possibleUserInputTypes = [LN, BTC];

// The asset argument is kept for call-site readability; BTC is the only
// on-chain asset
const decodeAddress = (_asset: string, addr: string) =>
    utxoDecodeAddress(addr, config.network as UtxoNetwork);

const getNetwork = (_asset?: string, network?: string) =>
    utxoGetNetwork((network ?? config.network) as UtxoNetwork);

const validateAddress = (asset: string, addr: string): boolean => {
    try {
        decodeAddress(asset, addr);
        return true;
    } catch {
        return false;
    }
};

const probeUserInputOption = (asset: string, input: string): boolean => {
    if (asset === LN) {
        const invoice = extractInvoice(input) ?? "";
        return isLnurl(invoice) || isInvoice(invoice);
    }

    try {
        decodeAddress(asset, extractAddress(input));
        return true;
    } catch {
        return false;
    }
};

const probeUserInput = (
    expectedAsset: string,
    input: string,
): string | null => {
    if (typeof input !== "string") {
        return null;
    }

    if (expectedAsset !== "" && probeUserInputOption(expectedAsset, input)) {
        return expectedAsset;
    }

    for (const asset of possibleUserInputTypes) {
        if (probeUserInputOption(asset, input)) {
            return asset;
        }
    }

    return null;
};

const findOutputByScript = (tx: BtcTransaction, targetScript: Uint8Array) => {
    for (let i = 0; i < tx.outputsLength; i++) {
        const out = tx.getOutput(i);
        if (out.script && equalBytes(out.script, targetScript)) {
            return out;
        }
    }
    return undefined;
};

export {
    findOutputByScript,
    validateAddress,
    getNetwork,
    decodeAddress,
    probeUserInput,
};
