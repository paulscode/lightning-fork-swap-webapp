import { getApiUrl } from "./helper";

// What the donation watcher found about a donation transaction: whether it
// could also be valid on the SHA256 chain, where it would move the donor's
// coins there to our address (see the server's replay checks)
export type ReplayVerdict = {
    verdict:
        | "pending"
        | "protected"
        | "at_risk"
        | "twin_moved"
        | "replayed"
        | "unknown";
    // The donor's addresses whose coins on the SHA256 chain are at risk
    atRiskAddresses: string[];
};

const verdicts = new Set([
    "pending",
    "protected",
    "at_risk",
    "twin_moved",
    "replayed",
    "unknown",
]);

// Final verdicts need no more asking
export const isFinalVerdict = (v: ReplayVerdict["verdict"]) =>
    v === "protected" || v === "twin_moved" || v === "replayed";

export const getReplayVerdict = async (
    txid: string,
): Promise<ReplayVerdict | undefined> => {
    if (!/^[0-9a-f]{64}$/.test(txid)) {
        return undefined;
    }
    try {
        const res = await fetch(`${getApiUrl()}/donate/v1/replay/${txid}`, {
            signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
            return undefined;
        }
        const body = (await res.json()) as Record<string, unknown>;
        if (
            typeof body.verdict !== "string" ||
            !verdicts.has(body.verdict) ||
            !Array.isArray(body.atRiskAddresses) ||
            !body.atRiskAddresses.every(
                (a) => typeof a === "string" && /^[a-zA-Z0-9]{14,100}$/.test(a),
            )
        ) {
            return undefined;
        }
        return {
            verdict: body.verdict as ReplayVerdict["verdict"],
            atRiskAddresses: body.atRiskAddresses as string[],
        };
    } catch {
        // The donations service may be down or not deployed: no verdict
        return undefined;
    }
};
