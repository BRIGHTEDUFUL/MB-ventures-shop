import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { api } from "../../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import {
  specs as specRows,
  errorMessage,
  type Category,
  type Product,
  type ProductMaster,
} from "@/lib/store";
import { images } from "@/lib/store-images";
import { useImageUpload } from "@/lib/upload-image";
import { toast } from "sonner";

type Draft = {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: string;
  original_price: string;
  stock: string;
  description: string;
  image_key: string;
  gallery: string[];
  specs: [string, string][];
  verified: boolean;
  /** Master data — codes, cost and reorder levels (staff-only fields). */
  sku: string;
  barcode: string;
  supplier: string;
  cost_price: string;
  reorder_point: string;
  reorder_quantity: string;
};

const toDraft = (p?: Product, m?: ProductMaster | null): Draft => ({
  id: p?.id ?? "",
  name: p?.name ?? "",
  brand: p?.brand ?? "",
  category: p?.category ?? "",
  price: p ? String(p.price) : "",
  original_price: p?.original_price != null ? String(p.original_price) : "",
  stock: p ? String(p.stock) : "0",
  description: p?.description ?? "",
  image_key: p?.image_key ?? "",
  gallery: p?.gallery ?? [],
  specs: p ? (specRows(p.specs) as [string, string][]) : [],
  verified: p?.verified ?? false,
  sku: m?.sku ?? "",
  barcode: m?.barcode ?? "",
  supplier: m?.supplier ?? "",
  cost_price: m?.cost_price != null ? String(m.cost_price) : "",
  reorder_point: m?.reorder_point != null ? String(m.reorder_point) : "",
  reorder_quantity: m?.reorder_quantity != null ? String(m.reorder_quantity) : "",
});

/**
 * The one product editor used by "Add product" and every edit page: pricing,
 * stock, description, specifications, photos and the verified flag.
 */
export function ProductForm({
  product,
  master,
  categories,
  onSaved,
  onCancel,
}: {
  product?: Product;
  /** Staff-only master data for this product; `null` while it cannot load. */
  master?: ProductMaster | null;
  categories: Category[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const isNew = product === undefined;
  const [d, setD] = useState<Draft>(() => toDraft(product, master));
  const [busy, setBusy] = useState(false);
  const uploadImage = useImageUpload();
  const saveProduct = useConvexMutation(api.catalogue.saveProduct);
  const deleteProduct = useConvexMutation(api.catalogue.deleteProduct);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const addPhotos = async (files: FileList | null, main: boolean) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadImage(f));
      if (main) {
        set("image_key", urls[0]!);
        if (urls.length > 1) set("gallery", [...d.gallery, ...urls.slice(1)]);
      } else {
        set("gallery", [...d.gallery, ...urls]);
      }
      toast.success("Photo uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    }
    setBusy(false);
  };

  const save = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const price = Number(d.price),
      stock = Number(d.stock),
      orig = d.original_price ? Number(d.original_price) : null,
      cost = d.cost_price.trim() === "" ? null : Number(d.cost_price),
      reorderPoint = d.reorder_point.trim() === "" ? null : Number(d.reorder_point),
      reorderQty = d.reorder_quantity.trim() === "" ? null : Number(d.reorder_quantity);
    if (!(price > 0)) {
      toast.error("Enter a price above zero.");
      return;
    }
    if (cost !== null && !(cost >= 0)) {
      toast.error("Cost must be a number of zero or more.");
      return;
    }
    if (reorderPoint !== null && (!Number.isInteger(reorderPoint) || reorderPoint < 0)) {
      toast.error("Reorder point must be a whole number of zero or more.");
      return;
    }
    if (reorderQty !== null && (!Number.isInteger(reorderQty) || reorderQty < 0)) {
      toast.error("Reorder quantity must be a whole number of zero or more.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      toast.error("Stock must be a whole number.");
      return;
    }
    if (orig !== null && orig <= price) {
      toast.error("Original price must be higher than the sale price.");
      return;
    }
    if (!d.image_key) {
      toast.error("Add a main photo.");
      return;
    }
    if (d.description.trim().length < 10) {
      toast.error("Write a short description (at least 10 characters).");
      return;
    }
    if (
      d.verified &&
      !/^https:\/\//.test(d.image_key) &&
      !window.confirm("This item still uses a stock illustration photo. Mark verified anyway?")
    ) {
      return;
    }
    const id = isNew
      ? (d.id || d.name)
          .toLowerCase()
          .trim()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
      : d.id;
    if (!id) {
      toast.error("Enter a product name.");
      return;
    }
    setBusy(true);
    try {
      await saveProduct({
        isNew,
        id,
        name: d.name.trim(),
        brand: d.brand.trim(),
        category: d.category,
        price,
        original_price: orig,
        stock,
        description: d.description.trim(),
        image_key: d.image_key,
        gallery: d.gallery,
        specs: Object.fromEntries(
          d.specs.filter(([k, v]) => k.trim() && v.trim()).map(([k, v]) => [k.trim(), v.trim()]),
        ),
        verified: d.verified,
        sku: d.sku.trim(),
        barcode: d.barcode.trim(),
        supplier: d.supplier.trim(),
        cost_price: cost,
        reorder_point: reorderPoint,
        reorder_quantity: reorderQty,
        // The stale-editor guard: send the version we loaded so a second tab
        // saving later loses loudly rather than silently discarding the edit.
        ...(isNew || master == null ? {} : { expected_version: master.version }),
      });
      toast.success(isNew ? "Product added" : "Product saved");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "Product could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${d.name} from the catalogue? Past orders keep their details.`))
      return;
    try {
      await deleteProduct({ id: d.id });
      toast.success("Product removed");
      onSaved();
    } catch (error) {
      toast.error(errorMessage(error, "Product could not be removed."));
    }
  };

  return (
    <form onSubmit={save} className="solid-panel space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl">{isNew ? "New product" : `Edit ${product?.name}`}</h2>
        {!isNew && (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              d.verified ? "bg-success/15 text-success" : "bg-offer/15 text-offer"
            }`}
          >
            {d.verified ? "Verified" : "Sample — not orderable"}
          </span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="sm:col-span-2">
          Product name
          <input
            required
            minLength={2}
            value={d.name}
            onChange={(e) => set("name", e.target.value)}
          />
        </label>
        {isNew && (
          <label className="sm:col-span-2">
            Link name (optional)
            <input
              placeholder="e.g. logitech-mx-keys"
              value={d.id}
              onChange={(e) => set("id", e.target.value)}
            />
          </label>
        )}
        <label>
          Brand
          <input required value={d.brand} onChange={(e) => set("brand", e.target.value)} />
        </label>
        <label>
          Category
          <select required value={d.category} onChange={(e) => set("category", e.target.value)}>
            <option value="">Choose a category…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {!c.visible ? " (hidden)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Price GH₵
          <input
            required
            type="number"
            min="0.01"
            step="0.01"
            value={d.price}
            onChange={(e) => set("price", e.target.value)}
          />
        </label>
        <label>
          Was price GH₵ (optional, for sales)
          <input
            type="number"
            min="0"
            step="0.01"
            value={d.original_price}
            onChange={(e) => set("original_price", e.target.value)}
          />
        </label>
        <label className="sm:col-span-2">
          Description
          <textarea
            required
            rows={4}
            value={d.description}
            onChange={(e) => set("description", e.target.value)}
          />
        </label>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Stock &amp; codes</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            Available to sell
            <input
              required
              type="number"
              min="0"
              step="1"
              value={d.stock}
              onChange={(e) => set("stock", e.target.value)}
            />
          </label>
          <label>
            Reorder point (low-stock warning)
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 5"
              value={d.reorder_point}
              onChange={(e) => set("reorder_point", e.target.value)}
            />
          </label>
          <label>
            Reorder quantity
            <input
              type="number"
              min="0"
              step="1"
              placeholder="e.g. 12"
              value={d.reorder_quantity}
              onChange={(e) => set("reorder_quantity", e.target.value)}
            />
          </label>
          <label>
            Cost per unit GH₵ (staff only)
            <input
              type="number"
              min="0"
              step="0.01"
              value={d.cost_price}
              onChange={(e) => set("cost_price", e.target.value)}
            />
          </label>
          <label>
            SKU
            <input
              maxLength={40}
              placeholder="e.g. SD-120-BLK"
              value={d.sku}
              onChange={(e) => set("sku", e.target.value)}
            />
          </label>
          <label>
            Barcode
            <input
              maxLength={40}
              inputMode="numeric"
              placeholder="e.g. 5901234123457"
              value={d.barcode}
              onChange={(e) => set("barcode", e.target.value)}
            />
          </label>
          <label className="sm:col-span-2">
            Supplier
            <input
              maxLength={120}
              placeholder="e.g. Accra Office Supplies"
              value={d.supplier}
              onChange={(e) => set("supplier", e.target.value)}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          SKU and barcode must be unique across the catalogue — the save refuses a duplicate and
          names the product already using it. Cost and supplier never appear on the storefront.
        </p>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Photos</h3>
        <div className="flex flex-wrap gap-3">
          {d.image_key && (
            <figure className="text-center text-xs">
              <img src={images[d.image_key]} alt="Main" className="size-24 rounded object-cover" />
              <figcaption>Main</figcaption>
            </figure>
          )}
          {d.gallery.map((g, i) => (
            <figure key={g + i} className="text-center text-xs">
              <img
                src={images[g]}
                alt={`Extra ${i + 1}`}
                className="size-24 rounded object-cover"
              />
              <div className="flex justify-center gap-1">
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    set(
                      "gallery",
                      [...d.gallery.filter((_, j) => j !== i), d.image_key].filter(Boolean),
                    );
                    set("image_key", g);
                  }}
                >
                  Make main
                </Button>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() =>
                    set(
                      "gallery",
                      d.gallery.filter((_, j) => j !== i),
                    )
                  }
                >
                  Remove
                </Button>
              </div>
            </figure>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="text-sm">
            {d.image_key ? "Replace main photo" : "Upload main photo"}
            <input
              type="file"
              accept="image/*"
              disabled={busy}
              onChange={(e) => {
                addPhotos(e.target.files, true);
                e.target.value = "";
              }}
            />
          </label>
          <label className="text-sm">
            Add more photos
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={busy}
              onChange={(e) => {
                addPhotos(e.target.files, false);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Specifications</h3>
        {d.specs.map(([k, v], i) => (
          <div key={i} className="mb-2 flex gap-2">
            <input
              aria-label="Specification name"
              placeholder="e.g. Dimensions"
              value={k}
              onChange={(e) =>
                set(
                  "specs",
                  d.specs.map((s, j) => (j === i ? [e.target.value, s[1]] : s)),
                )
              }
            />
            <input
              aria-label="Specification value"
              placeholder="e.g. 140 × 70 cm"
              value={v}
              onChange={(e) =>
                set(
                  "specs",
                  d.specs.map((s, j) => (j === i ? [s[0], e.target.value] : s)),
                )
              }
            />
            <Button
              type="button"
              variant="ghost"
              aria-label="Remove specification"
              onClick={() =>
                set(
                  "specs",
                  d.specs.filter((_, j) => j !== i),
                )
              }
            >
              ×
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() => set("specs", [...d.specs, ["", ""]])}
        >
          Add specification
        </Button>
      </div>

      <label className="filter-line">
        <input
          type="checkbox"
          checked={d.verified}
          onChange={(e) => set("verified", e.target.checked)}
        />
        Verified: name, price, specs, photos and stock match what is in the shop. Only verified
        items can be ordered.
      </label>

      <div className="flex flex-wrap gap-3">
        <Button disabled={busy}>{busy ? "Working…" : "Save product"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {!isNew && (
          <Button
            type="button"
            variant="ghost"
            className="ml-auto text-destructive"
            onClick={remove}
          >
            Remove product
          </Button>
        )}
      </div>
    </form>
  );
}
