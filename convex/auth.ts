import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth, type EmailConfig } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { normalizePhone } from "./lib/rules";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";

/**
 * Email + password only (no OAuth, no email verification — confirmed decision
 * in CONVEX_PLAN.md). The sign-up form also collects the customer's phone
 * number so checkout and staff records have it up front.
 *
 * Password reset is enabled through the `reset` email provider below: the
 * one-time code is delivered by the shared email pipeline, so it honours the
 * same dry-run mode, daily limit, rate limit and `emailLogs` audit trail as
 * order mail.
 *
 * Validation failures throw `ConvexError` so the message reaches the browser
 * (plain `Error` messages are redacted in production).
 */

const RESET_TTL_SECONDS = 60 * 60;

type ResetParams = {
  identifier: string;
  url: string;
  token: string;
  expires: Date;
};

/**
 * Auth emails link to `${SITE_URL}?code=...`; the form that consumes the code
 * lives on `/account`, so repoint the link without touching the code itself.
 */
function resetUrlFor(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = "/account";
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Convex calls `sendVerificationRequest(params, ctx)` while the Auth.js type
 * only declares `params`, hence the rest-arg shape.
 */
const resetEmailProvider: EmailConfig = {
  id: "password-reset",
  name: "MB Ventures GH password reset",
  type: "email",
  maxAge: RESET_TTL_SECONDS,
  sendVerificationRequest: async (...args: unknown[]) => {
    const params = args[0] as ResetParams | undefined;
    const ctx = args[1] as ActionCtx | undefined;
    if (params === undefined || ctx === undefined) {
      throw new ConvexError({ message: "The reset email could not be sent. Try again later." });
    }
    await ctx.runMutation(internal.emails.enqueueAuth, {
      template: "auth-reset-password",
      to: params.identifier,
      url: resetUrlFor(params.url),
      token: params.token,
      expires: "60 minutes",
    });
  },
};

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      reset: resetEmailProvider,
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
