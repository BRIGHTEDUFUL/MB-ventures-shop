/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as addresses from "../addresses.js";
import type * as auth from "../auth.js";
import type * as catalogue from "../catalogue.js";
import type * as categories from "../categories.js";
import type * as contact from "../contact.js";
import type * as crons from "../crons.js";
import type * as emails from "../emails.js";
import type * as emails_config from "../emails/config.js";
import type * as emails_enqueue from "../emails/enqueue.js";
import type * as emails_orderTriggers from "../emails/orderTriggers.js";
import type * as emails_queries from "../emails/queries.js";
import type * as emails_sample from "../emails/sample.js";
import type * as emails_templates_adminContactMessage from "../emails/templates/adminContactMessage.js";
import type * as emails_templates_adminNewOrder from "../emails/templates/adminNewOrder.js";
import type * as emails_templates_adminPaymentConfirmed from "../emails/templates/adminPaymentConfirmed.js";
import type * as emails_templates_authResetPassword from "../emails/templates/authResetPassword.js";
import type * as emails_templates_authVerifyEmail from "../emails/templates/authVerifyEmail.js";
import type * as emails_templates_base from "../emails/templates/base.js";
import type * as emails_templates_contactReceived from "../emails/templates/contactReceived.js";
import type * as emails_templates_index from "../emails/templates/index.js";
import type * as emails_templates_orderCancelled from "../emails/templates/orderCancelled.js";
import type * as emails_templates_orderCommon from "../emails/templates/orderCommon.js";
import type * as emails_templates_orderCompleted from "../emails/templates/orderCompleted.js";
import type * as emails_templates_orderOutForDelivery from "../emails/templates/orderOutForDelivery.js";
import type * as emails_templates_orderReadyPickup from "../emails/templates/orderReadyPickup.js";
import type * as emails_templates_orderReceived from "../emails/templates/orderReceived.js";
import type * as emails_templates_paymentConfirmed from "../emails/templates/paymentConfirmed.js";
import type * as emails_transport from "../emails/transport.js";
import type * as emails_webhook from "../emails/webhook.js";
import type * as http from "../http.js";
import type * as inventory from "../inventory.js";
import type * as lib_activity from "../lib/activity.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_dto from "../lib/dto.js";
import type * as lib_rules from "../lib/rules.js";
import type * as lib_settings from "../lib/settings.js";
import type * as orders from "../orders.js";
import type * as seed from "../seed.js";
import type * as stats from "../stats.js";
import type * as store from "../store.js";
import type * as uploads from "../uploads.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  addresses: typeof addresses;
  auth: typeof auth;
  catalogue: typeof catalogue;
  categories: typeof categories;
  contact: typeof contact;
  crons: typeof crons;
  emails: typeof emails;
  "emails/config": typeof emails_config;
  "emails/enqueue": typeof emails_enqueue;
  "emails/orderTriggers": typeof emails_orderTriggers;
  "emails/queries": typeof emails_queries;
  "emails/sample": typeof emails_sample;
  "emails/templates/adminContactMessage": typeof emails_templates_adminContactMessage;
  "emails/templates/adminNewOrder": typeof emails_templates_adminNewOrder;
  "emails/templates/adminPaymentConfirmed": typeof emails_templates_adminPaymentConfirmed;
  "emails/templates/authResetPassword": typeof emails_templates_authResetPassword;
  "emails/templates/authVerifyEmail": typeof emails_templates_authVerifyEmail;
  "emails/templates/base": typeof emails_templates_base;
  "emails/templates/contactReceived": typeof emails_templates_contactReceived;
  "emails/templates/index": typeof emails_templates_index;
  "emails/templates/orderCancelled": typeof emails_templates_orderCancelled;
  "emails/templates/orderCommon": typeof emails_templates_orderCommon;
  "emails/templates/orderCompleted": typeof emails_templates_orderCompleted;
  "emails/templates/orderOutForDelivery": typeof emails_templates_orderOutForDelivery;
  "emails/templates/orderReadyPickup": typeof emails_templates_orderReadyPickup;
  "emails/templates/orderReceived": typeof emails_templates_orderReceived;
  "emails/templates/paymentConfirmed": typeof emails_templates_paymentConfirmed;
  "emails/transport": typeof emails_transport;
  "emails/webhook": typeof emails_webhook;
  http: typeof http;
  inventory: typeof inventory;
  "lib/activity": typeof lib_activity;
  "lib/auth": typeof lib_auth;
  "lib/dto": typeof lib_dto;
  "lib/rules": typeof lib_rules;
  "lib/settings": typeof lib_settings;
  orders: typeof orders;
  seed: typeof seed;
  stats: typeof stats;
  store: typeof store;
  uploads: typeof uploads;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
