// Run: node src/lib/postLoginPath.test.mjs
// E-17: Login ignored ?redirect=... and E-18: the "Syncing in background" badge could stay on forever.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolvePostLoginPath, safeRedirectPath } from "./postLoginPath.js";

const emp = { role: "employee" };
const adm = { role: "admin" };
const q = (p) => `?redirect=${encodeURIComponent(p)}`;

assert.equal(resolvePostLoginPath(emp, q("/employee/calls?tab=x")), "/employee/calls?tab=x", "employee goes back to the page they wanted");
assert.equal(resolvePostLoginPath(adm, q("/team")), "/team");
assert.equal(resolvePostLoginPath(emp, ""), "/employee/pipeline", "no redirect = old default");
assert.equal(resolvePostLoginPath(adm, ""), "/");
assert.equal(resolvePostLoginPath({ role: "employee", mustChangePassword: true }, q("/employee/calls")), "/change-password", "password change comes first");
// never leave the app, never the wrong area
for (const bad of ["//evil.com", "https://evil.com", "/"+String.fromCharCode(92)+"evil.com", "javascript:alert(1)", "evil", "/login", "/change-password", "/employee/x\r\nSet-Cookie: a=b"]) {
  assert.equal(safeRedirectPath(q(bad), "admin"), null, bad);
}
assert.equal(safeRedirectPath(q("/team"), "employee"), null, "an employee is not sent to the admin area");
assert.equal(safeRedirectPath(q("/employee/calls"), "admin"), null, "an admin is not sent to the employee area");

const here = path.dirname(fileURLToPath(import.meta.url));
const sync = fs.readFileSync(path.join(here, "usePipelineSync.js"), "utf8");
assert.match(sync, /syncInFlightRef\.current \+= 1;/);
assert.match(sync, /if \(syncInFlightRef\.current === 0\) setSyncing\(false\);/);
assert.ok(!/reqId === reqIdRef\.current\) \{\s*setLoading\(false\);\s*if \(sync\) setSyncing\(false\)/.test(sync), "the old conditional reset is gone");
assert.match(fs.readFileSync(path.join(here, "../pages/Login.jsx"), "utf8"), /resolvePostLoginPath\(authUser, window\.location\.search\)/);

console.log("postLoginPath: login honours a safe ?redirect; the sync badge always clears - OK");
