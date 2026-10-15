/**
 * Admin hub access token.
 *
 * Admin accounts must visit /admin-hub/<ADMIN_HUB_TOKEN> at least once per
 * browser session to unlock /staff. The token is stored in sessionStorage so
 * it clears when the browser tab/window is closed.
 *
 * To change the URL, update ADMIN_HUB_TOKEN here and redeploy. Staff accounts
 * are not affected — they reach /staff through the normal account page flow.
 *
 * KEEP THIS VALUE OUT OF CLIENT LOGS AND ERROR MESSAGES.
 */
export const ADMIN_HUB_TOKEN = "mbvg-admin-2026";

const SESSION_KEY = "mbvg_admin_unlocked";

/** Returns true if the admin hub has been unlocked in this browser session. */
export function isAdminUnlocked(): boolean {
  try {
    return sessionStorage.getItem(SESSION_KEY) === ADMIN_HUB_TOKEN;
  } catch {
    return false;
  }
}

/** Stores the unlock token for this browser session. */
export function unlockAdmin(): void {
  try {
    sessionStorage.setItem(SESSION_KEY, ADMIN_HUB_TOKEN);
  } catch {
    // sessionStorage unavailable (SSR or private mode edge case) — no-op
  }
}

/** Clears the admin unlock (e.g. on sign-out). */
export function lockAdmin(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // no-op
  }
}
