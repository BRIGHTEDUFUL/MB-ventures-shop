import { describe, expect, it } from "vitest";
import type { Doc } from "../../convex/_generated/dataModel";
import { HOME_CONTENT_DEFAULTS, settingsDTO } from "../../convex/lib/dto";
import {
  HOME_LIMITS,
  TRUST_ICONS,
  TRUST_ICON_CHOICES,
  heroProductIds,
  isStorefrontTab,
} from "../lib/home-content";

/**
 * Covers the additive `home_*` settings added in Phase 2.
 *
 * The invariant that makes the rollout safe: a `store_settings` row written
 * before those fields existed must come back from `settingsDTO` rendering
 * exactly the copy the storefront shipped with, with no backfill and no seed
 * re-run in either deployment.
 */

type Row = Doc<"store_settings">;

const row = (overrides: Partial<Row> = {}): Row => ({
  _id: "settings" as Row["_id"],
  _creationTime: 0,
  key: "singleton",
  hero_title: "Made for your workspace.",
  hero_subtitle: "Desks, chairs and everyday tech.",
  phone: "+233 24 000 0000",
  email: "orders@example.com",
  address: "Abelenkpe taxi rank, Accra, Ghana",
  hours: "Monday to Saturday",
  momo_number: "0241234567",
  momo_name: "MB Ventures GH",
  central_fee: 30,
  greater_fee: 50,
  nationwide_fee: 100,
  free_threshold: 5000,
  ordering_enabled: true,
  hero_image: "workspace",
  setup_image: "workspace",
  announcement: "Pickup in store",
  whatsapp: "",
  featured_ids: ["standing-desk", "ergonomic-chair", "mechanical-keyboard"],
  ...overrides,
});

describe("settingsDTO home copy", () => {
  it("reproduces the original hardcoded copy for a row that predates home_*", () => {
    const settings = settingsDTO(row());

    // The storefront used to render these literals directly in index.tsx.
    expect(settings.home_category_heading).toBe("Find your workspace essentials");
    expect(settings.home_featured_heading).toBe("For your everyday setup");
    expect(settings.home_setup_eyebrow).toBe("Work, play, and everything in between");
    expect(settings.home_setup_heading).toBe("A place for your best work.");
    expect(settings.home_cta_heading).toBe("Your Abelenkpe shop. Now closer to your doorstep.");
    expect(settings.home_brands).toEqual(["Logitech", "IKEA", "elgato"]);
    expect(settings.home_trust).toHaveLength(4);
  });

  it("falls back to the default when a heading is blank", () => {
    const settings = settingsDTO(row({ home_featured_heading: "   " }));
    expect(settings.home_featured_heading).toBe(HOME_CONTENT_DEFAULTS.home_featured_heading);
  });

  it("keeps copy staff actually wrote", () => {
    const settings = settingsDTO(
      row({ home_setup_heading: "Sit better, work longer.", home_cta_body: "See you soon." }),
    );
    expect(settings.home_setup_heading).toBe("Sit better, work longer.");
    expect(settings.home_cta_body).toBe("See you soon.");
  });

  it("treats an empty array as 'staff hid this section', not 'use the default'", () => {
    const settings = settingsDTO(row({ home_brands: [], home_trust: [] }));
    expect(settings.home_brands).toEqual([]);
    expect(settings.home_trust).toEqual([]);
  });

  it("keeps a saved list that differs from the default", () => {
    const settings = settingsDTO(
      row({
        home_brands: ["Keychron", "Anker"],
        home_trust: HOME_CONTENT_DEFAULTS.home_trust.slice(0, 2),
      }),
    );
    expect(settings.home_brands).toEqual(["Keychron", "Anker"]);
    expect(settings.home_trust).toHaveLength(2);
  });

  it("returns the defaults verbatim when the row carries no home copy at all", () => {
    const { home_brands: _b, home_trust: _t, ...withoutHome } = row();
    const settings = settingsDTO(withoutHome as Row);
    expect({
      home_category_heading: settings.home_category_heading,
      home_featured_heading: settings.home_featured_heading,
      home_setup_eyebrow: settings.home_setup_eyebrow,
      home_setup_heading: settings.home_setup_heading,
      home_setup_body: settings.home_setup_body,
      home_cta_heading: settings.home_cta_heading,
      home_cta_body: settings.home_cta_body,
      home_brands: settings.home_brands,
      home_trust: settings.home_trust,
    }).toEqual(HOME_CONTENT_DEFAULTS);
  });
});

describe("heroProductIds", () => {
  it("derives hotspots from the first three featured picks", () => {
    expect(heroProductIds(["a", "b", "c", "d"], ["a", "b", "c", "d"])).toEqual(["a", "b", "c"]);
  });

  it("drops picks that no longer exist instead of rendering a dead hotspot", () => {
    expect(heroProductIds(["a", "gone", "b"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("returns nothing when nothing is featured", () => {
    expect(heroProductIds([], ["a", "b"])).toEqual([]);
  });
});

describe("trust strip icons", () => {
  it("registers an icon for every choice and every default row", () => {
    for (const choice of TRUST_ICON_CHOICES) {
      expect(TRUST_ICONS[choice.value]).toBeDefined();
    }
    for (const item of HOME_CONTENT_DEFAULTS.home_trust) {
      expect(TRUST_ICONS[item.icon]).toBeDefined();
    }
  });

  it("offers exactly the icon keys the schema validator allows", () => {
    expect(TRUST_ICON_CHOICES.map((choice) => choice.value).sort()).toEqual(
      ["map-pin", "shield-check", "truck", "wallet"].sort(),
    );
  });
});

describe("customization panes", () => {
  it("recognises only the panes that save through catalogue.saveSettings", () => {
    expect(isStorefrontTab("homepage")).toBe(true);
    expect(isStorefrontTab("ordering")).toBe(true);
    expect(isStorefrontTab("delivery")).toBe(false);
    expect(isStorefrontTab("momo")).toBe(false);
  });

  it("caps the lists at what the server accepts", () => {
    expect(HOME_LIMITS.featured).toBe(12);
    expect(HOME_LIMITS.brands).toBe(6);
    expect(HOME_LIMITS.trust).toBe(4);
  });
});
