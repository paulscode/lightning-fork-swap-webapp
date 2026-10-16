// What the page needs to know before loading the sky (three.js comes
// only with ./sky)

// Whether this browser can draw the sky. The test context is given back at
// once: browsers keep only a few alive (phones fewer), and past that they
// take the oldest, which may be the sky's own
export const webglAvailable = (): boolean => {
    try {
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl2");
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
        return gl !== null;
    } catch {
        return false;
    }
};

export const prefersReducedMotion = (): boolean =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
