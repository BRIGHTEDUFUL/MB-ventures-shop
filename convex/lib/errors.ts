import { ConvexError, type Value } from "convex/values";

/**
 * Typed backend errors.
 *
 * Every inventory function throws through `fail()` so the browser gets a
 * `code` it can branch on ("show me the conflict", "reduce to 3") alongside
 * the human `message` it already renders. Internals never leak: the message
 * is always copy we chose.
 *
 * `errorMessage()` in `src/lib/store.ts` keeps reading `data.message`, so
 * this is additive — existing screens render exactly as before.
 */
export type ErrorCode =
  /** Bad or out-of-range input; `details.fields` names the offenders. */
  | "VALIDATION_FAILED"
  /** Caller lacks the permission this function needs. */
  | "PERMISSION_DENIED"
  /** The row does not exist (or the id is unparseable). */
  | "NOT_FOUND"
  /** Not enough available stock for the requested quantity. */
  | "STOCK_INSUFFICIENT"
  /** Someone else saved first; `details.expected` carries the current version. */
  | "VERSION_CONFLICT"
  /** SKU or barcode already belongs to another product. */
  | "DUPLICATE_SKU"
  /** Allowed, but an approval step must run first. */
  | "APPROVAL_REQUIRED"
  /** Valid input, but the record's current state forbids the transition. */
  | "STATE_CONFLICT";

export type ErrorDetails = {
  code: ErrorCode;
  message: string;
  details?: Record<string, Value>;
};

/** Throw a typed, user-safe error. Never returns. */
export function fail(code: ErrorCode, message: string, details?: Record<string, Value>): never {
  throw new ConvexError({ code, message, ...(details !== undefined ? { details } : {}) });
}

/** Read the typed payload back off a caught error, if that is what it is. */
export function readError(error: unknown): ErrorDetails | null {
  if (!(error instanceof ConvexError)) return null;
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null) return null;
  const { code, message, details } = data as Record<string, unknown>;
  if (typeof code !== "string" || typeof message !== "string") return null;
  return {
    code: code as ErrorCode,
    message,
    ...(typeof details === "object" && details !== null
      ? { details: details as Record<string, Value> }
      : {}),
  };
}
