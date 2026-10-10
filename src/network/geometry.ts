// The sky's shapes, as plain numbers (no WebGL): channel curves, node
// sizes and colours, and the lightning arc's jagged path. Deterministic,
// so a channel keeps its curve from one version of the graph to the next.

export type Vec3 = [number, number, number];

// A small, fast seeded generator (mulberry32)
export const random = (seed: number) => {
    let s = seed >>> 0;
    return () => {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const length = (a: Vec3) => Math.sqrt(dot(a, a));
const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const normalize = (a: Vec3): Vec3 => {
    const l = length(a);
    return l < 1e-9 ? [0, 0, 0] : scale(a, 1 / l);
};

// The control points of a channel's curve: bowed sideways by its seed and
// gently away from the centre of the sky, more for longer channels
export const controlPoints = (a: Vec3, b: Vec3, seed: number): [Vec3, Vec3] => {
    const dir = sub(b, a);
    const len = length(dir);
    const rng = random(seed);
    // A direction across the channel, from the seed
    const axis = normalize(dir);
    let other: Vec3 = Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const u = normalize(cross(axis, other));
    other = cross(axis, u);
    const angle = rng() * Math.PI * 2;
    const side = add(scale(u, Math.cos(angle)), scale(other, Math.sin(angle)));
    const bend = len * (0.08 + 0.14 * rng());
    const mid = scale(add(a, b), 0.5);
    const outward = scale(normalize(mid), len * 0.1);
    const offset = add(scale(side, bend), outward);
    return [
        add(add(a, scale(dir, 1 / 3)), offset),
        add(add(a, scale(dir, 2 / 3)), offset),
    ];
};

// segments+1 points along the curve, flat [x, y, z, ...]
export const curvePoints = (
    a: Vec3,
    b: Vec3,
    seed: number,
    segments: number,
): Float32Array => {
    const [c1, c2] = controlPoints(a, b, seed);
    const out = new Float32Array((segments + 1) * 3);
    for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const m = 1 - t;
        const w0 = m * m * m;
        const w1 = 3 * m * m * t;
        const w2 = 3 * m * t * t;
        const w3 = t * t * t;
        for (let k = 0; k < 3; k++) {
            out[i * 3 + k] = w0 * a[k] + w1 * c1[k] + w2 * c2[k] + w3 * b[k];
        }
    }
    return out;
};

// Radius from capacity: volume grows with capacity (cube root), clamped so
// small nodes stay visible and big ones do not swallow the sky
export const nodeRadius = (capacitySat: number, unit = 0.04) => {
    const r = unit * Math.cbrt(Math.max(0, capacitySat) / 1_000_000);
    return Math.min(0.6, Math.max(0.06, r));
};

const hex = (c: string): Vec3 => {
    const m = /^#([0-9a-f]{6})$/i.exec(c);
    const v = m ? parseInt(m[1], 16) : 0x3399ff;
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
};

// A node's gossip colour, pulled most of the way to the sky's blue-white
export const nodeColor = (gossip: string, ours = false): Vec3 => {
    const palette: Vec3 = ours ? [1, 1, 1] : [0.61, 0.78, 1];
    const c = hex(gossip);
    return [0, 1, 2].map((k) => palette[k] * 0.7 + c[k] * 0.3) as Vec3;
};

// Smooth noise in one dimension (value noise), and a few octaves of it
const noise1 = (x: number, seed: number) => {
    const i = Math.floor(x);
    const f = x - i;
    const h = (n: number) =>
        random((n * 374761393 + seed * 668265263) >>> 0)() * 2 - 1;
    const s = f * f * (3 - 2 * f);
    return h(i) * (1 - s) + h(i + 1) * s;
};

export const fbm = (x: number, seed: number) =>
    noise1(x, seed) * 0.6 +
    noise1(x * 2.3, seed + 7) * 0.3 +
    noise1(x * 5.1, seed + 13) * 0.1;

// The lightning arc: the curve's points pushed off it by noise that moves
// with time, pinned at both ends (it leaves one node and strikes the other)
export const arcPoints = (
    curve: Float32Array,
    time: number,
    seed: number,
    amplitude: number,
): Float32Array => {
    const n = curve.length / 3;
    const out = new Float32Array(curve.length);
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const envelope = Math.sin(Math.PI * t);
        const x = t * 9 + time * 7;
        for (let k = 0; k < 3; k++) {
            out[i * 3 + k] =
                curve[i * 3 + k] + fbm(x, seed * 3 + k) * amplitude * envelope;
        }
    }
    return out;
};
