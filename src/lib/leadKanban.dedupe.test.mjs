// Run: node src/lib/leadKanban.dedupe.test.mjs  (proves one-card-per-phone on the Pipeline board)
import fs from "node:fs";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const LIB = fileURLToPath(new URL("./", import.meta.url)).split("\\").join("/");
// Legacy variant = same file with the phone de-duplication switched off (reproduces the bug).
const src = fs.readFileSync(LIB + "leadKanban.js", "utf8");
const legacySrc = src
  .replace("buildPhoneCanonicalMap(scopedVisible);", "{ canonicalById: new Map() };")
  .replace("if (phoneKey && placedPhones.has(phoneKey)) return;", "");
assert.notEqual(src, legacySrc);
const tmp = LIB + "__legacy_leadKanban_tmp.mjs";
fs.writeFileSync(tmp, legacySrc);
try {
  const fixed = await import("file:///" + LIB + "leadKanban.js");
  const legacy = await import("file:///" + tmp);

  // Same shapes as DB leads #458 / #1420 ("Tusharika Ma'am - TSP", phone 919554595134)
  const leads = [
    { id: 458, name: "Tusharika Ma'am - TSP", phone: "919554595134", stage: "meeting_done", pipelineStage: "Meeting Done", status: "Meeting Done", stageOverride: true, updatedAt: "2026-09-22T16:35:10Z" },
    { id: 1420, name: "Tusharika Ma'am - TSP", phone: "919554595134", stage: "not_interested", pipelineStage: "Not Interested", status: "Not Interested", stageOverride: true, updatedAt: "2026-09-24T07:33:09Z" },
    { id: 7, name: "Other Person", phone: "9811111111", stage: "proposal_sent", pipelineStage: "Proposal Sent", status: "Proposal Sent", stageOverride: true, updatedAt: "2026-09-20T00:00:00Z" },
  ];
  // plus a meeting for the loser, and two orphan Callyzer calls for the same unknown number
  const meetings = [{ id: 1, leadId: 458, status: "completed", scheduledAt: "2099-01-01T10:00:00Z" }];
  const calls = [
    { id: "c1", phone: "9822222222", direction: "outbound", durationSec: 130, callAt: "2026-09-23T05:00:00Z" },
    { id: "c2", phone: "9822222222", direction: "outbound", durationSec: 0, callType: "Not Connected", callAt: "2026-09-23T06:00:00Z" },
  ];
  const opts = { period: "all", adminScope: true, meetings };

  const count = (g, pred) => Object.entries(g).flatMap(([col, arr]) => arr.map((l) => [col, l])).filter(([, l]) => pred(l));
  const isTush = (l) => String(l.phone).endsWith("9554595134");
  const isOrphan = (l) => l._fromCall;

  const before = legacy.groupKanbanSyncedWithCallyzer(leads, calls, meetings, opts);
  const after = fixed.groupKanbanSyncedWithCallyzer(leads, calls, meetings, opts);

  const bt = count(before, isTush), at = count(after, isTush);
  console.log("BEFORE fix: Tusharika cards ->", bt.map(([c, l]) => `${c}#${l.id}`));
  console.log("AFTER  fix: Tusharika cards ->", at.map(([c, l]) => `${c}#${l.id}`));
  assert.equal(bt.length, 2, "legacy should reproduce the duplicate");
  assert.equal(at.length, 1, "fixed: exactly one card per phone");
  assert.equal(at[0][1].id, 1420, "winner = most recently updated manually staged row");
  assert.equal(at[0][0], "not_interested");

  const bo = count(before, isOrphan), ao = count(after, isOrphan);
  console.log("orphan call cards before/after:", bo.map(([c]) => c), ao.map(([c]) => c));
  assert.ok(ao.length <= 1);
  assert.equal(ao.length ? ao[0][0] : "conversation_2min", "conversation_2min");

  // every other lead still placed exactly once
  const other = count(after, (l) => l.id === 7);
  assert.equal(other.length, 1);
  assert.equal(other[0][0], "proposal_sent");

  // global invariant: no phone appears twice on the board
  const seen = new Map();
  for (const [, l] of count(after, () => true)) {
    const k = String(l.phone || "").replace(/\D/g, "").slice(-10);
    if (!k) continue;
    assert.ok(!seen.has(k), `phone ${k} on board twice`);
    seen.set(k, 1);
  }

  // older marker: manual-staged lead dated Jul on a "month" board => tagged
  const m = fixed.groupKanbanSyncedWithCallyzer(
    [{ id: 9, name: "Old", phone: "9833333333", stage: "meeting_done", pipelineStage: "Meeting Done", status: "Meeting Done", stageOverride: true, updatedAt: "2026-07-15T00:00:00Z" }],
    [], [], { period: "month", adminScope: true });
  console.log("older tag:", m.meeting_done[0]?._outsidePeriod, m.meeting_done[0]?._olderAt);
  assert.equal(m.meeting_done[0]._outsidePeriod, true);
  console.log("ALL OK");
} finally {
  fs.unlinkSync(tmp);
}
