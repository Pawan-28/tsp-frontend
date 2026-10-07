// Run: node src/lib/meetingActive.test.mjs
// The BACKEND marks each meeting isActive / lifecycle (backend/src/utils/activeMeetings.js). The Meetings page and the
// Pipeline must follow that flag so they show the same current Meeting Booked state.
import assert from "node:assert/strict";
import { partitionMeetings } from "../data/employeeMock.js";
import { filterMeetingsForPeriod, resolveMeetingKanbanColumn, isInactiveScheduledMeeting } from "./leadKanban.js";
import { isMeetingOverdue, buildOverdueMeetingByLead } from "./meetingStatus.js";

const future = new Date(Date.now() + 2 * 86400000);
const past = new Date(Date.now() - 2 * 86400000);
const wall = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19); // IST wall clock, like the API
const api = (o) => ({ id: 1, leadId: 10, title: "Clarity Call", status: "scheduled", isActive: true, lifecycle: "active", scheduledAt: wall(future), ...o });

// 1. Meetings page: active upcoming -> Upcoming; active but past -> still Upcoming/Overdue territory (history bucket, flagged overdue)
{
  const { upcoming, history } = partitionMeetings([api({ id: 1 })]);
  assert.deepEqual([upcoming.length, history.length], [1, 0]);
}

// 2. a "scheduled" row the backend says is NOT active -> History with a reason, never Upcoming, never Overdue
for (const [lifecycle, label] of [["stage_moved", /moved out of Meeting Booked/], ["superseded", /Replaced/], ["other_owner", /another rep/], ["lead_deleted", /deleted/]]) {
  const { upcoming, history } = partitionMeetings([api({ id: 2, isActive: false, lifecycle, scheduledAt: wall(past) })]);
  assert.equal(upcoming.length, 0, lifecycle);
  assert.equal(history.length, 1, lifecycle);
  assert.match(history[0].outcome, label);
  assert.equal(isMeetingOverdue(history[0]), false, `${lifecycle} must not be overdue`);
}

// 3. completed meetings stay history; cancelled are dropped (unchanged behaviour)
{
  const { upcoming, history } = partitionMeetings([api({ id: 3, status: "completed", isActive: false, lifecycle: "completed" }), api({ id: 4, status: "cancelled", isActive: false, lifecycle: "cancelled" })]);
  assert.deepEqual([upcoming.length, history.length], [0, 1]);
  assert.equal(history[0].outcome, "Completed");
}

// 4. old API payloads without the flag keep working (isActive undefined = active)
{
  const { upcoming } = partitionMeetings([{ id: 5, leadId: 1, title: "x", status: "scheduled", scheduledAt: wall(future) }]);
  assert.equal(upcoming.length, 1);
}

// 5. the Pipeline ignores inactive scheduled meetings: no Meeting Booked card, no period count
const active = api({ id: 6 });
const stale = api({ id: 7, isActive: false, lifecycle: "stage_moved" });
const done = api({ id: 8, status: "completed", isActive: false, lifecycle: "completed" });
assert.equal(isInactiveScheduledMeeting(stale), true);
assert.equal(isInactiveScheduledMeeting(active), false);
assert.equal(isInactiveScheduledMeeting(done), false, "completed is history but still places Meeting Done");
assert.equal(resolveMeetingKanbanColumn(active), "meeting_booked");
assert.equal(resolveMeetingKanbanColumn(stale), null);
assert.equal(resolveMeetingKanbanColumn(done), "meeting_done");
assert.ok(!filterMeetingsForPeriod([active, stale], "month").some((m) => m.id === 7), "inactive scheduled meeting is not counted for the period");

// 6. overdue map ignores inactive meetings
assert.equal(buildOverdueMeetingByLead([{ ...stale, scheduledAt: wall(past) }]).size, 0);
assert.equal(buildOverdueMeetingByLead([{ ...active, scheduledAt: wall(past) }]).size, 1);


// 7. ONE CUSTOMER = ONE ACTIVE MEETING on the Meetings page - the visible Deepak case: two overdue meetings, same customer
{
  const lead = { id: 9, name: "Deepak Kumar Sharma", phone: "919194724633", pipelineStage: "Meeting Booked", stage: "Meeting Booked", status: "Meeting Booked" };
  const two = [
    { id: 301, leadId: 9, title: "Deepak - Clarity Call", status: "scheduled", scheduledAt: "2026-10-06T14:00:00", leadPhone: "919194724633" },
    { id: 302, leadId: 9, title: "Deepak - Clarity Call", status: "scheduled", scheduledAt: "2026-10-06T20:30:00", leadPhone: "919194724633" },
  ];
  const overdueCards = ({ upcoming, history }) => [...upcoming, ...history].filter((m) => isMeetingOverdue(m));
  const upcomingCards = ({ upcoming, history }) => [...upcoming, ...history].filter((m) => m.isActive !== false && m.status === "scheduled");

  // (a) API from the NEW backend: flags decide
  const flagged = two.map((m) => ({ ...m, isActive: m.id === 302, lifecycle: m.id === 302 ? "active" : "superseded", supersededBy: m.id === 302 ? undefined : 302 }));
  const a = partitionMeetings(flagged, [lead]);
  assert.deepEqual(overdueCards(a).map((m) => m.id), [302], "backend flags: ONE overdue card (8:30 PM)");
  assert.equal(a.history.find((m) => m.id === 301).outcome, "Replaced by the current meeting", "the 2 PM one is history only");
  assert.equal(upcomingCards(a).length, 1);

  // (b) API from an OLD backend (no flag): the frontend fallback applies the SAME rule - still one active card
  const b = partitionMeetings(two, [lead]);
  assert.deepEqual(overdueCards(b).map((m) => m.id), [302], "no flag: still ONE overdue card");
  assert.equal(b.history.find((m) => m.id === 301).lifecycle, "superseded");

  // (c) both upcoming, 2 PM -> 8:30 PM: the later booking wins
  const both = [
    { id: 11, leadId: 9, status: "scheduled", scheduledAt: wall(new Date(Date.now() + 86400000)), leadPhone: "919194724633" },
    { id: 12, leadId: 9, status: "scheduled", scheduledAt: wall(new Date(Date.now() + 86400000 + 6.5 * 3600000)), leadPhone: "919194724633" },
  ];
  const c = partitionMeetings(both, [lead]);
  assert.deepEqual(c.upcoming.map((m) => m.id), [12]);
  assert.deepEqual(c.history.map((m) => m.id), [11]);

  // (d) lead left Meeting Booked: no active card at all, history only
  const moved = partitionMeetings(two, [{ ...lead, pipelineStage: "Conversation", stage: "Conversation", status: "Conversation" }]);
  assert.equal(overdueCards(moved).length, 0);
  assert.equal(moved.upcoming.length, 0);
  assert.equal(moved.history.length, 2);

  // (e) PIPELINE and MEETINGS PAGE share the definition: the meetings that place a Meeting Booked card are exactly the active ones
  const board = [...a.upcoming, ...a.history].filter((m) => resolveMeetingKanbanColumn(m) === "meeting_booked").map((m) => m.id);
  assert.deepEqual(board, [302]);
  assert.deepEqual(filterMeetingsForPeriod([...a.upcoming, ...a.history], "all").map((m) => m.id), [302]);
}

console.log("meetingActive: Meetings page + Pipeline follow the backend isActive flag - OK");
