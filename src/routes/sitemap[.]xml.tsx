import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";

/**
 * `/sitemap.xml`, built per request so it never goes stale when staff add a
 * product. The origin comes from the incoming request rather than an env var,
 * which is what makes it correct on localhost, on a preview host and on the
 * real domain without any configuration.
 */

/** Pages that exist without any data — the `$page` route serves each of these. */
const CONTENT_PAGES = [
  "about",
  "delivery",
  "warranty",
  "faq",
  "contact",
  "terms",
  "privacy",
] as const;

const STATIC_PATHS = ["/", "/catalogue", "/track", ...CONTENT_PAGES.map((page) => `/${page}`)];

const escapeXml = (value: string) =>
  value.replace(
    /[<>&'"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] ?? c,
  );

const urlEntry = (loc: string, priority: string) =>
  `  <url>\n    <loc>${escapeXml(loc)}</loc>\n    <priority>${priority}</priority>\n  </url>\n`;

/** Product slugs straight from the public storefront query; empty when Convex is unreachable. */
async function productPaths(): Promise<string[]> {
  try {
    const origin = import.meta.env["VITE_CONVEX_URL"];
    if (!origin) return [];
    const data = await new ConvexHttpClient(origin).query(api.store.get, {});
    // Hidden drafts still come back from the query — the sitemap must never
    // advertise a route that 404s for shoppers.
    return data.products
      .filter((p: { visible?: boolean }) => p.visible !== false)
      .map((p: { id: string }) => `/product/${p.id}`);
  } catch {
    // A sitemap that is one entry short beats a 500 for the crawler.
    return [];
  }
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const origin = new URL(request.url).origin;
        const paths = [...STATIC_PATHS, ...(await productPaths())];
        const xml =
          '<?xml version="1.0" encoding="UTF-8"?>\n' +
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
          paths.map((path) => urlEntry(`${origin}${path}`, path === "/" ? "1.0" : "0.7")).join("") +
          "</urlset>\n";

        return new Response(xml, {
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
