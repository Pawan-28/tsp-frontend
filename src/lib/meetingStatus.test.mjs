// Run: node src/lib/meetingStatus.test.mjs  (overdue-meeting flag, Today ⊂ This week tiles)
import assert from "node:assert/strict";
import {
  isMeetingOverdue, buildOverdueMeetingByLead, countMeetingTiles, endOfWeekMs,
} from "./meetingStatus.js";

const now = new Date("2026-10-07T10:00:00+05:30"); // a Wednesday
const nowMs = now.getTime();
const iso = (offsetH) => new Date(nowMs + offsetH * 3600000).toISOString();

// overdue = still booked + time passed. Completed / cancelled / future never overdue.
assert.equal(isMeetingOverdue({ status: "scheduled", scheduledAt: iso(-2) }, nowMs), true);
assert.equal(isMeetingOverdue({ status: "scheduled", scheduledAt: iso(2) }, nowMs), false);
assert.equal(isMeetingOverdue({ status: "completed", scheduledAt: iso(-48) }, nowMs), false);
assert.equal(isMeetingOverdue({ status: "cancelled", scheduledAt: iso(-48) }, nowMs), false);
assert.equal(isMeetingOverdue({ scheduledAt: "not a date" }, nowMs), false);
assert.equal(isMeetingOverdue(null, nowMs), false);

// pipeline map: lead with a later upcoming meeting is NOT overdue; most recent overdue wins.
const map = buildOverdueMeetingByLead([
  { id: 1, leadId: 10, status: "scheduled", scheduledAt: iso(-30) },
  { id: 2, leadId: 10, status: "scheduled", scheduledAt: iso(-3) },
  { id: 3, leadId: 11, status: "scheduled", scheduledAt: iso(-5) },
  { id: 4, leadId: 11, status: "scheduled", scheduledAt: iso(5) },
  { id: 5, leadId: 12, status: "completed", scheduledAt: iso(-5) },
], nowMs);
assert.equal(map.get("10").id, 2);
assert.equal(map.has("11"), false);
assert.equal(map.has("12"), false);

// tiles: Today subset of week; week stops at Sunday night
const tiles = countMeetingTiles([
  { scheduledAt: iso(1) },        // today
  { scheduledAt: iso(5) },        // today (15:00)
  { scheduledAt: iso(24) },       // Thu
  { scheduledAt: iso(24 * 4) },   // Sun 11 Oct 10:00 -> still this week
  { scheduledAt: iso(24 * 5) },   // Mon -> next week
  { scheduledAt: iso(-1) },       // already past -> not counted
], now);
assert.deepEqual(tiles, { today: 2, week: 4 });
assert.ok(tiles.today <= tiles.week);
assert.equal(new Date(endOfWeekMs(now)).getDay(), 0);
// on a Sunday the week ends today
assert.equal(new Date(endOfWeekMs(new Date("2026-10-11T09:00:00+05:30"))).getDate(), 11);

// tap vs drag

console.log("meetingStatus tests passed");
