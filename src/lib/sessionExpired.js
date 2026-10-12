import { clearAuthStorage, clearEmployeeStorage } from "./crmContext.js";

/**
 * The server now answers 401 (with one of these codes) when the login is missing, expired or the account was switched off.
 * Then the browser must forget the session and show the login page - instead of every screen failing one by one.
 * A wrong password on the login form is also a 401, but it has no such code and never reaches here.
 */
const SESSION_CODES = new Set(["AUTH_REQUIRED", "TOKEN_INVALID", "ACCOUNT_INACTIVE"]);

export function isSessionExpiredResponse(status, data) {
  return status === 401 && Boolean(data) && SESSION_CODES.has(data.code);
}

let redirecting = false;

/** Forget the session and go to /login?redirect=<where the user was>. Runs once per page load. */
export function handleSessionExpired({ win = typeof window !== "undefined" ? window : null } = {}) {
  if (!win || redirecting) return false;
  const here = `${win.location.pathname}${win.location.search}`;
  if (/^\/(login|change-password)(\/|$)/.test(win.location.pathname)) return false;
  redirecting = true;
  clearAuthStorage();
  clearEmployeeStorage();
  win.location.replace(`/login?redirect=${encodeURIComponent(here)}`);
  return true;
}

export function resetSessionExpiredForTests() {
  redirecting = false;
}
