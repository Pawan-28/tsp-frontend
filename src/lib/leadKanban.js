import {
  callBucket,
  isNotPickupByClientCall,
  isNotPickColumnCall,
  isOutboundCall,
  isShortConnectedCall,
  phonesMatchLoose,
  summarizeCalls,
} from "./callMetrics.js";
import { mapStageToId, PIPELINE_STAGE_DEFINITIONS } from "./pipelineStages.js";
import { isDateKeyInPeriod, isMeetingDateKeyInPeriod, localDateKey, parseCustomPeriod, resolveCallDateKey } from "./periodFilter.js";
import { parseAppDateTime } from "./timezone.js";
import { formatCallDisplayDate, buildLeadCallTimestampIndex, resolveLeadLastCallTimestamp } from "./callDisplay.js";

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

// Pipeline column rules = the shared call definitions (lib/callMetrics.js, mirror of the backend):
//   Conversation = answered, above 2 min (> 120 s), any direction
//   Short Call   = answered OUTBOUND, 1-120 s (exactly 120 s is Short)
//   Not Pick     = OUTBOUND call the client did not answer, OR an outbound call the customer REJECTED
//                  (in the call COUNTS Rejected is still its own bucket)
// A rejected INCOMING call, Missed (incoming) and Incoming short calls never create a Not Pick / Short Call card.
export function callKanbanColumn(call) {
  switch (callBucket(call || {})) {
    case "conversation": return "conversation_2min";
    case "short": return "short_call";
    case "no_pickup": return "not_pick";
    case "rejected": return isOutboundCall(call || {}) ? "not_pick" : null; // customer rejected our dial
    default: return null;
  }
}

export function leadHasConversation2MinPlus(calls = [], { outboundOnly = false } = {}) {
  return calls.some((c) => {
    if (outboundOnly && !isOutboundCall(c)) return false;
    return callBucket(c) === "conversation";
  });
}

export function leadHasNotPickCall(calls = [], { outboundOnly = false } = {}) {
  return calls.some((c) => {
    if (outboundOnly && !isOutboundCall(c)) return false;
    return isNotPickColumnCall(c);
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
    return isMeetingDateKeyInPeriod(key, period, now);
  });
}

export function resolveLeadKanbanColumn(lead, calls = [], options = {}) {
  if (!lead) return "lead";
  if (lead._fromCall && lead._callCol) return lead._callCol;

  const dbStageId = mapStageToId(lead.pipelineStage || lead.stage, lead.status);
  if (lead.stageOverride) return dbStageId;
  if (dbStageId && dbStageId !== "lead") {
    // call-driven stages can be upgraded by the real call history; everything further along is kept as stored
    const isCallStage = dbStageId in EARLY_COLUMN_RANK;
    return (isCallStage && historyAwareColumn(lead, dbStageId, options.callHistory)) || dbStageId;
  }

  const fromHistory = historyAwareColumn(lead, "lead", options.callHistory);
  if (fromHistory && fromHistory !== "lead") return fromHistory;
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
          if (periodKey === "today" || periodKey === "week" || periodKey === "month" || parseCustomPeriod(periodKey)) {
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

/** Last-10-digit phone key, or "" when the number is missing/too short to identify a person. */
function personPhoneKey(lead) {
  const key = phoneLast10(lead?.phone || lead?.clientPhone);
  return key.length >= 10 ? key : "";
}

// ───────────────────────── Full call history -> early-funnel column ─────────────────────────
// Backend utils/callHistory.js sends, per PERSON (phone), the buckets of ALL their calls (any employee, any date):
//   { conversation, short, noPickup, rejected, rejectedOutbound, missedIncoming, incomingShort, outbound, total, lastCallAt }
// Business rule (priority): Conversation (answered > 120 s) > Short Call (answered outbound, 1-120 s)
//   > Not Pick (outbound not answered, or rejected by the customer) > Lead (no qualifying call).
// Missed (incoming), a rejected INCOMING call and Incoming short never move a lead out of Lead on their own. This is what stops a lead that was dialed (e.g. "Dialed 1x", or by a
// previous owner, or last month) from sitting in Lead just because its stored stage still says "Lead".
const EARLY_COLUMN_RANK = { lead: 0, not_pick: 1, short_call: 2, conversation_2min: 3 };

/** Key of a lead's person in the call-history map (same as backend personKeySql). */
export function callHistoryKey(lead) {
  const k = personPhoneKey(lead);
  if (k) return k;
  return lead?.id != null ? `id:${lead._linkedLeadId ?? lead.id}` : "";
}

/** Pure: which early-funnel column does this history say? */
export function columnFromCallHistory(h) {
  if (!h) return "lead";
  if (h.conversation > 0) return "conversation_2min";
  if (h.short > 0) return "short_call";
  if (h.noPickup > 0 || h.rejectedOutbound > 0) return "not_pick";
  return "lead";
}

function furthestEarlyColumn(a, b) {
  return (EARLY_COLUMN_RANK[b] ?? 0) > (EARLY_COLUMN_RANK[a] ?? 0) ? b : a;
}

/**
 * Column for a non-manual lead in the call-driven part of the funnel: the further of its stored stage and what its
 * call history says. `null` when no call history was supplied (callers then fall back to the period-calls rule).
 */
export function historyAwareColumn(lead, storedColumn, callHistory) {
  if (!callHistory) return null;
  const fromHistory = columnFromCallHistory(callHistory[callHistoryKey(lead)]);
  return furthestEarlyColumn(storedColumn || "lead", fromHistory);
}

/**
 * One person = one card. CRM imports/webhooks can leave several lead rows for the same phone
 * (e.g. "Tusharika Ma'am - TSP" #458 Meeting Booked + #1420 Meeting Done, or one stuck in
 * Not Interested). Each row carries its own manual stage, so without this the same person
 * is rendered in two columns. The row that wins is the one preferredPhoneMatch picks
 * (manually staged first, then most recently updated) — the same row Callyzer calls attach to.
 *
 * @returns {{ canonicalById: Map<string, object> }} loser lead id -> winning lead
 */
function buildPhoneCanonicalMap(leads = []) {
  const winners = new Map();
  for (const lead of leads) {
    if (!lead) continue;
    const key = personPhoneKey(lead);
    if (!key) continue;
    winners.set(key, preferredPhoneMatch(winners.get(key), lead));
  }
  const canonicalById = new Map();
  for (const lead of leads) {
    if (!lead) continue;
    const key = personPhoneKey(lead);
    if (!key) continue;
    const winner = winners.get(key);
    if (winner && String(winner.id) !== String(lead.id)) canonicalById.set(String(lead.id), winner);
  }
  return { canonicalById };
}

function placeMeetingsOnKanban(map, pushLead, allLeads, meetings, period, showLead, canonicalize = (l) => l) {
  const periodMeetings = filterMeetingsForPeriod(meetings, period);
  for (const meeting of periodMeetings) {
    const lead = canonicalize(resolveMeetingLead(meeting, allLeads));
    const col = resolveMeetingKanbanColumn(meeting);
    if (!col || !lead || !map[col]) continue;
    if (!showLead(lead)) continue;
    pushLead(col, lead);
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
 * MEETING BOOKED column order — by the lead's meeting time, not by when anyone last called:
 *   1. upcoming meetings, soonest first (a meeting in 2 h sits above one in 3 h),
 *   2. meetings already held / past, most recent first,
 *   3. leads in this stage with no meeting on record, newest activity first.
 * Each card is tagged with `_meetingAt` so it shows the meeting time (see buildLeadActivityLabelMap).
 */
export function orderMeetingBookedColumn(columnLeads = [], meetings = [], fallbackMs = getLeadTimestampMs, now = Date.now()) {
  const byLead = new Map();
  for (const m of Array.isArray(meetings) ? meetings : []) {
    if (!m || m.status === "cancelled" || m.leadId == null) continue;
    const raw = m.scheduledAt || m.date;
    const ms = raw ? (parseAppDateTime(raw) || new Date(String(raw).replace(" ", "T"))).getTime() : NaN;
    if (Number.isNaN(ms)) continue;
    const id = String(m.leadId);
    const cur = byLead.get(id);
    const upcoming = ms >= now;
    // Keep the soonest upcoming meeting; otherwise the most recent past one.
    if (!cur
      || (upcoming && (!cur.upcoming || ms < cur.ms))
      || (!upcoming && !cur.upcoming && ms > cur.ms)) {
      byLead.set(id, { ms, upcoming, raw });
    }
  }

  const tagged = columnLeads.map((lead) => {
    const hit = byLead.get(String(lead.id)) || byLead.get(String(lead._linkedLeadId ?? ""));
    return { lead: hit ? { ...lead, _meetingAt: new Date(hit.ms).toISOString() } : lead, hit };
  });
  const group = (t) => (t.hit ? (t.hit.upcoming ? 0 : 1) : 2);
  tagged.sort((a, b) => {
    const ga = group(a);
    const gb = group(b);
    if (ga !== gb) return ga - gb;
    if (ga === 0) return a.hit.ms - b.hit.ms;          // soonest first
    if (ga === 1) return b.hit.ms - a.hit.ms;          // most recent first
    return fallbackMs(b.lead) - fallbackMs(a.lead);    // no meeting: newest activity first
  });
  return tagged.map((t) => t.lead);
}

function callTimestampMs(call) {
  const raw = call?.callAt || call?.startedAt || call?.createdAt || call?.date;
  if (!raw) return NaN;
  const parsed = parseAppDateTime(raw) || new Date(String(raw).replace(" ", "T"));
  return parsed ? parsed.getTime() : NaN;
}

/** Latest outbound dial made TODAY (app timezone) from a list of a lead's calls. */
function latestOutboundCallToday(calls = [], todayKey) {
  let best = null;
  let bestMs = -Infinity;
  for (const call of calls) {
    if (!call || !isOutboundCall(call)) continue;
    if (resolveCallDateKey(call) !== todayKey) continue;
    const ms = callTimestampMs(call);
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      best = call;
      bestMs = ms;
    }
  }
  return best ? { call: best, ms: bestMs } : null;
}

/**
 * NOT PICK column order.
 *
 * A card drops to the bottom of NOT PICK only when the employee actually dialled
 * the lead TODAY and that latest dial was a Not pick (shared definition: outbound dial the client
 * did not answer; a Rejected dial is NOT a Not pick).
 *  - Leads not dialled today keep the existing order (getLeadTimestampMs, newest first).
 *  - Dialled-and-unanswered-today leads follow, oldest attempt first, so the most
 *    recently attempted lead is always last.
 *  - If the latest dial today connected, the lead's column is decided by the
 *    existing routing (Short Call / 2 min+ …) and it isn't treated as an attempt here.
 *
 * The order is derived from persisted employee_calls rows (not client state), so it
 * survives refresh / logout / API reload. "Today" is recomputed on every render,
 * so on the next day nothing counts as attempted and the column falls back to the
 * existing timestamp ordering.
 */
export function orderNotPickColumn(columnLeads = [], getCallsForLead, now = new Date()) {
  const list = Array.isArray(columnLeads) ? columnLeads : [];
  if (list.length < 2 || typeof getCallsForLead !== "function") return list;
  const todayKey = localDateKey(now);
  if (!todayKey) return list;

  const untouched = [];
  const attempted = [];
  for (const lead of list) {
    const last = latestOutboundCallToday(getCallsForLead(lead) || [], todayKey);
    if (last && isNotPickColumnCall(last.call)) {
      attempted.push({ lead, ms: last.ms });
    } else {
      untouched.push(lead);
    }
  }
  if (!attempted.length) return list;
  attempted.sort((a, b) => a.ms - b.ms);
  return [...untouched, ...attempted.map((a) => a.lead)];
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
    callHistory = null,
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

  // Duplicate CRM rows for the same phone collapse onto one winning row (see buildPhoneCanonicalMap).
  const { canonicalById } = buildPhoneCanonicalMap(scopedVisible);
  const canonicalize = (lead) => (lead ? (canonicalById.get(String(lead.id)) || lead) : lead);
  const placedPhones = new Set();

  const isFilterActive = Boolean(options.searchFiltered || options.visibleLeads);

  const showLead = (lead) => {
    if (!lead) return false;
    if (canonicalById.has(String(lead.id))) return false; // losing duplicate — its winner is shown
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
    // Safety net: whatever route a card took (CRM row, meeting stub, orphan Callyzer call),
    // the same phone never sits in two columns.
    const phoneKey = personPhoneKey(lead);
    if (phoneKey && placedPhones.has(phoneKey)) return;
    map[col].push(lead);
    placed.add(id);
    if (phoneKey) placedPhones.add(phoneKey);
  };

  // Rep-set or manually overridden pipeline stages win over Callyzer auto-routing
  // AND over meeting-derived placement — a manual move must stick no matter what
  // the underlying meeting record or call history would otherwise dictate.
  for (const lead of scopedVisible) {
    if (!showLead(lead)) continue;
    const dbStageId = mapStageToId(lead.pipelineStage || lead.stage, lead.status);
    if (lead.stageOverride) {
      pushLead(dbStageId, lead); // a human placed it: it stays
    } else if (dbStageId && dbStageId !== "lead") {
      // Stored Not Pick / Short Call / Conversation can be stale (e.g. stored "Not Pick" but the person was later
      // answered for 5 min): take the further of stored stage and call history. Later stages are kept as stored.
      const upgraded = dbStageId in EARLY_COLUMN_RANK ? historyAwareColumn(lead, dbStageId, callHistory) : null;
      pushLead(upgraded || dbStageId, lead);
    }
  }

  placeMeetingsOnKanban(map, pushLead, allLeads, meetings, periodKey, showLead, canonicalize);

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
    const lead = canonicalize(leadIndex.byId.get(leadId));
    if (!lead || !showLead(lead)) continue;
    const leadCalls = getLeadCalls(lead);
    const outboundCalls = getOutboundCalls(lead);
    let col = null;
    if (leadHasConversation2MinPlus(leadCalls, { outboundOnly: false })) col = "conversation_2min";
    else if (leadHasShortCall(outboundCalls, { outboundOnly: true })) col = "short_call";
    else if (leadHasNotPickCall(outboundCalls, { outboundOnly: true })) col = "not_pick";
    // the period's calls are only part of the story: the person's full history may place the card further along
    const fullHistoryCol = historyAwareColumn(lead, col || "lead", callHistory);
    if (fullHistoryCol && fullHistoryCol !== "lead") col = fullHistoryCol;
    if (col && col !== "lead") pushLead(col, withLatestCallTimestamp(lead, leadCalls));
  }

  // Orphan calls with no CRM lead match — still show from Callyzer (inbound + outbound).
  // One card per phone: when the same unmatched number has several calls, keep the one whose
  // column is furthest along (2 min+ > short > not pick) instead of a card per call.
  const ORPHAN_COL_RANK = { conversation_2min: 3, short_call: 2, not_pick: 1 };
  const orphanBest = new Map();
  for (const call of periodCalls) {
    const col = callKanbanColumn(call);
    if (!col) continue;
    if (resolveLeadForCallFromIndex(call, leadIndex, allLeads)) continue;
    const phoneKey = phoneLast10(call.phone || call.clientPhone);
    const groupKey = phoneKey.length >= 10 ? `p:${phoneKey}` : `c:${call.id}`;
    const cur = orphanBest.get(groupKey);
    if (!cur || (ORPHAN_COL_RANK[col] || 0) > (ORPHAN_COL_RANK[cur.col] || 0)) {
      orphanBest.set(groupKey, { call, col });
    }
  }
  for (const { call, col } of orphanBest.values()) {
    const orphanLead = leadFromOrphanCall(call, col);
    if (!showLead(orphanLead)) continue;
    pushLead(col, orphanLead);
  }


  for (const lead of scopedVisible) {
    const id = String(lead.id);
    if (placed.has(id) || canonicalById.has(id)) continue;
    const allowUncontacted = options.includeUncontactedAssignments !== false;
    const periodKey = String(period).toLowerCase();
    const uncontactedNew = isAdminPanelAssignedLead(lead, options.employeeId)
      && !leadHasOutboundCalls(lead, periodCalls, {
        outboundOnly: true,
        scopeByAssignee: scopeCallsByAssignee,
        sinceAssignment: true,
      });
    const inAssignPeriod = (!["today", "week", "month"].includes(periodKey) && !parseCustomPeriod(periodKey))
      || isLeadAssignedInPeriod(lead, periodKey, undefined, { assignedOnly: true });
    // A card only gets here when nothing above placed it. It is a Lead ONLY if the person's FULL call history has
    // no qualifying outbound call: a dial by a previous owner, in an earlier month, or on a duplicate row all count.
    const historyCol = callHistory ? columnFromCallHistory(callHistory[callHistoryKey(lead)]) : "lead";
    if (historyCol === "lead") {
      // Lead column eligibility (unchanged): fresh uncontacted assignment, or an admin-scope new lead; plus, when
      // call history is available, a lead that is visible because of call activity in the period but had no
      // qualifying call (only rejected / missed / incoming-short) - it stays a Lead instead of vanishing.
      const visibleByPeriodCall = Boolean(callHistory) && kanbanIndex.callActiveIds.has(id);
      const freshUncontacted = allowUncontacted && uncontactedNew && inAssignPeriod;
      const adminNew = Boolean(options.adminScope && isNewPipelineLead(lead) && !outboundLeadIds.has(id));
      if (!freshUncontacted && !adminNew && !visibleByPeriodCall) continue;
    }
    pushLead(historyCol, withLatestCallTimestamp(lead, getLeadCalls(lead)));
  }

  // Every column is newest-first by the SAME time the card displays (last call / activity), so the
  // visible times always read top-to-bottom as latest -> oldest. Meeting Booked is the exception:
  // soonest upcoming meeting first (see orderMeetingBookedColumn).
  const tsIndex = buildLeadCallTimestampIndex(periodCalls);
  const displayedMs = (lead) => {
    const ts = resolveLeadLastCallTimestamp(lead, periodCalls, tsIndex);
    const ms = ts ? Date.parse(ts) : NaN;
    return Number.isNaN(ms) ? getLeadTimestampMs(lead) : ms;
  };
  for (const colKey of Object.keys(map)) {
    if (!Array.isArray(map[colKey])) continue;
    if (colKey === "meeting_booked") {
      map[colKey] = orderMeetingBookedColumn(map[colKey], meetings, displayedMs);
    } else {
      map[colKey].sort((a, b) => displayedMs(b) - displayedMs(a));
    }
  }

  // Manually staged leads (stageOverride) stay on the board for every period on purpose, so a "Month"
  // board can hold a lead last touched on 15 Jul. Tag those cards so the UI can label them "older"
  // instead of leaving it looking like a period-filter bug. In-period = a call/meeting in the period,
  // or last activity (meeting time / update) dated inside it.
  if (periodKey !== "all") {
    const periodMeetingLeadIds = new Set(
      filterMeetingsForPeriod(meetings, periodKey).map((m) => String(m.leadId)).filter(Boolean),
    );
    const { callActiveIds } = kanbanIndex;
    for (const colKey of Object.keys(map)) {
      if (!Array.isArray(map[colKey])) continue;
      map[colKey] = map[colKey].map((lead) => {
        if (!lead || lead._fromCall || lead._fromMeeting) return lead;
        const id = String(lead.id);
        if (callActiveIds.has(id) || periodMeetingLeadIds.has(id)) return lead;
        const rawAt = lead._meetingAt || lead.updatedAt || lead.createdAt;
        if (!rawAt) return lead;
        const at = parseAppDateTime(rawAt) || new Date(rawAt);
        if (Number.isNaN(at.getTime())) return lead;
        const key = localDateKey(at);
        const inPeriod = lead._meetingAt
          ? isMeetingDateKeyInPeriod(key, periodKey)
          : isDateKeyInPeriod(key, periodKey);
        return inPeriod ? lead : { ...lead, _outsidePeriod: true, _olderAt: at.toISOString() };
      });
    }
  }

  // Employee board: an unanswered dial today sends the card to the bottom of NOT PICK.
  if (options.notPickAttemptOrdering && map.not_pick?.length > 1) {
    const callsById = new Map(periodCalls.map((c) => [String(c?.id), c]));
    map.not_pick = orderNotPickColumn(map.not_pick, (lead) => {
      if (lead?._fromCall) {
        const own = callsById.get(String(lead._callId));
        return own ? [own] : [];
      }
      return getLeadCalls(lead);
    });
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

/**
 * Call counts for the Pipeline note / stage hints. Thin wrapper over summarizeCalls (lib/callMetrics.js) -
 * the ONE call definition: total = connected + notConnected,
 * connected = conversations + shortCalls + incomingShort, notConnected = notPickupByClient (Not pick) + missed
 * (incoming) + rejected. `*Leads` are DISTINCT leads (calls with no lead are de-duplicated by phone) and never
 * exceed the matching call count - always show both.
 */
export function countPipelineCallMetrics(periodCalls = []) {
  const s = summarizeCalls(periodCalls);
  return {
    totalCalls: s.total,
    connected: s.connected,
    conversations: s.conversation,
    shortCalls: s.short,
    incomingShort: s.incomingShort,
    notConnected: s.notConnected,
    notPickupByClient: s.noPickup,
    missed: s.missedIncoming,
    rejected: s.rejected,
    totalLeads: s.leads.total,
    connectedLeads: s.leads.connected,
    conversationLeads: s.leads.conversation,
    shortCallLeads: s.leads.short,
    incomingShortLeads: s.leads.incomingShort,
    notPickupLeads: s.leads.noPickup,
    missedLeads: s.leads.missedIncoming,
    rejectedLeads: s.leads.rejected,
    summary: s,
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
