import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { paystackWebhook } from "./payments";

const http = httpRouter();

auth.addHttpRoutes(http);

// Paystack's charge events — the fallback that confirms a payment when the
// shopper's browser never returns to /paystack/return. The handler verifies
// the x-paystack-signature HMAC before believing a single byte.
http.route({
  path: "/webhooks/paystack",
  method: "POST",
  handler: paystackWebhook,
});

export default http;
