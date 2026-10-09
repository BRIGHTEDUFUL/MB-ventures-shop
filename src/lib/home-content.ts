import { MapPin, ShieldCheck, Truck, Wallet, type LucideIcon } from "lucide-react";
import type { HomeTrustItem, TrustIcon } from "../../convex/lib/dto";

/**
 * Icon registry for the homepage trust strip.
 *
 * The key type is `TrustIcon`, which `convex/lib/dto.ts` derives from the
 * generated document type — so this `Record` fails to compile the moment the
 * `trustIcon` validator in `convex/schema.ts` gains or loses a member.
 */
export const TRUST_ICONS: Record<TrustIcon, LucideIcon> = {
  "map-pin": MapPin,
  truck: Truck,
  "shield-check": ShieldCheck,
  wallet: Wallet,
};

/** Choices offered in the staff trust-strip editor, in display order. */
export const TRUST_ICON_CHOICES: { value: TrustIcon; label: string }[] = [
  { value: "map-pin", label: "Location pin" },
  { value: "truck", label: "Delivery truck" },
  { value: "shield-check", label: "Warranty shield" },
  { value: "wallet", label: "Wallet" },
];

/** Caps enforced by `catalogue.saveSettings` — kept beside the UI that uses them. */
export const HOME_LIMITS = {
  /** Featured picks on the home rail and hero hotspots. */
  featured: 12,
  /** Trust strip rows; an empty list hides the strip. */
  trust: 4,
  /** Brand names under the featured rail; an empty list hides the strip. */
  brands: 6,
  heading: 90,
  body: 500,
  trustTitle: 60,
  trustText: 90,
  brand: 30,
} as const;

/** A blank row for the "add" button in the trust-strip editor. */
export const emptyTrustItem = (): HomeTrustItem => ({
  icon: "map-pin",
  title: "",
  text: "",
});

/** Panes of the staff Customization hub that save through one mutation. */
export const STOREFRONT_TABS = [
  "homepage",
  "featured",
  "trust",
  "announcement",
  "contact",
  "ordering",
] as const;
export type StorefrontTab = (typeof STOREFRONT_TABS)[number];

export const isStorefrontTab = (tab: string): tab is StorefrontTab =>
  (STOREFRONT_TABS as readonly string[]).includes(tab);

/**
 * The three products shown as hotspots over the hero photo, derived from the
 * first three featured picks so the picker stays the single control. Anything
 * that no longer exists is skipped rather than rendered as a dead hotspot.
 */
export const heroProductIds = (featuredIds: string[], available: string[]): string[] =>
  featuredIds.filter((id) => available.includes(id)).slice(0, 3);
