import { CALL_CONVERSATION_MIN_SEC, isMissedCall, parseCallDurationSeconds, dedupePeriodCalls } from "./callMetrics.js";
import { buildLeadLookupIndex, resolveLeadForCall, resolveLeadForCallFromIndex } from "./leadKanban.js";
import { localDateKey } from "./periodFilter.js";
import { formatCallDisplayDate, formatCallDuration } from "./callDisplay.js";

/** Infer direction; client no-pick outcomes are always outbound dials. */
export function inferCallDirection(apiCall, durationSec = 0) {
  const outcome = String(apiCall?.outcome || "").toLowerCase();
  const callType = String(apiCall?.callType || apiCall?.call_type || "").toLowerCase();
  const rawDirection = String(apiCall?.direction || "").toLowerCase();
  const sec = Number.isFinite(durationSec) ? durationSec : parseCallDurationSeconds(durationSec);

  // Client did not answer — treat as outbound even if legacy rows say inbound.
  if (
    sec < CALL_CONVERSATION_MIN_SEC
    && /not connected|not pick|rejected|no answer|busy|unanswered|not answered/.test(outcome)
  ) {
    return "outbound";
  }
  if (callType === "outgoing" || callType === "rejected") return "outbound";
  if (callType === "incoming") return "inbound";
  if (callType === "missed") return "inbound";
  if (rawDirection === "inbound" || rawDirection === "in" || rawDirection === "incoming") return "inbound";
  if (rawDirection === "outbound" || rawDirection === "out" || rawDirection === "outgoing") return "outbound";
  return "outbound";
}

function resolveCallDay(apiCall) {
  const raw = apiCall.startedAt || apiCall.started_at || apiCall.createdAt || apiCall.created_at;
  if (!raw) return null;
  const isoDay = String(raw).match(/^(\d{4}-\d{2}-\d{2})/)?.[1];
  if (isoDay) return isoDay;
  const d = new Date(String(raw).replace(" ", "T"));
  return Number.isNaN(d.getTime()) ? null : localDateKey(d);
}

/** Lightweight call mapper for pipeline board (skips per-call period labels). */
export function callFromApiLite(apiCall, leads = [], resolvedLead = null) {
  if (!apiCall) return null;
  const lead = resolvedLead ?? resolveLeadForCall({
    leadId: apiCall.leadId ?? apiCall.lead_id,
    phone: apiCall.clientPhone || apiCall.client_phone || apiCall.phone,
  }, leads);

  const durationRaw = apiCall.durationSec ?? apiCall.duration_sec ?? apiCall.duration;
  const durationSec = Number.isFinite(durationRaw)
    ? durationRaw
    : parseCallDurationSeconds(durationRaw);
  const direction = inferCallDirection(apiCall, durationSec);
  const dir = direction === "inbound" ? "in" : "out";
  const type = isMissedCall({ type: dir, direction, outcome: apiCall.outcome, durationSec })
    ? "miss"
    : dir;
  const callAt = apiCall.startedAt || apiCall.started_at || apiCall.createdAt || apiCall.created_at || null;
  const connected = durationSec > 0;
  const phone = lead?.phone || apiCall.clientPhone || apiCall.client_phone || apiCall.phone || "";

  return {
    id: apiCall.id,
    leadId: apiCall.leadId ?? apiCall.lead_id ?? lead?.id ?? null,
    employeeId: apiCall.employeeId ?? apiCall.employee_id ?? null,
    name: lead?.name || lead?.leadName || apiCall.clientName || apiCall.client_name || (phone ? phone.slice(-10) : "Unknown Lead"),
    company: lead?.company || lead?.companyName || apiCall.clientCompany || apiCall.client_company || "—",
    durationSec,
    connected,
    direction,
    type,
    phone,
    clientPhone: apiCall.clientPhone || apiCall.client_phone || apiCall.phone || "",
    outcome: apiCall.outcome || (connected ? "Connected" : "Call logged"),
    duration: connected ? formatCallDuration(durationSec) : "—",
    date: callAt ? formatCallDisplayDate(callAt) : "—",
    callAt,
    callDay: resolveCallDay(apiCall),
    note: apiCall.notes || apiCall.note || apiCall.aiSummary || apiCall.ai_summary || null,
    notes: apiCall.notes || apiCall.note || null,
    aiSummary: apiCall.aiSummary || apiCall.ai_summary || null,
    recordingUrl: apiCall.recordingUrl || apiCall.recording_url || null,
    checklistProgress: apiCall.checklistProgress || apiCall.checklist_progress || null,
    checkedQuestions: apiCall.checkedQuestions || apiCall.checked_questions || null,
    sopId: apiCall.sopId || apiCall.sop_id || null,
  };
}

/** Map many calls with one lead index build (pipeline board hot path). */
export function mapCallsFromApiLite(callsRaw = [], leads = []) {
  const list = Array.isArray(leads) ? leads : [];
  const index = buildLeadLookupIndex(list);
  const mapped = (Array.isArray(callsRaw) ? callsRaw : [])
    .map((apiCall) => {
      if (!apiCall) return null;
      const lead = resolveLeadForCallFromIndex({
        leadId: apiCall.leadId ?? apiCall.lead_id,
        phone: apiCall.clientPhone || apiCall.client_phone || apiCall.phone,
      }, index, list);
      return callFromApiLite(apiCall, list, lead);
    })
    .filter(Boolean);
  return dedupePeriodCalls(mapped);
}
