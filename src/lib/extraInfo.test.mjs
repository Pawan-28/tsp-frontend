// Run: node src/lib/extraInfo.test.mjs
// EXTRA INFO on the lead card: customer-level, from AI call analysis + verified CRM data, updated over time, never invented.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import {
  EXTRA_INFO_ROWS, NOT_DISCUSSED, UNKNOWN, isEmptyValue, deriveFromMom, deriveFromCalls, buildExtraInfoRows, temperatureLabel,
} from "./extraInfo.js";
import { isWasteMomText, getMomPlainText, getMomSections, stripGeminiCharges } from "./momFormat.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const BE = require(path.resolve(here, "../../../backend/src/utils/extraInfo.js"));

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-05T10:00:00.000Z";
const T3 = "2026-10-09T10:00:00.000Z";
const rowsOf = (input) => Object.fromEntries(buildExtraInfoRows(input).rows.map((r) => [r.key, r]));
const valuesOf = (input) => Object.fromEntries(buildExtraInfoRows(input).rows.map((r) => [r.key, r.value]));

// 0. rows: business / interests + the 12 fields + Lead Temperature, in the requested order
assert.deepEqual(EXTRA_INFO_ROWS.map((r) => r.label), [
  "Business / Job", "Interests / Hobbies", "Requirement", "Intent", "Budget", "Offer / Price Quoted", "Main Concern", "Purchase Timeline", "Decision Maker", "Objection",
  "Next Action", "Follow-up", "Meeting", "Conversion", "Lead Temperature",
]);

// 1. the frontend "nothing was said" test equals the backend's, value for value
for (const v of ["", " ", "Not discussed", "not discussed on the call", "Not mentioned", "N/A", "none", "Unknown", "-", "No objections raised", "No information", null, undefined,
  "Podcast", "₹2 lakh", "24-25 October", "Not paid yet", "Considering"]) {
  assert.equal(isEmptyValue(v), BE.isEmptyValue(v), `parity for ${JSON.stringify(v)}`);
}

// 2. CUSTOMER WITH A CONNECTED AI CALL: the stored AI profile fills the grid; values are the customer's, not hard-coded
const aiProfile = BE.mergeExtraInfo(null, {
  business: "Runs a media consultancy", interests: "Travel and cricket",
  requirement: "Podcast", intent: "Interested but delayed", budget: "Not discussed", offerQuoted: "Not discussed",
  mainConcern: "Certification pending", purchaseTimeline: "Tentatively 24-25 October / post-festivals", decisionMaker: "Not discussed",
  objection: "Certification delay", nextAction: "Customer to contact certification authority",
  followUp: { needed: "Yes", when: "after certification update" }, meeting: "Not discussed", conversion: "Not converted",
}, { callId: 11, at: T2 });
const lead = { id: 5, name: "Customer", stage: "Conversation", pipelineStage: "Conversation", status: "warm" };
const v1 = valuesOf({ stored: aiProfile, calls: [], lead, temperatureId: "warm", meetings: [], followUps: [] });
assert.deepEqual(v1, {
  business: "Runs a media consultancy", interests: "Travel and cricket",
  requirement: "Podcast", intent: "Interested but delayed", budget: NOT_DISCUSSED, offerQuoted: NOT_DISCUSSED, mainConcern: "Certification pending",
  purchaseTimeline: "Tentatively 24-25 October / post-festivals", decisionMaker: NOT_DISCUSSED, objection: "Certification delay",
  nextAction: "Customer to contact certification authority", followUp: "Yes — after certification update", meeting: NOT_DISCUSSED,
  conversion: "Not converted", temperature: "Warm",
});

// 3. MISSING data is never blank and never invented
const empty = buildExtraInfoRows({ stored: null, calls: [], lead: { id: 9 }, temperatureId: "", meetings: [], followUps: [] });
assert.equal(empty.knownCount, 0);
for (const r of empty.rows) {
  assert.ok(String(r.value).trim().length > 0, `${r.key} is never blank`);
  assert.equal(r.known, false);
}
const ev = Object.fromEntries(empty.rows.map((r) => [r.key, r.value]));
assert.equal(ev.intent, UNKNOWN);
assert.equal(ev.temperature, UNKNOWN);
assert.equal(ev.budget, NOT_DISCUSSED);
assert.equal(ev.conversion, "Not converted");
assert.equal(temperatureLabel("Hot Lead"), "Hot");
assert.equal(temperatureLabel("COLD"), "Cold");
assert.equal(temperatureLabel("booked"), UNKNOWN, "a lead STATUS that is not a temperature is never turned into one");
// "Not discussed"-like text smuggled into a stored profile is not shown as a known fact
const smuggled = rowsOf({ stored: { fields: { budget: { value: "Not discussed" } } }, calls: [], lead: { id: 1 } });
assert.equal(smuggled.budget.value, NOT_DISCUSSED);
assert.equal(smuggled.budget.known, false, 'shown muted, not as a known fact');

// 4. A LATER CALL UPDATES THE CUSTOMER-LEVEL VALUE (one field, no per-call duplicates)
let p = BE.mergeExtraInfo(null, { requirement: "Podcast", budget: "Not discussed" }, { callId: 1, at: T1 });
assert.equal(valuesOf({ stored: p, lead }).budget, NOT_DISCUSSED);                    // call 1: budget not discussed
p = BE.mergeExtraInfo(p, { budget: "₹2 lakh" }, { callId: 2, at: T2 });
assert.equal(valuesOf({ stored: p, lead }).budget, "₹2 lakh");                   // call 2: customer says 2 lakh
p = BE.mergeExtraInfo(p, { budget: "Not discussed", requirement: "Podcast + PR" }, { callId: 3, at: T3 });
assert.equal(valuesOf({ stored: p, lead }).budget, "₹2 lakh");                   // call 3 does not discuss budget: kept
assert.equal(valuesOf({ stored: p, lead }).requirement, "Podcast + PR");               // ...and the explicit change is applied
p = BE.mergeExtraInfo(p, { budget: "₹3 lakh" }, { callId: 4, at: "2026-10-12T10:00:00.000Z" });
assert.equal(valuesOf({ stored: p, lead }).budget, "₹3 lakh");                   // explicit change wins
assert.equal(buildExtraInfoRows({ stored: p, lead }).rows.filter((r) => r.key === "budget").length, 1, "one budget row, not one per call");

// 5. VERIFIED CRM DATA owns temperature / meeting / follow-up / conversion
const crm = rowsOf({
  stored: aiProfile, lead: { id: 5, stage: "Meeting Booked", pipelineStage: "Meeting Booked", status: "booked" }, temperatureId: "hot",
  meetings: [{ leadId: 5, status: "scheduled", isActive: true, time: "13 Oct, 5:00 pm" }, { leadId: 6, status: "scheduled", isActive: true, time: "x" }],
  followUps: [{ leadId: 5, done: false, time: "Tomorrow, 11:00 AM", scheduledDate: "2026-10-08" }, { leadId: 5, done: true, time: "old", scheduledDate: "2026-09-01" }],
});
assert.equal(crm.temperature.value, "Hot");
assert.equal(crm.meeting.value, "Booked — 13 Oct, 5:00 pm");
assert.equal(crm.followUp.value, "Yes — Tomorrow, 11:00 AM");
const inactive = rowsOf({ stored: null, lead: { id: 5 }, meetings: [{ leadId: 5, status: "scheduled", isActive: false, time: "x" }, { leadId: 5, status: "completed", isActive: false }] });
assert.equal(inactive.meeting.value, NOT_DISCUSSED, "a replaced / held meeting is not an active booking");
assert.equal(rowsOf({ stored: null, lead: { id: 5, stage: "Payment Complete", pipelineStage: "Payment Complete" } }).conversion.value, "Converted");
assert.equal(rowsOf({ stored: null, lead: { id: 5, stage: "Advance Paid", pipelineStage: "Advance Paid" } }).conversion.value, "Pending — advance paid");
assert.equal(rowsOf({ stored: BE.mergeExtraInfo(null, { followUp: { needed: "No" } }, { callId: 1, at: T1 }), lead: { id: 5 } }).followUp.value, "No");

// 6. EXISTING CUSTOMERS (no stored profile yet): read the labelled lines of the existing MOM - read-only, nothing invented
const MOM = `[KEY HIGHLIGHTS]
• Customer: Anita Rao, Rao Media
• Budget: ₹2 lakh
• Offer / Price Quoted: Podcast package ₹45,000 + 18% GST
• Payment / Conversion: Not paid yet
• Purchase Timeline: Tentatively 24-25 October
• Next Step: Customer to contact certification authority

[CALL HEADER]
Date: 1 Oct 2026 | Time: 10:54 am | Client: Anita Rao | Duration: 4:10
Call Summary:
Discussed a podcast.

[DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS]
Key Discussion Points:
• Podcast format
Customer Requirements:
• Podcast
• Weekly episodes
Customer Concerns / Objections:
• Certification is still pending

[ACTION ITEMS & NEXT STEPS]
Next Steps:
• Follow up after certification update`;
const d = deriveFromMom({ ai_summary: MOM });
assert.equal(d.budget, "₹2 lakh");
assert.equal(d.offerQuoted, "Podcast package ₹45,000 + 18% GST");
assert.equal(d.purchaseTimeline, "Tentatively 24-25 October");
assert.equal(d.nextAction, "Customer to contact certification authority");
assert.equal(d.requirement, "Podcast");
assert.equal(d.objection, "Certification is still pending");
assert.equal(d.conversion, "Not converted");
assert.equal(d.decisionMaker, undefined, "never guessed");
assert.equal(d.intent, undefined, "never guessed");
const NOT_SAID = `[KEY HIGHLIGHTS]
• Budget: Not discussed
• Offer / Price Quoted: Not discussed on the call
• Purchase Timeline: Not discussed
• Next Step: Not discussed

[DISCUSSION HIGHLIGHTS & KEY REQUIREMENTS]
Customer Concerns / Objections:
• No objections raised`;
assert.deepEqual(deriveFromMom({ ai_summary: NOT_SAID }), {}, "'Not discussed' / 'No objections' in an old MOM add nothing");
// newest call first: the newest explicit value wins, an older call fills what the newer one did not say
const newer = { ai_summary: "[KEY HIGHLIGHTS]\n• Budget: ₹3 lakh\n• Next Step: Send proposal" };
const older = { ai_summary: "[KEY HIGHLIGHTS]\n• Budget: ₹2 lakh\n• Purchase Timeline: next month" };
assert.deepEqual(deriveFromCalls([newer, older]), { budget: "₹3 lakh", nextAction: "Send proposal", purchaseTimeline: "next month" });
// stored AI profile beats the legacy MOM; the MOM only fills what is not stored
const mix = valuesOf({ stored: BE.mergeExtraInfo(null, { budget: "₹4 lakh" }, { callId: 9, at: T3 }), calls: [{ ai_summary: MOM }], lead });
assert.equal(mix.budget, "₹4 lakh");
assert.equal(mix.offerQuoted, "Podcast package ₹45,000 + 18% GST");

// 7. THE MOM IS UNCHANGED, and not-connected filler is never shown as a MoM
assert.equal(getMomSections({ ai_summary: MOM }).keyHighlights.includes("Budget: ₹2 lakh"), true);
assert.equal(getMomPlainText({ ai_summary: "plain old note about the call" }), "plain old note about the call");
assert.equal(stripGeminiCharges("[GEMINI CHARGES]\nTotal: ₹1.2\n\n" + MOM), MOM, "MoM text is exactly what it was");
assert.ok(!MOM.includes("EXTRA INFO") && !JSON.stringify(getMomSections({ ai_summary: MOM })).includes("EXTRA INFO"), "Extra Info is never part of the MoM");
const FILLER = `[CALL STATUS: NOT CONNECTED]\n• Client: Unknown\n• Call Ref: #15701 | Date: 1 Oct 2026 | Duration: 0:24 (Not Connected)\n• Status: Connected\n\n[CALL LOG SUMMARY]\n• Call attempt was not connected or not answered by the client.`;
assert.equal(isWasteMomText(FILLER), true);
assert.equal(isWasteMomText("[GEMINI CHARGES]\nTotal: ₹0.4\n\n[NO SPEECH DETECTED]\nCall Date: 1 Oct"), true);
assert.equal(isWasteMomText("[TRANSCRIPT UNAVAILABLE] The call recording could not be transcribed"), true);
assert.equal(isWasteMomText("[AI MINUTES OF MEETING - GEMINI PROCESSED]\n• Transcribed and analyzed audio recording using Google Gemini."), true);
assert.equal(isWasteMomText(MOM), false);
assert.equal(isWasteMomText(""), false);
assert.equal(getMomPlainText({ ai_summary: FILLER }), "", "the filler is not displayed as a MoM");
assert.deepEqual(deriveFromMom({ ai_summary: FILLER }), {}, "a not-connected filler can never feed Extra Info");

// 8. RENDER: the real component, for a connected AI call and for a customer with nothing yet
const tmp = path.join(os.tmpdir(), `extra-card-${process.pid}.cjs`);
await build({
  entryPoints: [path.resolve(here, "../components/leads/ExtraInfoCard.jsx")], bundle: true, platform: "node", format: "cjs",
  outfile: tmp, jsx: "automatic", logLevel: "silent", loader: { ".js": "jsx" },
});
const cardRequire = createRequire(import.meta.url);
const Card = cardRequire(tmp).default;
const { renderToStaticMarkup } = cardRequire(path.resolve(here, "../../node_modules/react-dom/server.js"));
const React = cardRequire(path.resolve(here, "../../node_modules/react/index.js"));
const filled = buildExtraInfoRows({ stored: aiProfile, lead, temperatureId: "warm" });
const html = renderToStaticMarkup(React.createElement(Card, { rows: filled.rows, hasAnalysedCall: true }));
// known information from connected calls gets a tile (business / job and interests / hobbies included) ...
const tileKeys = [...html.matchAll(/data-extra-key="([a-zA-Z]+)"/g)].map((m) => m[1]);
assert.deepEqual(tileKeys.filter((k) => k !== "temperature"), [
  "business", "interests", "requirement", "intent", "mainConcern", "purchaseTimeline", "objection", "nextAction", "followUp", "conversion",
]);
for (const val of ["Runs a media consultancy", "Travel and cricket", "Podcast", "Interested but delayed", "Certification pending",
  "Tentatively 24-25 October / post-festivals", "Customer to contact certification authority", "Not converted"]) {
  assert.ok(html.includes(val), `renders value ${val}`);
}
for (const label of ["Business / Job", "Interests / Hobbies", "Requirement", "Intent", "Main Concern", "Purchase Timeline", "Objection", "Next Action", "Follow-up", "Conversion"]) {
  assert.ok(html.includes(label), `renders label ${label}`);
}
// ... lead temperature is a small chip in the header ...
assert.ok(html.includes('data-extra-key="temperature"') && html.indexOf('data-extra-key="temperature"') < html.indexOf('data-extra-key="business"'));
assert.ok(html.includes(">Warm<"));
// ... and what was NOT discussed gets no tile - it is named once in a muted line (nothing hidden, nothing invented)
for (const k of ["budget", "offerQuoted", "decisionMaker", "meeting"]) assert.ok(!html.includes(`data-extra-key="${k}"`), `${k} has no tile`);
const footer = html.slice(html.indexOf("Not discussed:"));
for (const label of ["Budget", "Offer / Price Quoted", "Decision Maker", "Meeting"]) assert.ok(footer.includes(label), `${label} is listed as not discussed`);
assert.ok(html.indexOf("Business / Job") < html.indexOf("Interests / Hobbies") && html.indexOf("Interests / Hobbies") < html.indexOf("Requirement"), "profile first");
assert.ok(html.includes('data-testid="extra-info-card"'));
assert.ok(!html.includes("No details yet"));
// a SMALL box: values are clamped to 2 lines, the grid is 2 columns, tiles use small type
assert.equal((html.match(/line-clamp-2/g) || []).length, 10, "every value is clamped to two lines");
assert.ok(html.includes("sm:grid-cols-2") && html.includes("text-[11px]") && html.includes("p-2.5"));
// a customer with nothing from calls yet
const bare = renderToStaticMarkup(React.createElement(Card, { rows: empty.rows, hasAnalysedCall: false }));
assert.ok(bare.includes("No details yet") && !bare.includes("data-extra-key=\"business\""));
assert.ok(!bare.includes("Unknown"), "no noise");
const nothing = renderToStaticMarkup(React.createElement(Card, { rows: empty.rows, hasAnalysedCall: true }));
assert.ok(nothing.includes("Nothing about this customer was discussed yet."));
assert.ok(!/<dd[^>]*>\s*<\/dd>/.test(html + bare), "no blank values");
fs.rmSync(tmp, { force: true });

// 9. PLACEMENT: header card -> Extra Info -> notes / call history (source order of the lead panel)
const panel = fs.readFileSync(path.resolve(here, "../components/leads/LeadDetailPanel.jsx"), "utf8");
const iHeader = panel.indexOf("Dialed {dialCount}");
const iExtra = panel.indexOf("<ExtraInfoCard ");
const iNotes = panel.indexOf("Notes ({humanNoteCount})");
const iLogs = panel.indexOf("Recorded Call Logs & MoM");
assert.ok(iHeader > 0 && iExtra > iHeader && iNotes > iExtra && iLogs > iNotes, "header -> Extra Info -> notes/call summaries -> call logs");
assert.ok(panel.slice(iHeader, iExtra).split("<ExtraInfoCard").length === 1);
assert.equal((panel.match(/<ExtraInfoCard /g) || []).length, 1, "rendered exactly once");

console.log("extraInfo: rows, merge over time, CRM overrides, legacy MOM read, waste-MoM hiding, render + placement - OK");
