// Run: node src/lib/chunkRecovery.test.mjs
// "This page couldn't load - refresh": a tab opened before a new version was uploaded asks for page files that no longer exist.
// The app now reloads ONCE by itself, and the error screen no longer sticks when you open another page.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isChunkLoadError, reloadOnceForChunkError, retryImport } from "./chunkReload.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

// 1. which errors mean "a page file is gone" (every browser words it differently)
for (const msg of [
  "Failed to fetch dynamically imported module: https://app.example.com/assets/EmployeeWhatsAppScripts-9fA2kL.js",
  "error loading dynamically imported module",
  "Importing a module script failed.",
  "Loading chunk 17 failed.",
  "Loading CSS chunk 4 failed",
  "Unable to preload CSS for /assets/index-abc.css",
]) assert.equal(isChunkLoadError(new Error(msg)), true, msg);
assert.equal(isChunkLoadError(Object.assign(new Error("x"), { name: "ChunkLoadError" })), true);
for (const msg of ["Cannot read properties of undefined (reading 'toLowerCase')", "Network request failed", "x is not a function"]) assert.equal(isChunkLoadError(new Error(msg)), false, msg);
assert.equal(isChunkLoadError(null), false);
assert.equal(isChunkLoadError(undefined), false);

// 2. reload ONCE per minute, never a loop
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const chunkErr = new Error("Failed to fetch dynamically imported module: /assets/x.js");
{
  const storage = memory();
  let reloads = 0;
  const run = (err, now) => reloadOnceForChunkError(err, { storage, now, reload: () => { reloads += 1; } });
  assert.equal(run(chunkErr, 1_000_000), true, "first failure: reload");
  assert.equal(reloads, 1);
  assert.equal(run(chunkErr, 1_000_000 + 5_000), false, "5 s later it is still failing: do NOT reload again (no loop)");
  assert.equal(run(chunkErr, 1_000_000 + 59_000), false);
  assert.equal(reloads, 1);
  assert.equal(run(chunkErr, 1_000_000 + 61_000), true, "a minute later a new version may have arrived: one more try");
  assert.equal(reloads, 2);
  assert.equal(run(new Error("TypeError: boom"), 9_000_000), false, "an ordinary bug never reloads");
  assert.equal(reloads, 2);
}
assert.equal(reloadOnceForChunkError(chunkErr, { storage: null, now: 1, reload: () => assert.fail("must not reload without storage") }), false, "no storage = cannot remember = never reload");
assert.equal(reloadOnceForChunkError(chunkErr, { storage: { getItem() { throw new Error("blocked"); }, setItem() {} }, now: 1, reload: () => assert.fail("must not reload") }), false, "blocked storage = never reload");

// 3. the import wrapper
{
  let reloaded = 0;
  const options = { storage: memory(), now: 5_000_000, reload: () => { reloaded += 1; } };
  const settled = await Promise.race([
    retryImport(() => Promise.reject(chunkErr), options).then(() => "resolved", () => "rejected"),
    new Promise((r) => setTimeout(() => r("still pending (page is reloading)"), 50)),
  ]);
  assert.equal(settled, "still pending (page is reloading)");
  assert.equal(reloaded, 1);
  await assert.rejects(retryImport(() => Promise.reject(new Error("real bug")), { ...options, storage: memory() }), /real bug/, "a real error is passed on");
  assert.equal(await retryImport(() => Promise.resolve("module"), options), "module");
}

// 4. wiring: every page import is protected; the error screens clear on navigation, can retry and say why
const app = read("src/App.jsx");
assert.equal((app.match(/= lazyWithRetry\(\(\) => import\(/g) || []).length, 28, "all 28 page imports");
assert.ok(!/= lazy\(/.test(app), "no unprotected lazy import is left");
assert.match(app, /import \{ lazyWithRetry, reloadOnceForChunkError \} from "\.\/lib\/chunkReload\.js";/);
assert.match(app, /componentDidCatch\(error\) \{[\s\S]*?reloadOnceForChunkError\(error\)/);
const layout = read("src/employee/layouts/EmployeeLayout.jsx");
assert.match(layout, /<EmployeeRouteErrorBoundary resetKey=\{location\.pathname\}>/, "the error screen is reset by moving to another page");
assert.match(layout, /componentDidUpdate\(prevProps\) \{[\s\S]*?prevProps\.resetKey !== this\.props\.resetKey\) this\.setState\(\{ error: null \}\)/);
assert.match(layout, /componentDidCatch\(error\) \{[\s\S]*?console\.error\([\s\S]*?reloadOnceForChunkError\(error\)/);
assert.match(layout, /onClick=\{\(\) => this\.setState\(\{ error: null \}\)\}[\s\S]{0,200}Try again/, "a Try again button that does not need a full refresh");
assert.match(layout, /data-testid="route-error-reason"/, "the real reason is shown, so the next report says what it was");

console.log("chunkRecovery: stale-version page files reload once by themselves; the error screen resets on navigation - OK");
