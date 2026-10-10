import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";

import { curvePoints, grownPoints } from "../../src/network/geometry";
import { writeLine } from "../../src/network/sky";

describe("the storm's arcs", () => {
    // three.js draws an instanced line with the number of segments it had
    // when first drawn: an arc must keep all of them as it grows
    test("growing an arc keeps its buffer and every segment", () => {
        const curve = curvePoints([0, 0, 0], [6, 1, 0], 9, 20);
        const geometry = new LineGeometry();
        geometry.setPositions(Array.from(curve));
        const buffer = geometry.getAttribute("instanceStart");
        expect(geometry.instanceCount).toEqual(20);
        for (const shown of [2, 5, 13, 21]) {
            writeLine(geometry, grownPoints(curve, shown));
            expect(geometry.getAttribute("instanceStart")).toBe(buffer);
            expect(geometry.instanceCount).toEqual(20);
        }
        // Fully grown, the last segment ends at the far node
        const data = (buffer as unknown as { data: { array: Float32Array } })
            .data.array;
        expect(
            Array.from(data.slice(-3)).map((v) => Math.round(v * 1e5) / 1e5),
        ).toEqual([6, 1, 0]);
    });
});
