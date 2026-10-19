import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { pageHead, storeQuery } from "@/lib/store";
import { type StorefrontTab } from "@/lib/home-content";
import { StorefrontSettings } from "@/components/staff/home-editor";

export const Route = createFileRoute("/staff/customization")({
  head: () =>
    pageHead(
      "Customization",
      "Homepage copy, featured products, announcement, WhatsApp and ordering.",
    ),
  component: CustomizationPage,
});

/** Panes that all save through `catalogue.saveSettings`. */
const TABS: { id: StorefrontTab; label: string }[] = [
  { id: "homepage", label: "Homepage" },
  { id: "featured", label: "Featured" },
  { id: "trust", label: "Trust strip" },
  { id: "announcement", label: "Announcement" },
  { id: "contact", label: "Contact" },
  { id: "ordering", label: "Ordering" },
];

function CustomizationPage() {
  const store = useQuery(storeQuery);
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}) });
  // Every pane saves through `saveSettings`. `StorefrontSettings` stays mounted
  // across the whole run so a half-filled form survives a tab change.
  const [tab, setTab] = useState<StorefrontTab>("homepage");

  if (store.isPending)
    return <p className="text-sm text-muted-foreground">Loading store settings…</p>;
  if (store.isError) return <p role="alert">Settings could not load. Reload the page.</p>;

  const { settings, products } = store.data;

  return (
    <div>
      <h2 className="page-title">Customization</h2>
      <p className="page-lead">
        Everything customers see — homepage copy, featured picks, the announcement bar, contact
        details and the ordering switch.
      </p>

      <div
        className="settings-tabs"
        role="tablist"
        aria-label="Storefront settings"
        onKeyDown={(event) => {
          // Arrow keys move between tabs, as a tablist is expected to behave.
          if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
          const index = TABS.findIndex((item) => item.id === tab);
          if (index === -1) return;
          event.preventDefault();
          const step = event.key === "ArrowRight" ? 1 : -1;
          const next = TABS[(index + step + TABS.length) % TABS.length];
          if (next === undefined) return;
          setTab(next.id);
          // Keep focus on the newly selected trigger (the buttons are always
          // mounted, so the element is already there before the re-render).
          document.getElementById(`settings-tab-${next.id}`)?.focus();
        }}
      >
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`settings-tab-${item.id}`}
            aria-controls="settings-panel"
            aria-selected={tab === item.id}
            tabIndex={tab === item.id ? 0 : -1}
            className="settings-tab"
            data-active={tab === item.id ? "true" : undefined}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        id="settings-panel"
        role="tabpanel"
        aria-labelledby={`settings-tab-${tab}`}
        className="mt-6"
      >
        {/* Stays mounted for every storefront pane (see StorefrontSettings). */}
        <StorefrontSettings tab={tab} settings={settings} products={products} />
      </div>

      {/* On error the alert below speaks alone — showing "signed in as staff"
          alongside it would be a guess about a role that never loaded. */}
      {!role.isPending && !role.isError && (
        <p className="mt-8 text-xs text-muted-foreground">
          Signed in as {role.data === "admin" ? "an admin" : "staff"} — all storefront copy is yours
          to edit.
        </p>
      )}
      {role.isError && (
        <p role="alert" className="mt-8 text-sm text-destructive">
          Your role could not load. Reload the page to see what you can edit.
        </p>
      )}
    </div>
  );
}
