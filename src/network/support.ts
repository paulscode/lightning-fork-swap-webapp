// What the page needs to know before loading the sky (three.js comes
// only with ./sky)

// Whether this browser can draw the sky
export const webglAvailable = (): boolean => {
    try {
        const canvas = document.createElement("canvas");
        return canvas.getContext("webgl2") !== null;
    } catch {
        return false;
    }
};

export const prefersReducedMotion = (): boolean =>
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
