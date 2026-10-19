import type { PermissionKey } from "../schema";

/**
 * The permission catalogue as pure data — no Convex context, no auth server
 * import, nothing that cannot run in a browser.
 *
 * This module exists so the Team screen can draw the real permission matrix
 * (labels, groups, role defaults) while `permissions.ts` keeps the guards that
 * need `@convex-dev/auth/server`. Same split as `lib/variants.ts`: shared
 * logic lives in a pure file both sides import, so there is exactly one
 * definition of what each permission means.
 */

/** How sensitive a permission is: does it need `admin`, or is `staff` enough? */
export type Floor = "staff" | "admin";

export type PermissionSpec = {
  /** Human phrase used in the denial message, e.g. "adjust stock". */
  label: string;
  /** Group shown in the permission matrix. */
  group: string;
  /** The lowest role that has this permission without an override. */
  floor: Floor;
};

/**
 * The catalogue. `floor: "staff"` means attendants get it by default and only
 * an explicit override takes it away; `floor: "admin"` means it stays with the
 * owner unless an override grants it.
 *
 * The floors are not invented here — they mirror the `requireStaff` /
 * `requireAdmin` guards that these functions had before, so converting a call
 * site changes *how* the door is decided, never *who* walks through it.
 */
export const PERMISSION_CATALOG: Record<PermissionKey, PermissionSpec> = {
  "catalogue.view": { label: "view the catalogue", group: "Catalogue", floor: "staff" },
  "catalogue.edit": { label: "create and edit products", group: "Catalogue", floor: "staff" },
  "catalogue.delete": { label: "delete products", group: "Catalogue", floor: "staff" },
  "catalogue.bulk": { label: "bulk-edit products", group: "Catalogue", floor: "staff" },
  "catalogue.categories": { label: "manage categories", group: "Catalogue", floor: "staff" },
  "catalogue.settings": {
    label: "change storefront settings",
    group: "Catalogue",
    floor: "staff",
  },
  "catalogue.delivery": { label: "change delivery fees", group: "Catalogue", floor: "staff" },
  "inventory.view": { label: "view stock and movements", group: "Inventory", floor: "staff" },
  "inventory.adjust": { label: "adjust stock", group: "Inventory", floor: "staff" },
  "inventory.stocktake": { label: "apply a stocktake", group: "Inventory", floor: "staff" },
  "inventory.health": {
    label: "run the data-health report",
    group: "Inventory",
    floor: "staff",
  },
  "orders.view": { label: "view orders", group: "Orders", floor: "staff" },
  "orders.create": { label: "record orders at the counter", group: "Orders", floor: "staff" },
  "orders.update": { label: "update orders", group: "Orders", floor: "staff" },
  "reports.view": { label: "view reports", group: "Reporting", floor: "staff" },
  "activity.view": { label: "view the activity feed", group: "Reporting", floor: "staff" },
  "uploads.create": { label: "upload product photos", group: "Media", floor: "staff" },
  "team.view": { label: "see who has access", group: "Team", floor: "staff" },
  "team.manage": { label: "grant or revoke access", group: "Team", floor: "admin" },
  "emails.admin": { label: "manage email configuration", group: "Email", floor: "admin" },
  "emails.note": { label: "clear an email attention flag", group: "Email", floor: "staff" },
};

/** Every permission in the catalogue, in a stable order for the UI. */
export const PERMISSION_KEYS_IN_ORDER = Object.keys(PERMISSION_CATALOG) as PermissionKey[];

/** Permissions a role holds before per-user overrides are applied. */
export function defaultPermissions(role: "admin" | "staff"): PermissionKey[] {
  return PERMISSION_KEYS_IN_ORDER.filter((key) =>
    role === "admin" ? true : PERMISSION_CATALOG[key].floor === "staff",
  );
}

/** The catalogue grouped for display, in catalogue order — one entry per group. */
export function groupedPermissions(): { group: string; keys: PermissionKey[] }[] {
  const byGroup = new Map<string, PermissionKey[]>();
  for (const key of PERMISSION_KEYS_IN_ORDER) {
    const { group } = PERMISSION_CATALOG[key];
    byGroup.set(group, [...(byGroup.get(group) ?? []), key]);
  }
  return [...byGroup.entries()].map(([group, keys]) => ({ group, keys }));
}
