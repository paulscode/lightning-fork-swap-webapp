import { sha256 } from "@noble/hashes/sha2.js";
import { HDKey } from "@scure/bip32";
import {
    generateMnemonic,
    mnemonicToSeedSync,
    validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

import type { AssetType } from "../consts/Assets";

export enum Errors {
    InvalidFile = "invalid file",
    NotAllElementsHaveAnId = "not all elements have an id",
    InvalidMnemonic = "invalid mnemonic",
}

export type RescueFile = {
    mnemonic: string;
};

// Same derivation as Boltz, so a rescue key works with both
export const derivationPath = "m/44/0/0/0";

const getPath = (index: number) => `${derivationPath}/${index}`;

export const mnemonicToHDKey = (mnemonic: string) =>
    HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic));

export const getXpub = (rescueFile: RescueFile) => {
    return mnemonicToHDKey(rescueFile.mnemonic).publicExtendedKey;
};

export const generateRescueFile = (): RescueFile => ({
    mnemonic: generateMnemonic(wordlist),
});

export const deriveKey = (
    rescueFile: RescueFile,
    index: number,
    // Kept for call-site symmetry; all assets share one derivation path
    _asset?: AssetType,
    hdKey?: HDKey,
) => {
    if (!hdKey) {
        return mnemonicToHDKey(rescueFile.mnemonic).derive(getPath(index));
    }
    return hdKey.derive(getPath(index));
};

export const validateRescueFile = (
    data: Record<string, string | object | number | boolean>,
): RescueFile => {
    if (!("mnemonic" in data)) {
        throw Errors.InvalidFile;
    }

    if (!validateMnemonic(data.mnemonic as string, wordlist)) {
        throw Errors.InvalidMnemonic;
    }

    getXpub(data as RescueFile);

    return data as RescueFile;
};

export const derivePreimage = (privateKey: Uint8Array): Uint8Array =>
    sha256(privateKey);

export const derivePreimageFromRescueKey = (
    rescueKey: RescueFile,
    keyIndex: number,
    asset: AssetType,
    hdKey?: HDKey,
): Uint8Array => {
    const privateKey = deriveKey(rescueKey, keyIndex, asset, hdKey).privateKey;
    if (privateKey === null) {
        throw new Error("missing private key for preimage derivation");
    }

    return derivePreimage(privateKey);
};
