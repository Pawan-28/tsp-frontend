// Run: node src/lib/noteCardClean.test.mjs
// (1) the lead card has NO note input and NO call-log list; under Extra Info only the real MoM of connected calls is shown,
// (2) the Pipeline page no longer prints the long "<period> - Callyzer synced - N calls = ..." line.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.resolve(here, rel), "utf8");
const NL = String.fromCharCode(10);

const panel = read("../components/leads/LeadDetailPanel.jsx");
const code = panel.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").split(NL).filter((l) => !l.trim().startsWith("//")).join(NL); // code only: JSX {/* */} and // comments ignored

// no way to write a note, no notes counter
for (const gone of ["Add Note", "Type a note or call details", "handleAddNote", "newNote", "noteSaving", "humanNoteCount", "Notes ("]) {
  assert.ok(!code.includes(gone), `removed: ${gone}`);
}
// no call-log list under the notes / MoM card
for (const gone of ["Recorded Call Logs", "call-log", "isCallLogEntry", "Not connected \u2014 no recording", "No notes or call summaries saved"]) {
  assert.ok(!code.includes(gone), `removed: ${gone}`);
}
// only REAL MoMs: not-connected calls and filler add nothing, and no made-up "Call completed (1:12)" summary
assert.match(code, /if \(isCallNotConnected\(c\)\) return null;/);
assert.match(code, /if \(isWasteMomText\(summaryText\)\) return null;/);
assert.match(code, /const summaryText = c\.aiSummary \|\| c\.ai_summary \|\| c\.notes \|\| c\.note;/);
assert.ok(!/Call completed \(/.test(code), "no placeholder 'Call completed (duration)' summary");
// the MoM card: shown only when there is something to show, real AI summaries get a way to open the full MoM + SOP checklist
assert.match(code, /\{allNotesAndSummaries\.length > 0 && \(/);
assert.match(code, /data-testid="call-mom-card"/);
assert.match(code, /onClick=\{\(\) => setActiveViewCallMom\(item\.call\)\}/);
assert.match(code, /View MoM &amp; SOP checklist/);
assert.match(code, /<MomText text=\{stripGeminiCharges\(item\.body\)\}/);
assert.match(code, /<GeminiChargesBar call=\{\{ ai_summary: item\.body \}\} \/>/);
// the full-screen MoM view (SOP checklist, competency) is still there
assert.match(panel, /AI Call Summary &amp; MoM|AI Call Summary & MoM/);

// Pipeline page: the call-summary line is gone (only the small syncing hint remains)
const leads = read("../employee/pages/EmployeeLeads.jsx");
assert.ok(!/Callyzer synced/.test(leads), "the 'Callyzer synced' summary line is removed");
assert.match(leads, /Syncing in background/);
assert.match(leads, /Short Call column = every answered call of up to 2 min/);
assert.match(leads, /Not Pick column = every call that did not connect/);

console.log("noteCardClean: no note input, no call-log list, only real MoMs under Extra Info; no Callyzer summary line - OK");
