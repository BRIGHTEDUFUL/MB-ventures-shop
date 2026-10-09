import { createFileRoute } from "@tanstack/react-router";

/**
 * `/robots.txt`. Served from a route rather than `public/` so the `Sitemap`
 * line can be absolute — the origin is read from the incoming request, so it
 * is correct on localhost, on a preview host and on the real domain with no
 * configuration. Everything is crawlable; staff, admin and dev tooling are
 * kept out of the index by the `noindex` meta tag in `__root.tsx`.
 */
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: ({ request }) => {
        const origin = new URL(request.url).origin;
        const body =
          "User-agent: Googlebot\nAllow: /\n\n" +
          "User-agent: Bingbot\nAllow: /\n\n" +
          "User-agent: Twitterbot\nAllow: /\n\n" +
          "User-agent: facebookexternalhit\nAllow: /\n\n" +
          "User-agent: *\nAllow: /\n\n" +
          `Sitemap: ${origin}/sitemap.xml\n`;

        return new Response(body, {
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
