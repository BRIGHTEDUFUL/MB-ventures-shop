import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Convex Auth owns `users` + the auth* tables; we inline `users` so it can be
// extended later while keeping the exact indexes the library requires.
const { users: _authUsers, ...authTablesExceptUsers } = authTables;

const zone = v.union(v.literal("central"), v.literal("greater"), v.literal("nationwide"));
const fulfillment = v.union(v.literal("delivery"), v.literal("pickup"));
const paymentMethod = v.union(v.literal("momo"), v.literal("cod"));
const paymentStatus = v.union(v.literal("pending"), v.literal("confirmed"), v.literal("rejected"));
const orderStatus = v.union(
  v.literal("received"),
  v.literal("processing"),
  v.literal("ready"),
  v.literal("dispatched"),
  v.literal("completed"),
  v.literal("cancelled"),
);
/**
 * What a stock movement did. Stored on `inventory_history` so the movements
 * screen can filter (sales vs corrections vs restocks) and so reversal knows
 * which direction to write. Legacy rows predate the field and read as `null`;
 * `movementDTO` infers a type from the reason text for those.
 */
export const movementType = v.union(
  v.literal("opening"), // first stock when a product is created
  v.literal("sale"), // an order took units
  v.literal("restock"), // an order gave units back
  v.literal("receive"), // supplier delivery landed
  v.literal("adjustment"), // manual count correction (+/-)
  v.literal("damage"), // write-off: broken in the shop
  v.literal("loss"), // write-off: unexplained shortage
  v.literal("theft"), // write-off: suspected theft
  v.literal("return"), // customer gave goods back
  v.literal("transfer"), // moved between locations
  v.literal("correction"), // stocktake variance
  v.literal("stocktake"), // stocktake applied
  v.literal("import"), // CSV import
  v.literal("reversal"), // undo of another movement
  // Reservation lifecycle (added with the available/reserved split): an order
  // first *holds* units, the hold is *released* if the order dies on the
  // shelf, and *committed* when the goods actually leave.
  v.literal("reserve"), // order placed: available → reserved
  v.literal("release"), // cancelled before dispatch: reserved → available
  v.literal("commit"), // dispatched/completed: the shelf loses the units
);
/** Closed set of screens/jobs a movement can come from (audit `source`). */
export const movementSource = v.union(
  v.literal("admin"), // admin inventory screens
  v.literal("attendant"), // attendant quick actions
  v.literal("product"), // product editor stock field
  v.literal("bulk"), // bulk update
  v.literal("checkout"), // orders.place
  v.literal("order"), // orders.staffUpdate (cancel/restock)
  v.literal("stocktake"), // stocktake run
  v.literal("import"), // CSV import
  v.literal("system"), // cron or migration
);
/**
 * What has already happened to the units an order is holding, recorded on the
 * order itself so a later status change knows whether to give stock back
 * (`release`) or receive it (`restock`) — and, critically, whether to do
 * *anything* at all. Legacy orders predate the field and are treated as
 * `reserved` while they are still open.
 */
export const stockState = v.union(
  v.literal("reserved"),
  v.literal("committed"),
  v.literal("released"),
  v.literal("restocked"),
);
/**
 * The permission catalogue (spec C1) — the closed set of things a person can
 * be allowed to do in the back office.
 *
 * Keys live here, next to the validators, so `user_roles.overrides` can be
 * typed as a record *of real permissions* rather than free text that quietly
 * stops matching anything. `convex/lib/permissions.ts` holds the labels,
 * groups and role defaults that go with them.
 *
 * Two levels only, and deliberately so: role defaults cover the shop's actual
 * shapes (owner vs attendant), and per-user overrides handle the exceptions.
 * A full custom-role editor is more machinery than one shop needs — see
 * `docs/INVENTORY-DECISIONS.md` D9.
 */
export const PERMISSION_KEYS = [
  // Catalogue
  "catalogue.view",
  "catalogue.edit", // create + edit a listing (product editor)
  "catalogue.delete",
  "catalogue.bulk",
  "catalogue.categories",
  "catalogue.settings", // storefront copy, featured picks, announcement
  "catalogue.delivery", // delivery fees
  "catalogue.momo", // whose wallet the money lands in — admin only
  // Inventory
  "inventory.view",
  "inventory.adjust",
  "inventory.stocktake", // applied counts (M6)
  "inventory.health", // data-health report + fixes
  // Orders
  "orders.view",
  "orders.update", // status/payment transitions, notes, contact fixes
  // Reporting
  "reports.view",
  "activity.view",
  // Media
  "uploads.create",
  // Team
  "team.view",
  "team.manage", // grant, change and revoke roles
  // Email
  "emails.admin", // config, templates, suppression list, test sends
  "emails.note", // clear the bounce-attention flag on an order
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

/**
 * Permission keys as a plain string, for `user_roles.overrides`: Convex
 * records cannot be keyed by a literal union, so the closed set is enforced
 * on write by `lib/permissions.ts` rather than in the validator.
 */
export const permissionKey = v.string();
/** Closed-set validator for "which permission" arguments (`users.setPermission`). */
export const permissionValidator = v.union(...PERMISSION_KEYS.map((key) => v.literal(key)));
/**
 * Icon keys for the homepage trust strip. Kept as a closed union so an
 * invalid key can never reach the client's icon registry — the matching
 * `Record` lives in `src/routes/index.tsx` and must be updated alongside.
 */
export const trustIcon = v.union(
  v.literal("map-pin"),
  v.literal("truck"),
  v.literal("shield-check"),
  v.literal("wallet"),
);
const emailStatus = v.union(
  v.literal("queued"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("skipped_dry_run"),
  v.literal("delivered"),
  v.literal("bounced"),
  v.literal("complained"),
);
const emailCategory = v.union(
  v.literal("customer"),
  v.literal("admin"),
  v.literal("auth"),
  v.literal("contact"),
);

export const validators = {
  zone,
  fulfillment,
  paymentMethod,
  paymentStatus,
  orderStatus,
  trustIcon,
  emailStatus,
  emailCategory,
};

export default defineSchema({
  ...authTablesExceptUsers,

  users: defineTable({
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    image: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"]),

  // Staff/admin privileges. Replaces `public.user_roles` + `is_staff()`.
  //
  // `role` picks the default permission set; `overrides` tweaks that set for
  // one person (`true` grants, `false` takes away) without inventing a new
  // role. Both are optional-friendly: rows written before the permission work
  // validate unchanged, because a missing `overrides` means "no changes".
  user_roles: defineTable({
    user_id: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("staff")),
    overrides: v.optional(v.record(permissionKey, v.boolean())),
  }).index("by_user", ["user_id"]),

  // Replaces `public.products`; `slug` is the old text primary key (`id`).
  //
  // Stock numbers: `stock` is **available to sell** (what the storefront shows
  // and what an order takes from); `reserved` is what open, unpaid orders hold.
  // `on hand = stock + reserved`. Both live here so a single transaction can
  // move them together — see `convex/lib/stock.ts`.
  //
  // Every field added by the inventory work is optional so rows written before
  // it stay valid without a backfill (Convex validates on read).
  products: defineTable({
    slug: v.string(),
    name: v.string(),
    brand: v.string(),
    category: v.string(),
    price: v.number(),
    original_price: v.optional(v.union(v.number(), v.null())),
    stock: v.number(),
    description: v.string(),
    specs: v.record(v.string(), v.string()),
    image_key: v.string(),
    gallery: v.array(v.string()),
    verified: v.boolean(),
    // Units promised to open orders. Missing → 0 (no reservations yet).
    reserved: v.optional(v.number()),
    // Optimistic-concurrency token: bumped on every product save so a stale
    // editor loses loudly (VERSION_CONFLICT) instead of silently overwriting.
    version: v.optional(v.number()),
    // Cost the shop pays, never exposed by any public DTO (`lib/dto.ts`).
    cost_price: v.optional(v.number()),
    // Reorder point / suggested order quantity for the low-stock panel.
    reorder_point: v.optional(v.number()),
    reorder_quantity: v.optional(v.number()),
    // Draft → active → archived. Missing → derived from `verified`
    // (verified → active, else draft) so existing rows keep working.
    status: v.optional(v.union(v.literal("draft"), v.literal("active"), v.literal("archived"))),
    // Hidden from the storefront without archiving (in-store-only lines).
    visible: v.optional(v.boolean()),
    // When a scheduled sale starts/ends; `null`/missing = no schedule.
    sale_starts: v.optional(v.union(v.number(), v.null())),
    sale_ends: v.optional(v.union(v.number(), v.null())),
    // Staff-facing free text; never rendered to shoppers.
    internal_notes: v.optional(v.string()),
    // Admin-defined extra columns (`custom_fields` table), keyed by field key.
    custom: v.optional(v.record(v.string(), v.union(v.string(), v.number(), v.boolean()))),
  })
    .index("by_slug", ["slug"])
    .index("by_status", ["status"])
    .index("by_category", ["category"]),

  // Replaces `public.categories`.
  categories: defineTable({
    slug: v.string(),
    name: v.string(),
    short_name: v.string(),
    image_key: v.string(),
    sort_order: v.number(),
    visible: v.boolean(),
  }).index("by_slug", ["slug"]),

  // Replaces `public.store_settings` (single row, `id = 1`).
  store_settings: defineTable({
    key: v.string(),
    hero_title: v.string(),
    hero_subtitle: v.string(),
    phone: v.string(),
    email: v.string(),
    address: v.string(),
    hours: v.string(),
    momo_number: v.string(),
    momo_name: v.string(),
    central_fee: v.number(),
    greater_fee: v.number(),
    nationwide_fee: v.number(),
    free_threshold: v.number(),
    ordering_enabled: v.boolean(),
    hero_image: v.string(),
    setup_image: v.string(),
    announcement: v.string(),
    whatsapp: v.string(),
    featured_ids: v.array(v.string()),

    // ── Homepage section copy ────────────────────────────────────────────
    // All optional: `store_settings` predates them and existing dev/prod rows
    // would otherwise fail validation. `settingsDTO` fills the defaults, so no
    // backfill or seed re-run is needed.
    //
    // Strings: blank or missing → default copy (staff cannot blank a section).
    // Arrays: missing → default items, `[]` → staff hid the section.
    home_category_heading: v.optional(v.string()),
    home_featured_heading: v.optional(v.string()),
    home_setup_eyebrow: v.optional(v.string()),
    home_setup_heading: v.optional(v.string()),
    home_setup_body: v.optional(v.string()),
    home_cta_heading: v.optional(v.string()),
    home_cta_body: v.optional(v.string()),
    home_brands: v.optional(v.array(v.string())),
    home_trust: v.optional(
      v.array(
        v.object({
          icon: trustIcon,
          title: v.string(),
          text: v.string(),
        }),
      ),
    ),
  }).index("by_key", ["key"]),

  // Replaces `public.orders`. `created_at` is derived from `_creationTime`.
  orders: defineTable({
    reference: v.string(),
    user_id: v.id("users"),
    customer_name: v.string(),
    email: v.string(),
    phone: v.string(),
    address: v.string(),
    fulfillment,
    zone,
    payment_method: paymentMethod,
    provider: v.optional(v.string()),
    transaction_reference: v.optional(v.string()),
    payment_status: paymentStatus,
    status: orderStatus,
    subtotal: v.number(),
    delivery_fee: v.number(),
    total: v.number(),
    items: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        price: v.number(),
        quantity: v.number(),
        image_key: v.string(),
      }),
    ),
    // Set when a message we sent to the customer bounced or was complained
    // about (see `convex/emails/webhook.ts`), cleared by the next message
    // that reaches the address. Never set by checkout itself.
    needs_attention: v.optional(v.string()),
    // What has already happened to the physical units of this order, so a
    // later status change returns them exactly once:
    //   reserved  — held on the shelf (order placed, goods still here)
    //   committed — the goods left; the shelf no longer holds them
    //   released  — cancelled before dispatch; the hold was given back
    //   restocked — cancelled after dispatch; the goods were received back
    // Missing means "legacy": written before this field existed, and treated
    // as `reserved` while the order is still open (see `lib/stock` callers).
    stock_state: v.optional(stockState),
  })
    .index("by_reference", ["reference"])
    .index("by_user", ["user_id"]),

  // Replaces `public.order_history`.
  order_history: defineTable({
    order_id: v.id("orders"),
    status: v.string(),
    note: v.string(),
    actor_id: v.optional(v.id("users")),
  }).index("by_order", ["order_id"]),

  // Replaces `public.saved_addresses`.
  saved_addresses: defineTable({
    user_id: v.id("users"),
    name: v.string(),
    address: v.string(),
    phone: v.string(),
  }).index("by_user", ["user_id"]),

  // Every stock movement (staff adjust, order sale, cancellation restock)
  // leaves a trace so the inventory page can explain any number it shows.
  //
  // The ledger is append-only: rows are written once by `applyStockChange`
  // (`convex/lib/stock.ts`) and never patched or deleted. `previous_stock` /
  // `new_stock` are the **available** counts; `on_hand_before` / `on_hand_after`
  // include reserved units so a sale that only moves stock from available to
  // reserved still explains itself.
  inventory_history: defineTable({
    product_slug: v.string(),
    product_name: v.string(),
    previous_stock: v.number(),
    new_stock: v.number(),
    reason: v.string(),
    actor_id: v.optional(v.id("users")),
    // What happened. Missing on legacy rows → `movementDTO` infers it.
    movement_type: v.optional(movementType),
    // Signed change in available units (`new_stock - previous_stock`).
    delta: v.optional(v.number()),
    on_hand_before: v.optional(v.number()),
    on_hand_after: v.optional(v.number()),
    // Where the change came from (which screen or job).
    source: v.optional(movementSource),
    // Order reference, stocktake id or import batch this movement belongs to.
    reference: v.optional(v.string()),
    // Client-generated key making retried writes no-ops (`applyStockChange`).
    operation_key: v.optional(v.string()),
    // Free-text detail: stocktake counted vs system, transfer destination…
    note: v.optional(v.string()),
    // If set, this row undoes `reverses`; if undone, points at the undo row.
    reverses: v.optional(v.id("inventory_history")),
    reversed_by: v.optional(v.id("inventory_history")),
  })
    .index("by_product", ["product_slug"])
    .index("by_operation", ["operation_key"])
    .index("by_type", ["movement_type"]),

  // Audit trail of day-to-day staff/admin activity (catalogue, settings,
  // roles). Order changes already have `order_history`.
  activity_log: defineTable({
    actor_id: v.optional(v.id("users")),
    actor_name: v.string(),
    action: v.string(),
    summary: v.string(),
  }),

  // One row per outbound message (see `convex/emails/`). `html`/`text` are
  // persisted in dry-run mode only so `/admin/emails` can preview exactly what
  // would have been sent; live rows keep the provider id instead.
  emailLogs: defineTable({
    template: v.string(),
    category: emailCategory,
    to: v.string(),
    subject: v.string(),
    status: emailStatus,
    mode: v.union(v.literal("live"), v.literal("dry-run")),
    order_id: v.union(v.id("orders"), v.null()),
    // Dedupe key: `${template}:${orderId}` for order mail, otherwise
    // `${template}:${recipient}` — see `convex/emails/enqueue.ts`.
    dedupe_ref: v.string(),
    // Rendered template inputs. Deliberately untyped: each template owns the
    // shape of its own payload and coerces defensively when rendering.
    data: v.record(v.string(), v.any()),
    html: v.optional(v.string()),
    text: v.optional(v.string()),
    error: v.optional(v.string()),
    reply_to: v.optional(v.string()),
    tags: v.optional(v.array(v.string())),
    provider_message_id: v.optional(v.string()),
    // Dry-run only: the one-time code an auth email carries, stored when
    // EMAIL_DRY_RUN_LOG_CODES="true" so a developer can complete a flow.
    dry_run_code: v.optional(v.string()),
    attempt: v.number(),
    sent_at: v.optional(v.number()),
  })
    .index("by_status", ["status"])
    .index("by_template", ["template"])
    .index("by_dedupe", ["dedupe_ref"])
    .index("by_provider_id", ["provider_message_id"])
    .index("by_order", ["order_id"]),

  // Recipients we must stop emailing (hard bounces, complaints, manual opt
  // out). Checked on every enqueue; admins can remove an entry.
  suppressedEmails: defineTable({
    email: v.string(),
    reason: v.string(),
    source: v.string(),
    actor_id: v.optional(v.id("users")),
  }).index("by_email", ["email"]),

  // Svix delivery ids already applied, so a resent webhook is a no-op.
  webhook_events: defineTable({
    svix_id: v.string(),
    event_type: v.string(),
    provider_message_id: v.optional(v.string()),
  }).index("by_svix_id", ["svix_id"]),
});
