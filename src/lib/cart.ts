import type { Product } from "./store";
import type { Variant } from "../../convex/lib/dto";

/**
 * One cart line: the product, the option the shopper chose (when it sells in
 * options) and how many.
 *
 * The variant is stored as the snapshot the shopper saw when they added it —
 * the cart is a decision already made, not a live query — so a later price or
 * stock edit cannot quietly rewrite what they agreed to.
 *
 * Deliberately *not* exported from the store provider: a file that exports a
 * component alongside a plain function loses fast refresh, and the provider
 * already exports enough.
 */
export type Line = { product: Product; variant?: Variant; quantity: number };

/**
 * The cart's merge identity: product plus option.
 *
 * Two colours of one product are two lines; two of the same colour merge. A
 * line with no option (a product that never had them, or one added from the
 * grid) maps to `${id}/` and behaves exactly as the cart did before options
 * existed.
 */
export function lineKey(line: { product: Product; variant?: Variant | undefined }): string {
  return `${line.product.id}/${line.variant?.key ?? ""}`;
}
