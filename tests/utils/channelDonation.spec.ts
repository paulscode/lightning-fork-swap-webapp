import { sha256 } from "@noble/hashes/sha2.js";

import {
    ChannelApiError,
    createChannelDonation,
    disclaimerVersion,
    donationLink,
    donationSecret,
    editChannelNode,
    getChannelDonation,
    getChannelInfo,
    isSettled,
    parseNode,
    parseOrder,
    solvePow,
    storeDonation,
    storedDonations,
} from "../../src/utils/channelDonation";

const key =
    "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
const id = "AbCdEfGhIjKlMnOpQrSt_-";
const fetchMock = vi.fn();

export const sampleOrder = (over: Record<string, unknown> = {}) => ({
    id,
    state: "awaiting_payment",
    address: "bcrt1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqc8gma6",
    node: { pubkey: key, alias: "", address: "node.example.com" },
    minSat: 1_000_310,
    maxSat: 16_777_215,
    receivedSat: 0,
    confirmedSat: 0,
    confirmationsNeeded: 3,
    createdAt: "2026-10-10T12:00:00Z",
    expiresAt: "2026-10-11T12:00:00Z",
    capacitySat: 0,
    remainderSat: 0,
    feeSat: 0,
    fundingConfirmations: 0,
    editable: true,
    timeline: [],
    ...over,
});

const info = {
    available: true,
    minSat: 1_000_310,
    maxSat: 16_777_215,
    maxWumboSat: 16_777_215,
    feeRate: 2,
    confirmations: 3,
    expiryHours: 24,
    maxPerNode: 2,
    disclaimerVersion,
    powBits: 8,
    challenge: "Y2hhbGxlbmdl",
};

const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
) => new Response(JSON.stringify(body), { status, headers });

describe("channel donations, the browser's side", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        localStorage.clear();
    });
    afterEach(() => vi.unstubAllGlobals());

    test("a node as the donor types it", () => {
        expect(parseNode(key)).toEqual({ pubkey: key, host: undefined });
        expect(
            parseNode(` ${key.toUpperCase()}@node.example.com:9736 `),
        ).toEqual({
            pubkey: key,
            host: "node.example.com:9736",
        });
        expect(parseNode(`${key}@[2a01:4f8::1]:9735`)?.host).toEqual(
            "[2a01:4f8::1]:9735",
        );
        for (const bad of [
            "",
            "02abc",
            "04" + key.slice(2),
            key + "00",
            `${key}@<script>`,
            `${key}@a b`,
        ]) {
            expect(parseNode(bad)).toBeUndefined();
        }
    });

    test("the proof of work meets the server's rule", async () => {
        for (const bits of [1, 8, 12]) {
            const nonce = await solvePow("challenge", bits);
            const h = sha256(new TextEncoder().encode(`challenge:${nonce}`));
            let zeros = 0;
            for (const b of h) {
                if (b === 0) {
                    zeros += 8;
                    continue;
                }
                zeros += Math.clz32(b) - 24;
                break;
            }
            expect(zeros).toBeGreaterThanOrEqual(bits);
        }
        const controller = new AbortController();
        controller.abort();
        await expect(solvePow("x", 30, controller.signal)).rejects.toThrow();
    });

    test("orders are shape-checked", () => {
        expect(parseOrder(sampleOrder())?.id).toEqual(id);
        for (const bad of [
            { state: "pwned" },
            { id: "../x" },
            { address: "<img src=x>" },
            { minSat: -1 },
            { node: null },
            { timeline: "x" },
        ]) {
            expect(parseOrder(sampleOrder(bad))).toBeUndefined();
        }
        expect(parseOrder(null)).toBeUndefined();
        expect(isSettled("open")).toBe(true);
        expect(isSettled("retrying")).toBe(false);
    });

    test("the numbers, or nothing when the service has none", async () => {
        fetchMock.mockResolvedValueOnce(json(info));
        await expect(getChannelInfo()).resolves.toMatchObject({
            minSat: 1_000_310,
        });
        fetchMock.mockResolvedValueOnce(json({ error: "not found" }, 404));
        await expect(getChannelInfo()).resolves.toBeUndefined();
        fetchMock.mockResolvedValueOnce(json({ ...info, powBits: 99 }));
        await expect(getChannelInfo()).resolves.toBeUndefined();
        fetchMock.mockRejectedValueOnce(new Error("offline"));
        await expect(getChannelInfo()).resolves.toBeUndefined();
    });

    test("creating one sends the terms' version and the work", async () => {
        fetchMock.mockResolvedValueOnce(
            json({ id, secret: "s".repeat(43), order: sampleOrder() }, 201),
        );
        const created = await createChannelDonation(
            `${key}@node.example.com`,
            info,
        );
        expect(created.id).toEqual(id);
        expect(created.order?.state).toEqual("awaiting_payment");
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toMatch(/\/donate\/v1\/channel-orders$/);
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        expect(body).toMatchObject({
            node: `${key}@node.example.com`,
            accepted: true,
            disclaimerVersion,
            challenge: info.challenge,
        });
        const h = sha256(
            new TextEncoder().encode(`${info.challenge}:${String(body.nonce)}`),
        );
        expect(h[0]).toEqual(0);

        fetchMock.mockResolvedValueOnce(
            json({ code: "not_public", error: "x" }, 422),
        );
        const err: unknown = await createChannelDonation(key, info).catch(
            (e: unknown) => e,
        );
        expect(err).toBeInstanceOf(ChannelApiError);
        expect((err as ChannelApiError).code).toEqual("not_public");

        fetchMock.mockResolvedValueOnce(json({ id: "bad", secret: "x" }, 201));
        await expect(createChannelDonation(key, info)).rejects.toThrow();
    });

    test("the page polls with its ETag", async () => {
        fetchMock.mockResolvedValueOnce(
            json(sampleOrder(), 200, { ETag: '"v1"' }),
        );
        const first = await getChannelDonation(id);
        expect(first.order?.state).toEqual("awaiting_payment");
        expect(first.etag).toEqual('"v1"');
        fetchMock.mockResolvedValueOnce(new Response(null, { status: 304 }));
        const second = await getChannelDonation(id, first.etag);
        expect(second.unchanged).toBe(true);
        expect(
            (fetchMock.mock.calls[1][1] as RequestInit).headers as Record<
                string,
                string
            >,
        ).toEqual({ "If-None-Match": '"v1"' });
        fetchMock.mockResolvedValueOnce(json({ code: "not_found" }, 404));
        await expect(getChannelDonation(id)).rejects.toMatchObject({
            status: 404,
        });
        await expect(getChannelDonation("../etc")).rejects.toMatchObject({
            code: "not_found",
        });
    });

    test("an edit carries the secret", async () => {
        fetchMock.mockResolvedValueOnce(json({ status: "accepted" }, 202));
        await editChannelNode(id, "secret", key);
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toMatch(new RegExp(`/channel-orders/${id}/node$`));
        expect(init.method).toEqual("PATCH");
        expect(JSON.parse(init.body as string)).toEqual({
            secret: "secret",
            node: key,
        });
    });

    test("the browser keeps its donations and their secrets", () => {
        expect(storedDonations()).toEqual([]);
        storeDonation({ id, secret: "s1", createdAt: 1 });
        storeDonation({
            id: "ZyXwVuTsRqPoNmLkJiHg_-",
            secret: "s2",
            createdAt: 2,
        });
        storeDonation({ id, secret: "s3", createdAt: 3 });
        expect(storedDonations().map((d) => d.secret)).toEqual(["s3", "s2"]);
        expect(donationSecret(id)).toEqual("s3");
        localStorage.setItem(
            "lfswap.channelDonations",
            JSON.stringify([
                { id: "x", secret: 1 },
                { id, secret: "ok", createdAt: 5 },
            ]),
        );
        expect(storedDonations()).toEqual([{ id, secret: "ok", createdAt: 5 }]);
        localStorage.setItem("lfswap.channelDonations", "{not json");
        expect(storedDonations()).toEqual([]);
        expect(donationLink(id, "sec")).toMatch(
            new RegExp(`/donate/channel/${id}#sec$`),
        );
        expect(donationLink(id)).not.toContain("#");
    });
});
