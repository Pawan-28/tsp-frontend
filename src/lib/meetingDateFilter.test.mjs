// Run: node src/lib/meetingDateFilter.test.mjs
// The Meetings page filters: Today / Upcoming / Previous (relative to today in the app timezone).
import assert from "node:assert/strict";
import { MEETING_DATE_FILTERS, meetingDateBucket, filterMeetingsByDate, countByDateBucket } from "./meetingDateFilter.js";
import { partitionMeetings } from "../data/employeeMock.js";

const TODAY = "2026-10-07";
const m = (id, date, extra = {}) => ({ id, date, scheduledAt: `${date}T10:00:00`, ...extra });
const list = [
  m(1, "2026-10-07"),            // today (any time of day)
  m(2, "2026-10-07", { scheduledAt: "2026-10-07T23:30:00" }),
  m(3, "2026-10-08"),            // upcoming
  m(4, "2026-10-13"),
  m(5, "2026-10-06"),            // previous
  m(6, "2026-06-28"),
  m(7, undefined, { scheduledAt: undefined }), // no date -> in no bucket, only under "All"
];

assert.deepEqual(MEETING_DATE_FILTERS.map((f) => f.id), ["all", "today", "upcoming", "previous"]);
assert.equal(meetingDateBucket(list[0], TODAY), "today");
assert.equal(meetingDateBucket(list[1], TODAY), "today", "a later time today is still today");
assert.equal(meetingDateBucket(list[2], TODAY), "upcoming");
assert.equal(meetingDateBucket(list[4], TODAY), "previous");
assert.equal(meetingDateBucket(list[6], TODAY), null);
assert.equal(meetingDateBucket(list[0], "bad"), null);

assert.deepEqual(filterMeetingsByDate(list, "today", TODAY).map((x) => x.id), [1, 2]);
assert.deepEqual(filterMeetingsByDate(list, "upcoming", TODAY).map((x) => x.id), [3, 4]);
assert.deepEqual(filterMeetingsByDate(list, "previous", TODAY).map((x) => x.id), [5, 6]);
assert.equal(filterMeetingsByDate(list, "all", TODAY).length, list.length);
assert.equal(filterMeetingsByDate(list, undefined, TODAY).length, list.length);

const counts = countByDateBucket(list, TODAY);
assert.deepEqual(counts, { all: 7, today: 2, upcoming: 2, previous: 2 });

// end to end with the real partition: an overdue meeting from an earlier date is found under "Previous"; one today under "Today"
const wall = (d) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 19);
const now = Date.now();
const api = [
  { id: 1, leadId: 1, title: "earlier", status: "scheduled", isActive: true, lifecycle: "active", scheduledAt: wall(new Date(now - 3 * 86400000)) },
  { id: 2, leadId: 2, title: "later", status: "scheduled", isActive: true, lifecycle: "active", scheduledAt: wall(new Date(now + 3 * 86400000)) },
];
const { upcoming, history } = partitionMeetings(api, []);
const all = [...upcoming, ...history];
const todayKey = wall(new Date(now)).slice(0, 10);
assert.deepEqual(filterMeetingsByDate(all, "previous", todayKey).map((x) => x.id), [1]);
assert.deepEqual(filterMeetingsByDate(all, "upcoming", todayKey).map((x) => x.id), [2]);
assert.deepEqual(filterMeetingsByDate(all, "today", todayKey).map((x) => x.id), []);

console.log("meetingDateFilter: Today / Upcoming / Previous - OK");
