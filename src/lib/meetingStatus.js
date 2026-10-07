import { parseAppDateTime } from "./timezone.js";

/** ms timestamp of a meeting's scheduled time (ISO / "YYYY-MM-DD HH:mm" in app timezone), or NaN. */
export function meetingTimeMs(meeting) {
  const raw = meeting?.scheduledAt || meeting?.date;
  const d = raw ? parseAppDateTime(raw) : null;
  return d ? d.getTime() : NaN;
}

/**
 * A meeting is OVERDUE when it is still "booked" (not completed / cancelled) but its time has already passed.
 * Display-only: nothing is auto-completed — the employee decides ("Mark held" or "Reschedule").
 */
export function isMeetingOverdue(meeting, now = Date.now()) {
  if (!meeting) return false;
  const status = String(meeting.status || "scheduled").toLowerCase();
  if (status === "completed" || status === "cancelled") return false;
  if (meeting.isActive === false) return false; // history (replaced / lead moved on) is never "overdue"
  const ms = meetingTimeMs(meeting);
  return Number.isFinite(ms) && ms < now;
}

/**
 * leadId -> overdue meeting, for pipeline "Meeting Booked" cards. A lead that ALSO has a later upcoming
 * booked meeting is not overdue. When a lead has several overdue meetings the most recent one is returned.
 */
export function buildOverdueMeetingByLead(meetings = [], now = Date.now()) {
  const overdue = new Map();
  const hasUpcoming = new Set();
  for (const m of Array.isArray(meetings) ? meetings : []) {
    if (!m || m.leadId == null) continue;
    const status = String(m.status || "scheduled").toLowerCase();
    if (status === "completed" || status === "cancelled") continue;
    if (m.isActive === false) continue;
    const id = String(m.leadId);
    const ms = meetingTimeMs(m);
    if (!Number.isFinite(ms)) continue;
    if (ms >= now) {
      hasUpcoming.add(id);
    } else {
      const cur = overdue.get(id);
      if (!cur || ms > meetingTimeMs(cur)) overdue.set(id, m);
    }
  }
  for (const id of hasUpcoming) overdue.delete(id);
  return overdue;
}

/**
 * "This week" for the Meetings tiles = upcoming from now to the end of Sunday (local time).
 * Today is always a subset of it. Returns the end-of-week timestamp.
 */
export function endOfWeekMs(now = new Date()) {
  const d = new Date(now);
  const daysToSunday = (7 - d.getDay()) % 7;
  d.setDate(d.getDate() + daysToSunday);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export function endOfTodayMs(now = new Date()) {
  const d = new Date(now);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

/** Counts for the Meetings tiles from the list of upcoming (not yet overdue) booked meetings. */
export function countMeetingTiles(upcoming = [], now = new Date()) {
  const nowMs = now.getTime();
  const todayEnd = endOfTodayMs(now);
  const weekEnd = endOfWeekMs(now);
  let today = 0;
  let week = 0;
  for (const m of upcoming) {
    const ms = meetingTimeMs(m);
    if (!Number.isFinite(ms) || ms < nowMs) continue;
    if (ms <= todayEnd) today += 1;
    if (ms <= weekEnd) week += 1;
  }
  return { today, week };
}

