// Run: node src/lib/mobileStageCount.test.mjs
// Mobile pipeline (one row per stage): every stage row shows its lead count, in the employee and the admin board.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

const emp = read("src/employee/pages/EmployeeLeads.jsx");
const start = emp.indexOf("Mobile — one row per stage");
const end = emp.indexOf("hidden sm:", start) > 0 ? emp.indexOf("hidden sm:", start) : emp.length;
const mobile = emp.slice(start, end);
assert.ok(start > 0);
assert.match(mobile, /data-testid=\{`mobile-stage-header-\$\{stage\.id\}`\}/);
assert.match(mobile, /<Badge tone=\{stage\.badgeTone\}>\{stage\.label\}<\/Badge>\s*<span[^>]*data-testid="mobile-stage-count"[^>]*>\s*\{getColumnCount\(stage\.id, columnLeads\)\}/, "the count sits next to the stage name");
assert.ok(/min-w-6/.test(mobile), "wide enough for a 3-digit count");

// same number as the desktop column header
assert.ok(emp.includes("const getColumnCount = (stageId, columnLeads) => columnLeads.length;"));

// admin board already shows it on mobile
const admin = read("src/pages/Pipeline.jsx");
const am = admin.slice(admin.indexOf("Mobile — one row per stage"));
assert.match(am, /getColumnCount\(stage\.id, columnLeads\)/);

console.log("mobileStageCount: each mobile stage row shows its lead count - OK");
