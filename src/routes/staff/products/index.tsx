import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { Plus } from "lucide-react";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../../convex/_generated/api";
import { errorMessage, money, storeQuery, type Product } from "@/lib/store";
import { images } from "@/lib/store-images";
import { Button } from "@/components/ui/button";
import { EmptyState, QueryState } from "@/components/staff/bits";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/products/")({
  head: () => pageHeadLocal(),
  component: ProductsList,
});

function pageHeadLocal() {
  return {
    meta: [{ title: "Products | MB Ventures GH" }],
  };
}

type BulkKind = "verified" | "sample" | "category" | "price_percent" | "price_amount" | "stock";

function ProductsList() {
  const navigate = useNavigate();
  const store = useQuery(storeQuery);
  const bulkUpdate = useConvexMutation(api.catalogue.bulkUpdate);

  const [search, setSearch] = useState("");
  const [show, setShow] = useState<"all" | "sample" | "verified">("all");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkKind, setBulkKind] = useState<BulkKind>("verified");
  const [bulkValue, setBulkValue] = useState("");
  const [busy, setBusy] = useState(false);

  const products = useMemo(() => store.data?.products ?? [], [store.data]);
  const categories = useMemo(() => store.data?.categories ?? [], [store.data]);

  const list = useMemo(
    () =>
      products.filter((p) => {
        if (show === "sample" && p.verified) return false;
        if (show === "verified" && !p.verified) return false;
        if (category !== "" && p.category !== category) return false;
        const needle = search.trim().toLowerCase();
        if (needle !== "" && !`${p.name} ${p.brand} ${p.id}`.toLowerCase().includes(needle))
          return false;
        return true;
      }),
    [products, show, category, search],
  );

  const allVisibleSelected = list.length > 0 && list.every((p) => selected.has(p.id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelected((prev) => {
      if (allVisibleSelected) return new Set<string>();
      const next = new Set(prev);
      for (const p of list) next.add(p.id);
      return next;
    });

  const applyBulk = async () => {
    const ids = [...selected];
    if (ids.length === 0) return;
    const changes: Parameters<typeof bulkUpdate>[0]["changes"] = {};
    switch (bulkKind) {
      case "verified":
        changes.verified = true;
        break;
      case "sample":
        changes.verified = false;
        break;
      case "category":
        if (bulkValue === "") {
          toast.error("Choose a category to move to.");
          return;
        }
        changes.category = bulkValue;
        break;
      case "price_percent": {
        const pct = Number(bulkValue);
        if (!pct) {
          toast.error("Enter a percentage, e.g. 10 or -15.");
          return;
        }
        changes.price_percent = pct;
        break;
      }
      case "price_amount": {
        const amount = Number(bulkValue);
        if (!amount) {
          toast.error("Enter an amount in GH₵, e.g. 20 or -5.");
          return;
        }
        changes.price_amount = amount;
        break;
      }
      case "stock": {
        const stock = Number(bulkValue);
        if (!Number.isInteger(stock) || stock < 0) {
          toast.error("Enter a whole number of units.");
          return;
        }
        changes.stock = stock;
        break;
      }
    }
    setBusy(true);
    try {
      const result = await bulkUpdate({ ids, changes });
      toast.success(
        `Updated ${result.updated} product${result.updated === 1 ? "" : "s"}` +
          (result.clearedSales > 0
            ? ` (cleared ${result.clearedSales} sale price${result.clearedSales === 1 ? "" : "s"})`
            : ""),
      );
      setSelected(new Set());
      setBulkValue("");
    } catch (err) {
      toast.error(errorMessage(err, "Products could not be updated."));
    } finally {
      setBusy(false);
    }
  };

  const needsValue = bulkKind !== "verified" && bulkKind !== "sample";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="page-title">Products</h2>
          <p className="page-lead">
            Keep names, prices, stock and photos true to the shop. Samples cannot be ordered.
          </p>
        </div>
        <Button asChild>
          <Link to="/staff/products/new">
            <Plus className="size-4" aria-hidden />
            Add product
          </Link>
        </Button>
      </div>

      <div className="toolbar mt-6">
        <input
          aria-label="Search products"
          placeholder="Search name, brand or link"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Show listings"
          value={show}
          onChange={(e) => setShow(e.target.value as typeof show)}
        >
          <option value="all">All listings</option>
          <option value="sample">Samples only</option>
          <option value="verified">Verified only</option>
        </select>
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <QueryState pending={store.isPending} error={store.isError} label="Products" />

      {store.isPending ? null : (
        <>
          {selected.size > 0 && (
            <div className="solid-panel mt-5">
              <p className="mb-3 text-sm font-semibold">
                {selected.size} selected
                <button
                  type="button"
                  className="ml-3 text-xs font-normal text-link hover:underline"
                  onClick={() => setSelected(new Set())}
                >
                  Clear selection
                </button>
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[12rem] flex-1">
                  Bulk action
                  <select
                    value={bulkKind}
                    onChange={(e) => {
                      setBulkKind(e.target.value as BulkKind);
                      setBulkValue("");
                    }}
                  >
                    <option value="verified">Mark verified</option>
                    <option value="sample">Mark as sample</option>
                    <option value="category">Move to category…</option>
                    <option value="price_percent">Change price by %…</option>
                    <option value="price_amount">Change price by GH₵…</option>
                    <option value="stock">Set stock to…</option>
                  </select>
                </label>
                {needsValue && (
                  <label className="min-w-[12rem] flex-1">
                    {bulkKind === "category"
                      ? "Category"
                      : bulkKind === "price_percent"
                        ? "Percentage"
                        : bulkKind === "price_amount"
                          ? "Amount GH₵"
                          : "Units"}
                    {bulkKind === "category" ? (
                      <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
                        <option value="">Choose…</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="number"
                        placeholder={
                          bulkKind === "price_percent"
                            ? "e.g. 10 or -15"
                            : bulkKind === "price_amount"
                              ? "e.g. 20 or -5"
                              : "e.g. 24"
                        }
                        value={bulkValue}
                        onChange={(e) => setBulkValue(e.target.value)}
                      />
                    )}
                  </label>
                )}
                <Button disabled={busy} onClick={applyBulk}>
                  {busy ? "Working…" : "Apply"}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Bulk price changes clear any “was price” that would no longer sit above the new
                price.
              </p>
            </div>
          )}

          {list.length === 0 ? (
            <div className="mt-5">
              <EmptyState
                title="No products match these filters"
                hint="Adjust the search or add a new product."
              />
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              <li className="flex items-center gap-3 px-1 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  aria-label="Select all visible products"
                  checked={allVisibleSelected}
                  onChange={toggleAll}
                />
                Select all ({list.length})
              </li>
              {list.map((p) => (
                <ProductRow
                  key={p.id}
                  product={p}
                  checked={selected.has(p.id)}
                  onToggle={() => toggle(p.id)}
                  categoryLabel={categories.find((c) => c.id === p.category)?.name ?? p.category}
                />
              ))}
            </ul>
          )}
        </>
      )}
      <div className="mt-6">
        <Button variant="outline" onClick={() => navigate({ to: "/staff" })}>
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}

function ProductRow({
  product: p,
  checked,
  onToggle,
  categoryLabel,
}: {
  product: Product;
  checked: boolean;
  onToggle: () => void;
  categoryLabel: string;
}) {
  return (
    <li className="solid-panel flex items-center gap-4">
      <input
        type="checkbox"
        aria-label={`Select ${p.name}`}
        checked={checked}
        onChange={onToggle}
      />
      <img src={images[p.image_key]} alt="" className="size-14 rounded-lg object-cover" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{p.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {p.brand} · {categoryLabel} · {money(p.price)} ·{" "}
          <span className={p.stock === 0 ? "text-destructive" : p.stock <= 5 ? "text-offer" : ""}>
            {p.stock} in stock
          </span>
        </p>
      </div>
      <span
        className={`hidden text-xs font-semibold sm:block ${
          p.verified ? "text-success" : "text-offer"
        }`}
      >
        {p.verified ? "Verified" : "Sample"}
      </span>
      <Button variant="outline" size="sm" asChild>
        <Link to="/staff/products/$id" params={{ id: p.id }}>
          Edit
        </Link>
      </Button>
    </li>
  );
}
