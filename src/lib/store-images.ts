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
