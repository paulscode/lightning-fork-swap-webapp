// The Lightning Fork sky: the network as stars in deep night, its channels
// faint filaments, and on selection a discharge of lightning along the
// selected node's channels. three.js, loaded only with this module.
import {
    AdditiveBlending,
    BackSide,
    BufferAttribute,
    BufferGeometry,
    Color,
    InstancedMesh,
    LineBasicMaterial,
    LineSegments,
    Matrix4,
    Mesh,
    MeshBasicMaterial,
    PerspectiveCamera,
    Points,
    Raycaster,
    Scene,
    ShaderMaterial,
    SphereGeometry,
    Vector2,
    Vector3,
    WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

import type { GraphMeta, NodeInfo, Tile } from "./data";
import {
    type Vec3,
    arcPoints,
    curvePoints,
    nodeColor,
    nodeRadius,
    random,
} from "./geometry";

export type SkyOptions = {
    reducedMotion: boolean;
    onSelect?: (pubkey: string) => void;
    onHover?: (pubkey: string | undefined) => void;
};

export type Sky = {
    select: (pubkey: string, info?: NodeInfo) => void;
    home: () => void;
    zoom: (factor: number) => void;
    resize: () => void;
    dispose: () => void;
    // Screen positions of nodes for labels: [pubkey, alias, x, y][]
    labels: () => [string, string, number, number][];
};

// The sky's scale: the generator's unit is about one channel's length
const spread = 6;
const segments = 20;

type NodeEntry = {
    index: number;
    pos: Vec3;
    alias: string;
    cap: number;
    color: string;
};

const starfield = (
    count: number,
    radius: number,
    size: number,
    seed: number,
) => {
    const rng = random(seed);
    const pos = new Float32Array(count * 3);
    const tint = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // Uniform on a thick shell
        const u = rng() * 2 - 1;
        const phi = rng() * Math.PI * 2;
        const r = radius * (0.7 + 0.3 * rng());
        const s = Math.sqrt(1 - u * u);
        pos.set([r * s * Math.cos(phi), r * u, r * s * Math.sin(phi)], i * 3);
        const warm = rng() < 0.15;
        tint.set(warm ? [1, 0.9, 0.8] : [0.75 + 0.25 * rng(), 0.85, 1], i * 3);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(pos, 3));
    geometry.setAttribute("color", new BufferAttribute(tint, 3));
    const material = new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexColors: true,
        uniforms: { size: { value: size }, time: { value: 0 } },
        vertexShader: `
            uniform float size;
            uniform float time;
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
                vColor = color;
                vTwinkle = 0.75 + 0.25 * sin(time * 1.3 + position.x * 12.7 + position.y * 3.1);
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * (300.0 / -mv.z);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            varying vec3 vColor;
            varying float vTwinkle;
            void main() {
                float d = length(gl_PointCoord - 0.5);
                float a = smoothstep(0.5, 0.0, d);
                gl_FragColor = vec4(vColor * vTwinkle, a * 0.8);
            }`,
    });
    return new Points(geometry, material);
};

const nebula = () =>
    new Mesh(
        new SphereGeometry(600, 32, 16),
        new ShaderMaterial({
            side: BackSide,
            depthWrite: false,
            uniforms: { time: { value: 0 } },
            vertexShader: `
                varying vec3 vDir;
                void main() {
                    vDir = normalize(position);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }`,
            fragmentShader: `
                uniform float time;
                varying vec3 vDir;
                float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
                float noise(vec3 p) {
                    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
                    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
                                      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
                                      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
                    return n;
                }
                void main() {
                    vec3 p = vDir * 2.5 + vec3(time * 0.004, 0.0, 0.0);
                    float n = noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15;
                    float band = smoothstep(0.55, 0.0, abs(vDir.y + 0.15));
                    float cloud = smoothstep(0.45, 0.9, n) * (0.35 + 0.65 * band);
                    vec3 deep = vec3(0.008, 0.016, 0.04);
                    vec3 indigo = vec3(0.10, 0.07, 0.26);
                    vec3 blue = vec3(0.05, 0.12, 0.32);
                    vec3 c = deep + cloud * mix(indigo, blue, noise(p * 1.7)) * 0.9;
                    gl_FragColor = vec4(c, 1.0);
                }`,
        }),
    );

const haloMaterial = () =>
    new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        vertexColors: true,
        uniforms: { scale: { value: 1 } },
        vertexShader: `
            attribute float size;
            uniform float scale;
            varying vec3 vColor;
            void main() {
                vColor = color;
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                gl_PointSize = size * scale * (600.0 / -mv.z);
                gl_Position = projectionMatrix * mv;
            }`,
        fragmentShader: `
            varying vec3 vColor;
            void main() {
                float d = length(gl_PointCoord - 0.5) * 2.0;
                float core = exp(-d * d * 18.0);
                float glow = exp(-d * 3.5) * 0.45;
                gl_FragColor = vec4(vColor * (core + glow), core + glow);
            }`,
    });

export const createSky = (
    canvas: HTMLCanvasElement,
    meta: GraphMeta,
    tile: Tile,
    options: SkyOptions,
): Sky => {
    const phone = Math.min(window.innerWidth, window.innerHeight) < 600;
    const renderer = new WebGLRenderer({
        canvas,
        antialias: !phone,
        powerPreference: "high-performance",
    });
    renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, phone ? 1.5 : 2),
    );
    const scene = new Scene();
    scene.background = new Color(0x02040a);
    const camera = new PerspectiveCamera(55, 1, 0.05, 2000);
    camera.position.set(0, 4, 14);

    const backdrop = nebula();
    scene.add(backdrop);
    const stars = [
        starfield(phone ? 600 : 1400, 380, 1.4, 1),
        starfield(phone ? 300 : 700, 220, 1.8, 2),
        starfield(phone ? 80 : 160, 120, 2.6, 3),
    ];
    stars.forEach((s) => scene.add(s));

    // --- nodes ---
    const nodes = new Map<string, NodeEntry>();
    const count = tile.nodes.ids.length;
    const all = tile.nodes.ids.concat(tile.refs.ids);
    const posOf = (i: number): Vec3 => {
        const src = i < count ? tile.nodes.pos : tile.refs.pos;
        const j = (i < count ? i : i - count) * 3;
        return [src[j] * spread, src[j + 1] * spread, src[j + 2] * spread];
    };
    for (let i = 0; i < count; i++) {
        nodes.set(tile.nodes.ids[i], {
            index: i,
            pos: posOf(i),
            alias: tile.nodes.alias[i],
            cap: tile.nodes.cap[i],
            color: tile.nodes.color[i],
        });
    }
    const sphere = new SphereGeometry(1, 20, 14);
    const cores = new InstancedMesh(
        sphere,
        new MeshBasicMaterial({ color: 0xffffff }),
        count,
    );
    // Larger, invisible spheres to click: small stars stay easy to pick
    const targets = new InstancedMesh(
        sphere,
        new MeshBasicMaterial({ visible: false }),
        count,
    );
    const haloPos = new Float32Array(count * 3);
    const haloColor = new Float32Array(count * 3);
    const haloSize = new Float32Array(count);
    const m = new Matrix4();
    const radii: number[] = [];
    for (let i = 0; i < count; i++) {
        const p = posOf(i);
        const ours = tile.nodes.ids[i] === meta.ours.pubkey;
        const r = nodeRadius(tile.nodes.cap[i]) * (ours ? 1.3 : 1);
        radii.push(r);
        m.makeScale(r, r, r).setPosition(p[0], p[1], p[2]);
        cores.setMatrixAt(i, m);
        const c = nodeColor(tile.nodes.color[i], ours);
        cores.setColorAt(i, new Color(c[0], c[1], c[2]));
        m.makeScale(
            Math.max(r * 2.5, 0.35),
            Math.max(r * 2.5, 0.35),
            Math.max(r * 2.5, 0.35),
        ).setPosition(p[0], p[1], p[2]);
        targets.setMatrixAt(i, m);
        haloPos.set(p, i * 3);
        haloColor.set(c, i * 3);
        haloSize[i] = r * (ours ? 6 : 5);
    }
    scene.add(cores, targets);
    const haloGeometry = new BufferGeometry();
    haloGeometry.setAttribute("position", new BufferAttribute(haloPos, 3));
    haloGeometry.setAttribute("color", new BufferAttribute(haloColor, 3));
    haloGeometry.setAttribute("size", new BufferAttribute(haloSize, 1));
    const halos = new Points(haloGeometry, haloMaterial());
    scene.add(halos);

    // --- idle channels: one batch of faint curves ---
    const edges = tile.edges;
    const curves: Float32Array[] = [];
    const linePos = new Float32Array(edges.a.length * segments * 2 * 3);
    const lineColor = new Float32Array(edges.a.length * segments * 2 * 3);
    for (let e = 0; e < edges.a.length; e++) {
        const curve = curvePoints(
            posOf(edges.a[e]),
            posOf(edges.b[e]),
            edges.seed[e],
            segments,
        );
        curves.push(curve);
        const brightness =
            0.25 + 0.2 * Math.min(1, Math.log10(1 + edges.cap[e] / 1e6) / 2);
        for (let s = 0; s < segments; s++) {
            const o = (e * segments + s) * 6;
            linePos.set(curve.subarray(s * 3, s * 3 + 6), o);
            for (let k = 0; k < 2; k++) {
                lineColor.set(
                    [0.32 * brightness, 0.5 * brightness, 1 * brightness],
                    o + k * 3,
                );
            }
        }
    }
    const lineGeometry = new BufferGeometry();
    lineGeometry.setAttribute("position", new BufferAttribute(linePos, 3));
    lineGeometry.setAttribute("color", new BufferAttribute(lineColor, 3));
    const filaments = new LineSegments(
        lineGeometry,
        new LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.45,
            blending: AdditiveBlending,
            depthWrite: false,
        }),
    );
    scene.add(filaments);
    // Channels by node, for the storm
    const byNode = new Map<string, number[]>();
    for (let e = 0; e < edges.a.length; e++) {
        for (const end of [edges.a[e], edges.b[e]]) {
            const key = all[end];
            const list = byNode.get(key) ?? [];
            list.push(e);
            byNode.set(key, list);
        }
    }

    // --- post: bloom ---
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.75, 0.5, 0.22);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // --- controls ---
    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.zoomToCursor = true;
    controls.minDistance = 1;
    controls.maxDistance = 300;
    let lastInput = performance.now();
    const touched = () => {
        lastInput = performance.now();
        controls.autoRotate = false;
    };
    controls.addEventListener("start", touched);

    // --- the storm ---
    type Arc = {
        line: Line2;
        curve: Float32Array;
        seed: number;
        start: number;
        neighbour: number;
    };
    let arcs: Arc[] = [];
    let selected: string | undefined;
    let selectedAt = 0;
    const arcMaterial = new LineMaterial({
        color: 0xcfe3ff,
        linewidth: phone ? 2 : 2.6,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        worldUnits: false,
    });
    const flight = {
        from: new Vector3(),
        to: new Vector3(),
        camFrom: new Vector3(),
        camTo: new Vector3(),
        start: -1,
    };

    const clearArcs = () => {
        for (const a of arcs) {
            scene.remove(a.line);
            a.line.geometry.dispose();
        }
        arcs = [];
    };

    const select = (pubkey: string, info?: NodeInfo) => {
        const node = nodes.get(pubkey);
        if (node === undefined) {
            return;
        }
        selected = pubkey;
        selectedAt = performance.now();
        clearArcs();
        // The channels to draw: all of the node's, from its full record
        // when there is one (far ends may be outside this file)
        let list = (byNode.get(pubkey) ?? []).map((e) => ({
            curve: edges.a[e] === node.index ? curves[e] : reverse(curves[e]),
            seed: edges.seed[e],
            cap: edges.cap[e],
            other: edges.a[e] === node.index ? edges.b[e] : edges.a[e],
        }));
        if (info !== undefined) {
            const have = new Set(list.map((c) => all[c.other]));
            for (const [peer, cap] of info.channels) {
                const other = nodes.get(peer);
                if (other && !have.has(peer)) {
                    list.push({
                        curve: curvePoints(
                            node.pos,
                            other.pos,
                            cap >>> 0,
                            segments,
                        ),
                        seed: cap >>> 0,
                        cap,
                        other: other.index,
                    });
                    have.add(peer);
                }
            }
        }
        list = list.sort((a, b) => b.cap - a.cap).slice(0, 150);
        list.forEach((c, i) => {
            const geometry = new LineGeometry();
            geometry.setPositions(Array.from(c.curve));
            const line = new Line2(geometry, arcMaterial);
            line.computeLineDistances();
            line.visible = false;
            scene.add(line);
            arcs.push({
                line,
                curve: c.curve,
                seed: c.seed,
                start: options.reducedMotion ? 0 : 250 + i * 30,
                neighbour: c.other,
            });
        });
        // Fly to frame it (or cut, with reduced motion)
        const target = new Vector3(...node.pos);
        let reach = 2;
        for (const a of arcs) {
            reach = Math.max(
                reach,
                new Vector3(...posOf(a.neighbour)).distanceTo(target),
            );
        }
        const dir = camera.position.clone().sub(controls.target).normalize();
        flight.from.copy(controls.target);
        flight.to.copy(target);
        flight.camFrom.copy(camera.position);
        flight.camTo.copy(
            target
                .clone()
                .add(dir.multiplyScalar(Math.min(60, reach * 2.2 + 3))),
        );
        flight.start = options.reducedMotion ? -1 : performance.now();
        if (options.reducedMotion) {
            controls.target.copy(flight.to);
            camera.position.copy(flight.camTo);
        }
    };

    // --- picking ---
    const raycaster = new Raycaster();
    const pointer = new Vector2();
    const pick = (event: PointerEvent): string | undefined => {
        const rect = canvas.getBoundingClientRect();
        pointer.set(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1,
        );
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObject(targets, false)[0];
        return hit?.instanceId !== undefined
            ? tile.nodes.ids[hit.instanceId]
            : undefined;
    };
    let downAt: [number, number] | undefined;
    const onDown = (e: PointerEvent) => {
        downAt = [e.clientX, e.clientY];
        touched();
    };
    const onUp = (e: PointerEvent) => {
        if (
            downAt &&
            Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6
        ) {
            const key = pick(e);
            if (key !== undefined) {
                options.onSelect?.(key);
            }
        }
        downAt = undefined;
    };
    let hovered: string | undefined;
    const onMove = (e: PointerEvent) => {
        if (e.pointerType !== "mouse") {
            return;
        }
        const key = pick(e);
        if (key !== hovered) {
            hovered = key;
            canvas.style.cursor = key ? "pointer" : "grab";
            options.onHover?.(key);
        }
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);

    // --- the loop ---
    let visible = true;
    let frame = 0;
    let running = true;
    const observer = new IntersectionObserver((entries) => {
        visible = entries.some((e) => e.isIntersecting);
    });
    observer.observe(canvas);
    const ease = (t: number) =>
        t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
    const tmp = new Matrix4();
    const crackle = random(7);
    let nextCrackle = 0;

    const render = (now: number) => {
        if (!running) {
            return;
        }
        frame = requestAnimationFrame(render);
        if (!visible || document.visibilityState === "hidden") {
            return;
        }
        const t = now / 1000;
        (backdrop.material as ShaderMaterial).uniforms.time.value = t;
        stars.forEach((s, i) => {
            s.rotation.y = t * 0.004 * (i + 1);
            (s.material as ShaderMaterial).uniforms.time.value =
                options.reducedMotion ? 0 : t;
        });
        if (flight.start >= 0) {
            const k = Math.min(1, (now - flight.start) / 800);
            const e = ease(k);
            controls.target.lerpVectors(flight.from, flight.to, e);
            camera.position.lerpVectors(flight.camFrom, flight.camTo, e);
            if (k >= 1) {
                flight.start = -1;
            }
        }
        if (
            !options.reducedMotion &&
            now - lastInput > 20_000 &&
            flight.start < 0
        ) {
            controls.autoRotate = true;
            controls.autoRotateSpeed = 0.35;
        }
        // The selected node charges; arcs leave in a staggered burst, then
        // a random one crackles now and then
        const since = now - selectedAt;
        if (selected !== undefined) {
            const node = nodes.get(selected)!;
            const pulse = options.reducedMotion
                ? 1.25
                : 1.15 +
                  0.25 * Math.max(0, 1 - since / 600) +
                  0.05 * Math.sin(t * 9);
            const r = radii[node.index] * pulse;
            tmp.makeScale(r, r, r).setPosition(
                node.pos[0],
                node.pos[1],
                node.pos[2],
            );
            cores.setMatrixAt(node.index, tmp);
            cores.instanceMatrix.needsUpdate = true;
        }
        if (
            !options.reducedMotion &&
            arcs.length > 0 &&
            now > nextCrackle &&
            since > 1500
        ) {
            const a = arcs[Math.floor(crackle() * arcs.length)];
            a.start = since + 0;
            nextCrackle = now + 500 + crackle() * 1500;
        }
        for (const a of arcs) {
            const age = since - a.start;
            if (age < 0) {
                a.line.visible = false;
                continue;
            }
            a.line.visible = true;
            if (options.reducedMotion) {
                continue;
            }
            // Grows along the channel in 150 ms, flickers, then fades to a
            // steady glow
            const grow = Math.min(1, age / 150);
            const shown = Math.max(2, Math.round(segments * grow) + 1);
            const jagged = arcPoints(
                a.curve,
                t + a.seed * 0.001,
                a.seed,
                0.12 + 0.25 * Math.max(0, 1 - age / 400),
            );
            (a.line.geometry as LineGeometry).setPositions(
                Array.from(jagged.subarray(0, shown * 3)),
            );
        }
        // Dimmer when many channels share the node, so their crossing
        // near it does not burn to white
        const crowd = Math.min(1, 12 / Math.max(1, arcs.length));
        arcMaterial.opacity =
            (options.reducedMotion
                ? 0.7
                : 0.45 + 0.3 * Math.abs(Math.sin(t * 23))) *
            (0.5 + 0.5 * crowd);
        controls.update();
        composer.render();
    };
    frame = requestAnimationFrame(render);

    const resize = () => {
        const w = canvas.clientWidth || window.innerWidth;
        const h = canvas.clientHeight || window.innerHeight;
        renderer.setSize(w, h, false);
        composer.setSize(w, h);
        bloom.resolution.set(w / 2, h / 2);
        arcMaterial.resolution.set(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    resize();

    const home = () => {
        touched();
        select(meta.ours.pubkey);
    };

    const projected = new Vector3();
    return {
        select,
        home,
        zoom: (factor: number) => {
            touched();
            const offset = camera.position
                .clone()
                .sub(controls.target)
                .multiplyScalar(factor);
            camera.position.copy(controls.target.clone().add(offset));
        },
        resize,
        dispose: () => {
            running = false;
            cancelAnimationFrame(frame);
            observer.disconnect();
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointermove", onMove);
            controls.dispose();
            clearArcs();
            composer.dispose();
            renderer.dispose();
            scene.traverse((o) => {
                const mesh = o as Mesh;
                mesh.geometry?.dispose?.();
            });
        },
        labels: () => {
            const out: [string, string, number, number][] = [];
            const keys = new Set<string>();
            if (selected) {
                keys.add(selected);
                for (const a of arcs.slice(0, 12)) {
                    keys.add(all[a.neighbour]);
                }
            }
            if (hovered) {
                keys.add(hovered);
            }
            const w = canvas.clientWidth;
            const h = canvas.clientHeight;
            for (const key of keys) {
                const n = nodes.get(key);
                if (!n || !n.alias) {
                    continue;
                }
                projected.set(...n.pos).project(camera);
                if (projected.z > 1) {
                    continue;
                }
                out.push([
                    key,
                    n.alias,
                    ((projected.x + 1) / 2) * w,
                    ((1 - projected.y) / 2) * h,
                ]);
            }
            return out;
        },
    };
};

const reverse = (curve: Float32Array): Float32Array => {
    const n = curve.length / 3;
    const out = new Float32Array(curve.length);
    for (let i = 0; i < n; i++) {
        out.set(curve.subarray((n - 1 - i) * 3, (n - i) * 3), i * 3);
    }
    return out;
};
