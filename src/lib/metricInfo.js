/**
 * Human-readable metric definitions (tooltips). The rules themselves live in lib/callMetrics.js
 * (calls) and backend/src/utils/metricDefinitions.js (admin dashboard); these strings only describe them.
 */
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL } from "./callMetrics.js";
import { localDateKey, parseCustomPeriod, weekStartMonday, monthStartLocal } from "./periodFilter.js";

function fmtKey(key, withYear = true) {
  if (!key) return "";
  const [y, m, d] = key.split("-").map(Number);
  const text = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}), timeZone: "UTC",
  });
  return text;
}

/** "This Month (1 Oct - 7 Oct 2026)" - the exact date range a call metric covers. */
export function describePeriodRange(period = "month", now = new Date()) {
  const todayKey = localDateKey(now);
  const custom = parseCustomPeriod(period);
  if (custom) {
    return custom.startDate === custom.endDate
      ? fmtKey(custom.startDate)
      : `${fmtKey(custom.startDate, false)} - ${fmtKey(custom.endDate)}`;
  }
  const p = String(period || "month").toLowerCase();
  if (p === "today" || p === "day") return `Today (${fmtKey(todayKey)})`;
  if (p === "week" || p === "this_week") {
    return `This week (${fmtKey(localDateKey(weekStartMonday(now)), false)} - ${fmtKey(todayKey)})`;
  }
  return `This month (${fmtKey(localDateKey(monthStartLocal(now)), false)} - ${fmtKey(todayKey)})`;
}

/** Call tiles: formula text. Combine with describePeriodRange() for the date range line. */
export const CALL_METRIC_INFO = {
  total: `Total calls = Conversation + Short call + Incoming short + Not pick + Rejected + Missed (incoming). Every call logged in the period (incoming + outgoing) is counted once.`,
  connected: `Connected = Conversation (${CALL_CONVERSATION_LABEL}) + Short call (${CALL_SHORT_LABEL}, outgoing) + Incoming short (${CALL_SHORT_LABEL}, incoming). A call is connected when it was answered and someone talked (talk time above 0). Ring seconds on a Not pick are not talk time.`,
  conversation: `Answered calls with talk time of ${CALL_CONVERSATION_LABEL}, any direction. Shown as calls and as DISTINCT leads - one lead can have several such calls.`,
  short: `Short call = answered OUTGOING call with talk time under ${CALL_CONVERSATION_LABEL}. Shown as calls and as DISTINCT leads.`,
  incomingShort: `Incoming short = answered INCOMING call with talk time under ${CALL_CONVERSATION_LABEL}. It counts as Connected but is not a Short call (those are outgoing only) and not a Not pick.`,
  notConnected: "Not connected = Not pick + Rejected + Missed (incoming) (Total calls - Connected).",
  noPickup: "Not pick = OUTGOING calls the client did not answer. Rejected calls are counted separately, never inside Not pick.",
  missed: "Missed (incoming) = INCOMING calls that were not answered.",
  rejected: "Rejected = rejected calls. Counted separately - never inside Not pick.",
  neverAttended: "Never attended = missed incoming calls with no later call to or from the same lead. A subset of Missed (incoming), not an extra category.",
  unique: "Distinct leads (numbers) across all calls in the period. A lead called 5 times counts once.",
  pickupRate: "Pickup rate = answered OUTGOING calls (Conversation + Short call) / OUTGOING dials (answered + Not pick + Rejected). One definition on every screen: Dashboard, Call Reporting, Team, Incentives and KRA.",
  avgDuration: "Avg call duration = total talk time / connected calls (unanswered dials add no talk time).",
  talkTime: "Total talk time of connected calls only.",
};

/** Meeting numbers on different screens measure different things - these explain each one. */
export const MEETING_METRIC_INFO = {
  scheduledInPeriod: "Meetings scheduled (not cancelled) whose date falls inside the selected period. Week / month include meetings later in the same week / month.",
  upcoming: "Meetings from now onward that are not completed or cancelled, regardless of the selected period.",
  bookedCards: "Leads currently in the Meeting Booked stage (one card per lead, whatever number of meetings it has).",
  held: "Meetings marked completed (held), counted by meeting date.",
  doneCards: "Leads currently in the Meeting Done stage (one card per lead).",
};

/**
 * Which kind of meeting number is it? Every screen that shows a meeting count must use ONE of these words,
 * so "2", "11", "13", "14" and "15" can be told apart:
 *   Upcoming              - from now onward, not completed / cancelled (ignores the period filter)
 *   Scheduled in period   - meetings dated inside the selected period (cancelled excluded)
 *   Booked                - leads in the Meeting Booked stage (cards, not meetings)
 *   Held                  - meetings marked completed
 */
export const MEETING_KIND_LABEL = {
  upcoming: "Upcoming",
  scheduledInPeriod: "Scheduled in period",
  booked: "Booked (stage)",
  held: "Held",
};

export function callMetricTooltip(key, period, now = new Date()) {
  const text = CALL_METRIC_INFO[key] || "";
  return `${text}\nDate range: ${describePeriodRange(period, now)}.`;
}
