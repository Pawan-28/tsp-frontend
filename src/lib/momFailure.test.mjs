// Run: node src/lib/momFailure.test.mjs
// The AI stores a marker + the real reason when it cannot make a MoM. The screens used to hide it ("not generated yet") and even
// show a success toast. momFailure() turns the stored text into a plain message.
import assert from "node:assert/strict";
import { momFailure, isWasteMomText } from "./momFormat.js";
import { buildCallHistoryItems } from "./callHistoryList.js";

const NL = "\n";
const dead = `[TRANSCRIPT UNAVAILABLE] The call recording could not be transcribed (no speech detected or Gemini transcription failed) - no MoM was generated for this call.${NL}Reason: recording download failed (HTTP 403)`;
assert.match(momFailure(dead), /recording link no longer works \(\(?HTTP 403\)/);
assert.match(momFailure(dead), /Callyzer may have expired/);
assert.match(momFailure(`[TRANSCRIPT UNAVAILABLE] x${NL}Reason: recording download failed (HTTP 500)`), /could not be downloaded/);
assert.match(momFailure(`[TRANSCRIPT UNAVAILABLE] x${NL}Reason: recording file is empty`), /file is empty/);
assert.match(momFailure(`[TRANSCRIPT UNAVAILABLE] x${NL}Reason: Gemini quota exceeded (429)`), /usage limit/);
assert.match(momFailure(`[TRANSCRIPT UNAVAILABLE] x${NL}Reason: weird thing`), /could not transcribe the recording: weird thing/);
assert.match(momFailure("[TRANSCRIPT UNAVAILABLE] no reason stored"), /could not transcribe the recording\./);
assert.match(momFailure(`[AI UNAVAILABLE] GEMINI_API_KEY is not configured on the server - no MoM was generated for this call.`), /GEMINI_API_KEY is not configured/);
assert.match(momFailure(`[AI SUMMARY PENDING]${NL}Call Date: x`), /summary step failed/);
assert.match(momFailure(`[AI SUMMARY PENDING]${NL}Call Date: x${NL}Reason: Gemini 429: quota`), /summary step failed \(Gemini 429: quota\)/);
assert.match(momFailure(`[NO SPEECH DETECTED]${NL}x`), /no intelligible speech/);
// a real MoM, an empty text and ordinary notes are not failures
assert.equal(momFailure("Client wants a book launch in December. Budget 2.5L."), null);
assert.equal(momFailure(""), null);
assert.equal(momFailure(undefined), null);
assert.equal(isWasteMomText(dead), true, "the old rule still hides the marker from the MoM view");

// the call list shows the reason, and a failed pending summary no longer counts as a MoM
const connected = { id: 1, direction: "outbound", outcome: "connected", durationSec: 97, duration: "1:37", recordingUrl: "https://x/a.mp3", startedAt: "2026-10-10T09:00:00Z" };
const items = buildCallHistoryItems([
  { ...connected, id: 1, aiSummary: dead },
  { ...connected, id: 2, aiSummary: `[AI SUMMARY PENDING]${NL}x` },
  { ...connected, id: 3, aiSummary: "Real minutes of the meeting." },
  { ...connected, id: 4, aiSummary: "" },
]);
const byId = Object.fromEntries(items.map((i) => [i.id, i]));
assert.equal(byId["1"].hasMom, false);
assert.match(byId["1"].momFailure, /no longer works/);
assert.equal(byId["2"].hasMom, false, "a pending placeholder is not a MoM");
assert.match(byId["2"].momFailure, /summary step failed/);
assert.equal(byId["3"].hasMom, true);
assert.equal(byId["3"].momFailure, null);
assert.equal(byId["4"].hasMom, false);
assert.equal(byId["4"].momFailure, null, "nothing stored yet: the plain 'not generated yet'");

console.log("momFailure: the real reason is shown instead of a fake success - OK");
