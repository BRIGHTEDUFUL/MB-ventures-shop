import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead, storeQuery, type Settings } from "@/lib/store";
import { images } from "@/lib/store-images";
import { useImageUpload } from "@/lib/upload-image";
import { Button } from "@/components/ui/button";
import { Panel, QueryState } from "@/components/staff/bits";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/customization")({
  head: () =>
    pageHead(
      "Customization",
      "Homepage hero, announcement, contact details, featured picks, delivery fees and payments.",
    ),
  component: CustomizationPage,
});

type StoreForm = Pick<
  Settings,
  | "hero_title"
  | "hero_subtitle"
  | "announcement"
  | "hero_image"
  | "setup_image"
  | "phone"
  | "email"
  | "address"
  | "hours"
  | "whatsapp"
  | "ordering_enabled"
> & { featured_ids: string[] };

type FinanceForm = Pick<
  Settings,
  "central_fee" | "greater_fee" | "nationwide_fee" | "free_threshold" | "momo_number" | "momo_name"
>;

function CustomizationPage() {
  const store = useQuery(storeQuery);
  const role = useQuery({ ...convexQueryOptions(api.users.myRole, {}) });

  if (store.isPending)
    return <p className="text-sm text-muted-foreground">Loading store settings…</p>;
  if (store.isError) return <p role="alert">Settings could not load. Reload the page.</p>;

  return (
    <div>
      <h2 className="page-title">Customization</h2>
      <p className="page-lead">
        Everything customers see and pay — hero copy, photos, announcements, contact details,
        delivery fees and the ordering switch.
      </p>

      <StoreSettingsForm settings={store.data.settings} products={store.data.products} />

      <div className="mt-8">
        {role.data === "admin" ? (
          <FinanceFormPanel settings={store.data.settings} />
        ) : (
          <Panel title="Delivery & payments" description="Admin access required.">
            <p className="text-sm text-muted-foreground">
              Delivery fees, the free-delivery threshold and the Mobile Money recipient are managed
              by an admin. Ask the store owner to update them.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}

/** Homepage, contact, ordering switch — editable by any staff member. */
function StoreSettingsForm({
  settings,
  products,
}: {
  settings: Settings;
  products: { id: string; name: string; verified: boolean }[];
}) {
  const [form, setForm] = useState<StoreForm | null>(null);
  const [busy, setBusy] = useState(false);
  const saveSettings = useConvexMutation(api.catalogue.saveSettings);
  const uploadImage = useImageUpload();

  // Seed the form once (and only once) from the loaded settings.
  useEffect(() => {
    if (form === null) {
      setForm({
        hero_title: settings.hero_title,
        hero_subtitle: settings.hero_subtitle,
        announcement: settings.announcement,
        hero_image: settings.hero_image,
        setup_image: settings.setup_image,
        phone: settings.phone,
        email: settings.email,
        address: settings.address,
        hours: settings.hours,
        whatsapp: settings.whatsapp,
        ordering_enabled: settings.ordering_enabled,
        featured_ids: [...settings.featured_ids],
      });
    }
  }, [settings, form]);

  const set = <K extends keyof StoreForm>(k: K, v: StoreForm[K]) =>
    setForm((x) => (x === null ? x : { ...x, [k]: v }));

  const toggleFeatured = (id: string) =>
    setForm((x) => {
      if (x === null) return x;
      const has = x.featured_ids.includes(id);
      if (!has && x.featured_ids.length >= 12) {
        toast.error("Pick at most 12 featured products.");
        return x;
      }
      return {
        ...x,
        featured_ids: has ? x.featured_ids.filter((f) => f !== id) : [...x.featured_ids, id],
      };
    });

  const upload = async (field: "hero_image" | "setup_image", file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      set(field, await uploadImage(file));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form === null) return;
    setBusy(true);
    try {
      await saveSettings({
        hero_title: form.hero_title,
        hero_subtitle: form.hero_subtitle,
        announcement: form.announcement,
        hero_image: form.hero_image,
        setup_image: form.setup_image,
        phone: form.phone,
        email: form.email,
        address: form.address,
        hours: form.hours,
        whatsapp: form.whatsapp,
        ordering_enabled: form.ordering_enabled,
        featured_ids: form.featured_ids,
      });
      toast.success("Storefront settings saved");
    } catch (err) {
      toast.error(errorMessage(err, "Settings could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  if (form === null) return null;

  return (
    <form onSubmit={save}>
      <Panel
        title="Homepage & appearance"
        description="Hero headline, supporting copy and the photos on the home page."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            Hero headline
            <input
              required
              value={form.hero_title}
              onChange={(e) => set("hero_title", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Hero supporting line
            <input
              value={form.hero_subtitle}
              onChange={(e) => set("hero_subtitle", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Announcement bar (empty hides it)
            <input
              value={form.announcement}
              onChange={(e) => set("announcement", e.target.value)}
              placeholder="e.g. Free delivery in Accra on orders over GH₵ 500"
            />
          </label>
          <div>
            <span className="text-sm font-medium">Hero photo</span>
            <div className="mt-2 flex items-center gap-3">
              <img
                src={images[form.hero_image]}
                alt=""
                className="size-16 rounded-lg object-cover"
              />
              <label className="text-sm">
                Replace hero photo
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => {
                    upload("hero_image", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
          <div>
            <span className="text-sm font-medium">Setup section photo</span>
            <div className="mt-2 flex items-center gap-3">
              <img
                src={images[form.setup_image]}
                alt=""
                className="size-16 rounded-lg object-cover"
              />
              <label className="text-sm">
                Replace photo
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => {
                    upload("setup_image", e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
      </Panel>

      <Panel
        title="Featured products"
        description={`${form.featured_ids.length} of 12 picked for the home page rail.`}
      >
        <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-border p-3">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No products yet.</p>
          ) : (
            products.map((p) => (
              <label
                key={p.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted"
              >
                <input
                  type="checkbox"
                  checked={form.featured_ids.includes(p.id)}
                  onChange={() => toggleFeatured(p.id)}
                />
                <span className="flex-1 text-sm font-normal">
                  {p.name}
                  {!p.verified && <span className="ml-2 text-xs text-offer">Sample</span>}
                </span>
              </label>
            ))
          )}
        </div>
      </Panel>

      <Panel
        title="Contact & hours"
        description="Shown in the header facts bar, footer and contact page."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Phone
            <input required value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            Shop address
            <input required value={form.address} onChange={(e) => set("address", e.target.value)} />
          </label>
          <label>
            Opening hours
            <input value={form.hours} onChange={(e) => set("hours", e.target.value)} />
          </label>
          <label>
            WhatsApp number
            <input
              value={form.whatsapp}
              onChange={(e) => set("whatsapp", e.target.value)}
              placeholder="e.g. 233241234567"
            />
          </label>
        </div>
      </Panel>

      <Panel
        title="Ordering switch"
        description="Turn ordering off for holidays, stock-taking or while payments are unverified."
      >
        <label className="filter-line">
          <input
            type="checkbox"
            checked={form.ordering_enabled}
            onChange={(e) => set("ordering_enabled", e.target.checked)}
          />
          Accept orders on the storefront
          {form.ordering_enabled && settings.momo_number === "" && (
            <span className="mt-1 block text-xs text-destructive">
              No Mobile Money recipient saved yet — add it under Delivery & payments before orders
              can be paid.
            </span>
          )}
        </label>
      </Panel>

      <div className="flex gap-3">
        <Button disabled={busy}>{busy ? "Working…" : "Save storefront settings"}</Button>
      </div>
    </form>
  );
}

/** Fees, threshold and MoMo recipient — admin only (server-enforced). */
function FinanceFormPanel({ settings }: { settings: Settings }) {
  const [form, setForm] = useState<FinanceForm | null>(null);
  const [busy, setBusy] = useState(false);
  const saveFinance = useConvexMutation(api.catalogue.saveFinanceSettings);

  useEffect(() => {
    if (form === null) {
      setForm({
        central_fee: settings.central_fee,
        greater_fee: settings.greater_fee,
        nationwide_fee: settings.nationwide_fee,
        free_threshold: settings.free_threshold,
        momo_number: settings.momo_number,
        momo_name: settings.momo_name,
      });
    }
  }, [settings, form]);

  const set = <K extends keyof FinanceForm>(k: K, v: FinanceForm[K]) =>
    setForm((x) => (x === null ? x : { ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form === null) return;
    setBusy(true);
    try {
      await saveFinance({
        central_fee: Number(form.central_fee),
        greater_fee: Number(form.greater_fee),
        nationwide_fee: Number(form.nationwide_fee),
        free_threshold: Number(form.free_threshold),
        momo_number: form.momo_number,
        momo_name: form.momo_name,
      });
      toast.success("Delivery & payment settings saved");
    } catch (err) {
      toast.error(errorMessage(err, "Settings could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  if (form === null) return null;

  return (
    <form onSubmit={save}>
      <Panel
        title="Delivery & payments"
        description="Admin only — these change what customers are charged."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Accra Central & Circle fee GH₵
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.central_fee}
              onChange={(e) => set("central_fee", Number(e.target.value))}
            />
          </label>
          <label>
            Greater Accra fee GH₵
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.greater_fee}
              onChange={(e) => set("greater_fee", Number(e.target.value))}
            />
          </label>
          <label>
            Nationwide fee GH₵
            <input
              type="number"
              min="0"
              step="0.5"
              value={form.nationwide_fee}
              onChange={(e) => set("nationwide_fee", Number(e.target.value))}
            />
          </label>
          <label>
            Free delivery above GH₵
            <input
              type="number"
              min="0"
              step="50"
              value={form.free_threshold}
              onChange={(e) => set("free_threshold", Number(e.target.value))}
            />
          </label>
          <label>
            Mobile Money number
            <input
              value={form.momo_number}
              onChange={(e) => set("momo_number", e.target.value)}
              placeholder="e.g. 0241234567"
            />
          </label>
          <label>
            Mobile Money recipient name
            <input
              value={form.momo_name}
              onChange={(e) => set("momo_name", e.target.value)}
              placeholder="e.g. MB Ventures GH"
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Checkout blocks MoMo payments until a verified recipient number and name are saved, and
          the ordering switch stays off until then too.
        </p>
        <div className="mt-4">
          <Button disabled={busy}>{busy ? "Working…" : "Save delivery & payments"}</Button>
        </div>
      </Panel>
    </form>
  );
}
