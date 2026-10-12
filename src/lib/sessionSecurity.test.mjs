// Run: node src/lib/sessionSecurity.test.mjs
// S-02 client side: a 401 "login missing / expired" sends the browser to /login; logout leaves no data of the previous user behind (S-05).
import assert from "node:assert/strict";

function makeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    keys: () => [...m.keys()],
  };
}
const local = makeStorage({
  crm_auth_token_v1: "t", crm_auth_user_v1: "{}", crm_current_employee_v1: "{}", crm_lead_assignment_v1: "{}", emp_workspace_v2: "{}",
  "emp_workspace_v2:7": "{}", emp_daily_checklist_checks: "{}", admin_dashboard_sops: "[]", ts_admin_profile: "{}", tsp_employee_summary_visible: "1",
  "crm-settings-draft-v1": "{}", some_other_site_key: "keep me",
});
const session = makeStorage({ "crm_cache:/api/x": "{}", crm_chunk_reload_at: "123", other: "keep" });
const location = { pathname: "/employee/calls", search: "?tab=x", replaced: null, replace(u) { this.replaced = u; } };
globalThis.window = { localStorage: local, sessionStorage: session, location };

const { clearAuthStorage } = await import("./crmContext.js");
const { isSessionExpiredResponse, handleSessionExpired, resetSessionExpiredForTests } = await import("./sessionExpired.js");

// 1. only a 401 WITH the server's session code counts (a wrong password on the login form is a plain 401)
assert.equal(isSessionExpiredResponse(401, { code: "AUTH_REQUIRED" }), true);
assert.equal(isSessionExpiredResponse(401, { code: "TOKEN_INVALID" }), true);
assert.equal(isSessionExpiredResponse(401, { code: "ACCOUNT_INACTIVE" }), true);
assert.equal(isSessionExpiredResponse(401, { message: "Invalid login ID or password" }), false);
assert.equal(isSessionExpiredResponse(403, { code: "AUTH_REQUIRED" }), false);
assert.equal(isSessionExpiredResponse(503, { code: "AUTH_UNAVAILABLE" }), false, "a database hiccup does not log anybody out");
assert.equal(isSessionExpiredResponse(401, null), false);

// 2. it forgets the session, remembers where the person was, and redirects once
resetSessionExpiredForTests();
assert.equal(handleSessionExpired(), true);
assert.equal(location.replaced, "/login?redirect=" + encodeURIComponent("/employee/calls?tab=x"));
assert.equal(local.getItem("crm_auth_token_v1"), null);
location.replaced = null;
assert.equal(handleSessionExpired(), false, "no second redirect while the first is in flight");
assert.equal(location.replaced, null);
resetSessionExpiredForTests();
location.pathname = "/login";
assert.equal(handleSessionExpired(), false, "already on the login page: no redirect loop");
location.pathname = "/employee/calls";

// 3. logout removes every cached copy of the person's data, but not other sites' keys or the reload guard
local.setItem("crm_auth_token_v1", "t");
clearAuthStorage();
assert.deepEqual(local.keys(), ["some_other_site_key"]);
assert.deepEqual(session.keys().sort(), ["crm_chunk_reload_at", "other"]);

console.log("sessionSecurity: 401 -> login page with ?redirect; logout clears every cached copy of the user's data - OK");
