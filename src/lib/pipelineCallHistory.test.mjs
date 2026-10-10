// Run: node src/lib/pipelineCallHistory.test.mjs
// Pipeline early-funnel classification (Lead / Not Pick / Short Call / Conversation) must come from the person's
// FULL call history (any employee, any date), not from a stale stored "Lead" stage nor from only the selected
// period's calls of the current owner. Works for OLD (legacy stored stage) and NEW leads.
//   priority: Conversation (answered > 120 s) > Short Call (answered 1-120 s) > Not Pick (not answered / not connected / missed / rejected) > Lead
//   DIRECTION DOES NOT MATTER: an answered INCOMING call is a Short Call / Conversation exactly like an outgoing one, and a Missed or
//   rejected INCOMING call is Not Pick.
import assert from "node:assert/strict";
import { groupKanbanSyncedWithCallyzer, resolveLeadKanbanColumn, columnFromCallHistory, historyAwareColumn } from "./leadKanban.js";
import { callBucket, isOutboundCall } from "./callMetrics.js";

const EMP = 15;
const NOW = new Date().toISOString();
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();

// ---- call + history builders (history built with the SAME shared call definitions the backend uses)
let callSeq = 1;
const call = (leadId, phone, { dir = "outbound", outcome = "Connected", sec = 0, emp = EMP, daysAgo = 40 } = {}) => ({
  id: callSeq++, leadId, phone, direction: dir, outcome, durationSec: sec, employeeId: emp, callAt: iso(daysAgo), startedAt: iso(daysAgo),
});
const NO_ANSWER = { outcome: "Not Connected", sec: 0 };
const historyOf = (calls) => {
  const h = { conversation: 0, short: 0, noPickup: 0, rejected: 0, rejectedOutbound: 0, missedIncoming: 0, incomingShort: 0, outbound: 0, total: 0 };
  for (const c of calls) {
    const b = callBucket(c);
    h.total += 1;
    if (b === "conversation") h.conversation += 1;
    else if (b === "short") h.short += 1;
    else if (b === "no_pickup") h.noPickup += 1;
    else if (b === "rejected") { h.rejected += 1; if (isOutboundCall(c)) h.rejectedOutbound += 1; }
    else if (b === "missed_incoming") h.missedIncoming += 1;
    else if (b === "incoming_short") h.incomingShort += 1;
  }
  return h;
};

// ---- lead builders: a fresh admin assignment this month (so a "Lead" card is eligible to be on the board)
let idSeq = 100;
const lead = (phone, extra = {}) => {
  const id = idSeq++;
  return {
    id, name: `Lead ${id}`, phone, stage: "New Lead", pipelineStage: "New Lead", status: "New Lead",
    assigneeId: EMP, assignedTo: EMP, assignmentStatus: "assigned", assignmentMethod: "bulk", assignedAt: NOW,
    createdAt: iso(60), updatedAt: iso(1), ...extra,
  };
};

const leads = [];
const history = {}; // phone10 -> history
const periodCalls = [];
const add = (l, calls = [], { period = false } = {}) => {
  leads.push(l);
  if (calls.length) history[l.phone] = historyOf(calls);
  if (period) periodCalls.push(...calls);
  return l;
};
const P = (n) => `98765${String(n).padStart(5, "0")}`; // 10-digit phones

const expectations = []; // [lead, expected column, label]
const expectCol = (l, col, label) => expectations.push([l, col, label]);

// ===== OLD / legacy leads: stored stage still says "Lead", full history decides =====
expectCol(add(lead(P(1), { stage: "Lead", pipelineStage: "Lead" })), "lead", "legacy Lead, never called");
expectCol(add(lead(P(2)), [call(0, P(2), NO_ANSWER)]), "not_pick", "legacy Lead + dialed 1x no answer (old call)");
expectCol(add(lead(P(3)), [1, 2, 3, 4, 5].map(() => call(0, P(3), NO_ANSWER))), "not_pick", "legacy Lead + dialed 5x no answer");
expectCol(add(lead(P(4)), [call(0, P(4), { sec: 45 })]), "short_call", "legacy Lead + answered 45 s outbound");
expectCol(add(lead(P(5)), [call(0, P(5), { sec: 240 })]), "conversation_2min", "legacy Lead + answered 4 min outbound");
expectCol(add(lead(P(6)), [call(0, P(6), { dir: "inbound", sec: 180 })]), "conversation_2min", "legacy Lead + answered 3 min INCOMING (conversation, any direction)");
expectCol(add(lead(P(7)), [call(0, P(7), { outcome: "Rejected", sec: 0 })]), "not_pick", "legacy Lead + a dial the CUSTOMER REJECTED -> Not Pick");
expectCol(add(lead(P(23)), [call(0, P(23), { dir: "inbound", outcome: "Rejected", sec: 0 })]), "not_pick", "legacy Lead + a rejected INCOMING call -> Not Pick (direction does not matter)");
expectCol(add(lead(P(8)), [call(0, P(8), { dir: "inbound", outcome: "Missed", sec: 0 })]), "not_pick", "legacy Lead + a MISSED incoming call -> Not Pick");
expectCol(add(lead(P(9)), [call(0, P(9), { dir: "inbound", sec: 30 })]), "short_call", "legacy Lead + an answered INCOMING 30 s call -> Short Call (direction does not matter)");
expectCol(add(lead(P(10)), [call(0, P(10), { ...NO_ANSWER, emp: 99, daysAgo: 70 })]), "not_pick", "legacy Lead + 1 dial by ANOTHER employee long ago (the 'Dialed 1x still in Lead' case)");

// priority when several outcomes exist on the same person
expectCol(add(lead(P(11)), [call(0, P(11), NO_ANSWER), call(0, P(11), NO_ANSWER), call(0, P(11), { sec: 20 }), call(0, P(11), { sec: 400 })]), "conversation_2min", "priority: conversation beats short and not pick");
expectCol(add(lead(P(12)), [call(0, P(12), NO_ANSWER), call(0, P(12), NO_ANSWER), call(0, P(12), { sec: 20 })]), "short_call", "priority: short beats not pick");
expectCol(add(lead(P(13)), [call(0, P(13), { outcome: "Rejected" }), call(0, P(13), NO_ANSWER)]), "not_pick", "rejected + an unanswered dial -> Not Pick");
expectCol(add(lead(P(24)), [call(0, P(24), { outcome: "Rejected" }), call(0, P(24), { sec: 30 })]), "short_call", "rejected dial then an answered 30 s call -> Short Call (priority)");
// ----- answered outbound call duration boundaries (talk seconds)
expectCol(add(lead(P(25)), [call(0, P(25), { sec: 1 })]), "short_call", "answered outbound 1 s -> Short Call");
expectCol(add(lead(P(26)), [call(0, P(26), { sec: 119 })]), "short_call", "answered outbound 119 s -> Short Call");
expectCol(add(lead(P(27)), [call(0, P(27), { sec: 120 })]), "short_call", "answered outbound exactly 120 s -> Short Call (boundary)");
expectCol(add(lead(P(30)), [call(0, P(30), { sec: 121 })]), "conversation_2min", "answered outbound 121 s -> Conversation (above 120 s)");
expectCol(add(lead(P(28)), [call(0, P(28), { outcome: "Not Connected", sec: 5 })]), "not_pick", "'Not Connected' with 5 s of ring time is NOT a Short Call -> Not Pick");

// ===== stored stages that are stale / further along =====
expectCol(add(lead(P(14), { stage: "Not Pick", pipelineStage: "Not Pick", status: "Not Pick" }), [call(0, P(14), { sec: 300 })], { period: true }), "conversation_2min", "stored Not Pick but the person was later answered 5 min -> Conversation");
expectCol(add(lead(P(15), { stage: "Contacted", pipelineStage: "Contacted", status: "Contacted" }), [call(0, P(15), NO_ANSWER)], { period: true }), "conversation_2min", "stored Contacted (= Conversation by decision) is KEPT even though history is only Not Pick");
expectCol(add(lead(P(16), { stage: "Meeting Booked", pipelineStage: "Meeting Booked", status: "Booked" }), [call(0, P(16), NO_ANSWER)], { period: true }), "meeting_booked", "stored Meeting Booked is never pulled back by call history");
expectCol(add(lead(P(17), { stage: "Lead", pipelineStage: "Lead", stageOverride: true }), [call(0, P(17), { sec: 600 })], { period: true }), "conversation_2min", "manually placed in Lead (stageOverride) + an answered 10 min call -> Conversation (a hand-placed early stage can never sit BELOW a 2 min+ call)");

// ===== NEW leads with period calls =====
expectCol(add(lead(P(18)), [call(0, P(18), { sec: 20, daysAgo: 0 })], { period: true }), "short_call", "new lead, one 20 s answered call today");
expectCol(add(lead(P(19)), [call(0, P(19), { ...NO_ANSWER, daysAgo: 0 })], { period: true }), "not_pick", "new lead, one unanswered dial today");
expectCol(add(lead(P(20)), [call(0, P(20), { sec: 200, daysAgo: 0 })], { period: true }), "conversation_2min", "new lead, one 3 min conversation today");
expectCol(add(lead(P(29)), [call(0, P(29), { outcome: "Rejected", daysAgo: 0 })], { period: true }), "not_pick", "new lead, customer rejected our dial today -> Not Pick");

// ===== duplicate phones: ONE visible card, classified from the whole phone's calls =====
const dupA = add(lead(P(21), { updatedAt: iso(5) }));
const dupB = lead(P(21), { updatedAt: iso(1) }); // newer duplicate row, same phone
leads.push(dupB);
history[P(21)] = historyOf([1, 2, 3].map(() => call(0, P(21), NO_ANSWER))); // 3 unanswered dials on the phone
const dupShortA = lead(P(22)); const dupShortB = lead(P(22), { updatedAt: iso(0) });
leads.push(dupShortA, dupShortB);
history[P(22)] = historyOf([call(0, P(22), { sec: 45 })]);

// ===== a stage placed BY HAND is kept - but it can never sit BELOW an answered call above 2 min =====
const manual = (phone, stage, extra = {}) => lead(phone, { stage, pipelineStage: stage, status: stage, stageOverride: true, ...extra });
expectCol(add(manual(P(31), "Short Call"), [call(0, P(31), { sec: 240 })]), "conversation_2min", "HAND-placed Short Call + answered 4 min -> Conversation");
expectCol(add(manual(P(32), "Not Pick"), [call(0, P(32), { sec: 300, emp: 99, daysAgo: 70 })]), "conversation_2min", "HAND-placed Not Pick + a 5 min call by ANOTHER employee long ago -> Conversation");
expectCol(add(manual(P(33), "Lead"), [call(0, P(33), { dir: "inbound", sec: 180 })]), "conversation_2min", "HAND-placed Lead + an answered 3 min INCOMING call -> Conversation");
expectCol(add(manual(P(34), "Short Call"), [call(0, P(34), { sec: 45 })]), "short_call", "HAND-placed Short Call + only a 45 s call -> stays Short Call");
expectCol(add(manual(P(35), "Not Pick"), [call(0, P(35), { sec: 45 })]), "not_pick", "HAND-placed Not Pick + only a 45 s call -> stays (only a 2 min+ call overrides)");
expectCol(add(manual(P(36), "Short Call")), "short_call", "HAND-placed Short Call, no call history at all -> stays");
expectCol(add(manual(P(37), "Short Call"), [call(0, P(37), { sec: 120 })]), "short_call", "HAND-placed Short Call + a call of exactly 120 s (that is Short, not Conversation) -> stays");
expectCol(add(manual(P(38), "Short Call"), [call(0, P(38), { sec: 121 })]), "conversation_2min", "HAND-placed Short Call + 121 s -> Conversation");
for (const [n, stage, col] of [[41, "Meeting Booked", "meeting_booked"], [42, "Meeting Done", "meeting_done"], [43, "Proposal Sent", "proposal_sent"], [44, "Not Interested", "not_interested"], [45, "Advance Paid", "advance_paid"], [46, "Payment Complete", "payment_complete"]]) {
  expectCol(add(manual(P(n), stage), [call(0, P(n), { sec: 600 })]), col, `HAND-placed ${stage} + a 10 min call -> stays ${stage}`);
}

const board = groupKanbanSyncedWithCallyzer(leads, periodCalls, [], {
  period: "month", visibleLeads: leads, scopeCallsByAssignee: true, includeUncontactedAssignments: true, employeeId: EMP,
  callHistory: history,
});
const columnOf = (l) => {
  for (const [col, list] of Object.entries(board)) if (list.some((c) => String(c.id) === String(l.id))) return col;
  return null;
};

let checked = 0;
for (const [l, col, label] of expectations) {
  assert.equal(columnOf(l), col, `${label}: got ${columnOf(l)}, want ${col}`);
  // resolveLeadKanbanColumn (used for scroll / move logic) must agree with the board
  if (!l.stageOverride && col !== "meeting_booked") {
    assert.equal(resolveLeadKanbanColumn(l, periodCalls, { scopeByAssignee: true, callHistory: history }), col, `resolveLeadKanbanColumn: ${label}`);
  }
  checked += 1;
}

// duplicate phones: exactly one card per phone, in the right column, rows are NOT merged/deleted
const cardsFor = (phone) => Object.entries(board).flatMap(([col, list]) => list.filter((c) => c.phone === phone).map((c) => ({ col, id: c.id })));
assert.equal(cardsFor(P(21)).length, 1, "duplicate phone shows ONE card");
assert.equal(cardsFor(P(21))[0].col, "not_pick", "duplicate phone (3 unanswered dials) -> Not Pick");
assert.equal(cardsFor(P(22)).length, 1);
assert.equal(cardsFor(P(22))[0].col, "short_call", "duplicate phone with one 45 s answered call -> Short Call");
assert.equal(leads.filter((l) => l.phone === P(21)).length, 2, "both duplicate rows still exist (nothing merged or deleted)");
checked += 4;

// a phone never sits in two columns, anywhere on the board
const seen = new Map();
for (const [col, list] of Object.entries(board)) for (const c of list) {
  const k = String(c.phone || c.id).slice(-10);
  assert.ok(!seen.has(k), `phone ${k} appears in ${seen.get(k)} AND ${col}`);
  seen.set(k, col);
}

// ===== fallback: without call history the board keeps its previous behaviour (never breaks) =====
const boardNoHist = groupKanbanSyncedWithCallyzer(leads, periodCalls, [], {
  period: "month", visibleLeads: leads, scopeCallsByAssignee: true, includeUncontactedAssignments: true, employeeId: EMP,
});
const inLeadNoHist = boardNoHist.lead.some((c) => c.phone === P(10));
assert.equal(inLeadNoHist, true, "without history the other-employee dial stays in Lead (old behaviour) - proves the history is what fixes it");

// resolveLeadKanbanColumn (used for scroll / move logic) agrees for hand-placed leads as well
{
  const hist = { [P(31)]: historyOf([call(0, P(31), { sec: 240 })]), [P(34)]: historyOf([call(0, P(34), { sec: 45 })]) };
  assert.equal(resolveLeadKanbanColumn(manual(P(31), "Short Call"), [], { callHistory: hist }), "conversation_2min");
  assert.equal(resolveLeadKanbanColumn(manual(P(34), "Short Call"), [], { callHistory: hist }), "short_call");
  assert.equal(resolveLeadKanbanColumn(manual(P(31), "Meeting Booked"), [], { callHistory: hist }), "meeting_booked");
  assert.equal(resolveLeadKanbanColumn(manual(P(31), "Short Call"), [], {}), "short_call", "without a call history nothing changes");
}

// pure helpers
assert.equal(columnFromCallHistory(null), "lead");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 5, rejectedOutbound: 0, missedIncoming: 3, incomingShort: 2 }), "short_call", "an answered incoming call (Incoming short) -> Short Call, whatever else happened");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 5, rejectedOutbound: 0, missedIncoming: 3, incomingShort: 0 }), "not_pick", "rejected INCOMING / missed alone -> Not Pick");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 0, missedIncoming: 1, incomingShort: 0 }), "not_pick", "one missed incoming call -> Not Pick");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 0, missedIncoming: 0, incomingShort: 1 }), "short_call", "one answered incoming 33 s call -> Short Call");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 0, missedIncoming: 0, incomingShort: 0 }), "lead", "no call at all -> Lead");
assert.equal(columnFromCallHistory({ conversation: 0, short: 0, noPickup: 0, rejected: 2, rejectedOutbound: 2 }), "not_pick", "customer-rejected dials -> Not Pick");
assert.equal(columnFromCallHistory({ conversation: 1, short: 3, noPickup: 9 }), "conversation_2min");
assert.equal(historyAwareColumn({ id: 1, phone: P(1) }, "short_call", { [P(1)]: { noPickup: 4 } }), "short_call", "a stored stage further along is kept");
assert.equal(historyAwareColumn({ id: 1, phone: P(1) }, "not_pick", { [P(1)]: { short: 1 } }), "short_call", "history can move a stored stage further");
assert.equal(historyAwareColumn({ id: 1, phone: P(1) }, "lead", null), null, "no history supplied -> caller falls back");

console.log(`pipeline call-history classification: ${checked} cases OK (legacy + new leads, duplicates, fallback)`);
