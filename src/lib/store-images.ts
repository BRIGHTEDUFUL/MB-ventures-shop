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
  "hero-workspace": "/images/hero-workspace.jpg",
  "chair-detail": "/images/chair-detail.jpg",
  logo: "/images/store-logo.jpeg",
  "carbon-fiber-gaming-desk": "/images/products/carbon-fiber-gaming-desk.png",
  "luminous-rgb-mouse-pad": "/images/products/luminous-rgb-mouse-pad.png",
  "360-rotating-laptop-stand": "/images/products/360-rotating-laptop-stand.png",
  "dual-monitor-desk-mount": "/images/products/dual-monitor-desk-mount.png",
  "rock-360-phone-tablet-stand": "/images/products/rock-360-phone-tablet-stand.png",
  "vertical-laptop-stand": "/images/products/vertical-laptop-stand.png",
  "monitor-light-bar": "/images/products/monitor-light-bar.png",
  "rgb-dynamic-usb-microphone": "/images/products/rgb-dynamic-usb-microphone.png",
  "electric-standing-desk-rgb-160": "/images/products/electric-standing-desk-rgb-160.png",
  "mottian-ai-smart-keyboard-mouse": "/images/products/mottian-ai-smart-keyboard-mouse.png",
  "custom-macro-mechanical-keyboard": "/images/products/custom-macro-mechanical-keyboard.png",
  "custom-macro-mechanical-keyboard-gallery":
    "/images/products/custom-macro-mechanical-keyboard-gallery.png",
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
