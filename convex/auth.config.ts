/**
 * Convex Auth provider lookup.
 *
 * `domain` MUST be `CONVEX_SITE_URL`: `@convex-dev/auth` signs every session
 * JWT with `iss = CONVEX_SITE_URL` (see `server/implementation/tokens.ts`),
 * and Convex matches a presented token against this list by issuer. Using the
 * storefront origin (`SITE_URL`) instead makes the match fail with
 * "No auth provider found matching the given token", so `ctx.auth` resolves to
 * nobody — every signed-in user is treated as a customer and staff/admin roles
 * never apply. `SITE_URL` stays reserved for absolute links (emails, canonical
 * URLs), never for auth token verification.
 */
export default {
  providers: [
    {
      domain: process.env["CONVEX_SITE_URL"],
      applicationID: "convex",
    },
  ],
};
