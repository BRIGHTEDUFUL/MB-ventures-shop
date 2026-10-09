import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { convexQueryOptions } from "@/lib/convex";
import { api } from "../../../convex/_generated/api";
import { errorMessage, pageHead, storeQuery } from "@/lib/store";
import { images } from "@/lib/store-images";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, QueryState } from "@/components/staff/bits";
import { toast } from "sonner";

export const Route = createFileRoute("/staff/inventory")({
  head: () => pageHead("Inventory", "Correct stock levels with a reason and audit every movement."),
  component: InventoryPage,
});

const REASONS = [
  "Restock from supplier",
  "Delivery received",
  "Damaged unit",
  "Count correction",
  "Display unit",
];

/**
 * Only movements that move physical stock can be undone here. Order-driven
 * ones (`reserve` / `release` / `commit`) are reversed by cancelling the
 * order — the server refuses them with that exact instruction, and rows from
 * before the typed ledger arrived carry no type at all, so we do not guess.
 */
const reversible = (type: string | null): boolean =>
  type !== null && !["reserve", "release", "commit"].includes(type);

function InventoryPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [reasonFilter, setReasonFilter] = useState(""); // product slug filter for history

  const store = useQuery(storeQuery);
  const history = useQuery({
    ...convexQueryOptions(api.inventory.history, {
      limit: 50,
      ...(reasonFilter !== "" ? { product_id: reasonFilter } : {}),
    }),
  });
  const adjust = useConvexMutation(api.inventory.adjust);
  const reverse = useConvexMutation(api.inventory.reverse);

  const undo = async (movementId: string, name: string) => {
    try {
      const result = await reverse({ movement_id: movementId });
      toast.success(`${name}: movement undone, stock is back to ${result.stock}`);
    } catch (err) {
      toast.error(errorMessage(err, "That movement could not be undone."));
    }
  };

  const products = useMemo(() => {
    const list = store.data?.products ?? [];
    const needle = search.trim().toLowerCase();
    return list
      .filter((p) => {
        if (filter === "out" && p.stock !== 0) return false;
        if (filter === "low" && !(p.stock > 0 && p.stock <= 5)) return false;
        if (needle !== "" && !`${p.name} ${p.brand} ${p.id}`.toLowerCase().includes(needle))
          return false;
        return true;
      })
      .sort((a, b) => a.stock - b.stock || a.name.localeCompare(b.name));
  }, [store.data, search, filter]);

  const apply = async (slug: string, name: string) => {
    const raw = document.getElementById(`delta-${slug}`) as HTMLInputElement | null;
    const reasonEl = document.getElementById(`reason-${slug}`) as HTMLInputElement | null;
    const delta = Number(raw?.value);
    const reason = reasonEl?.value ?? "";
    if (!Number.isInteger(delta) || delta === 0) {
      toast.error("Enter a whole number change that is not zero (e.g. 12 or -3).");
      return;
    }
    try {
      const result = await adjust({ product_id: slug, delta, reason });
      toast.success(`${name}: stock is now ${result.stock}`);
      if (raw) raw.value = "";
      if (reasonEl) reasonEl.value = "";
    } catch (err) {
      toast.error(errorMessage(err, "Stock could not be updated."));
    }
  };

  return (
    <div>
      <h2 className="page-title">Inventory</h2>
      <p className="page-lead">
        Every change needs a reason and is logged — sales, cancellations and corrections included.
      </p>

      <div className="toolbar mt-6">
        <input
          aria-label="Search stock"
          placeholder="Search product, brand or link"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter stock level"
          value={filter}
          onChange={(e) => setFilter(e.target.value as typeof filter)}
        >
          <option value="all">All stock levels</option>
          <option value="low">Low (1–5 on hand)</option>
          <option value="out">Out of stock</option>
        </select>
      </div>

      <QueryState pending={store.isPending} error={store.isError} label="Inventory" />

      {store.isPending ? null : products.length === 0 ? (
        <div className="mt-5">
          <EmptyState title="No products match these filters" />
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {products.map((p) => (
            <li key={p.id} className="solid-panel">
              <div className="flex flex-wrap items-center gap-4">
                <img src={images[p.image_key]} alt="" className="size-12 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.verified ? "Verified" : "Sample"} ·{" "}
                    <span
                      className={
                        p.stock === 0
                          ? "font-semibold text-destructive"
                          : p.stock <= 5
                            ? "font-semibold text-offer"
                            : ""
                      }
                    >
                      {p.stock} on hand
                    </span>
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setReasonFilter(reasonFilter === p.id ? "" : p.id)}
                >
                  {reasonFilter === p.id ? "All history" : "History"}
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-border pt-3">
                <label className="w-28">
                  Change by
                  <input
                    id={`delta-${p.id}`}
                    type="number"
                    step="1"
                    placeholder={p.stock === 0 ? "+12" : "12 / -3"}
                  />
                </label>
                <label className="min-w-[14rem] flex-1">
                  Reason
                  <input
                    id={`reason-${p.id}`}
                    list="stock-reasons"
                    placeholder="e.g. Restock from supplier"
                  />
                </label>
                <Button size="sm" onClick={() => apply(p.id, p.name)}>
                  Apply
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <datalist id="stock-reasons">
        {REASONS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <div className="mt-8">
        <Panel
          title="Stock movement log"
          description={
            reasonFilter
              ? `Showing movements for one product — “${store.data?.products.find((p) => p.id === reasonFilter)?.name ?? reasonFilter}”.`
              : "Newest first, including sales and cancellations."
          }
          actions={
            reasonFilter ? (
              <Button variant="outline" size="sm" onClick={() => setReasonFilter("")}>
                Show all
              </Button>
            ) : undefined
          }
        >
          {history.isPending ? (
            <p className="text-sm text-muted-foreground">Loading history…</p>
          ) : history.isError ? (
            <p role="alert">History could not load. Reload the page.</p>
          ) : (history.data ?? []).length === 0 ? (
            <EmptyState title="No stock movements yet" hint="Sales and adjustments land here." />
          ) : (
            <ul className="divide-y divide-border text-sm">
              {(history.data ?? []).map((entry) => {
                const delta = entry.new_stock - entry.previous_stock;
                return (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {entry.product_name}
                        {entry.movement_type && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase text-muted-foreground">
                            {entry.movement_type}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.reason} · {entry.actor_name} ·{" "}
                        {new Date(entry.created_at).toLocaleString()}
                        {entry.reversed && " · already reversed"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 font-mono text-sm">
                      <span>
                        {entry.previous_stock} → {entry.new_stock}
                        <span
                          className={`ml-2 font-semibold ${delta > 0 ? "text-success" : "text-offer"}`}
                        >
                          {delta > 0 ? `+${delta}` : delta}
                        </span>
                      </span>
                      {entry.reversed ? (
                        <span className="font-sans text-xs text-muted-foreground">Undone</span>
                      ) : reversible(entry.movement_type) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => undo(entry.id, entry.product_name)}
                        >
                          Undo
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
