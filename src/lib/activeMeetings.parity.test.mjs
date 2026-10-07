// Run: node src/lib/activeMeetings.parity.test.mjs
// Proves the frontend fallback (lib/activeMeetings.js) classifies EXACTLY like the backend (backend/src/utils/activeMeetings.js),
// so a response without the backend flag still shows ONE active meeting per customer, same as the Meetings API would.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as FE from "./activeMeetings.js";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const BE = require(path.resolve(here, "../../../backend/src/utils/activeMeetings.js"));

const STATUSES = ["scheduled", "scheduled", "completed", "cancelled"];
const STAGES = [["Meeting Booked", "Meeting Booked"], ["booked", "New Lead"], ["Conversation", "Conversation"], ["Lead", "booked"], ["Meeting Done", "Meeting Done"], ["Not Interested", ""], ["", ""]];
const PHONES = ["+91 91947 24633", "9194724633", "919194724633", "88888 22222", "12345"];
const ASSIGNEES = [5, 9, null];
const TIMES = ["2026-10-06T14:00:00", "2026-10-06T20:30:00", "2026-10-09T10:00:00", "2026-10-12T10:00:00"];

let n = 0; let cases = 0;
const rows = [];
for (const status of STATUSES) for (const [stage, st] of STAGES) for (const phone of PHONES) for (const assignee of ASSIGNEES) for (const time of TIMES.slice(0, 2)) {
  n += 1;
  rows.push({
    id: n, leadId: 1 + (n % 7), employeeId: n % 3 === 0 ? 9 : 5, status, scheduledAt: time, leadPhone: phone,
    leadStage: stage, leadStatus: st, leadAssignedTo: assignee, leadIsDeleted: n % 29 === 0 ? 1 : 0,
  });
}
// scenario groups of 6 rows sharing customers so "one per customer" is exercised heavily
for (const viewer of [null, 5, 9]) {
  for (let i = 0; i < rows.length; i += 6) {
    const group = rows.slice(i, i + 6);
    const be = BE.annotateActiveMeetings(group, { now: Date.parse("2026-10-07T09:30:00Z"), viewerEmployeeId: viewer });
    const fe = FE.annotateActiveMeetings(group, { viewerEmployeeId: viewer });
    for (let k = 0; k < group.length; k += 1) {
      cases += 1;
      assert.deepEqual(
        { isActive: fe[k].isActive, lifecycle: fe[k].lifecycle, supersededBy: fe[k].supersededBy },
        { isActive: be[k].isActive, lifecycle: be[k].lifecycle, supersededBy: be[k].supersededBy },
        `row ${JSON.stringify(group[k])} viewer=${viewer}`,
      );
    }
  }
}
// whole list at once (customers spread across the table) + the invariant: never two active meetings for one customer
for (const viewer of [null, 5]) {
  const be = BE.annotateActiveMeetings(rows, { viewerEmployeeId: viewer });
  const fe = FE.annotateActiveMeetings(rows, { viewerEmployeeId: viewer });
  fe.forEach((m, k) => assert.equal(m.isActive, be[k].isActive, `whole-list row ${m.id}`));
  const perCustomer = {};
  for (const m of fe.filter((x) => x.isActive)) perCustomer[FE.meetingPersonKey(m)] = (perCustomer[FE.meetingPersonKey(m)] || 0) + 1;
  assert.ok(Object.values(perCustomer).every((c) => c === 1), "never 2 active meetings for one customer");
}
assert.equal(FE.meetingPersonKey({ leadPhone: "+91 91947 24633" }), BE.meetingPersonKey({ leadPhone: "+91 91947 24633" }));
assert.equal(FE.isMeetingBookedStage("booked", "New Lead"), BE.isMeetingBookedStage("booked", "New Lead"));

console.log(`activeMeetings parity: ${cases} rows OK (frontend fallback == backend), max one active meeting per customer`);
