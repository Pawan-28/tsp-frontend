// Run: node src/lib/noteCardClean.test.mjs
// (1) the lead's Notes card shows only real notes + real AI summaries - no "Not pick call - ... - Not connected" log lines.
// (2) the Pipeline page no longer prints the long "<period> - Callyzer synced - N calls = ..." line.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, rel), "utf8");

const panel = read("../components/leads/LeadDetailPanel.jsx");
const panelCode = panel.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"); // code only, comments ignored
// notes list: not-connected calls and "no conversation" filler produce NO entry at all
assert.match(panel, /if \(isCallNotConnected\(c\)\) return null;/);
assert.match(panel, /if \(isWasteMomText\(summaryText\)\) return null;/);
assert.ok(!/isCallLogEntry|call-log|Not connected`|\$\{notConnectedLabel\} call/.test(panelCode), "no call-log line is built or drawn any more");
assert.ok(!/No conversation recorded`/.test(panel.slice(panel.indexOf("allNotesAndSummaries = useMemo"), panel.indexOf("Header counter"))), "no 'No conversation recorded' note line");
// what stays: real notes, real AI summaries, and the full call list in its own card
assert.match(panel, /isAiCallSummary: true/);
assert.match(panel, /Recorded Call Logs & MoM/);
assert.match(panel, /Not connected — no recording or AI summary/, "the Recorded Call Logs card still marks a not-connected call");
assert.match(panel, /No notes or call summaries saved for this lead\./);

// Pipeline page: the call-summary line is gone (only the small syncing hint remains)
const leads = read("../employee/pages/EmployeeLeads.jsx");
assert.ok(!/Callyzer synced/.test(leads), "the 'Callyzer synced' summary line is removed");
assert.ok(!/meetings scheduled in period<\/span>/.test(leads));
assert.match(leads, /Syncing in background/);
// the stage chips (with their hover hints) are untouched
assert.match(leads, /Short Call column = every answered call of up to 2 min/);
assert.match(leads, /Not Pick column = every call that did not connect/);

console.log("noteCardClean: no call-log lines in Notes, no Callyzer summary line on the Pipeline - OK");
