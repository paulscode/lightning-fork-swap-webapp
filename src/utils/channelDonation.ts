import { sha256 } from "@noble/hashes/sha2.js";

import { getApiUrl } from "./helper";

// A channel donation: coins sent to an address made for it, which the
// service tries to use to open a channel from its node to the donor's
// (best effort; see the server's donations/internal/channels).

// The version of the terms the donor accepts; the server refuses another
// one, so a page showing older terms cannot create a donation
export const disclaimerVersion = "2026-10-1";

export type ChannelInfo = {
    available: boolean;
    minSat: number;
    maxSat: number;
    feeRate: number;
    confirmations: number;
    expiryHours: number;
    maxPerNode: number;
    disclaimerVersion: string;
    powBits: number;
    challenge: string;
    openSlots?: number;
};

export type ChannelState =
    | "new"
    | "awaiting_payment"
    | "payment_seen"
    | "payment_confirmed"
    | "connecting"
    | "opening"
    | "funding_broadcast"
    | "open"
    | "retrying"
    | "needs_attention"
    | "fell_back"
    | "closed"
    | "expired"
    | "rejected";

const states = new Set<string>([
    "new",
    "awaiting_payment",
    "payment_seen",
    "payment_confirmed",
    "connecting",
    "opening",
    "funding_broadcast",
    "open",
    "retrying",
    "needs_attention",
    "fell_back",
    "closed",
    "expired",
    "rejected",
]);

export type TimelineItem = {
    at: string;
    kind: string;
    detail?: Record<string, unknown>;
};

export type ChannelOrder = {
    id: string;
    state: ChannelState;
    address: string;
    node: { pubkey: string; alias: string; address: string };
    minSat: number;
    maxSat: number;
    receivedSat: number;
    confirmedSat: number;
    confirmationsNeeded: number;
    createdAt: string;
    expiresAt: string;
    capacitySat: number;
    remainderSat: number;
    feeSat: number;
    fundingConfirmations: number;
    editable: boolean;
    timeline: TimelineItem[];
    channelPoint?: string;
    errorCode?: string;
    nextAttempt?: string;
};

// The states where nothing more happens (an open channel is still watched
// for a close, but there is nothing for the donor to wait for)
export const isSettled = (s: ChannelState) =>
    s === "open" ||
    s === "fell_back" ||
    s === "closed" ||
    s === "expired" ||
    s === "rejected";

const isNumber = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0;
const isString = (v: unknown): v is string => typeof v === "string";

export const orderIdPattern = /^[A-Za-z0-9_-]{22}$/;

// A node as the donor types it: its key, optionally @host[:port]
export type NodeInput = { pubkey: string; host?: string };

export const parseNode = (text: string): NodeInput | undefined => {
    const trimmed = text.trim();
    const at = trimmed.indexOf("@");
    const key = (at === -1 ? trimmed : trimmed.slice(0, at)).toLowerCase();
    const host = at === -1 ? undefined : trimmed.slice(at + 1);
    if (!/^0[23][0-9a-f]{64}$/.test(key)) {
        return undefined;
    }
    if (host !== undefined && !/^[A-Za-z0-9.:[\]-]{1,300}$/.test(host)) {
        return undefined;
    }
    return { pubkey: key, host: host === "" ? undefined : host };
};

export class ChannelApiError extends Error {
    constructor(
        public status: number,
        public code: string,
    ) {
        super(code);
    }
}

const call = async (
    path: string,
    init?: RequestInit,
): Promise<{ status: number; body: Record<string, unknown> | undefined }> => {
    const res = await fetch(`${getApiUrl()}/donate/v1${path}`, {
        ...init,
        signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 304) {
        return { status: 304, body: undefined };
    }
    let body: Record<string, unknown> | undefined;
    try {
        body = (await res.json()) as Record<string, unknown>;
    } catch {
        body = undefined;
    }
    if (!res.ok) {
        throw new ChannelApiError(
            res.status,
            isString(body?.code) ? body.code : "unavailable",
        );
    }
    return { status: res.status, body };
};

export const getChannelInfo = async (): Promise<ChannelInfo | undefined> => {
    try {
        const { body } = await call("/info");
        if (
            body === undefined ||
            typeof body.available !== "boolean" ||
            !isNumber(body.minSat) ||
            !isNumber(body.maxSat) ||
            !isNumber(body.feeRate) ||
            !isNumber(body.powBits) ||
            body.powBits > 32 ||
            !isString(body.challenge) ||
            !isString(body.disclaimerVersion)
        ) {
            return undefined;
        }
        return body as unknown as ChannelInfo;
    } catch {
        return undefined;
    }
};

export const parseOrder = (body: unknown): ChannelOrder | undefined => {
    if (typeof body !== "object" || body === null) {
        return undefined;
    }
    const o = body as Record<string, unknown>;
    const node = o.node as Record<string, unknown> | undefined;
    if (
        !isString(o.id) ||
        !orderIdPattern.test(o.id) ||
        !isString(o.state) ||
        !states.has(o.state) ||
        !isString(o.address) ||
        (o.address !== "" && !/^[a-zA-Z0-9]{14,100}$/.test(o.address)) ||
        typeof node !== "object" ||
        node === null ||
        !isString(node.pubkey) ||
        !isNumber(o.minSat) ||
        !isNumber(o.maxSat) ||
        !isNumber(o.receivedSat) ||
        !isNumber(o.confirmedSat) ||
        !Array.isArray(o.timeline)
    ) {
        return undefined;
    }
    return o as unknown as ChannelOrder;
};

// The browser's proof of work: a nonce whose SHA-256 with the challenge
// starts with `bits` zero bits. Yields to the page every few thousand tries
export const solvePow = async (
    challenge: string,
    bits: number,
    signal?: AbortSignal,
): Promise<string> => {
    const encoder = new TextEncoder();
    const prefix = `${challenge}:`;
    const fullBytes = Math.floor(bits / 8);
    const restMask = (0xff << (8 - (bits % 8))) & 0xff;
    for (let nonce = 0; ; nonce++) {
        if (nonce % 4000 === 0) {
            await new Promise((resolve) => setTimeout(resolve, 0));
            if (signal?.aborted) {
                throw new Error("aborted");
            }
        }
        const hash = sha256(encoder.encode(prefix + nonce));
        let ok = true;
        for (let i = 0; i < fullBytes; i++) {
            if (hash[i] !== 0) {
                ok = false;
                break;
            }
        }
        if (ok && (bits % 8 === 0 || (hash[fullBytes] & restMask) === 0)) {
            return String(nonce);
        }
    }
};

export type CreatedDonation = {
    id: string;
    secret: string;
    order?: ChannelOrder;
};

export const createChannelDonation = async (
    node: string,
    info: ChannelInfo,
    signal?: AbortSignal,
): Promise<CreatedDonation> => {
    const nonce = await solvePow(info.challenge, info.powBits, signal);
    const { body } = await call("/channel-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            node,
            accepted: true,
            disclaimerVersion,
            challenge: info.challenge,
            nonce,
        }),
    });
    if (
        !isString(body?.id) ||
        !orderIdPattern.test(body.id) ||
        !isString(body.secret) ||
        body.secret.length < 20
    ) {
        throw new ChannelApiError(500, "unavailable");
    }
    return { id: body.id, secret: body.secret, order: parseOrder(body.order) };
};

// The order page polls with the last ETag: unchanged is 304, no body
export const getChannelDonation = async (
    id: string,
    etag?: string,
): Promise<{ order?: ChannelOrder; etag?: string; unchanged: boolean }> => {
    if (!orderIdPattern.test(id)) {
        throw new ChannelApiError(404, "not_found");
    }
    const res = await fetch(`${getApiUrl()}/donate/v1/channel-orders/${id}`, {
        headers: etag ? { "If-None-Match": etag } : {},
        signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 304) {
        return { unchanged: true, etag };
    }
    if (!res.ok) {
        let code = "unavailable";
        try {
            const b = (await res.json()) as Record<string, unknown>;
            code = isString(b.code) ? b.code : code;
        } catch {
            // keep "unavailable"
        }
        throw new ChannelApiError(res.status, code);
    }
    const order = parseOrder(await res.json());
    if (order === undefined) {
        throw new ChannelApiError(500, "unavailable");
    }
    return {
        order,
        etag: res.headers.get("ETag") ?? undefined,
        unchanged: false,
    };
};

export const editChannelNode = async (
    id: string,
    secret: string,
    node: string,
): Promise<void> => {
    await call(`/channel-orders/${id}/node`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret, node }),
    });
};

// The donations this browser made (their secrets let it change the node).
// Nothing else about them is stored here
export type StoredDonation = { id: string; secret: string; createdAt: number };

const storageKey = "lfswap.channelDonations";

export const storedDonations = (): StoredDonation[] => {
    try {
        const list = JSON.parse(
            localStorage.getItem(storageKey) ?? "[]",
        ) as unknown;
        if (!Array.isArray(list)) {
            return [];
        }
        return list.filter(
            (d): d is StoredDonation =>
                typeof d === "object" &&
                d !== null &&
                isString((d as StoredDonation).id) &&
                orderIdPattern.test((d as StoredDonation).id) &&
                isString((d as StoredDonation).secret) &&
                isNumber((d as StoredDonation).createdAt),
        );
    } catch {
        return [];
    }
};

export const storeDonation = (d: StoredDonation) => {
    const list = storedDonations().filter((x) => x.id !== d.id);
    list.unshift(d);
    localStorage.setItem(storageKey, JSON.stringify(list.slice(0, 50)));
};

export const donationSecret = (id: string): string | undefined =>
    storedDonations().find((d) => d.id === id)?.secret;

// The link a donor keeps: the page, and the secret in the fragment (never
// sent to a server)
export const donationLink = (id: string, secret?: string) =>
    `${window.location.origin}/donate/channel/${id}${secret ? `#${secret}` : ""}`;
