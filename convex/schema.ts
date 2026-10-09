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
  user_roles: defineTable({
    user_id: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("staff")),
  }).index("by_user", ["user_id"]),

  // Replaces `public.products`; `slug` is the old text primary key (`id`).
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
  }).index("by_slug", ["slug"]),

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
  inventory_history: defineTable({
    product_slug: v.string(),
    product_name: v.string(),
    previous_stock: v.number(),
    new_stock: v.number(),
    reason: v.string(),
    actor_id: v.optional(v.id("users")),
  }).index("by_product", ["product_slug"]),

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
