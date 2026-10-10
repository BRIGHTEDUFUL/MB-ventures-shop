/** Built-in keys resolve to photos bundled in `public/images`; staff-uploaded photos are stored as full https URLs. */
const base: Record<string, string> = {
  desk: "/images/desk.webp",
  gaming: "/images/desk.webp",
  chair: "/images/chair.webp",
  keyboard: "/images/keyboard.webp",
  mouse: "/images/mouse.webp",
  mic: "/images/mic.webp",
  arm: "/images/arm.webp",
  stand: "/images/arm.webp",
  stream: "/images/mic.webp",
  workspace: "/images/workspace.webp",
  "hero-workspace": "/images/hero-workspace.webp",
  "chair-detail": "/images/chair-detail.webp",
  logo: "/images/store-logo.jpeg",
  "carbon-fiber-gaming-desk": "/images/products/carbon-fiber-gaming-desk.webp",
  "luminous-rgb-mouse-pad": "/images/products/luminous-rgb-mouse-pad.webp",
  "360-rotating-laptop-stand": "/images/products/360-rotating-laptop-stand.webp",
  "dual-monitor-desk-mount": "/images/products/dual-monitor-desk-mount.webp",
  "rock-360-phone-tablet-stand": "/images/products/rock-360-phone-tablet-stand.webp",
  "vertical-laptop-stand": "/images/products/vertical-laptop-stand.webp",
  "monitor-light-bar": "/images/products/monitor-light-bar.webp",
  "rgb-dynamic-usb-microphone": "/images/products/rgb-dynamic-usb-microphone.webp",
  "electric-standing-desk-rgb-160": "/images/products/electric-standing-desk-rgb-160.webp",
  "mottian-ai-smart-keyboard-mouse": "/images/products/mottian-ai-smart-keyboard-mouse.webp",
  "custom-macro-mechanical-keyboard": "/images/products/custom-macro-mechanical-keyboard.webp",
  "custom-macro-mechanical-keyboard-gallery":
    "/images/products/custom-macro-mechanical-keyboard-gallery.webp",
};
export const images: Record<string, string> = new Proxy(base, {
  get: (t, k) =>
    typeof k !== "string"
      ? undefined
      : (t[k] ?? (/^(https:\/\/|\/images\/)/.test(k) ? k : base["desk"])),
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
  "hero-workspace": [1376, 768],
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
