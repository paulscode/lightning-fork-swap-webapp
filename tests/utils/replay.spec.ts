import { getReplayVerdict, isFinalVerdict } from "../../src/utils/replay";

const txid = "a".repeat(64);
const fetchMock = vi.fn();

describe("replay verdicts", () => {
    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    test("a verdict from the donations API", async () => {
        fetchMock.mockResolvedValue(
            new Response(
                JSON.stringify({
                    verdict: "at_risk",
                    atRiskAddresses: ["bc1qdonorsaddress000"],
                }),
            ),
        );
        await expect(getReplayVerdict(txid)).resolves.toEqual({
            verdict: "at_risk",
            atRiskAddresses: ["bc1qdonorsaddress000"],
        });
        expect(fetchMock.mock.calls[0][0]).toMatch(
            new RegExp(`/donate/v1/replay/${txid}$`),
        );
    });

    test.each([
        ["an unknown verdict", { verdict: "maybe", atRiskAddresses: [] }],
        ["no address list", { verdict: "at_risk" }],
        [
            "an address that is markup",
            { verdict: "at_risk", atRiskAddresses: ["<img src=x>"] },
        ],
    ])("nothing for %s", async (_, body) => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
        await expect(getReplayVerdict(txid)).resolves.toBeUndefined();
    });

    test("nothing when the API is down or the id is not a txid", async () => {
        fetchMock.mockRejectedValue(new Error("down"));
        await expect(getReplayVerdict(txid)).resolves.toBeUndefined();
        fetchMock.mockResolvedValue(new Response("", { status: 404 }));
        await expect(getReplayVerdict(txid)).resolves.toBeUndefined();
        await expect(getReplayVerdict("../x")).resolves.toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test("final verdicts", () => {
        expect(isFinalVerdict("replayed")).toBe(true);
        expect(isFinalVerdict("at_risk")).toBe(false);
        expect(isFinalVerdict("pending")).toBe(false);
    });
});
