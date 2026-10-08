// Run: node src/lib/callHistoryList.test.mjs
// Lead card "Activity History": every call - direction, status, time, duration - and the recording of a connected call.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildCallHistoryItems } from "./callHistoryList.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

const REC = "https://recordings.example.com/a.mp3";
const calls = [
  { id: 1, direction: "outbound", outcome: "Connected", durationSec: 72, duration: "1:12", date: "Today, 12:43 pm", callAt: "2026-10-08T12:43:00", recordingUrl: REC },
  { id: 2, direction: "outbound", outcome: "Connected", durationSec: 14, duration: "0:14", date: "Today, 12:43 pm", callAt: "2026-10-08T12:43:30" }, // no recording
  { id: 3, direction: "inbound", outcome: "Missed", durationSec: 0, duration: "—", date: "Today, 12:00 pm", callAt: "2026-10-08T12:00:00" },
  { id: 4, direction: "outbound", outcome: "Not Connected", durationSec: 5, duration: "0:05", date: "22 Aug, 10:20 pm", callAt: "2026-08-22T22:20:00", recordingUrl: "https://x/ignored.mp3" },
  { id: 5, direction: "inbound", outcome: "Rejected", durationSec: 0, duration: "0:00", date: "21 Aug, 9:00 am", callAt: "2026-08-21T09:00:00" },
  { id: 6, direction: "inbound", outcome: "Connected", durationSec: 33, duration: "0:33", date: "25 Sept, 3:12 pm", callAt: "2026-09-25T15:12:00", recording_url: REC },
];
const items = buildCallHistoryItems(calls);
const by = (id) => items.find((i) => i.id === String(id));

// 1. every call, newest first
assert.equal(items.length, 6);
assert.deepEqual(items.map((i) => i.id), ["2", "1", "3", "6", "4", "5"]);

// 2. which call / what happened / when / how long
assert.deepEqual([by(1).direction, by(1).status, by(1).when, by(1).duration], ["Outgoing", "Connected", "Today, 12:43 pm", "1:12"]);
assert.deepEqual([by(6).direction, by(6).status, by(6).duration], ["Incoming", "Connected", "0:33"], "an answered incoming call is Connected");
assert.deepEqual([by(3).direction, by(3).status, by(3).duration], ["Incoming", "Missed", ""], "a missed call has no talk time");
assert.deepEqual([by(4).direction, by(4).status, by(4).duration], ["Outgoing", "Not pick", ""], "ring seconds on a not-connected dial are not shown as a duration");
assert.deepEqual([by(5).status, by(5).tone], ["Rejected", "danger"]);
assert.equal(by(1).tone, "success");
assert.equal(by(3).tone, "warning");

// 3. recording: only for a CONNECTED call, from either field name; never for missed / not pick / rejected
assert.equal(by(1).recordingUrl, REC);
assert.equal(by(6).recordingUrl, REC, "recording_url (API name) works too");
assert.equal(by(2).recordingUrl, "", "connected but no recording yet");
assert.equal(by(4).recordingUrl, "", "a recording URL on a not-connected call is ignored");
assert.deepEqual(buildCallHistoryItems(undefined), []);
assert.deepEqual(buildCallHistoryItems([]), []);

// 4. the real list, rendered
const out = path.join(os.tmpdir(), `callhist-${process.pid}.cjs`);
await build({ entryPoints: [path.resolve(root, "src/components/leads/CallHistoryList.jsx")], bundle: true, platform: "node", format: "cjs", outfile: out, jsx: "automatic", logLevel: "silent" });
const List = require(out).default;
fs.rmSync(out, { force: true });
const { renderToStaticMarkup } = require(path.resolve(root, "node_modules/react-dom/server.js"));
const React = require(path.resolve(root, "node_modules/react/index.js"));
const html = renderToStaticMarkup(React.createElement(List, { items }));
assert.ok(html.includes("Calls (6)"));
for (const t of ["Outgoing call", "Incoming call", "Connected", "Missed", "Not pick", "Rejected", "1:12", "0:14", "0:33", "Today, 12:43 pm", "Today, 12:00 pm", "22 Aug, 10:20 pm", "25 Sept, 3:12 pm"]) {
  assert.ok(html.includes(t), `shows ${t}`);
}
assert.equal((html.match(/<audio /g) || []).length, 2, "an audio player only for the 2 connected calls that have a recording");
assert.ok(html.includes(`src="${REC}"`) && html.includes("Recording"));
assert.equal((html.match(/No recording for this call/g) || []).length, 1, "the connected call without a recording says so");
assert.equal((html.match(/Not connected/g) || []).length, 3, "missed / not pick / rejected are marked Not connected");
assert.ok(!html.includes("ignored.mp3"), "no player for a not-connected call");
// each call is one row, in order
assert.deepEqual([...html.matchAll(/data-call-id="(\d+)"/g)].map((m) => m[1]), ["2", "1", "3", "6", "4", "5"]);
assert.equal(renderToStaticMarkup(React.createElement(List, { items: [] })), "", "nothing when there are no calls");
assert.ok(renderToStaticMarkup(React.createElement(List, { items: [], loading: true })).includes("Loading call history"));

// 5. wiring: the Activity History card shows it for every viewer, with the other activity underneath
const panel = fs.readFileSync(path.resolve(root, "src/components/leads/LeadDetailPanel.jsx"), "utf8");
const card = panel.indexOf('data-testid="activity-history-card"');
assert.ok(card > 0);
assert.ok(!/variant === "employee" && \(\s*<>\s*<div className="[^"]*"\s*data-testid="activity-history-card"/.test(panel), "not limited to the employee view");
assert.match(panel, /<CallHistoryList items=\{callHistoryItems\} loading=\{callsLoading\} \/>/);
assert.match(panel, /buildCallHistoryItems\(leadCalls\)/);
assert.ok(panel.indexOf("Other activity") > card, "other activity is listed under the calls");
assert.ok(!panel.includes("Recorded Call Logs"), "the old call-log card stays removed");

console.log("callHistoryList: every call with direction / status / time / duration, recording for connected calls - OK");
