import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getEmailConfig } from "./emails/config";
import { parseEvent, verifySvixSignature } from "./emails/webhook";

const http = httpRouter();

auth.addHttpRoutes(http);

const json = (body: string, status: number) =>
  new Response(body, {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });

/**
 * Resend delivery webhooks (Svix signed).
 *
 * 404 while `RESEND_WEBHOOK_SECRET` is unset so the endpoint does not exist in
 * dry-run; 401 for a bad or stale signature; 200 once the event has been handed
 * to `internal.emails.applyWebhookEvent`, which is idempotent by svix id.
 */
const resendWebhook = httpAction(async (ctx, request) => {
  const config = getEmailConfig();
  if (config.webhookSecret === "") {
    return new Response("Not found", { status: 404 });
  }

  const svixId = request.headers.get("svix-id") ?? "";
  const svixTimestamp = request.headers.get("svix-timestamp") ?? "";
  const svixSignature = request.headers.get("svix-signature") ?? "";
  if (svixId === "" || svixTimestamp === "" || svixSignature === "") {
    return json(JSON.stringify({ ok: false, error: "missing signature headers" }), 401);
  }

  const rawBody = await request.text();
  const valid = await verifySvixSignature({
    secret: config.webhookSecret,
    id: svixId,
    timestamp: svixTimestamp,
    signatureHeader: svixSignature,
    rawBody,
  });
  if (!valid) {
    return json(JSON.stringify({ ok: false, error: "signature mismatch" }), 401);
  }

  const event = parseEvent(rawBody);
  if (event === null) {
    return json(JSON.stringify({ ok: false, error: "unreadable payload" }), 400);
  }

  const emailId =
    event.data && typeof event.data.email_id === "string" ? event.data.email_id : undefined;
  const result = await ctx.runMutation(internal.emails.applyWebhookEvent, {
    svix_id: svixId,
    event_type: event.type,
    ...(emailId === undefined ? {} : { email_id: emailId }),
  });
  return json(JSON.stringify(result), 200);
});

http.route({
  path: "/resend/webhook",
  method: "POST",
  handler: resendWebhook,
});

export default http;
