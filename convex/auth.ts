import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizePhone } from "./lib/rules";

/**
 * Email + password only (no OAuth, no email verification — confirmed decision
 * in CONVEX_PLAN.md). The sign-up form also collects the customer's phone
 * number so checkout and staff records have it up front.
 *
 * Validation failures throw `ConvexError` so the message reaches the browser
 * (plain `Error` messages are redacted in production).
 */
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const email = String(params["email"] ?? "")
          .trim()
          .toLowerCase();
        if (!email) throw new ConvexError({ message: "Enter your email address." });

        const flow = params["flow"] === "signUp" ? "signUp" : "signIn";
        const name = typeof params["name"] === "string" ? params["name"].trim() : "";
        const phone = normalizePhone(typeof params["phone"] === "string" ? params["phone"] : "");

        if (flow === "signUp" && phone.length < 9) {
          throw new ConvexError({ message: "Enter a phone number with at least 9 digits." });
        }

        return {
          email,
          ...(name ? { name } : {}),
          ...(phone ? { phone } : {}),
        };
      },
    }),
  ],
});
