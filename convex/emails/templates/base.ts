/**
 * Shared HTML/text layout for every template.
 *
 * A template builds a list of typed `BodyBlock`s; `renderEmail` turns the same
 * list into table-based inline-CSS HTML *and* a plain-text alternative, so a
 * message can never ship without its text version.
 *
 * Copy rules enforced by hand (no emoji, no exclamation marks, no em dashes,
 * sentence case) — there is no linter for prose, so the helpers stay boring.
 */

export type ShopContext = {
  name: string;
  address: string;
  hours: string;
  phone: string;
  email: string;
};

export type RenderContext = {
  siteUrl: string;
  shop: ShopContext;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export type OrderLine = { name: string; quantity: number; money: string };

export type BodyBlock =
  | { kind: "lead"; text: string }
  | { kind: "p"; text: string }
  | { kind: "rows"; rows: [string, string][] }
  | { kind: "items"; items: OrderLine[] }
  | { kind: "note"; text: string }
  | { kind: "quote"; text: string };

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Every value that came from a customer or staff member goes through this. */
export const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

export const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

export const num = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export const asRecord = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

/**
 * Ghana cedis, formatted without `Intl` so the Convex runtime, Node and the
 * browser all produce byte-identical output (and tests can assert on it).
 */
export function formatMoney(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  const [whole, fraction] = Math.abs(safe).toFixed(2).split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${safe < 0 ? "-" : ""}GH₵ ${grouped}.${fraction}`;
}

/** Absolute link built from SITE_URL; a trailing slash is normalised away. */
export const siteLink = (ctx: RenderContext, path: string): string =>
  `${ctx.siteUrl.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`;

const FONT =
  "'Archivo', 'Public Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const INK = "#14181F";
const MUTED = "#5b6472";
const RULE = "#e6e8ec";

const pStyle = `margin:0 0 16px 0;font-family:${FONT};font-size:15px;line-height:1.65;color:${INK};`;
const labelStyle = `margin:0;font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};`;

function renderHtmlBlock(block: BodyBlock): string {
  switch (block.kind) {
    case "lead":
      return `<p style="${pStyle}">${escapeHtml(block.text)}</p>`;
    case "p":
      return `<p style="${pStyle}">${escapeHtml(block.text)}</p>`;
    case "rows":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border-collapse:collapse;">${block.rows
        .map(
          ([label, value]) =>
            `<tr><td style="${labelStyle}padding:6px 0;border-top:1px solid ${RULE};vertical-align:top;">${escapeHtml(label)}</td>` +
            `<td align="right" style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};padding:6px 0;border-top:1px solid ${RULE};vertical-align:top;">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}</table>`;
    case "items":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;border-collapse:collapse;">${block.items
        .map(
          (item) =>
            `<tr><td style="${labelStyle}padding:8px 0;border-top:1px solid ${RULE};vertical-align:top;">${escapeHtml(
              `${item.quantity} x ${item.name}`,
            )}</td>` +
            `<td align="right" style="margin:0;font-family:${FONT};font-size:14px;line-height:1.5;color:${INK};padding:8px 0;border-top:1px solid ${RULE};vertical-align:top;">${escapeHtml(
              item.money,
            )}</td></tr>`,
        )
        .join("")}</table>`;
    case "note":
      return `<p style="margin:0 0 16px 0;font-family:${FONT};font-size:13px;line-height:1.6;color:${MUTED};">${escapeHtml(
        block.text,
      )}</p>`;
    case "quote":
      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px 0;"><tr><td style="margin:0;padding:12px 16px;background:#f5f6f8;border-left:3px solid ${INK};font-family:${FONT};font-size:14px;line-height:1.6;color:${INK};white-space:pre-wrap;">${escapeHtml(
        block.text,
      )}</td></tr></table>`;
  }
}

function renderTextBlock(block: BodyBlock): string {
  switch (block.kind) {
    case "lead":
    case "p":
      return block.text;
    case "rows":
      return block.rows.map(([label, value]) => `${label}: ${value}`).join("\n");
    case "items":
      return block.items
        .map((item) => `${item.quantity} x ${item.name} - ${item.money}`)
        .join("\n");
    case "note":
      return block.text;
    case "quote":
      return block.text
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
  }
}

export type RenderEmailOptions = {
  ctx: RenderContext;
  subject: string;
  heading: string;
  blocks: BodyBlock[];
  cta?: { href: string; label: string } | undefined;
};

/** Builds the 600px table layout and its text twin in one pass. */
export function renderEmail(options: RenderEmailOptions): RenderedEmail {
  const { ctx, subject, heading, blocks, cta } = options;

  const htmlBlocks = blocks.map(renderHtmlBlock).join("\n");
  const ctaHtml =
    cta === undefined
      ? ""
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px 0;"><tr><td style="background:${INK};border-radius:6px;">` +
        `<a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:12px 22px;font-family:${FONT};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(
          cta.label,
        )}</a>` +
        `</td></tr></table>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ${RULE};border-radius:8px;border-collapse:separate;">
<tr>
<td style="padding:26px 32px 4px 32px;font-family:${FONT};font-size:17px;font-weight:700;letter-spacing:0.02em;color:${INK};">${escapeHtml(
    ctx.shop.name,
  )}</td>
</tr>
<tr>
<td style="padding:0 32px 6px 32px;font-family:${FONT};font-size:20px;line-height:1.35;font-weight:700;color:${INK};">${escapeHtml(
    heading,
  )}</td>
</tr>
<tr>
<td style="padding:8px 32px 0 32px;">
${htmlBlocks}
${ctaHtml}
</td>
</tr>
<tr>
<td style="padding:18px 32px 26px 32px;border-top:1px solid ${RULE};font-family:${FONT};font-size:12px;line-height:1.75;color:${MUTED};">
${escapeHtml(ctx.shop.address)}<br>
${escapeHtml(ctx.shop.hours)}<br>
${escapeHtml(ctx.shop.phone)} · ${escapeHtml(ctx.shop.email)}<br>
You are receiving this message because it relates to your MB Ventures GH account or order.
</td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const textParts = [`${ctx.shop.name}`, "", heading, ""];
  for (const block of blocks) {
    textParts.push(renderTextBlock(block), "");
  }
  if (cta !== undefined) textParts.push(`${cta.label}: ${cta.href}`, "");
  textParts.push(
    ctx.shop.address,
    ctx.shop.hours,
    `${ctx.shop.phone} · ${ctx.shop.email}`,
    "You are receiving this message because it relates to your MB Ventures GH account or order.",
  );

  return { subject, html, text: textParts.join("\n").replace(/\n{3,}/g, "\n\n") };
}
