/** Built-in keys resolve to photos bundled in `public/images`; staff-uploaded photos are stored as full https URLs. */
const base: Record<string, string> = {
  desk: "/images/desk.jpg",
  gaming: "/images/desk.jpg",
  chair: "/images/chair.jpg",
  keyboard: "/images/keyboard.jpg",
  mouse: "/images/mouse.jpg",
  mic: "/images/mic.jpg",
  arm: "/images/arm.jpg",
  stand: "/images/arm.jpg",
  stream: "/images/mic.jpg",
  workspace: "/images/workspace.jpg",
  "chair-detail": "/images/chair-detail.jpg",
  logo: "/images/store-logo.jpeg",
};
export const images: Record<string, string> = new Proxy(base, {
  get: (t, k) =>
    typeof k !== "string" ? undefined : (t[k] ?? (/^https:\/\//.test(k) ? k : base["desk"])),
});
export const builtInPhotos = Object.keys(base).filter((k) => k !== "logo");

/** Intrinsic pixel size of every built-in photo, measured from the files in `public/images`. */
const sizes: Record<string, readonly [number, number]> = {
  desk: [1400, 1400],
  gaming: [1400, 1400],
  chair: [1400, 1400],
  keyboard: [1800, 1013],
  mouse: [1600, 1374],
  mic: [1800, 1269],
  arm: [1400, 1400],
  stand: [1400, 1400],
  stream: [1800, 1269],
  workspace: [1400, 1400],
  "chair-detail": [1400, 1400],
  logo: [1024, 1024],
};

/**
 * `width` / `height` for an `<img>`. The browser can hold the layout slot
 * before the bytes arrive, which is what stops the rails and cards from
 * shifting on a slow connection; CSS (`object-fit`, fixed tiles) still decides
 * how the picture is drawn inside that slot. Staff-uploaded photos have no
 * known intrinsic size, so they fall back to the square shape every product
 * tile already uses.
 */
export const imageSize = (key: string): { width: number; height: number } => {
  const [width, height] = sizes[key] ?? [1400, 1400];
  return { width, height };
};
