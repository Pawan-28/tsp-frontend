import {
  isConversationCall,
  isMissedCall,
  isNotPickupByClientCall,
  isOutboundCall,
  isShortConnectedCall,
  phonesMatchLoose,
  parseCallDurationSeconds,
} from "./callMetrics.js";
import { mapStageToId, PIPELINE_STAGE_DEFINITIONS } from "./pipelineStages.js";
import { isDateKeyInPeriod, localDateKey } from "./periodFilter.js";
import { parseAppDateTime } from "./timezone.js";
import { formatCallDisplayDate } from "./callDisplay.js";

/** Stages set manually by rep — not auto-routed from Callyzer calls. */
export const ADVANCED_KANBAN_STAGES = new Set([
  "meeting_booked",
  "meeting_done",
  "proposal_sent",
  "objection",
  "advance_paid",
  "payment_complete",
  "not_interested",
]);

export function resolveLeadAssigneeId(lead) {
  if (!lead) return null;
  const raw = lead.assigneeId ?? lead.assigned_to ?? lead.assignedTo;
  if (raw == null) return null;
  if (typeof raw === "object") return raw.id ?? raw._id ?? null;
  return raw;
}

export function isEmployeeNewAssignedLead(lead) {
  if (!lead) return false;
  if (lead.acceptedAt || lead.accepted_at) return false;
  const assignStatus = String(lead.assignmentStatus || lead.assignment_status || "").toLowerCase();
  if (assignStatus === "accepted" || assignStatus === "in_progress") return false;
  if (!(assignStatus === "assigned" || assignStatus === "pending" || assignStatus === "unassigned")) {
    if (!(lead.assignedAt || lead.assigned_at) || !resolveLeadAssigneeId(lead)) return false;
  }
  const stageId = mapStageToId(lead.pipelineStage || lead.stage || lead.pipeline_stage, lead.status);
  if (ADVANCED_KANBAN_STAGES.has(stageId)) return false;
  if (stageId === "meeting_booked" || stageId === "meeting_done") return false;
  return assignStatus === "assigned" || assignStatus === "pending" || assignStatus === "unassigned";
}

export function isNewPipelineLead(lead) {
  if (!lead) return false;
  if (isEmployeeNewAssignedLead(lead)) return true;
  const st = String(lead.status || "").toLowerCase();
  if (st === "new" || st.includes("new lead")) return true;
  return mapStageToId(lead.pipelineStage || lead.stage, lead.status) === "lead";
}

export function isLeadAssignedInPeriod(lead, period = "month", now = new Date(), options = {}) {
  const raw = options.assignedOnly
    ? (lead?.assignedAt || lead?.assigned_at)
    : (lead?.assignedAt || lead?.assigned_at || lead?.createdAt || lead?.created_at);
  if (!raw) return false;
  const parsed = parseAppDateTime(raw) || new Date(raw);
  if (Number.isNaN(parsed.getTime())) return false;
  const key = localDateKey(parsed);
  return isDateKeyInPeriod(key, period, now);
}

function leadContactOptions(lead, options = {}) {
  const since = options.sinceAssignment
    ? (lead?.assignedAt || lead?.assigned_at)
    : (options.since ?? null);
  return {
    outboundOnly: options.outboundOnly ?? true,
    scopeByAssignee: options.scopeByAssignee ?? false,
    since,
  };
}

function callMatchesSince(call, since) {
  if (!since) return true;
  const sinceMs = new Date(since).getTime();
  if (Number.isNaN(sinceMs)) return true;
  const raw = call.callAt || call.startedAt || call.createdAt || call.date;
  if (!raw) return false;
  return new Date(raw).getTime() >= sinceMs;
}

/** Admin panel assignment (manual, bulk, round-robin) — not employee self-added. */
export function isAdminPanelAssignedLead(lead, employeeId = null) {
  if (!isEmployeeNewAssignedLead(lead)) return false;
  const method = String(lead.assignmentMethod || lead.assignment_method || "").toLowerCase();
  if (["bulk", "round_robin", "round-robin", "auto", "automatic"].includes(method)) return true;
  const assignStatus = String(lead.assignmentStatus || lead.assignment_status || "").toLowerCase();
  if (assignStatus !== "assigned" && assignStatus !== "pending") return false;
  const assignedBy = lead.assignedBy ?? lead.assigned_by;
  if (assignedBy != null && employeeId != null && String(assignedBy) === String(employeeId)) {
    return false;
  }
  if (lead.assignedAt || lead.assigned_at) return true;
  return assignStatus === "assigned" || assignStatus === "pending";
}

/** Today: fresh admin assignment, no outbound dial yet. */
export function isTodayUncontactedAdminLead(lead, periodCalls = [], employeeId = null, now = new Date()) {
  if (!isAdminPanelAssignedLead(lead, employeeId)) return false;
  if (leadHasOutboundCalls(lead, periodCalls, {
    outboundOnly: true,
    scopeByAssignee: true,
    sinceAssignment: true,
  })) return false;
  return isLeadAssignedInPeriod(lead, "today", now, { assignedOnly: true });
}

/** Today: any new assignment (admin or self-added), no outbound dial yet. */
export function isTodayUncontactedNewLead(lead, periodCalls = [], employeeId = null, now = new Date()) {
  if (!isEmployeeNewAssignedLead(lead)) return false;
  if (leadHasOutboundCalls(lead, periodCalls, {
    outboundOnly: true,
    scopeByAssignee: true,
    sinceAssignment: true,
  })) return false;
  if (isLeadAssignedInPeriod(lead, "today", now, { assignedOnly: true })) return true;
  return isLeadAssignedInPeriod(lead, "today", now, { assignedOnly: false });
}

/** Before today: still uncontacted — surfaces in overdue due section. */
export function isStaleUncontactedAdminLead(lead, periodCalls = [], employeeId = null, now = new Date()) {
  if (!isAdminPanelAssignedLead(lead, employeeId)) return false;
  if (leadHasOutboundCalls(lead, periodCalls, {
    outboundOnly: true,
    scopeByAssignee: true,
    sinceAssignment: true,
  })) return false;
  return !isLeadAssignedInPeriod(lead, "today", now, { assignedOnly: true });
}

function phoneLast10(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function leadUpdatedMs(lead) {
  const raw = lead?.updatedAt || lead?.updated_at || lead?.createdAt || lead?.created_at;
  const ms = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(ms) ? 0 : ms;
}

/** Duplicate leads can share a phone. Prefer the manually-staged one, then the
 *  most recently updated — otherwise a stale duplicate silently wins the slot
 *  and steals the call attribution, discarding the real lead's manual stage. */
function preferredPhoneMatch(current, candidate) {
  if (!current) return candidate;
  if (Boolean(candidate.stageOverride) !== Boolean(current.stageOverride)) {
    return candidate.stageOverride ? candidate : current;
  }
  return leadUpdatedMs(candidate) >= leadUpdatedMs(current) ? candidate : current;
}

export function buildLeadLookupIndex(leads = []) {
  const byId = new Map();
  const byPhone = new Map();
  for (const lead of leads) {
    if (!lead) continue;
    byId.set(String(lead.id), lead);
    const key = phoneLast10(lead.phone || lead.clientPhone);
    if (key) byPhone.set(key, preferredPhoneMatch(byPhone.get(key), lead));
  }
  return { byId, byPhone };
}

/** Match leads to calls by leadId or phone only — never by name (many leads share "Unknown"). */
function resolveLeadByPhone(callPhone, index, leads = []) {
  if (!callPhone) return null;
  const key = phoneLast10(callPhone);
  if (key) {
    const hit = index.byPhone.get(key);
    if (hit) return hit;
  }
  const list = Array.isArray(leads) ? leads : [];
  return list.find((l) => {
    const leadPhone = l.phone || l.clientPhone;
    return leadPhone && phonesMatchLoose(leadPhone, callPhone);
  }) || null;
}

export function resolveLeadForCallFromIndex(call, index, leads = []) {
  if (!call) return null;
  if (call.leadId != null) {
    const byId = index.byId.get(String(call.leadId));
    if (byId) return byId;
  }
  const callPhone = call.phone || call.clientPhone;
  return resolveLeadByPhone(callPhone, index, leads);
}

/** Build O(1) lead/call lookups for kanban grouping (684 leads × 200 calls). */
export function buildPipelineKanbanIndex(allLeads = [], periodCalls = []) {
  const leadIndex = buildLeadLookupIndex(allLeads);
  const callsByLeadId = new Map();
  const outboundLeadIds = new Set();
  const callActiveIds = new Set();

  for (const call of periodCalls) {
    const lead = resolveLeadForCallFromIndex(call, leadIndex, allLeads);
    if (!lead?.id) continue;
    const id = String(lead.id);
    callActiveIds.add(id);
    if (!callsByLeadId.has(id)) callsByLeadId.set(id, []);
    callsByLeadId.get(id).push(call);
    if (isOutboundCall(call)) outboundLeadIds.add(id);
  }

  return { leadIndex, callsByLeadId, outboundLeadIds, callActiveIds };
}

export function resolveLeadForCall(call, leads = []) {
  if (!call) return null;
  const list = Array.isArray(leads) ? leads : [];
  const index = buildLeadLookupIndex(list);
  return resolveLeadForCallFromIndex(call, index, list);
}

export function getCallsForLead(lead, calls = [], options = {}) {
  if (!lead || !Array.isArray(calls)) return [];
  const { scopeByAssignee = false, since = null } = options;
  let matched = calls.filter((c) => {
    if (String(c.leadId) === String(lead.id)) return true;
    const leadPhone = lead.phone || lead.clientPhone;
    const callPhone = c.phone || c.clientPhone;
    if (leadPhone && callPhone && phonesMatchLoose(leadPhone, callPhone)) return true;
    return false;
  });
  if (scopeByAssignee) {
    const assigneeId = resolveLeadAssigneeId(lead);
    if (assigneeId != null) {
      matched = matched.filter((c) => String(c.employeeId) === String(assigneeId));
    }
  }
  if (since) {
    matched = matched.filter((c) => callMatchesSince(c, since));
  }
  return matched;
}

export function getLeadOutboundCalls(lead, periodCalls = [], options = {}) {
  const opts = leadContactOptions(lead, options);
  const leadCalls = getCallsForLead(lead, periodCalls, opts);
  if (!opts.outboundOnly) return leadCalls;
  return leadCalls.filter(isOutboundCall);
}

export function leadHasOutboundCalls(lead, periodCalls = [], options = {}) {
  return getLeadOutboundCalls(lead, periodCalls, options).length > 0;
}

/** New assigned lead with no outbound dial attempts in the period. */
export function isUncontactedNewLead(lead, periodCalls = [], options = {}) {
  if (!lead) return false;
  const contactOpts = {
    outboundOnly: options.outboundOnly ?? true,
    scopeByAssignee: options.scopeByAssignee ?? false,
    sinceAssignment: options.sinceAssignment ?? false,
  };
  if (leadHasOutboundCalls(lead, periodCalls, contactOpts)) return false;
  return isEmployeeNewAssignedLead(lead);
}

function resolveEarlyFunnelColumn(lead, periodCalls = [], options = {}) {
  const contactOpts = {
    outboundOnly: options.outboundOnly ?? true,
    scopeByAssignee: options.scopeByAssignee ?? false,
  };
  const allCalls = getCallsForLead(lead, periodCalls, {
    scopeByAssignee: contactOpts.scopeByAssignee,
  });
  const outboundCalls = getLeadOutboundCalls(lead, periodCalls, contactOpts);

  if (leadHasConversation2MinPlus(allCalls, { outboundOnly: false })) return "conversation_2min";
  if (leadHasShortCall(outboundCalls, { outboundOnly: true })) return "short_call";
  if (leadHasNotPickCall(outboundCalls, { outboundOnly: true })) return "not_pick";
  if (isUncontactedNewLead(lead, periodCalls, {
    ...contactOpts,
    sinceAssignment: options.sinceAssignment ?? false,
  })) return "lead";
  return null;
}

export function callKanbanColumn(call) {
  const sec = Number.isFinite(call?.durationSec)
    ? call.durationSec
    : parseCallDurationSeconds(call?.duration);
  if (isConversationCall(sec)) return "conversation_2min";
  if (!isOutboundCall(call)) return null;
  if (isNotPickupByClientCall(call)) return "not_pick";
  if (isShortConnectedCall(call)) return "short_call";
  return null;
}

export function leadHasConversation2MinPlus(calls = [], { outboundOnly = false } = {}) {
  return calls.some((c) => {
    if (outboundOnly && !isOutboundCall(c)) return false;
    const sec = Number.isFinite(c.durationSec) ? c.durationSec : parseCallDurationSeconds(c.duration);
    return isConversationCall(sec);
  });
}

export function leadHasNotPickCall(calls = [], { outboundOnly = false } = {}) {
  return calls.some((c) => {
    if (outboundOnly && !isOutboundCall(c)) return false;
    return isNotPickupByClientCall(c);
  });
}

export function leadHasShortCall(calls = [], { outboundOnly = false } = {}) {
  return calls.some((c) => {
    if (outboundOnly && !isOutboundCall(c)) return false;
    return isShortConnectedCall(c);
  });
}

export function filterMeetingsForPeriod(meetings = [], period = "month", now = new Date()) {
  const list = Array.isArray(meetings) ? meetings : [];
  return list.filter((m) => {
    if (m.status === "cancelled") return false;
    const raw = m.scheduledAt || m.date;
    if (!raw) return period === "month";
    const key = localDateKey(new Date(raw));
    return isDateKeyInPeriod(key, period, now);
  });
}

export function resolveLeadKanbanColumn(lead, calls = [], options = {}) {
  if (!lead) return "lead";
  if (lead._fromCall && lead._callCol) return lead._callCol;

  const dbStageId = mapStageToId(lead.pipelineStage || lead.stage, lead.status);
  if (lead.stageOverride || (dbStageId && dbStageId !== "lead")) return dbStageId;

  return (
    resolveEarlyFunnelColumn(lead, calls, {
      outboundOnly: true,
      scopeByAssignee: options.scopeByAssignee ?? false,
    }) || dbStageId || "lead"
  );
}

/** Only leads visible in pipeline: Callyzer call activity, meetings, or uncontacted new assignment. */
export function filterPipelineLeadsForPeriod(leads = [], periodCalls = [], period = "month", meetings = [], kanbanIndex = null, options = {}) {
  const { adminScope = false, includeUncontactedAssignments = true, employeeId = null, scopeCallsByAssignee = false } = options;
  const list = Array.isArray(leads) ? leads : [];
  const pKey = String(period || "month").toLowerCase();
  if (adminScope && pKey === "all") return list;

  const periodMeetings = filterMeetingsForPeriod(meetings, period);
  const meetingLeadIds = new Set(
    periodMeetings.map((m) => String(m.leadId)).filter(Boolean),
  );

  const index = kanbanIndex || buildPipelineKanbanIndex(list, periodCalls);
  const { callActiveIds, outboundLeadIds } = index;

  return list.filter((lead) => {
    const id = String(lead.id);
    // A human explicitly placed this lead in a column — it stays on the board even
    // with no calls this period. Otherwise it drops out of scope and an auto-classified
    // Callyzer card takes its place, which reads as the manual move reverting.
    if (lead.stageOverride) return true;
    if (meetingLeadIds.has(id)) return true;
    if (callActiveIds.has(id)) return true;
    if (includeUncontactedAssignments) {
      const periodKey = String(period).toLowerCase();
      if (isAdminPanelAssignedLead(lead, employeeId)) {
        const contacted = leadHasOutboundCalls(lead, periodCalls, {
          outboundOnly: true,
          scopeByAssignee: scopeCallsByAssignee,
          sinceAssignment: true,
        });
        if (!contacted) {
          if (periodKey === "today" || periodKey === "week" || periodKey === "month") {
            if (isLeadAssignedInPeriod(lead, periodKey, undefined, { assignedOnly: true })) return true;
          } else {
            return true;
          }
        }
      }
    }
    if (adminScope && isNewPipelineLead(lead) && !outboundLeadIds.has(id)) return true;
    return false;
  });
}

export function leadFromMeeting(meeting) {
  return {
    id: meeting.leadId || `meeting-${meeting.id}`,
    name: meeting.lead || meeting.title || "Meeting lead",
    company: meeting.company || "—",
    service: meeting.service || meeting.requirements || meeting.title || "—",
    stage: "Meeting Booked",
    status: "warm",
    budget: "—",
    last: meeting.time || "Scheduled",
    source: "Meeting",
    _fromMeeting: true,
    _meetingId: meeting.id,
  };
}

export function resolveMeetingLead(meeting, allLeads = []) {
  if (!meeting) return null;
  const list = Array.isArray(allLeads) ? allLeads : [];
  if (meeting.leadId != null) {
    const byId = list.find((l) => String(l.id) === String(meeting.leadId));
    if (byId) return byId;
  }
  const meetingPhone = meeting.phone || meeting.leadPhone || meeting.clientPhone;
  if (meetingPhone) {
    const index = buildLeadLookupIndex(list);
    const byPhone = resolveLeadByPhone(meetingPhone, index, list);
    if (byPhone) return byPhone;
  }
  return leadFromMeeting(meeting);
}

export function resolveMeetingKanbanColumn(meeting, now = new Date()) {
  if (!meeting || meeting.status === "cancelled") return null;
  if (meeting.status === "completed") return "meeting_done";
  const outcome = String(meeting.outcome || "").toLowerCase();
  if (outcome.includes("completed") || outcome.includes("showed") || outcome.includes("done")) {
    return "meeting_done";
  }
  const at = new Date(meeting.scheduledAt || meeting.date);
  if (!Number.isNaN(at.getTime()) && at.getTime() < now.getTime()) {
    return "meeting_booked";
  }
  return "meeting_booked";
}

function placeMeetingsOnKanban(map, placed, allLeads, meetings, period, showLead) {
  const periodMeetings = filterMeetingsForPeriod(meetings, period);
  for (const meeting of periodMeetings) {
    const lead = resolveMeetingLead(meeting, allLeads);
    const col = resolveMeetingKanbanColumn(meeting);
    if (!col || !lead || !map[col]) continue;
    if (!showLead(lead)) continue;
    const id = String(lead.id);
    if (placed.has(id)) continue;
    map[col].push(lead);
    placed.add(id);
  }
  return periodMeetings;
}

export function leadFromOrphanCall(call, col = "lead") {
  const phone = call.phone || call.clientPhone || "";
  const name = call.name || call.clientName || (phone ? phone.slice(-10) : "Unknown");
  const callAt = call.callAt || call.startedAt || call.createdAt || null;
  const lastLabel = callAt
    ? formatCallDisplayDate(callAt)
    : (call.date && call.date !== "—" ? call.date : null);
  return {
    id: `call-${call.id}`,
    name,
    company: call.company || call.clientCompany || "Callyzer Call",
    phone,
    stage: col === "conversation_2min"
      ? "Conversation"
      : col === "short_call"
        ? "Short Call"
        : col === "not_pick"
          ? "Not Pick"
          : "Lead",
    status: col === "conversation_2min"
      ? "contacted"
      : col === "short_call"
        ? "contacted"
        : col === "not_pick"
          ? "notpick"
          : "new",
    budget: "—",
    callAt,
    startedAt: callAt,
    date: callAt,
    last: lastLabel || "—",
    source: call.source || "Callyzer",
    service: call.service || call.requirements || "—",
    _fromCall: true,
    _callId: call.id,
    _linkedLeadId: call.leadId ?? null,
    _callCol: col,
  };
}

function latestRawCallTimestamp(calls = []) {
  let latestMs = 0;
  let latestRaw = null;
  for (const call of calls) {
    const raw = call?.callAt || call?.startedAt || call?.createdAt || call?.date;
    if (!raw) continue;
    const ms = new Date(String(raw).replace(" ", "T")).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > latestMs) {
      latestMs = ms;
      latestRaw = raw;
    }
  }
  return latestRaw;
}

function withLatestCallTimestamp(lead, calls = []) {
  if (!lead || lead._fromCall || lead.callAt) return lead;
  const raw = latestRawCallTimestamp(calls);
  if (!raw) return lead;
  return { ...lead, callAt: raw, startedAt: raw };
}

export function getLeadTimestampMs(lead) {
  if (!lead) return 0;
  
  // 1. Call timestamp if any
  const callTime = lead.callAt || lead.startedAt || lead.lastCallAt || lead.last_call_at;
  if (callTime) {
    const ms = new Date(String(callTime).replace(" ", "T")).getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }

  // 2. Meeting timestamp if any
  const meetingTime = lead.scheduledAt || lead.meetingDate || lead.meeting_date;
  if (meetingTime) {
    const ms = new Date(String(meetingTime).replace(" ", "T")).getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }

  // 3. Assigned / Created / Updated timestamp
  const dateStr = lead.assignedAt || lead.assigned_at || lead.createdAt || lead.created_at || lead.updatedAt || lead.updated_at || lead.date;
  if (dateStr && dateStr !== "—") {
    const ms = new Date(String(dateStr).replace(" ", "T")).getTime();
    if (!Number.isNaN(ms) && ms > 0) return ms;
  }

  // Fallback to numeric id if applicable
  const numId = Number(String(lead.id || "").replace(/\D/g, ""));
  return numId || 0;
}

/**
 * Build kanban from Callyzer period calls + meetings.
 * Lead-centric: each lead's best early-funnel column from all their outbound calls in the period.
 */
export function groupKanbanSyncedWithCallyzer(
  allLeads = [],
  periodCalls = [],
  meetings = [],
  options = {},
) {
  const {
    period = "month",
    visibleLeads = null,
  } = options;
  const periodKey = String(period).toLowerCase();
  const map = Object.fromEntries(PIPELINE_STAGE_DEFINITIONS.map((s) => [s.id, []]));
  const placed = new Set();
  const kanbanIndex = buildPipelineKanbanIndex(allLeads, periodCalls);
  const { leadIndex, outboundLeadIds, callsByLeadId } = kanbanIndex;
  const scopeCallsByAssignee = options.scopeCallsByAssignee ?? false;

  const filterCallsForAssignee = (lead, callList) => {
    if (!scopeCallsByAssignee || !callList?.length) return callList || [];
    const assigneeId = resolveLeadAssigneeId(lead);
    if (assigneeId == null) return callList;
    return callList.filter((c) => String(c.employeeId) === String(assigneeId));
  };

  const getLeadCalls = (lead) => {
    const cached = callsByLeadId.get(String(lead.id));
    if (cached?.length) return filterCallsForAssignee(lead, cached);
    return getCallsForLead(lead, periodCalls, { scopeByAssignee: scopeCallsByAssignee });
  };
  const getOutboundCalls = (lead) => getLeadCalls(lead).filter(isOutboundCall);

  const scopedVisible = visibleLeads ?? filterPipelineLeadsForPeriod(allLeads, periodCalls, periodKey, meetings, kanbanIndex, options);
  const visibleIds = new Set(scopedVisible.map((l) => String(l.id)));

  const isFilterActive = Boolean(options.searchFiltered || options.visibleLeads);

  const showLead = (lead) => {
    if (!lead) return false;
    if (visibleIds.has(String(lead.id))) return true;
    if (lead._linkedLeadId && visibleIds.has(String(lead._linkedLeadId))) return true;
    if (!isFilterActive) {
      if (lead._fromCall || lead._fromMeeting) return true;
    }
    return false;
  };

  const pushLead = (col, lead) => {
    if (!lead || !map[col]) return;
    const id = String(lead.id);
    if (placed.has(id)) return;
    map[col].push(lead);
    placed.add(id);
  };

  // Rep-set or manually overridden pipeline stages win over Callyzer auto-routing
  // AND over meeting-derived placement — a manual move must stick no matter what
  // the underlying meeting record or call history would otherwise dictate.
  for (const lead of scopedVisible) {
    if (!showLead(lead)) continue;
    const dbStageId = mapStageToId(lead.pipelineStage || lead.stage, lead.status);
    if (lead.stageOverride || (dbStageId && dbStageId !== "lead")) {
      pushLead(dbStageId, lead);
    }
  }

  placeMeetingsOnKanban(map, placed, allLeads, meetings, periodKey, showLead);

  // Lead-centric: best early-funnel column from calls for leads not manually staged.
  const leadsToEvaluate = new Set();
  for (const lead of scopedVisible) {
    if (getLeadCalls(lead).length > 0) leadsToEvaluate.add(String(lead.id));
  }
  for (const leadId of outboundLeadIds) leadsToEvaluate.add(leadId);
  for (const call of periodCalls) {
    const col = callKanbanColumn(call);
    if (!col) continue;
    const lead = resolveLeadForCallFromIndex(call, leadIndex, allLeads);
    if (lead?.id) leadsToEvaluate.add(String(lead.id));
  }

  for (const leadId of leadsToEvaluate) {
    const lead = leadIndex.byId.get(leadId);
    if (!lead || !showLead(lead)) continue;
    const leadCalls = getLeadCalls(lead);
    const outboundCalls = getOutboundCalls(lead);
    let col = null;
    if (leadHasConversation2MinPlus(leadCalls, { outboundOnly: false })) col = "conversation_2min";
    else if (leadHasShortCall(outboundCalls, { outboundOnly: true })) col = "short_call";
    else if (leadHasNotPickCall(outboundCalls, { outboundOnly: true })) col = "not_pick";
    if (col && col !== "lead") pushLead(col, withLatestCallTimestamp(lead, leadCalls));
  }

  // Orphan calls with no CRM lead match — still show from Callyzer (inbound + outbound).
  for (const call of periodCalls) {
    const col = callKanbanColumn(call);
    if (!col) continue;
    if (resolveLeadForCallFromIndex(call, leadIndex, allLeads)) continue;
    const orphanLead = leadFromOrphanCall(call, col);
    if (!showLead(orphanLead)) continue;
    pushLead(col, orphanLead);
  }


  for (const lead of scopedVisible) {
    const id = String(lead.id);
    if (placed.has(id)) continue;
    const allowUncontacted = options.includeUncontactedAssignments !== false;
    const periodKey = String(period).toLowerCase();
    const uncontactedNew = isAdminPanelAssignedLead(lead, options.employeeId)
      && !leadHasOutboundCalls(lead, periodCalls, {
        outboundOnly: true,
        scopeByAssignee: scopeCallsByAssignee,
        sinceAssignment: true,
      });
    const inAssignPeriod = !["today", "week", "month"].includes(periodKey)
      || isLeadAssignedInPeriod(lead, periodKey, undefined, { assignedOnly: true });
    if (!allowUncontacted || !uncontactedNew || !inAssignPeriod) {
      if (!(options.adminScope && isNewPipelineLead(lead) && !outboundLeadIds.has(id))) continue;
    }
    pushLead("lead", withLatestCallTimestamp(lead, getLeadCalls(lead)));
  }

  // Sort every pipeline column so newest/latest leads appear at the top
  for (const colKey of Object.keys(map)) {
    if (Array.isArray(map[colKey])) {
      map[colKey].sort((a, b) => getLeadTimestampMs(b) - getLeadTimestampMs(a));
    }
  }

  return map;
}

export function groupEmpLeadsKanban(leads, calls = [], options = {}) {
  const meetings = options.meetings || [];
  const period = String(options.period || "month").toLowerCase();
  const searchFiltered = options.searchFiltered ?? null;

  const scoped = filterPipelineLeadsForPeriod(leads, calls, period, meetings, null, options);
  let visibleLeads = scoped;
  if (Array.isArray(searchFiltered)) {
    const scopedIds = new Set(scoped.map((l) => String(l.id)));
    visibleLeads = searchFiltered.filter((l) => scopedIds.has(String(l.id)));
  } else if (options.visibleLeads) {
    const scopedIds = new Set(scoped.map((l) => String(l.id)));
    visibleLeads = options.visibleLeads.filter((l) => scopedIds.has(String(l.id)));
  }

  return groupKanbanSyncedWithCallyzer(leads, calls, meetings, {
    ...options,
    period,
    visibleLeads,
  });
}

function conversationContactKey(call) {
  if (call?.leadId != null) return `id:${call.leadId}`;
  const phone = phoneLast10(call?.phone || call?.clientPhone);
  if (phone) return `phone:${phone}`;
  return `call:${call?.id ?? ""}`;
}

export function countPipelineCallMetrics(periodCalls = []) {
  const list = Array.isArray(periodCalls) ? periodCalls : [];
  let conversations = 0;
  let missed = 0;
  let notPickupByClient = 0;
  let shortCalls = 0;
  let connected = 0;
  const conversationContacts = new Set();
  const missedLeadIds = new Set();
  const notPickupLeadIds = new Set();
  const shortCallLeadIds = new Set();

  for (const call of list) {
    const sec = Number.isFinite(call.durationSec)
      ? call.durationSec
      : parseCallDurationSeconds(call.duration);
    if (isConversationCall(sec)) {
      conversations += 1;
      conversationContacts.add(conversationContactKey(call));
    } else if (isNotPickupByClientCall(call)) {
      notPickupByClient += 1;
      if (call.leadId != null) notPickupLeadIds.add(String(call.leadId));
    } else if (isShortConnectedCall(call)) {
      shortCalls += 1;
      if (call.leadId != null) shortCallLeadIds.add(String(call.leadId));
    } else if (isMissedCall(call)) {
      missed += 1;
      if (call.leadId != null) missedLeadIds.add(String(call.leadId));
    } else if (sec > 0) {
      connected += 1;
    }
  }

  return {
    totalCalls: list.length,
    conversations,
    missed,
    notPickupByClient,
    shortCalls,
    connected,
    conversationLeads: conversationContacts.size,
    missedLeads: missedLeadIds.size,
    notPickupLeads: notPickupLeadIds.size,
    shortCallLeads: shortCallLeadIds.size,
  };
}

export function getPipelineStageDisplayCounts(
  grouped,
  { callyzerStats, callMetrics, periodMeetings = [] } = {},
) {
  const counts = {};
  for (const stage of PIPELINE_STAGE_DEFINITIONS) {
    counts[stage.id] = grouped[stage.id]?.length ?? 0;
  }

  // Kanban pills/columns = unique lead cards (never Callyzer call totals).
  counts.conversation_2min = grouped.conversation_2min?.length ?? 0;
  counts.short_call = grouped.short_call?.length ?? 0;
  counts.not_pick = grouped.not_pick?.length ?? 0;

  const booked = periodMeetings.filter((m) => resolveMeetingKanbanColumn(m) === "meeting_booked");
  const done = periodMeetings.filter((m) => resolveMeetingKanbanColumn(m) === "meeting_done");
  if (booked.length > counts.meeting_booked) counts.meeting_booked = booked.length;
  if (done.length > counts.meeting_done) counts.meeting_done = done.length;

  return counts;
}

export function isCallSyncedPipelineStage(stageId) {
  return stageId === "conversation_2min" || stageId === "short_call" || stageId === "not_pick";
}

export function getPipelineStagePillCount(stageId, { grouped }) {
  return grouped[stageId]?.length ?? 0;
}
