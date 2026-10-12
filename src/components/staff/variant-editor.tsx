import { useEffect, useState } from "react";
import { useConvexMutation } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../../convex/_generated/api";
import { convexQueryOptions } from "@/lib/convex";
import { Button } from "@/components/ui/button";
import { errorMessage, money } from "@/lib/store";
import { toast } from "sonner";
import {
  VARIANT_LIMITS,
  combineAxes,
  deriveAxes,
  swatchFor,
  variantLabel,
} from "../../../convex/lib/variants";

type AxisDraft = { name: string; values: string[] };

/** One option row as the editor holds it — strings, because forms take text. */
type RowDraft = {
  key: string;
  name: string;
  options: Record<string, string>;
  /** Blank = inherit the product's price. */
  price: string;
  sku: string;
  /** The on-hand count, not a delta — staff correct it to the shelf. */
  stock: string;
  visible: boolean;
  /**
   * Carried through untouched. This panel does not edit them, but the save
   * replaces the whole row, so dropping them here would silently erase a
   * variant photo or a per-option cost every time stock was edited.
   */
  image_key: string | null;
  cost_price: number | null;
};

type Props = {
  slug: string;
  /** The product's own price, shown as the fallback when a row's price is blank. */
  basePrice: number;
};

/**
 * The "Options" panel: Colour, Size, Material — each with its own stock, price
 * and SKU.
 *
 * Axes are never saved on their own. They are *derived* from the rows
 * (`deriveAxes`), so an axis can never name a value no variant actually has —
 * this panel only edits the axes it has reconstructed from those rows, then
 * cross-multiplies them back into rows.
 *
 * `expected_version` is deliberately not sent: `saveVariants` replaces the
 * whole list in one call, and the product's `version` moves every time variants
 * are saved (the stock aggregate is recomputed), so a version taken before the
 * save would reject the second one. The full replace *is* the guard.
 */
export function VariantEditor({ slug, basePrice }: Props) {
  const rowsQuery = useQuery({
    ...convexQueryOptions(api.catalogue.variantList, { slug }),
  });
  const saveVariants = useConvexMutation(api.catalogue.saveVariants);

  const [axes, setAxes] = useState<AxisDraft[]>([]);
  const [rows, setRows] = useState<RowDraft[]>([]);
  const [seeded, setSeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newAxis, setNewAxis] = useState("");
  /** Inline "add a value" boxes, keyed by axis name. */
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  // Seed once per load. Deliberately *not* re-run after a save: keeping the
  // drafts in place means an unfinished edit is never thrown away by a
  // background refetch, and the local rows already match what was saved.
  useEffect(() => {
    if (seeded || !rowsQuery.data) return;
    const docs = rowsQuery.data;
    setAxes(
      deriveAxes(docs.map((doc) => ({ options: doc.options }))).map((axis) => ({
        name: axis.name,
        values: [...axis.values],
      })),
    );
    setRows(
      docs.map((doc) => ({
        key: doc.key,
        name: doc.name,
        options: doc.options,
        price: doc.price != null ? String(doc.price) : "",
        sku: doc.sku ?? "",
        stock: String(doc.stock),
        visible: doc.visible,
        image_key: doc.image_key ?? null,
        cost_price: doc.cost_price ?? null,
      })),
    );
    setSeeded(true);
  }, [rowsQuery.data, seeded]);

  const setRow = (key: string, patch: Partial<RowDraft>): void =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addAxis = (): void => {
    const name = newAxis.trim();
    if (name === "") return;
    if (axes.length >= VARIANT_LIMITS.axes) {
      toast.error(`That is the limit of ${VARIANT_LIMITS.axes} kinds of option.`);
      return;
    }
    if (axes.some((axis) => axis.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`You already have an option called “${name}”.`);
      return;
    }
    if (name.length > VARIANT_LIMITS.axisName) {
      toast.error(`Keep the option name under ${VARIANT_LIMITS.axisName} characters.`);
      return;
    }
    setAxes((current) => [...current, { name, values: [] }]);
    setNewAxis("");
  };

  const addValue = (axis: string): void => {
    const raw = newValues[axis] ?? "";
    const value = raw.trim();
    if (value === "") return;
    if (value.length > VARIANT_LIMITS.valueName) {
      toast.error(`Keep each value under ${VARIANT_LIMITS.valueName} characters.`);
      return;
    }
    setAxes((current) =>
      current.map((row) => {
        if (row.name !== axis) return row;
        if (row.values.length >= VARIANT_LIMITS.valuesPerAxis) {
          toast.error(`“${axis}” already has ${VARIANT_LIMITS.valuesPerAxis} values.`);
          return row;
        }
        if (row.values.some((v) => v.toLowerCase() === value.toLowerCase())) {
          toast.error(`“${value}” is already one of your ${axis} values.`);
          return row;
        }
        return { ...row, values: [...row.values, value] };
      }),
    );
    setNewValues((current) => ({ ...current, [axis]: "" }));
  };

  const removeValue = (axis: string, index: number): void =>
    setAxes((current) =>
      current.map((row) =>
        row.name === axis ? { ...row, values: row.values.filter((_, i) => i !== index) } : row,
      ),
    );

  const removeAxis = (index: number): void =>
    setAxes((current) => current.filter((_, i) => i !== index));

  /**
   * Cross the axes into rows, keeping every row that already exists.
   *
   * Matching by `key` is what makes this safe to press twice: stock, SKU and
   * price survive a re-generation untouched, and only genuinely new
   * combinations arrive at 0.
   */
  const build = (): void => {
    const combos = combineAxes(axes);
    if (combos.length === 0) {
      toast.error("Add an option — for example “Colour” — and give it at least one value.");
      return;
    }
    if (combos.length > VARIANT_LIMITS.combinations) {
      toast.error(
        `That is ${combos.length} combinations — the limit is ${VARIANT_LIMITS.combinations}.`,
      );
      return;
    }
    const live = new Set(combos.map((combo) => combo.key));
    const dropping = rows.filter((row) => !live.has(row.key) && Number(row.stock) > 0);
    if (
      dropping.length > 0 &&
      !window.confirm(
        `Removing these values takes ${dropping.length} option${dropping.length === 1 ? "" : "s"} out of sale:\n\n` +
          `${dropping.map((row) => row.name).join(", ")}\n\n` +
          `Their stock will be written off with a note in the movement log. Continue?`,
      )
    ) {
      return;
    }

    const byKey = new Map(rows.map((row) => [row.key, row]));
    const order = axes.map((axis) => axis.name);
    setRows(
      combos.map((combo) => {
        const existing = byKey.get(combo.key);
        if (existing) return existing;
        return {
          key: combo.key,
          name: combo.name || variantLabel(combo.options, order),
          options: combo.options,
          price: "",
          sku: "",
          stock: "0",
          visible: true,
          image_key: null,
          cost_price: null,
        };
      }),
    );
    toast.success(`${combos.length} option${combos.length === 1 ? "" : "s"} laid out.`);
  };

  const save = async (): Promise<void> => {
    if (rows.length === 0) {
      toast.error("Build your combinations first — an empty list would clear every option.");
      return;
    }

    const payload: {
      key: string;
      name: string;
      options: Record<string, string>;
      price: number | null;
      sku: string | null;
      image_key: string | null;
      cost_price: number | null;
      stock: number;
      visible: boolean;
    }[] = [];

    for (const row of rows) {
      const stock = Number(row.stock);
      if (!Number.isInteger(stock) || stock < 0) {
        toast.error(`Stock for “${row.name}” must be a whole number of 0 or more.`);
        return;
      }
      let price: number | null = null;
      if (row.price.trim() !== "") {
        price = Number(row.price);
        if (!Number.isFinite(price) || price <= 0) {
          toast.error(
            `The price for “${row.name}” must be above zero — or leave it blank to keep ${money(basePrice)}.`,
          );
          return;
        }
      }
      payload.push({
        key: row.key,
        name:
          row.name.trim() === ""
            ? variantLabel(
                row.options,
                axes.map((a) => a.name),
              )
            : row.name.trim(),
        options: row.options,
        price,
        sku: row.sku.trim() === "" ? null : row.sku.trim().toUpperCase(),
        image_key: row.image_key,
        cost_price: row.cost_price,
        stock,
        visible: row.visible,
      });
    }

    setBusy(true);
    try {
      const result = await saveVariants({ slug, variants: payload });
      toast.success(
        `Saved ${result.count} option${result.count === 1 ? "" : "s"} for this product.`,
      );
    } catch (err) {
      toast.error(errorMessage(err, "The options could not be saved."));
    } finally {
      setBusy(false);
    }
  };

  if (rowsQuery.isPending) {
    return <p className="text-sm text-muted-foreground">Loading options…</p>;
  }
  if (rowsQuery.isError) {
    return (
      <p className="text-sm text-destructive">
        The options could not be loaded. {errorMessage(rowsQuery.error, "")}
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        A product can sell in versions — Black or White, Small or Large — and each one keeps its own
        stock, price and SKU. The product's own stock becomes the total across them. Leave a price
        blank to use the product price of {money(basePrice)}.
      </p>

      {/* ---- axes ---- */}
      <div>
        <h4 className="mb-2 font-semibold">Option types</h4>
        {axes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Start with Colour, then add values below.
          </p>
        ) : (
          <ul className="space-y-3">
            {axes.map((axis, axisIndex) => (
              <li key={axisIndex} className="rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    aria-label={`Option type ${axisIndex + 1} name`}
                    value={axis.name}
                    onChange={(e) =>
                      setAxes((current) =>
                        current.map((row, i) =>
                          i === axisIndex ? { ...row, name: e.target.value } : row,
                        ),
                      )
                    }
                    className="min-w-0 flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Remove option type ${axis.name}`}
                    onClick={() => removeAxis(axisIndex)}
                  >
                    ×
                  </Button>
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  {axis.values.map((value, valueIndex) => (
                    <span
                      key={`${value}-${valueIndex}`}
                      className="flex min-h-[44px] items-center gap-1 rounded-xl border border-border pl-3 pr-1 text-sm"
                    >
                      {swatchFor(value) !== null &&
                      axis.name.trim().toLowerCase().startsWith("colo") ? (
                        <span
                          aria-hidden="true"
                          className="inline-block size-3.5 shrink-0 rounded-full border border-border"
                          style={{ backgroundColor: swatchFor(value) as string }}
                        />
                      ) : null}
                      {value}
                      <Button
                        type="button"
                        variant="ghost"
                        aria-label={`Remove ${value}`}
                        onClick={() => removeValue(axis.name, valueIndex)}
                      >
                        ×
                      </Button>
                    </span>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <input
                    aria-label={`Add a value to ${axis.name}`}
                    placeholder={`e.g. ${axis.name === "Colour" ? "Black" : "Large"}`}
                    value={newValues[axis.name] ?? ""}
                    onChange={(e) =>
                      setNewValues((current) => ({ ...current, [axis.name]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addValue(axis.name);
                      }
                    }}
                    className="min-w-0 max-w-48"
                  />
                  <Button type="button" variant="outline" onClick={() => addValue(axis.name)}>
                    Add value
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            aria-label="New option type"
            placeholder="e.g. Material"
            value={newAxis}
            onChange={(e) => setNewAxis(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAxis();
              }
            }}
            className="min-w-0 max-w-56"
          />
          <Button type="button" variant="outline" onClick={addAxis}>
            Add option
          </Button>
          <Button type="button" variant="outline" onClick={build}>
            Build combinations
          </Button>
        </div>
      </div>

      {/* ---- rows ---- */}
      <div>
        <h4 className="mb-2 font-semibold">
          {rows.length === 0 ? "Options" : `${rows.length} in total`}
        </h4>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Once you have picked your values, press <strong>Build combinations</strong> to lay them
            out here.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => {
              const colour = Object.entries(row.options).find(([axis]) =>
                axis.trim().toLowerCase().startsWith("colo"),
              )?.[1];
              const swatch = swatchFor(colour ?? "");
              return (
                <li key={row.key} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {swatch !== null ? (
                      <span
                        aria-hidden="true"
                        className="inline-block size-4 shrink-0 rounded-full border border-border"
                        style={{ backgroundColor: swatch }}
                      />
                    ) : null}
                    <input
                      aria-label={`Label for ${row.name}`}
                      value={row.name}
                      onChange={(e) => setRow(row.key, { name: e.target.value })}
                      className="min-w-0 flex-1 font-semibold"
                    />
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-sm">
                      Price
                      <input
                        aria-label={`Price for ${row.name}`}
                        inputMode="decimal"
                        placeholder={money(basePrice)}
                        value={row.price}
                        onChange={(e) => setRow(row.key, { price: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      SKU
                      <input
                        aria-label={`SKU for ${row.name}`}
                        maxLength={40}
                        placeholder="Optional"
                        value={row.sku}
                        onChange={(e) => setRow(row.key, { sku: e.target.value })}
                      />
                    </label>
                    <label className="text-sm">
                      On hand
                      <input
                        aria-label={`Stock for ${row.name}`}
                        inputMode="numeric"
                        placeholder="0"
                        value={row.stock}
                        onChange={(e) => setRow(row.key, { stock: e.target.value })}
                      />
                    </label>
                  </div>

                  <label className="mt-3 flex min-h-[44px] items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={row.visible}
                      onChange={(e) => setRow(row.key, { visible: e.target.checked })}
                      className="size-5"
                    />
                    Sell this option on the storefront
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={save} disabled={busy || rows.length === 0}>
          {busy ? "Saving…" : "Save options"}
        </Button>
        <p className="self-center text-xs text-muted-foreground">
          Saving writes a stock movement for every count that changed, so the log explains each one.
        </p>
      </div>
    </div>
  );
}
