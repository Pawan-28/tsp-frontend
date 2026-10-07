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

console.log("meetingActive: Meetings page + Pipeline follow the backend isActive flag - OK");
