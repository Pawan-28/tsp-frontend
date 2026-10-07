// Run: node src/lib/callMetrics.parity.test.mjs
// Proves the frontend call classification (lib/callMetrics.js) gives IDENTICAL buckets to the backend
// (backend/src/utils/callMetrics.js) on a table of cases, that every call lands in exactly one bucket, and that
// countPipelineCallMetrics (Pipeline note) sums to the total.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as FE from "./callMetrics.js";
import { callKanbanColumn, countPipelineCallMetrics } from "./leadKanban.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const BE = require(path.resolve(here, "../../../backend/src/utils/callMetrics.js"));

const OUTCOMES = [
  "Connected", "Not Connected", "Missed", "Rejected", "Discovery complete", "Foo", "", null,
  "not connected - callback requested", "Rejected by IVR note", "  NOT_connected ", "never-attended", "No answer", "busy",
  "Not Picked", "Call logged",
];
const DIRECTIONS = ["outbound", "inbound", "out", "in", "incoming", "OUTGOING", "", null];
const DURATIONS = [0, 1, 5, 45, 119, 120, 121, 600];

const cases = [];
let id = 0;
for (const outcome of OUTCOMES) {
  for (const direction of DIRECTIONS) {
    for (const durationSec of DURATIONS) {
      id += 1;
      cases.push({ id, leadId: (id % 17) + 1, direction, outcome, durationSec });
    }
  }
}

// 1. identical buckets, frontend == backend, and every call has exactly one valid bucket
const counts = {};
for (const c of cases) {
  const fe = FE.callBucket(c);
  const be = BE.callBucket(c);
  assert.equal(fe, be, `bucket mismatch for ${JSON.stringify(c)}: fe=${fe} be=${be}`);
  assert.ok(FE.CALL_BUCKETS.includes(fe), `unknown bucket ${fe}`);
  counts[fe] = (counts[fe] || 0) + 1;
  // every helper agrees too
  assert.equal(FE.isConnectedCall(c), BE.isConnectedCall(c));
  assert.equal(FE.isOutboundCall(c), BE.isOutboundCall(c));
  assert.equal(FE.isNotPickupByClientCall(c), BE.isNotPickupByClientCall(c));
  assert.equal(FE.isMissedCall(c), BE.isMissedCall(c));
  assert.equal(FE.isShortConnectedCall(c), BE.isShortConnectedCall(c));
  assert.equal(FE.isIncomingShortCall(c), BE.isIncomingShortCall(c));
  assert.equal(FE.isRejectedCall(c), BE.isRejectedCall(c));
}
for (const bucket of FE.CALL_BUCKETS) assert.ok(counts[bucket] > 0, `table never produces bucket ${bucket}`);

// 2. the normalizer and the sets are the same
assert.equal(FE.normalizeCallOutcome("  NOT_connected "), BE.normalizeCallOutcome("  NOT_connected "));
for (const key of ["OUTCOME_NOT_CONNECTED", "OUTCOME_MISSED", "OUTCOME_REJECTED"]) {
  assert.deepEqual(FE[key], [...BE[{ OUTCOME_NOT_CONNECTED: "NOT_CONNECTED_OUTCOMES", OUTCOME_MISSED: "MISSED_OUTCOMES", OUTCOME_REJECTED: "REJECTED_OUTCOMES" }[key]]]);
}

// 3. summarizeCalls identical and a clean partition; pipeline note sums to the total
assert.deepEqual(FE.summarizeCalls(cases), BE.summarizeCalls(cases));
const s = FE.summarizeCalls(cases);
assert.equal(s.total, cases.length);
assert.equal(s.total, s.conversation + s.short + s.incomingShort + s.noPickup + s.rejected + s.missedIncoming);
assert.equal(s.connected, s.conversation + s.short + s.incomingShort);
assert.equal(s.notConnected, s.noPickup + s.rejected + s.missedIncoming);

const m = countPipelineCallMetrics(cases);
assert.equal(m.totalCalls, cases.length);
assert.equal(
  m.totalCalls,
  m.conversations + m.shortCalls + m.incomingShort + m.notPickupByClient + m.rejected + m.missed,
  "Pipeline note: total = conversation + short + incoming short + not pick + rejected + missed incoming",
);
assert.equal(m.connected, m.conversations + m.shortCalls + m.incomingShort);
assert.equal(m.notConnected, m.notPickupByClient + m.rejected + m.missed);
assert.ok(m.totalLeads <= m.totalCalls);
for (const [calls, leads] of [
  [m.conversations, m.conversationLeads], [m.shortCalls, m.shortCallLeads], [m.incomingShort, m.incomingShortLeads],
  [m.notPickupByClient, m.notPickupLeads], [m.rejected, m.rejectedLeads], [m.missed, m.missedLeads],
]) assert.ok(leads <= calls);

// 4. the spec cases (frontend side)
const b = (direction, outcome, durationSec) => FE.callBucket({ direction, outcome, durationSec });
assert.equal(b("outbound", "Discovery complete", 30), "short");
assert.equal(b("inbound", "Not Connected", 0), "no_pickup");
assert.equal(b("outbound", "Rejected", 0), "rejected");
assert.equal(b("inbound", "Missed", 0), "missed_incoming");
assert.equal(b("inbound", "Connected", 45), "incoming_short");
assert.equal(b("outbound", "Foo", 0), "no_pickup");
assert.equal(b("outbound", "not connected - callback requested", 30), "short");
assert.equal(b("outbound", "Rejected by IVR note", 0), "no_pickup");

// 5. pipeline columns: Not Pick = no_pickup only, Short = answered outbound short
assert.equal(callKanbanColumn({ direction: "outbound", outcome: "Rejected", durationSec: 0 }), null);
assert.equal(callKanbanColumn({ direction: "outbound", outcome: "Not Connected", durationSec: 0 }), "not_pick");
assert.equal(callKanbanColumn({ direction: "inbound", outcome: "Not Connected", durationSec: 0 }), "not_pick");
assert.equal(callKanbanColumn({ direction: "inbound", outcome: "Connected", durationSec: 45 }), null);
assert.equal(callKanbanColumn({ direction: "outbound", outcome: "Connected", durationSec: 45 }), "short_call");
for (const c of cases) {
  const col = callKanbanColumn(c);
  const bucket = FE.callBucket(c);
  const expected = { conversation: "conversation_2min", short: "short_call", no_pickup: "not_pick" }[bucket] ?? null;
  assert.equal(col, expected);
}

// 6. pickup rate: one formula
assert.equal(FE.pickupRatePct(1, 5), BE.pickupRatePct(1, 5));
assert.equal(s.pickupRate, BE.summarizeCalls(cases).pickupRate);

console.log(`callMetrics parity: ${cases.length} cases OK (frontend == backend), buckets:`, counts);
