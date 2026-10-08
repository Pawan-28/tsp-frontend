// Run: node src/lib/blankTemperature.test.mjs
// Hot / Warm / Cold is BLANK until Gemini (after a connected call) or a person sets it - nothing invents "Warm" / "Cold Lead".
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiLeadToEmployee, normalizeLeadForDetailPanel, normalizeTemperature, temperatureToApi } from "./leadSync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

// 1. mapping: blank in -> blank out
assert.equal(normalizeTemperature(""), "");
assert.equal(normalizeTemperature(null), "");
assert.equal(normalizeTemperature(undefined), "");
assert.equal(normalizeTemperature("Hot Lead"), "hot");
assert.equal(normalizeTemperature("Warm Lead"), "warm");
assert.equal(normalizeTemperature("cold"), "cold");
assert.equal(normalizeTemperature("Not Interested"), "ni");
assert.equal(temperatureToApi(""), "", "no \"Cold Lead\" fallback");
assert.equal(temperatureToApi(undefined), "");
assert.equal(temperatureToApi("new"), "");
assert.equal(temperatureToApi("hot"), "Hot Lead");
assert.equal(temperatureToApi("warm"), "Warm Lead");
assert.equal(temperatureToApi("ni"), "Not Interested");

// 2. the lead panel header: a lead without a temperature has no Hot / Warm / Cold status - even when a stale "warm" sits in its status
const base = { id: 1, name: "Test", phone: "919800000000", stage: "Lead" };
for (const raw of [
  { ...base, temperature: null, status: "New Lead" },
  { ...base, temperature: "", status: "warm" },
  { ...base, status: "warm" },
  { ...base },
]) {
  const l = normalizeLeadForDetailPanel(raw);
  assert.ok(!["hot", "warm", "cold"].includes(l.status), `status ${JSON.stringify(raw.status)} -> ${l.status}`);
}
assert.equal(normalizeLeadForDetailPanel({ ...base, temperature: null }).status, "new", "no temperature = a plain new lead");
// ... and a real temperature still shows
assert.equal(normalizeLeadForDetailPanel({ ...base, temperature: "Hot Lead" }).status, "hot");
assert.equal(normalizeLeadForDetailPanel({ ...base, temperature: "Warm Lead", status: "New Lead" }).status, "warm");
assert.equal(normalizeLeadForDetailPanel({ ...base, temperature: "Cold Lead" }).status, "cold");
// the admin-side mapping never turns a blank temperature into "warm" either
for (const raw of [{ id: 1, leadName: "T", pipelineStage: "Lead", temperature: null, status: "New Lead" }, { id: 1, leadName: "T", pipelineStage: "Lead" }]) {
  assert.ok(!["hot", "warm", "cold"].includes(apiLeadToEmployee(raw).status));
}

// 3. nothing on the page pre-selects a temperature or sends one nobody chose
const drawer = read("src/components/AddLeadDrawer.jsx");
assert.match(drawer, /useState\(""\); \/\/ blank/);
assert.ok(!/useState\("Cold Lead"\)/.test(drawer), "Add Lead no longer starts on Cold");
assert.match(drawer, /setWarmth\(warmth === w\.value \? "" : w\.value\)/, "a chosen warmth can be un-chosen");
const ctx = read("src/context/EmployeeContext.jsx");
assert.ok(!/status: form\.status \|\| "warm"/.test(ctx));
assert.match(ctx, /if \(label\) \{ \/\/ a blank \/ unknown status sends nothing/);
const call = read("src/employee/pages/EmployeeCallDetail.jsx");
assert.ok(!/status: "warm"/.test(call), "a lead made from a call is not marked Warm");
assert.ok(!/status = "warm"/.test(call));
assert.ok(!/setEditStatus\(lead\?\.status \|\| "warm"\)/.test(call));
const panel = read("src/components/leads/LeadDetailPanel.jsx");
assert.match(panel, /Blank until Gemini sets it after a connected call/);

console.log("blankTemperature: Hot/Warm/Cold stays blank until Gemini or a person sets it - OK");
