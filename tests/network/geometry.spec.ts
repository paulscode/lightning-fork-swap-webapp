import {
    arcPoints,
    controlPoints,
    curvePoints,
    fbm,
    grownPoints,
    nodeColor,
    nodeRadius,
    random,
} from "../../src/network/geometry";

describe("the sky's shapes", () => {
    test("a channel keeps its curve: same seed, same points", () => {
        const a: [number, number, number] = [0, 0, 0];
        const b: [number, number, number] = [4, 1, -2];
        expect(curvePoints(a, b, 42, 10)).toEqual(curvePoints(a, b, 42, 10));
        expect(curvePoints(a, b, 42, 10)).not.toEqual(
            curvePoints(a, b, 43, 10),
        );
    });

    test("curves start and end at their nodes and bow off the line", () => {
        const a: [number, number, number] = [1, 2, 3];
        const b: [number, number, number] = [5, -1, 0];
        const pts = curvePoints(a, b, 7, 16);
        expect(Array.from(pts.slice(0, 3))).toEqual(a);
        expect(
            Array.from(pts.slice(-3)).map((v) => Math.round(v * 1e6) / 1e6),
        ).toEqual(b);
        const mid = Array.from(pts.slice(8 * 3, 8 * 3 + 3));
        const straight = [3, 0.5, 1.5];
        const off = Math.hypot(...mid.map((v, k) => v - straight[k]));
        const len = Math.hypot(4, -3, -3);
        expect(off).toBeGreaterThan(len * 0.03);
        expect(off).toBeLessThan(len * 0.4);
        const [c1, c2] = controlPoints(a, b, 7);
        expect(c1.every(Number.isFinite) && c2.every(Number.isFinite)).toBe(
            true,
        );
        // A zero-length channel does not break it
        expect(curvePoints(a, a, 1, 4).every(Number.isFinite)).toBe(true);
    });

    test("radius grows with capacity, within bounds", () => {
        expect(nodeRadius(0)).toEqual(0.06);
        expect(nodeRadius(10_000_000)).toBeGreaterThan(nodeRadius(1_000_000));
        expect(nodeRadius(1e15)).toEqual(0.6);
        // Volume, not radius, follows capacity
        expect(nodeRadius(8e8) / nodeRadius(1e8)).toBeCloseTo(2, 5);
    });

    test("colours stay in the sky's palette; ours is white-hot", () => {
        const red = nodeColor("#ff0000");
        expect(red[2]).toBeGreaterThan(red[0] * 0.9);
        expect(nodeColor("not a colour")).toEqual(nodeColor("#3399ff"));
        expect(nodeColor("#000000", true)[0]).toBeCloseTo(0.7);
        for (const c of [
            red,
            nodeColor("#123456"),
            nodeColor("#ffffff", true),
        ]) {
            expect(c.every((v) => v >= 0 && v <= 1)).toBe(true);
        }
    });

    test("the arc is jagged but pinned to both nodes", () => {
        const curve = curvePoints([0, 0, 0], [6, 0, 0], 3, 20);
        const arc = arcPoints(curve, 1.5, 3, 0.4);
        expect(Array.from(arc.slice(0, 3))).toEqual(
            Array.from(curve.slice(0, 3)),
        );
        expect(
            Math.abs(arc[arc.length - 3] - curve[curve.length - 3]),
        ).toBeLessThan(1e-6);
        let moved = 0;
        for (let i = 3; i < arc.length - 3; i++) {
            moved = Math.max(moved, Math.abs(arc[i] - curve[i]));
        }
        expect(moved).toBeGreaterThan(0.01);
        expect(moved).toBeLessThanOrEqual(0.4);
        // And it moves with time
        expect(arcPoints(curve, 2, 3, 0.4)).not.toEqual(arc);
    });

    test("seeded randomness and noise are repeatable and bounded", () => {
        const r1 = random(5);
        const r2 = random(5);
        const a = [r1(), r1(), r1()];
        expect([r2(), r2(), r2()]).toEqual(a);
        expect(a.every((v) => v >= 0 && v < 1)).toBe(true);
        for (let x = 0; x < 20; x += 0.37) {
            expect(Math.abs(fbm(x, 9))).toBeLessThanOrEqual(1);
        }
    });

    test("an arc grown part way keeps all its points, the rest on its tip", () => {
        const curve = curvePoints([0, 0, 0], [5, 0, 0], 1, 10);
        const part = grownPoints(curve, 4);
        expect(part.length).toEqual(curve.length);
        expect(Array.from(part.slice(0, 12))).toEqual(
            Array.from(curve.slice(0, 12)),
        );
        for (let i = 4; i <= 10; i++) {
            expect(Array.from(part.slice(i * 3, i * 3 + 3))).toEqual(
                Array.from(curve.slice(9, 12)),
            );
        }
        expect(grownPoints(curve, 99)).toEqual(curve);
        expect(Array.from(grownPoints(curve, 0).slice(-3))).toEqual([0, 0, 0]);
    });
});
