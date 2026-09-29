import { sha256 } from "@noble/hashes/sha2.js";
import { hex } from "@scure/base";
import bolt11 from "bolt11";

import { getConfiguredNetwork } from "./config.ts";

export enum InvoiceType {
    Bolt11 = "bolt11",
}

const bolt11Prefixes = {
    mainnet: "lnbc",
    testnet: "lntb",
    regtest: "lnbcrt",
};

// Lightning nodes on the Bitcoin BLAKE2b chain set `option_blake2b` (feature
// bit 512, or 513 when optional) in every invoice. The chain shares the `lnbc`
// prefix with SHA256 Bitcoin, so this bit is the only thing that tells the two
// networks' invoices apart; an invoice without it cannot be paid by the service.
export const blake2bFeatureBits = [512, 513] as const;

export const missingBlake2bFeatureMessage =
    "This invoice was not made by a Lightning node on the Bitcoin BLAKE2b chain (it lacks feature bit 512). Paying it would fail.";

export class MissingBlake2bFeatureError extends Error {
    constructor() {
        super(missingBlake2bFeatureMessage);
        this.name = "MissingBlake2bFeatureError";
    }
}

export const isMissingBlake2bFeatureError = (
    value: unknown,
): value is MissingBlake2bFeatureError =>
    value instanceof MissingBlake2bFeatureError;

type Bolt11Decoded = ReturnType<typeof bolt11.decode>;

type ExtraFeatureBits = {
    start_bit: number;
    bits: boolean[];
};

const getFeatureBit = (decoded: Bolt11Decoded, bit: number): boolean => {
    const features = decoded.tags.find((tag) => tag.tagName === "feature_bits")
        ?.data as { extra_bits?: ExtraFeatureBits } | undefined;
    const extra = features?.extra_bits;
    if (extra === undefined || bit < extra.start_bit) {
        return false;
    }

    return extra.bits[bit - extra.start_bit] === true;
};

export const hasBlake2bFeature = (decoded: Bolt11Decoded): boolean =>
    blake2bFeatureBits.some((bit) => getFeatureBit(decoded, bit));

export const isInvoice = (data: string): boolean => {
    if (typeof data !== "string") {
        return false;
    }

    const value = data.toLowerCase();
    const prefix = bolt11Prefixes[getConfiguredNetwork()];
    if (
        prefix === bolt11Prefixes.mainnet &&
        value.startsWith(bolt11Prefixes.regtest)
    ) {
        return false;
    }
    // BOLT11 HRP: prefix, optional amount with multiplier, then the "1"
    // separator; prefix alone (e.g. a "lnbc@host" Lightning address) is not
    // an invoice.
    return new RegExp(`^${prefix}(\\d+[munp]?)?1.`).test(value);
};

export type DecodedInvoice = {
    type: InvoiceType;
    satoshis: number;
    preimageHash: string;
};

// Decodes a BOLT11 invoice. Throws MissingBlake2bFeatureError when the
// invoice does not come from a BLAKE2b-chain Lightning node, so every path
// that turns user input into an invoice (paste, QR scan, LNURL, Lightning
// address) refuses SHA256-chain invoices up front.
export const decodeInvoice = (invoice: string): DecodedInvoice => {
    let decoded: Bolt11Decoded;
    try {
        decoded = bolt11.decode(invoice);
    } catch (error) {
        throw new Error("invalid invoice", { cause: error });
    }

    const preimageHash = decoded.tags.find(
        (tag) => tag.tagName === "payment_hash",
    )?.data as string | undefined;
    if (preimageHash === undefined) {
        throw new Error("invalid invoice", {
            cause: new Error("missing bolt11 payment hash"),
        });
    }

    if (!hasBlake2bFeature(decoded)) {
        throw new MissingBlake2bFeatureError();
    }

    return {
        type: InvoiceType.Bolt11,
        satoshis:
            decoded.satoshis ??
            Math.round(Number(decoded.millisatoshis ?? 0) / 1_000),
        preimageHash,
    };
};

export const assertPreimageHash = (
    expectedHash: string,
    preimage: Uint8Array,
): void => {
    if (hex.encode(sha256(preimage)) !== expectedHash) {
        throw new Error("invalid preimage");
    }
};
