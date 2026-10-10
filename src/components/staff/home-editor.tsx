import { useEffect, useMemo, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { ArrowDown, ArrowRight, ArrowUp, MapPin, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { FormActions, Panel } from "@/components/staff/bits";
import {
  DEFAULT_ANNOUNCEMENT,
  delivery,
  errorMessage,
  money,
  normalizeWhatsApp,
  validateWhatsApp,
  whatsappHref,
  type HomeTrustItem,
  type Product,
  type Settings,
} from "@/lib/store";
import {
  HOME_LIMITS,
  TRUST_ICONS,
  TRUST_ICON_CHOICES,
  emptyTrustItem,
  isStorefrontTab,
} from "@/lib/home-content";
import { images } from "@/lib/store-images";
import { useImageUpload } from "@/lib/upload-image";

type StoreForm = {
  hero_title: string;
  hero_subtitle: string;
  hero_image: string;
  setup_image: string;
  phone: string;
  email: string;
  address: string;
  hours: string;
  whatsapp: string;
  announcement: string;
  ordering_enabled: boolean;
  featured_ids: string[];
  home_category_heading: string;
  home_featured_heading: string;
  home_setup_eyebrow: string;
  home_setup_heading: string;
  home_setup_body: string;
  home_cta_heading: string;
  home_cta_body: string;
  home_brands: string[];
  home_trust: HomeTrustItem[];
};

const seed = (settings: Settings): StoreForm => ({
  hero_title: settings.hero_title,
  hero_subtitle: settings.hero_subtitle,
  hero_image: settings.hero_image,
  setup_image: settings.setup_image,
  phone: settings.phone,
  email: settings.email,
  address: settings.address,
  hours: settings.hours,
  whatsapp: settings.whatsapp,
  announcement: settings.announcement,
  ordering_enabled: settings.ordering_enabled,
  featured_ids: [...settings.featured_ids],
  home_category_heading: settings.home_category_heading,
  home_featured_heading: settings.home_featured_heading,
  home_setup_eyebrow: settings.home_setup_eyebrow,
  home_setup_heading: settings.home_setup_heading,
  home_setup_body: settings.home_setup_body,
  home_cta_heading: settings.home_cta_heading,
  home_cta_body: settings.home_cta_body,
  home_brands: [...settings.home_brands],
  home_trust: settings.home_trust.map((item) => ({ ...item })),
});

const subheading = "mt-6 pb-2 text-sm font-semibold first:mt-0";

/**
 * Everything a staff member can change about the storefront *without* touching
 * money: hero, homepage copy, featured picks, trust strip, announcement,
 * contact details, WhatsApp and the ordering switch.
 *
 * The component stays mounted for every one of those panes and swaps only the
 * body, so a half-filled form survives tab changes; it renders nothing at all
 * while a different mutation's tab (delivery fees) is open.
 */
export function StorefrontSettings({
  tab,
  settings,
  products,
}: {
  tab: string;
  settings: Settings;
  products: Product[];
}) {
  const [form, setForm] = useState<StoreForm | null>(null);
  const [busy, setBusy] = useState(false);
  const saveSettings = useConvexMutation(api.catalogue.saveSettings);
  const uploadImage = useImageUpload();

  // Seed once, and only once, from the loaded settings — after a save the
  // server echoes back and we must not stomp unsaved edits.
  useEffect(() => {
    if (form === null) setForm(seed(settings));
  }, [settings, form]);

  const set = <K extends keyof StoreForm>(key: K, value: StoreForm[K]) =>
    setForm((current) => (current === null ? current : { ...current, [key]: value }));

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

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (form === null) return;
    const whatsappProblem = validateWhatsApp(form.whatsapp);
    if (whatsappProblem !== null) {
      toast.error(whatsappProblem);
      return;
    }
    setBusy(true);
    try {
      await saveSettings(form);
      toast.success("Storefront settings saved");
    } catch (err) {
      toast.error(errorMessage(err, "Settings could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  // Not one of our panes — the delivery-fee form owns the screen right now. The
  // component stays mounted so the draft above is not thrown away.
  if (!isStorefrontTab(tab)) return null;
  if (form === null) return <p className="text-sm text-muted-foreground">Loading settings…</p>;

  return (
    <form onSubmit={save}>
      {tab === "homepage" && <HomepagePane form={form} set={set} busy={busy} upload={upload} />}
      {tab === "featured" && <FeaturedPane form={form} set={set} products={products} />}
      {tab === "trust" && <TrustPane form={form} set={set} />}
      {tab === "announcement" && <AnnouncementPane form={form} set={set} />}
      {tab === "contact" && <ContactPane form={form} set={set} />}
      {tab === "ordering" && <OrderingPane form={form} set={set} />}
      <FormActions busy={busy}>
        <Button disabled={busy}>{busy ? "Working…" : "Save storefront settings"}</Button>
      </FormActions>
    </form>
  );
}

/* ── Panes ─────────────────────────────────────────────────────────────── */

function PhotoField({
  label,
  value,
  disabled,
  onFile,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <div>
      <span className="text-sm font-medium">{label}</span>
      <div className="mt-2 flex items-center gap-3">
        <img src={images[value]} alt="" className="size-16 rounded-lg object-cover" />
        <label className="cursor-pointer rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted">
          Replace photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={disabled}
            onChange={(e) => {
              onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}

function HomepagePane({
  form,
  set,
  busy,
  upload,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
  busy: boolean;
  upload: (field: "hero_image" | "setup_image", file: File | undefined) => void;
}) {
  return (
    <>
      <Panel title="Hero" description="The first thing a customer sees.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            Headline
            <input
              required
              maxLength={HOME_LIMITS.heading}
              value={form.hero_title}
              onChange={(e) => set("hero_title", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Supporting line
            <input
              value={form.hero_subtitle}
              onChange={(e) => set("hero_subtitle", e.target.value)}
            />
          </label>
          <PhotoField
            label="Hero photo"
            value={form.hero_image}
            disabled={busy}
            onFile={(file) => upload("hero_image", file)}
          />
          <PhotoField
            label="Setup section photo"
            value={form.setup_image}
            disabled={busy}
            onFile={(file) => upload("setup_image", file)}
          />
        </div>
      </Panel>

      <Panel
        title="Section copy"
        description="Headings and paragraphs between the hero and the footer."
      >
        <label>
          Categories section heading
          <input
            maxLength={HOME_LIMITS.heading}
            value={form.home_category_heading}
            onChange={(e) => set("home_category_heading", e.target.value)}
          />
        </label>
        <label className="mt-4 block">
          Featured rail heading
          <input
            maxLength={HOME_LIMITS.heading}
            value={form.home_featured_heading}
            onChange={(e) => set("home_featured_heading", e.target.value)}
          />
        </label>

        <p className={subheading}>Setup section</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            Eyebrow
            <input
              maxLength={HOME_LIMITS.heading}
              value={form.home_setup_eyebrow}
              onChange={(e) => set("home_setup_eyebrow", e.target.value)}
            />
          </label>
          <label>
            Heading
            <input
              maxLength={HOME_LIMITS.heading}
              value={form.home_setup_heading}
              onChange={(e) => set("home_setup_heading", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Paragraph
            <textarea
              rows={3}
              maxLength={HOME_LIMITS.body}
              value={form.home_setup_body}
              onChange={(e) => set("home_setup_body", e.target.value)}
            />
          </label>
        </div>

        <p className={subheading}>Closing section</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            Heading
            <input
              maxLength={HOME_LIMITS.heading}
              value={form.home_cta_heading}
              onChange={(e) => set("home_cta_heading", e.target.value)}
            />
          </label>
          <label>
            Paragraph
            <textarea
              rows={3}
              maxLength={HOME_LIMITS.body}
              value={form.home_cta_body}
              onChange={(e) => set("home_cta_body", e.target.value)}
            />
          </label>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Clearing a field restores the shop&apos;s default wording for it.
        </p>
      </Panel>
    </>
  );
}

type Filter = "all" | "verified" | "stock";

function FeaturedPane({
  form,
  set,
  products,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const toggle = (id: string) => {
    if (form.featured_ids.includes(id)) {
      set(
        "featured_ids",
        form.featured_ids.filter((value) => value !== id),
      );
      return;
    }
    if (form.featured_ids.length >= HOME_LIMITS.featured) {
      toast.error(`Pick at most ${HOME_LIMITS.featured} featured products.`);
      return;
    }
    set("featured_ids", [...form.featured_ids, id]);
  };

  const move = (id: string, direction: -1 | 1) => {
    const ids = [...form.featured_ids];
    const index = ids.indexOf(id);
    const target = index + direction;
    if (index === -1 || target < 0 || target >= ids.length) return;
    const picked = ids[index];
    const neighbour = ids[target];
    if (picked === undefined || neighbour === undefined) return;
    ids[index] = neighbour;
    ids[target] = picked;
    set("featured_ids", ids);
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const order = (id: string) => {
      const index = form.featured_ids.indexOf(id);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return products
      .filter((product) =>
        needle === "" ? true : `${product.name} ${product.brand}`.toLowerCase().includes(needle),
      )
      .filter((product) =>
        filter === "verified" ? product.verified : filter === "stock" ? product.stock > 0 : true,
      )
      .sort((a, b) => order(a.id) - order(b.id) || a.name.localeCompare(b.name));
  }, [products, query, filter, form.featured_ids]);

  const chips: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "verified", label: "Verified" },
    { value: "stock", label: "In stock" },
  ];

  return (
    <Panel
      title="Featured products"
      description={`${form.featured_ids.length} of ${HOME_LIMITS.featured} picked for the home rail.`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <label className="picker-search relative min-w-[12rem] flex-1">
          <span className="sr-only">Search products</span>
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products"
          />
        </label>
        <div className="flex gap-2" role="group" aria-label="Filter products">
          {chips.map((chip) => (
            <Button
              key={chip.value}
              type="button"
              size="sm"
              variant={filter === chip.value ? "default" : "outline"}
              aria-pressed={filter === chip.value}
              onClick={() => setFilter(chip.value)}
            >
              {chip.label}
            </Button>
          ))}
        </div>
      </div>

      <ul className="mt-4 max-h-[26rem] space-y-1 overflow-y-auto rounded-lg border border-border p-2">
        {visible.length === 0 ? (
          <li className="px-2 py-6 text-center text-sm text-muted-foreground">
            No products match “{query}”.
          </li>
        ) : (
          visible.map((product) => {
            const picked = form.featured_ids.includes(product.id);
            const index = form.featured_ids.indexOf(product.id);
            return (
              <li
                key={product.id}
                className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted"
              >
                <img
                  src={images[product.image_key]}
                  alt=""
                  className="size-9 shrink-0 rounded object-cover"
                />
                <button
                  type="button"
                  onClick={() => toggle(product.id)}
                  aria-pressed={picked}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <span
                    aria-hidden
                    className={`grid size-5 shrink-0 place-items-center rounded border text-[11px] ${
                      picked
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {picked ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-normal">{product.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {product.verified ? money(product.price) : "Sample · example price"}
                    </span>
                  </span>
                </button>
                <span className="picker-move flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="size-9 p-0"
                    aria-label={`Move ${product.name} up`}
                    disabled={!picked || index === 0}
                    onClick={() => move(product.id, -1)}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="size-9 p-0"
                    aria-label={`Move ${product.name} down`}
                    disabled={!picked || index === form.featured_ids.length - 1}
                    onClick={() => move(product.id, 1)}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                </span>
              </li>
            );
          })
        )}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        Order matters: the first {Math.min(3, HOME_LIMITS.featured)} picks also become the hotspots
        on the hero photo.
      </p>
    </Panel>
  );
}

function TrustPane({
  form,
  set,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
}) {
  const update = (index: number, patch: Partial<HomeTrustItem>) =>
    set(
      "home_trust",
      form.home_trust.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  const add = () =>
    set("home_trust", [...form.home_trust, emptyTrustItem()].slice(0, HOME_LIMITS.trust));

  const remove = (index: number) =>
    set(
      "home_trust",
      form.home_trust.filter((_, i) => i !== index),
    );

  return (
    <>
      <Panel
        title="Trust strip"
        description="The four assurance cards under the hero. Remove every row to hide the strip."
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={form.home_trust.length >= HOME_LIMITS.trust}
            onClick={add}
          >
            <Plus className="size-4" /> Add row
          </Button>
        }
      >
        {form.home_trust.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
            The trust strip is hidden on the home page. Add a row to show it again.
          </p>
        ) : (
          <ul className="space-y-3">
            {form.home_trust.map((item, index) => {
              const Icon = TRUST_ICONS[item.icon];
              return (
                <li
                  key={index}
                  className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-[12rem_1fr_auto]"
                >
                  <label>
                    Icon
                    <span className="mt-2 flex items-center gap-2">
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <select
                        value={item.icon}
                        onChange={(e) =>
                          update(index, { icon: e.target.value as HomeTrustItem["icon"] })
                        }
                      >
                        {TRUST_ICON_CHOICES.map((choice) => (
                          <option key={choice.value} value={choice.value}>
                            {choice.label}
                          </option>
                        ))}
                      </select>
                    </span>
                  </label>
                  <label>
                    Title
                    <input
                      maxLength={HOME_LIMITS.trustTitle}
                      value={item.title}
                      onChange={(e) => update(index, { title: e.target.value })}
                    />
                  </label>
                  <label>
                    Line
                    <input
                      maxLength={HOME_LIMITS.trustText}
                      value={item.text}
                      onChange={(e) => update(index, { text: e.target.value })}
                    />
                  </label>
                  <div className="sm:col-span-3">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="size-4" /> Remove row
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Brand strip"
        description={`Up to ${HOME_LIMITS.brands} names, one per line. Clear the box to hide the strip.`}
      >
        <label>
          Brand names
          <textarea
            rows={5}
            value={form.home_brands.join("\n")}
            onChange={(e) =>
              set(
                "home_brands",
                e.target.value
                  .split("\n")
                  .map((line) => line.trim())
                  .slice(0, HOME_LIMITS.brands),
              )
            }
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Blank lines are dropped when you save.{" "}
          {HOME_LIMITS.brands - form.home_brands.filter(Boolean).length} slot
          {HOME_LIMITS.brands - form.home_brands.filter(Boolean).length === 1 ? "" : "s"} left.
        </p>
      </Panel>
    </>
  );
}

function AnnouncementPane({
  form,
  set,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
}) {
  const preview = form.announcement.trim();
  return (
    <Panel
      title="Announcement bar"
      description="The strip above the header — good for delivery cutoffs and holidays."
    >
      <label>
        Announcement <span className="font-normal text-muted-foreground">(empty hides it)</span>
        <input
          value={form.announcement}
          onChange={(e) => set("announcement", e.target.value)}
          placeholder={DEFAULT_ANNOUNCEMENT}
        />
      </label>

      <p className="mt-6 text-sm font-semibold">Preview</p>
      {preview === "" ? (
        <p className="mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          The announcement bar is hidden — the header starts straight away.
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg">
          <div className="facts-bar flex items-center justify-between gap-3 bg-primary px-8 py-2 text-[11px] text-primary-foreground">
            <span className="flex min-w-0 items-center gap-2">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{preview}</span>
            </span>
            <span className="shrink-0 whitespace-nowrap">Track your order →</span>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Long messages are truncated on phones, so keep the important words first.
      </p>
    </Panel>
  );
}

function ContactPane({
  form,
  set,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
}) {
  const preview = whatsappHref({ whatsapp: form.whatsapp, phone: form.phone });
  const problem = form.whatsapp.trim() === "" ? null : validateWhatsApp(form.whatsapp);
  return (
    <>
      <Panel title="Contact & hours" description="Shown in the header, footer and contact page.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            Phone
            <input
              required
              type="tel"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </label>
          <label>
            Email
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            Shop address
            <input required value={form.address} onChange={(e) => set("address", e.target.value)} />
          </label>
          <label className="sm:col-span-2">
            Opening hours
            <input value={form.hours} onChange={(e) => set("hours", e.target.value)} />
          </label>
        </div>
      </Panel>

      <Panel
        title="WhatsApp"
        description="Used by every “Ask on WhatsApp” button and the footer chat link."
      >
        <label>
          WhatsApp number
          <input
            type="tel"
            inputMode="tel"
            value={form.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            placeholder="e.g. 024 123 4567"
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Local and international formats both work — it is saved as{" "}
          <span className="font-mono">{normalizeWhatsApp(form.whatsapp) || "…"}</span>. Leave it
          blank to use the shop phone number instead.
        </p>
        {problem !== null ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {problem}
          </p>
        ) : (
          preview !== null && (
            <p className="mt-3 text-sm">
              <a
                href={preview}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 text-link hover:underline"
              >
                Send a test message <ArrowRight className="size-3" aria-hidden />
              </a>
            </p>
          )
        )}
      </Panel>
    </>
  );
}

function OrderingPane({
  form,
  set,
}: {
  form: StoreForm;
  set: <K extends keyof StoreForm>(key: K, value: StoreForm[K]) => void;
}) {
  return (
    <Panel title="Ordering switch" description="Turn ordering off for holidays or stock-taking.">
      <label className="filter-line">
        <input
          type="checkbox"
          checked={form.ordering_enabled}
          onChange={(e) => set("ordering_enabled", e.target.checked)}
        />
        Accept orders on the storefront
      </label>
      <p className="mt-3 text-xs text-muted-foreground">
        Customers pay when they collect at the shop or when the courier arrives — no online payment
        is taken. While ordering is off, checkout reports “Ordering is not open yet” and no stock is
        reserved.
      </p>
    </Panel>
  );
}

/* ── Delivery fees (staff) ─────────────────────────────────────────────── */

/** Which zone a sample cart is priced against while editing the fees. */
type FeeZone = "central" | "greater" | "nationwide";

export function DeliverySettings({ settings }: { settings: Settings }) {
  // Seeded once on mount — the tab is created fresh each time it opens, so a
  // save echoes back equal values and a background settings change elsewhere
  // can never stomp a fee being typed.
  const [form, setForm] = useState({
    central_fee: settings.central_fee,
    greater_fee: settings.greater_fee,
    nationwide_fee: settings.nationwide_fee,
    free_threshold: settings.free_threshold,
  });
  const [busy, setBusy] = useState(false);
  const [zone, setZone] = useState<FeeZone>("central");
  const [subtotal, setSubtotal] = useState(1500);
  const save = useConvexMutation(api.catalogue.saveDeliverySettings);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await save(form);
      toast.success("Delivery fees saved");
    } catch (err) {
      toast.error(errorMessage(err, "Delivery fees could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const number = (key: keyof typeof form, step: number) => (
    <label>
      {
        {
          central_fee: "Accra Central & Abelenkpe fee GH₵",
          greater_fee: "Greater Accra fee GH₵",
          nationwide_fee: "Nationwide fee GH₵",
          free_threshold: "Free delivery above GH₵",
        }[key]
      }
      <input
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => setForm((current) => ({ ...current, [key]: Number(e.target.value) }))}
      />
    </label>
  );

  return (
    <form onSubmit={submit}>
      <Panel
        title="Delivery fees"
        description="What a customer pays for shipping. Saved by any staff member."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {number("central_fee", 0.5)}
          {number("greater_fee", 0.5)}
          {number("nationwide_fee", 0.5)}
          {number("free_threshold", 50)}
        </div>
        <FormActions busy={busy} note="These take effect on the next page load.">
          <Button disabled={busy}>{busy ? "Working…" : "Save delivery fees"}</Button>
        </FormActions>
      </Panel>

      <Panel title="Try a cart" description="Check the new fees before customers see them.">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Delivery zone">
          {(
            [
              ["central", "Accra Central"],
              ["greater", "Greater Accra"],
              ["nationwide", "Nationwide"],
            ] as const
          ).map(([value, label]) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={zone === value ? "default" : "outline"}
              aria-pressed={zone === value}
              onClick={() => setZone(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        <label className="mt-4 block max-w-xs">
          Cart subtotal GH₵
          <input
            type="number"
            min="0"
            step="50"
            inputMode="decimal"
            value={subtotal}
            onChange={(e) => setSubtotal(Math.max(0, Number(e.target.value)))}
          />
        </label>
        <p className="mt-4 text-2xl font-semibold">
          {delivery(form, zone, subtotal) === 0 ? (
            <span className="text-success">Free delivery</span>
          ) : (
            <>
              {money(delivery(form, zone, subtotal), true)}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                delivery fee ·{" "}
                {zone === "central"
                  ? "Accra Central"
                  : zone === "greater"
                    ? "Greater Accra"
                    : "Nationwide"}
              </span>
            </>
          )}
        </p>
        <table className="spec-table mt-5">
          <tbody>
            {(
              [
                ["central", "Accra Central & Abelenkpe"],
                ["greater", "Greater Accra"],
                ["nationwide", "Nationwide"],
              ] as const
            ).map(([value, label]) => (
              <tr key={value}>
                <th>{label}</th>
                <td>
                  {delivery(form, value, subtotal) === 0
                    ? "Free"
                    : money(delivery(form, value, subtotal))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">
          Pickup and carts over {money(form.free_threshold)} always ship free. A saved fee of 0
          makes that zone free.
        </p>
      </Panel>
    </form>
  );
}
