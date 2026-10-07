/**
 * Date filters of the Meetings page: Today / Upcoming / Previous (relative to today in the app timezone).
 *   today    = meetings dated today (earlier or later in the day)
 *   upcoming = meetings dated AFTER today
 *   previous = meetings dated BEFORE today
 * `meeting.date` is the YYYY-MM-DD of the meeting's scheduled time (see meetingFromApi).
 */
export const MEETING_DATE_FILTERS = [
  { id: "all", label: "All" },
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "previous", label: "Previous" },
];

export function meetingDateBucket(meeting, todayKey) {
  const key = String(meeting?.date || meeting?.scheduledAt || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !/^\d{4}-\d{2}-\d{2}$/.test(String(todayKey || ""))) return null;
  if (key === todayKey) return "today";
  return key > todayKey ? "upcoming" : "previous";
}

export function filterMeetingsByDate(list = [], filterId = "all", todayKey) {
  if (!filterId || filterId === "all") return list;
  return list.filter((m) => meetingDateBucket(m, todayKey) === filterId);
}

export function countByDateBucket(list = [], todayKey) {
  const counts = { all: list.length, today: 0, upcoming: 0, previous: 0 };
  for (const m of list) {
    const b = meetingDateBucket(m, todayKey);
    if (b) counts[b] += 1;
  }
  return counts;
}
