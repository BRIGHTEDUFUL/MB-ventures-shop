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
