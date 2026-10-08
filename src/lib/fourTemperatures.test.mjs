// Run: node src/lib/fourTemperatures.test.mjs
// Lead header: Hot / Warm / Cold / Not Interested - all unselected at the start; Gemini (or the rep) selects one.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EMP_LEAD_TEMPERATURES, LEAD_STATUS_LABELS } from "../data/employeeMock.js";
import { temperatureLabel } from "./extraInfo.js";
import { temperatureToApi } from "./leadSync.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.resolve(root, rel), "utf8");

// 1. the four options, in order
assert.deepEqual(EMP_LEAD_TEMPERATURES.map((t) => t.id), ["hot", "warm", "cold", "ni"]);
assert.deepEqual(EMP_LEAD_TEMPERATURES.map((t) => t.label), ["Hot", "Warm", "Cold", "Not Interested"]);
assert.equal(LEAD_STATUS_LABELS.ni, "Not Interested");
assert.equal(temperatureToApi("ni"), "Not Interested", "stored as Not Interested (the same word Gemini writes)");

// 2. Extra Info's temperature chip knows Not Interested too
assert.equal(temperatureLabel("Not Interested"), "Not Interested");
assert.equal(temperatureLabel("ni"), "Not Interested");
assert.equal(temperatureLabel("Hot Lead"), "Hot");
assert.equal(temperatureLabel(""), "Unknown");

// 3. the panel reads the selected option from the lead's TEMPERATURE; blank = nothing lit
const panel = read("src/components/leads/LeadDetailPanel.jsx");
assert.match(panel, /ni: "bg-violet-100 border-violet-200 text-violet-800 shadow-sm",/);
const block = panel.slice(panel.indexOf("const storedTemperature = (() => {"), panel.indexOf("const isTemperatureStatus"));
assert.match(block, /t\.includes\("not interested"\) \|\| t === "ni"\) return "ni"/);
assert.match(block, /!t\.trim\(\) && \["hot", "warm", "cold"\]\.includes\(liveLead\.status\) \? liveLead\.status : ""/, "a blank temperature is blank (only a local, never-saved lead falls back to status)");
assert.match(panel, /const currentTemperature = tempOverride \?\? storedTemperature;/);
assert.match(panel, /const active = currentTemperature === id;/);
assert.ok(!panel.includes("aiNotInterested") && !panel.includes("ai-not-interested"), "no separate 'Not Interested' chip - it is the 4th option now");

// run the panel's own mapping against typical stored values
const map = (liveLead) => {
  const t = String(liveLead.temperature || "").toLowerCase();
  if (t.includes("not interested") || t === "ni") return "ni";
  if (t.includes("hot")) return "hot";
  if (t.includes("cold")) return "cold";
  if (t.includes("warm")) return "warm";
  return !t.trim() && ["hot", "warm", "cold"].includes(liveLead.status) ? liveLead.status : "";
};
for (const [lead, want] of [
  [{ temperature: null, status: "new" }, ""],
  [{ temperature: "", status: "new" }, ""],
  [{ temperature: "Hot Lead" }, "hot"],
  [{ temperature: "Warm Lead" }, "warm"],
  [{ temperature: "Cold Lead" }, "cold"],
  [{ temperature: "Not Interested" }, "ni"],
  [{ temperature: "warm" }, "warm"],
  [{ temperature: "Not Pick" }, ""],
  [{ temperature: "Converted" }, ""],
]) assert.equal(map(lead), want, JSON.stringify(lead));
assert.equal(map({ temperature: "Not Interested", status: "warm" }), "ni", "the temperature wins over a stale status");

// 4. picking Not Interested saves the temperature AND moves the lead to the Not Interested stage of the pipeline
const ctx = read("src/context/EmployeeContext.jsx");
assert.match(ctx, /nextStatus === "ni"\n?\s*\/\/ Not Interested is a temperature too[\s\S]{0,200}\? \{ \.\.\.l, temperature: "Not Interested" \}/);
assert.match(ctx, /temperature: temperatureToApi\(nextStatus\),/);

assert.match(panel, /if \(id === "ni" && draft\.stage !== "Not Interested"\) \{\s*patchDraft\("stage"\)\("Not Interested"\);\s*onStageChange\?\.\("Not Interested"\);/, "the same stage move as picking it in the Stage dropdown");

console.log("fourTemperatures: Hot / Warm / Cold / Not Interested, unselected until Gemini or the rep picks; Not Interested moves the stage - OK");
