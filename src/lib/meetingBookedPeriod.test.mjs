// Run: node src/lib/meetingBookedPeriod.test.mjs
// "Meeting Booked" is a CURRENT STATE, not activity in a period: a lead in Meeting Booked (open meeting or stage only) stays on the
// Pipeline board in EVERY period filter, so the Pipeline column and the Meetings page list the same leads.
import assert from "node:assert/strict";
import { groupEmpLeadsKanban, isOpenMeeting, isMeetingBookedLead, filterMeetingsForPeriod } from "./leadKanban.js";

const EMP = 7;
const day = (offset) => new Date(Date.now() + offset * 86400000);
const wall = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19);
const iso = (d) => d.toISOString();
const lead = (id, extra = {}) => ({
  id, name: `Lead ${id}`, phone: `98765${String(id).padStart(5, "0")}`, stage: "booked", pipelineStage: "booked", status: "New Lead",
  assigneeId: EMP, assignedTo: EMP, assignmentStatus: "accepted", assignedAt: iso(day(-90)), createdAt: iso(day(-90)), updatedAt: iso(day(-80)),
  stageOverride: false, ...extra,
});
const meeting = (id, leadId, offsetDays, extra = {}) => ({
  id, leadId, title: "Clarity Call", status: "scheduled", isActive: true, lifecycle: "active", scheduledAt: wall(day(offsetDays)), ...extra,
});

const leads = [
  lead(1),                                                   // booked, overdue meeting from ~2 months ago (a previous month)
  lead(2),                                                   // booked, meeting next month
  lead(3),                                                   // booked, stage only - no meeting record, nothing this period
  lead(4, { stage: "Conversation", pipelineStage: "Conversation", status: "Conversation" }), // moved on; its old meeting is not active
  lead(5),                                                   // booked, meeting today
];
const meetings = [
  meeting(11, 1, -60),
  meeting(12, 2, 40),
  meeting(14, 4, -60, { isActive: false, lifecycle: "stage_moved" }),
  meeting(15, 5, 0),
];

assert.equal(isOpenMeeting(meetings[0]), true);
assert.equal(isOpenMeeting(meetings[2]), false);
assert.equal(isOpenMeeting({ status: "scheduled" }), true, "an API without the flag counts as active");
assert.equal(isOpenMeeting({ status: "completed", isActive: false }), false);
assert.equal(isMeetingBookedLead(leads[2]), true);
assert.equal(isMeetingBookedLead(leads[3]), false);

for (const period of ["today", "week", "month", "all"]) {
  const grouped = groupEmpLeadsKanban(leads, [], { meetings, period, employeeId: EMP, scopeCallsByAssignee: true });
  const ids = (grouped.meeting_booked || []).map((l) => Number(l.id)).sort((a, b) => a - b);
  assert.deepEqual(ids, [1, 2, 3, 5], `period=${period}: Meeting Booked column must hold every Meeting Booked lead`);
  assert.ok(!ids.includes(4), "a lead that left Meeting Booked is not in the column (its meeting is not active)");
}

// the in-period counter still means "meetings dated in the period" (unchanged) - only the board visibility became state-based
assert.ok(filterMeetingsForPeriod(meetings, "month").every((m) => m.id !== 11), "a meeting from 2 months ago is not 'in this month'");

console.log("meetingBookedPeriod: Meeting Booked is period-independent (Pipeline == Meetings page) - OK");
