/**
 * ACTIVE MEETING - frontend MIRROR of backend/src/utils/activeMeetings.js (ONE CUSTOMER = ONE ACTIVE MEETING).
 *
 * The BACKEND is the source of truth: every meeting from the meetings API carries `isActive` + `lifecycle`, and the Meetings page
 * and the Pipeline simply follow that flag. This mirror is only a FALLBACK for a response that has no flag (an older API, a
 * stale cached payload, the backend not yet upgraded): without it such a response would show two active cards for one customer.
 * `activeMeetings.parity.test.mjs` proves this file classifies EXACTLY like the backend on a table of cases - keep both in sync.
 *
 * Active = status "scheduled" + lead not deleted + lead currently in Meeting Booked + (viewer: the lead's assignee) +
 * the customer's CURRENT meeting = the MOST RECENT BOOKING (highest id) among that customer's scheduled meetings.
 */
import { mapStageToId } from "./pipelineStages.js";

const norm = (v) => String(v == null ? "" : v).trim().toLowerCase();

export function isMeetingBookedStage(stage, status) {
  if (!String(stage || "").trim() && !String(status || "").trim()) return false;
  return mapStageToId(stage, status) === "meeting_booked";
}

/** Person key: last 10 digits of the phone, else the lead id. */
export function meetingPersonKey(meeting) {
  const digits = String(meeting?.leadPhone || "").replace(/\D/g, "");
  if (digits.length >= 10) return `p:${digits.slice(-10)}`;
  return `l:${meeting?.leadId}`;
}

export function pickCurrentMeeting(candidates) {
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => Number(b.id) - Number(a.id))[0];
}

export function annotateActiveMeetings(meetings = [], { viewerEmployeeId = null } = {}) {
  const list = Array.isArray(meetings) ? meetings : [];
  const viewer = viewerEmployeeId == null ? null : String(viewerEmployeeId);
  const out = new Map();
  const eligible = new Map();

  for (const m of list) {
    const status = norm(m.status) || "scheduled";
    if (status === "completed") { out.set(m, { ...m, isActive: false, lifecycle: "completed" }); continue; }
    if (status === "cancelled" || status === "canceled") { out.set(m, { ...m, isActive: false, lifecycle: "cancelled" }); continue; }

    const hasLeadInfo = m.leadStage !== undefined || m.leadStatus !== undefined;
    if (hasLeadInfo) {
      if (Number(m.leadIsDeleted) === 1 || m.leadIsDeleted === true) { out.set(m, { ...m, isActive: false, lifecycle: "lead_deleted" }); continue; }
      if (!isMeetingBookedStage(m.leadStage, m.leadStatus)) { out.set(m, { ...m, isActive: false, lifecycle: "stage_moved" }); continue; }
    }
    if (viewer != null) {
      const assignee = m.leadAssignedTo == null ? null : String(m.leadAssignedTo);
      const owner = m.employeeId == null ? null : String(m.employeeId);
      const mine = assignee != null ? assignee === viewer : owner === viewer;
      if (!mine) { out.set(m, { ...m, isActive: false, lifecycle: "other_owner" }); continue; }
    }
    const key = meetingPersonKey(m);
    if (!eligible.has(key)) eligible.set(key, []);
    eligible.get(key).push(m);
  }

  for (const group of eligible.values()) {
    const current = pickCurrentMeeting(group);
    for (const m of group) {
      out.set(m, m === current
        ? { ...m, isActive: true, lifecycle: "active" }
        : { ...m, isActive: false, lifecycle: "superseded", supersededBy: current.id });
    }
  }
  return list.map((m) => out.get(m));
}

/**
 * FALLBACK used by partitionMeetings: when EVERY meeting already has the backend's `isActive` flag nothing changes (the backend
 * decides). When any flag is missing, the active definition is applied here, using the lead's stage from the leads list.
 */
export function applyActiveFallback(apiMeetings = [], leads = []) {
  const list = Array.isArray(apiMeetings) ? apiMeetings : [];
  if (list.every((m) => typeof m?.isActive === "boolean")) return list;
  const byId = new Map((Array.isArray(leads) ? leads : []).map((l) => [String(l.id), l]));
  const enriched = list.map((m) => {
    const lead = byId.get(String(m.leadId));
    if (!lead) return { ...m, leadPhone: m.leadPhone };
    return {
      ...m,
      leadPhone: m.leadPhone || lead.phone,
      leadStage: m.leadStage !== undefined ? m.leadStage : (lead.pipelineStage ?? lead.stage ?? ""),
      leadStatus: m.leadStatus !== undefined ? m.leadStatus : (lead.status ?? ""),
    };
  });
  return annotateActiveMeetings(enriched);
}
