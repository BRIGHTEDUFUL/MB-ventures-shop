import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { Plus } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead, storeQuery, type Category } from "@/lib/store";
import { images } from "@/lib/store-images";
import { useImageUpload } from "@/lib/upload-image";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/staff/bits";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/categories")({
  head: () =>
    pageHead(
      "Categories",
      "Create, reorder and hide the categories that structure the storefront.",
    ),
  component: CategoriesPage,
});

type Draft = {
  id: string;
  isNew: boolean;
  name: string;
  short_name: string;
  image_key: string;
  sort_order: string;
  visible: boolean;
};

const toDraft = (c?: Category, sortOrder = 0): Draft => ({
  id: c?.id ?? "",
  isNew: c === undefined,
  name: c?.name ?? "",
  short_name: c?.short_name ?? "",
  image_key: c?.image_key ?? "",
  sort_order: c ? String(c.sort_order) : String(sortOrder),
  visible: c?.visible ?? true,
});

function CategoriesPage() {
  const store = useQuery(storeQuery);
  const [editing, setEditing] = useState<Draft | null>(null);

  if (store.isPending) return <p className="text-sm text-muted-foreground">Loading categories…</p>;
  if (store.isError) return <p role="alert">Categories could not load. Reload the page.</p>;

  const categories = [...store.data.categories].sort((a, b) => a.sort_order - b.sort_order);
  const productCounts = new Map<string, number>();
  for (const p of store.data.products) {
    productCounts.set(p.category, (productCounts.get(p.category) ?? 0) + 1);
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">Categories</h2>
          <p className="page-lead">
            Categories drive the navigation and the catalogue filters. Hidden ones stay out of the
            storefront.
          </p>
        </div>
        <Button onClick={() => setEditing(toDraft(undefined, categories.length))}>
          <Plus className="size-4" aria-hidden />
          Add category
        </Button>
      </div>

      {editing && (
        <div className="mt-6">
          <CategoryEditor
            draft={editing}
            onDone={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {categories.length === 0 && !editing ? (
          <EmptyState title="No categories yet" hint="Add the first one to structure the shop." />
        ) : (
          categories.map((c) => (
            <div key={c.id} className="solid-panel flex items-center gap-4">
              <img src={images[c.image_key]} alt="" className="size-14 rounded-lg object-cover" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {c.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">/{c.id}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.short_name} · order {c.sort_order} · {productCounts.get(c.id) ?? 0} product
                  {(productCounts.get(c.id) ?? 0) === 1 ? "" : "s"}
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${c.visible ? "text-success" : "text-offer"}`}
              >
                {c.visible ? "Visible" : "Hidden"}
              </span>
              <Button variant="outline" size="sm" onClick={() => setEditing(toDraft(c))}>
                Edit
              </Button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CategoryEditor({
  draft,
  onDone,
  onCancel,
}: {
  draft: Draft;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState(draft);
  const [busy, setBusy] = useState(false);
  const saveCategory = useConvexMutation(api.categories.save);
  const deleteCategory = useConvexMutation(api.categories.remove);
  const uploadImage = useImageUpload();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const sortOrder = Number(d.sort_order);
    if (!Number.isInteger(sortOrder) || sortOrder < 0) {
      toast.error("Sort order must be a whole number.");
      return;
    }
    setBusy(true);
    try {
      await saveCategory({
        isNew: d.isNew,
        id: d.id,
        name: d.name,
        short_name: d.short_name,
        image_key: d.image_key || "desk",
        sort_order: sortOrder,
        visible: d.visible,
      });
      toast.success(d.isNew ? "Category added" : "Category saved");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Category could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove the “${d.name}” category? Products must be moved first.`)) return;
    setBusy(true);
    try {
      await deleteCategory({ id: d.id });
      toast.success("Category removed");
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Category could not be removed."));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      set("image_key", await uploadImage(file));
      toast.success("Photo uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
    }
    setBusy(false);
  };

  return (
    <Panel
      title={d.isNew ? "New category" : `Edit ${draft.name}`}
      description="The link name is generated from the category name when created."
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label>
            Name
            <input
              required
              value={d.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Desks"
            />
          </label>
          <label>
            Short name (navigation)
            <input
              value={d.short_name}
              onChange={(e) => set("short_name", e.target.value)}
              placeholder="e.g. Desks"
            />
          </label>
          <label>
            Sort order
            <input
              type="number"
              min="0"
              step="1"
              value={d.sort_order}
              onChange={(e) => set("sort_order", e.target.value)}
            />
          </label>
          <div>
            <span className="text-sm font-medium">Photo</span>
            <div className="mt-2 flex items-center gap-3">
              <img src={images[d.image_key]} alt="" className="size-14 rounded-lg object-cover" />
              <label className="text-sm">
                {d.image_key ? "Replace photo" : "Upload photo"}
                <input
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => {
                    upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <label className="filter-line">
          <input
            type="checkbox"
            checked={d.visible}
            onChange={(e) => set("visible", e.target.checked)}
          />
          Visible in the storefront navigation
        </label>
        <div className="flex flex-wrap gap-3">
          <Button disabled={busy}>{busy ? "Working…" : "Save category"}</Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          {!d.isNew && (
            <Button
              type="button"
              variant="ghost"
              className="ml-auto text-destructive"
              onClick={remove}
            >
              Remove category
            </Button>
          )}
        </div>
      </form>
    </Panel>
  );
}
