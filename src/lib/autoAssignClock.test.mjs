// Run: node src/lib/autoAssignClock.test.mjs
// 3-day stuck-lead timer on the page: "3 days / 2 days / 1 day to auto-assign", the chip, and where it is shown.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { DAY_MS, clockState, autoAssignLabel, autoAssignTone, autoAssignTitle } from "./autoAssignClock.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

const NOW = Date.parse("2026-10-08T12:00:00Z");
const at = (days, hours = 0) => ({ deadlineAt: new Date(NOW + days * DAY_MS + hours * 3600 * 1000).toISOString() });

// 1. the words: 3 -> 2 -> 1 -> due
assert.equal(autoAssignLabel(at(3), NOW), "3 days to auto-assign");
assert.equal(autoAssignLabel(at(2, 5), NOW), "3 days to auto-assign", "2d 5h left still rounds up to 3");
assert.equal(autoAssignLabel(at(2), NOW), "2 days to auto-assign");
assert.equal(autoAssignLabel(at(1, 3), NOW), "2 days to auto-assign");
assert.equal(autoAssignLabel(at(1), NOW), "1 day to auto-assign");
assert.equal(autoAssignLabel(at(0, 5), NOW), "1 day to auto-assign", "the last 24 hours read as 1 day");
assert.equal(autoAssignLabel(at(0), NOW), "Auto-assigning soon");
assert.equal(autoAssignLabel(at(-2), NOW), "Auto-assigning soon");
assert.equal(autoAssignLabel(null, NOW), null);
assert.equal(autoAssignLabel({}, NOW), null);
assert.equal(autoAssignLabel({ deadlineAt: "garbage" }, NOW), null);

// 2. tone drives the colour
assert.equal(autoAssignTone(at(3), NOW), "normal");
assert.equal(autoAssignTone(at(2), NOW), "normal");
assert.equal(autoAssignTone(at(1), NOW), "urgent");
assert.equal(autoAssignTone(at(0, 5), NOW), "urgent");
assert.equal(autoAssignTone(at(-1), NOW), "due");
assert.equal(autoAssignTone(null, NOW), null);
assert.deepEqual(Object.keys(clockState(at(2), NOW)).sort(), ["daysLeft", "due", "msLeft"]);
assert.match(autoAssignTitle(at(2), NOW), /auto-assigned to another employee on /);
assert.match(autoAssignTitle(at(-1), NOW), /about to be auto-assigned/);

// 3. same words as the server (backend/src/utils/stageClock.js)
const backend = require(path.resolve(root, "../backend/src/utils/stageClock.js"));
for (const days of [3, 2.5, 2, 1.2, 1, 0.4, 0, -1]) {
  const c = at(days);
  const serverClock = { timed: true, due: new Date(c.deadlineAt).getTime() - NOW <= 0, daysLeft: Math.max(0, Math.ceil((new Date(c.deadlineAt).getTime() - NOW) / DAY_MS)) };
  assert.equal(autoAssignLabel(c, NOW), backend.autoAssignLabel(serverClock), `label parity at ${days} days`);
}

// 4. the chip, rendered
const out = path.join(os.tmpdir(), `autochip-${process.pid}.cjs`);
await build({ entryPoints: [path.resolve(root, "src/components/AutoAssignChip.jsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "silent" });
const Chip = require(out).default;
fs.rmSync(out, { force: true });
const { renderToStaticMarkup } = require(path.resolve(root, "node_modules/react-dom/server.js"));
const React = require(path.resolve(root, "node_modules/react/index.js"));
const soon = { deadlineAt: new Date(Date.now() + 2 * DAY_MS - 1000).toISOString() };
const html = renderToStaticMarkup(React.createElement(Chip, { clock: soon }));
assert.ok(html.includes("2 days to auto-assign") && html.includes('data-testid="auto-assign-chip"'));
assert.ok(html.includes("slate"), "2 days left = calm colour");
assert.ok(renderToStaticMarkup(React.createElement(Chip, { clock: { deadlineAt: new Date(Date.now() + 3600e3).toISOString() } })).includes("amber"), "last day = amber");
assert.ok(renderToStaticMarkup(React.createElement(Chip, { clock: { deadlineAt: new Date(Date.now() - 3600e3).toISOString() } })).includes("rose"), "due = rose");
assert.equal(renderToStaticMarkup(React.createElement(Chip, { clock: null })), "", "no clock = nothing drawn");

// 5. wiring
const emp = read("src/employee/pages/EmployeeLeads.jsx");
assert.match(emp, /useAutoAssignClocks\("employee", getCrmHeaders\)/);
assert.equal((emp.match(/autoAssign=\{autoAssignClockFor\(lead\)\}/g) || []).length, 2, "mobile + desktop cards");
assert.match(emp, /\{autoAssign && <div className="mb-1\.5"><AutoAssignChip clock=\{autoAssign\} \/><\/div>\}/);
const adm = read("src/pages/Pipeline.jsx");
assert.match(adm, /useAutoAssignClocks\("admin", getAdminCrmHeaders\)/);
assert.equal((adm.match(/autoAssign=\{autoAssignClockFor\(lead\)\}/g) || []).length, 2);
const panel = read("src/components/leads/LeadDetailPanel.jsx");
assert.match(panel, /autoAssignClock && <AutoAssignChip clock=\{autoAssignClock\}/, "in the lead header");
assert.match(panel, /aiNotInterested/);
assert.match(panel, /const active = !aiNotInterested && \(tempOverride \?\? liveLead\.status\) === id;/, "no Hot/Warm/Cold lit when the AI says Not Interested");
assert.ok(!/status = "ni"/.test(read("src/lib/leadSync.js").split("export function apiLeadToEmployee")[1] || ""), "the AI's Not Interested never moves the card by itself");
const settings = read("src/pages/Settings.jsx");
assert.match(settings, /id: "autoassign", +label: "Lead Auto-Assign"/);
assert.match(settings, /activeTab === "autoassign" && <AutoReassignPanel \/>/);
const ap = read("src/components/AutoReassignPanel.jsx");
assert.match(ap, /\{ autoReassign: \{ enabled \} \}/, "the client sends only on/off - the server stamps the start moment");
assert.ok(!/enabledAt:/.test(ap.replace(/cfg\?\.enabledAt|enabledAt: null/g, "")), "the page never sends enabledAt");
assert.match(ap, /Hot Lead/); assert.match(ap, /7 days/); assert.match(ap, /30 days/); assert.match(ap, /90 days/);
const hook = read("src/lib/useAutoAssignClocks.js");
assert.match(hook, /\/api\/v1\/auto-reassign\/clocks/);

console.log("autoAssignClock: 3/2/1-day countdown chip on cards + lead header, admin switch, Gemini rules - OK");
