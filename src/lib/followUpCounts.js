import { getFollowUpUrgency, isFollowUpCompleted, isTaskAssignedToEmployee } from "../data/employeeMock.js";
import { isUncontactedNewLead } from "./leadKanban.js";
import { parseAppDateTime } from "./timezone.js";

/**
 * ONE shared source for the employee follow-up / task workload numbers.
 * Follow-Up page, My Tasks page and the Dashboard must all read from here so the
 * counts always describe the same sets.
 *
 * Definitions
 *  - overdue   : scheduled follow-up (a real follow-up row with a scheduled date) in the past, not completed.
 *  - dueToday  : scheduled follow-up for today, not completed.
 *  - upcoming  : scheduled follow-up after today, not completed.
 *  - newLeads  : leads assigned to the rep (by admin or self-added) with NO outbound call since assignment.
 *                These are NOT follow-ups and are never counted as overdue.
 *  - totalOpen : overdue + dueToday + upcoming + newLeads (everything the rep still has to act on).
 *  - completed : completed follow-ups.
 */

/** Today's date key (YYYY-MM-DD) in the browser's local zone — same basis as getFollowUpUrgency. */
function todayKey(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Urgency of a scheduled follow-up row, recomputed from its scheduled date (falls back to the stored value). */
export function followUpUrgency(followUp) {
  if (followUp?.scheduledDate) return getFollowUpUrgency(followUp.scheduledDate);
  return followUp?.urgency || "upcoming";
}

/** Leads still waiting for a first outbound call, newest assignment first. */
export function selectNewLeads(leads = [], calls = [], employeeId = null) {
  const list = (Array.isArray(leads) ? leads : []).filter((lead) => isUncontactedNewLead(lead, calls, {
    outboundOnly: true,
    scopeByAssignee: Boolean(employeeId),
    sinceAssignment: true,
  }));
  return list.sort((a, b) => leadAssignedMs(b) - leadAssignedMs(a));
}

export function leadAssignedMs(lead) {
  const raw = lead?.assignedAt || lead?.assigned_at || lead?.createdAt || lead?.created_at || lead?.updatedAt;
  if (!raw) return 0;
  const parsed = parseAppDateTime(raw) || new Date(raw);
  const ms = parsed?.getTime?.();
  return Number.isFinite(ms) ? ms : 0;
}

/** "Assigned 12 Sep, 3:40 PM" (always an absolute date — never reads as a due time). */
export function formatAssignedLabel(lead) {
  const ms = leadAssignedMs(lead);
  if (!ms) return "Assigned —";
  const d = new Date(ms);
  const date = d.toLocaleDateString("en-IN", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });
  const time = d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `Assigned ${date}, ${time}`;
}

/**
 * Split follow-ups / leads into the exact sets the Follow-Up page renders.
 * @returns {{ overdue: object[], today: object[], upcoming: object[], completed: object[], newLeads: object[] }}
 */
export function classifyFollowUps({ followUps = [], leads = [], calls = [], employeeId = null } = {}) {
  const overdue = [];
  const today = [];
  const upcoming = [];
  const completed = [];
  for (const f of Array.isArray(followUps) ? followUps : []) {
    if (!f) continue;
    if (isFollowUpCompleted(f)) {
      completed.push(f);
      continue;
    }
    const urgency = followUpUrgency(f);
    if (urgency === "overdue") overdue.push(f);
    else if (urgency === "today") today.push(f);
    else upcoming.push(f);
  }
  completed.sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0));
  const newLeads = selectNewLeads(leads, calls, employeeId);
  return { overdue, today, upcoming, completed, newLeads };
}

/** Counts for the sets above. */
export function computeFollowUpCounts(args = {}) {
  const sets = classifyFollowUps(args);
  const overdue = sets.overdue.length;
  const dueToday = sets.today.length;
  const upcoming = sets.upcoming.length;
  const newLeads = sets.newLeads.length;
  return {
    overdue,
    dueToday,
    upcoming,
    newLeads,
    completed: sets.completed.length,
    scheduledOpen: overdue + dueToday + upcoming,
    totalOpen: overdue + dueToday + upcoming + newLeads,
    /** What the rep must act on right now: missed + due-today scheduled follow-ups. */
    actionable: overdue + dueToday,
  };
}

/**
 * Task workload from the EmployeeContext `tasks` map ({ [YYYY-MM-DD]: task[] }).
 *  - pending      : every open task assigned to the rep (any date).
 *  - dueToday     : open tasks dated today.
 *  - overdue      : open tasks dated before today.
 *  - doneToday    : tasks completed with today's date.
 *  - highPriority : open high-priority tasks.
 *  - daysWithTasks: distinct upcoming (today or later) dates that still hold an open task.
 */
export function computeTaskCounts({ tasks = {}, employeeName = "", now = new Date() } = {}) {
  const today = todayKey(now);
  const all = Object.entries(tasks || {}).flatMap(([date, items]) => (
    (Array.isArray(items) ? items : [])
      .filter((t) => isTaskAssignedToEmployee(t, employeeName))
      .map((t) => ({ ...t, date }))
  ));
  const open = all.filter((t) => !t.done);
  return {
    pending: open.length,
    dueToday: open.filter((t) => t.date === today).length,
    overdue: open.filter((t) => t.date < today).length,
    doneToday: all.filter((t) => t.done && t.date === today).length,
    highPriority: open.filter((t) => t.priority === "high").length,
    daysWithTasks: new Set(open.filter((t) => t.date >= today).map((t) => t.date)).size,
  };
}
