/** Minimum answered call duration (seconds) counted as a conversation for KRA/incentives. */
export const CALL_CONVERSATION_MIN_SEC = 120;
export const CALL_CONVERSATION_LABEL = "2 min+";
export const CALL_SHORT_LABEL = "< 2 min";

export function parseCallDurationSeconds(durationStr) {
  if (durationStr == null || durationStr === "—") return 0;
  if (typeof durationStr === "number") return durationStr;
  const raw = String(durationStr).trim();
  if (!raw) return 0;
  if (raw.includes(":")) {
    const parts = raw.split(":").map((p) => parseInt(p, 10) || 0);
    if (parts.length >= 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function isConversationCall(durationOrSec) {
  const sec =
    typeof durationOrSec === "number"
      ? durationOrSec
      : parseCallDurationSeconds(durationOrSec);
  return sec >= CALL_CONVERSATION_MIN_SEC;
}

export function phonesMatchLoose(a, b) {
  const da = String(a || "").replace(/\D/g, "");
  const db = String(b || "").replace(/\D/g, "");
  if (!da || !db) return false;
  if (da === db) return true;
  return da.slice(-10) === db.slice(-10);
}

/* ───────────────────────────── CALL CLASSIFICATION — THE ONE DEFINITION ─────────────────────────────
 * MIRROR of backend/src/utils/callMetrics.js - keep both in sync (frontend/src/lib/callMetrics.parity.test.mjs and
 * backend/src/utils/callPartition.test.js prove they classify identically).
 * (Product-owner decision.) The same definitions are used in Backend, Frontend, Dashboard, Call Reporting,
 * Pipeline and Incentives/KRA. Every call lands in exactly ONE bucket:
 *
 *   conversation     answered call, talk >= 2 min (120 s), any direction
 *   short            answered OUTBOUND call, talk < 2 min
 *   incoming_short   answered INCOMING call, talk < 2 min  (own bucket: counts as CONNECTED, not Short, not Not pick)
 *   no_pickup        OUTBOUND call the client did not answer ("Not pick")           - Rejected is NOT inside it
 *   rejected         rejected call                                                  - never inside Not pick
 *   missed_incoming  INCOMING call that was not answered ("Missed")
 *
 *   Total calls   = Conversation + Short + Incoming short + Not pick + Rejected + Missed (incoming)
 *   Connected     = Conversation + Short + Incoming short
 *   Not connected = Not pick + Rejected + Missed (incoming)
 *
 * NO substring / regex guessing of free text. The rule is EXACT lookups of the NORMALIZED outcome
 * (lower-case, trim, "_" and "-" -> space, collapse spaces) in the explicit sets below, plus direction,
 * plus duration:
 *   1. talk >= 120 s                                  -> conversation (an unanswered call cannot last 2 min)
 *   2. outcome in REJECTED set                        -> rejected
 *   3. talk > 0 and outcome NOT in any unanswered set -> answered (outcome "Connected", "Discovery complete",
 *                                                        or any unknown outcome that carries talk time):
 *                                                        outbound -> short, inbound -> incoming_short
 *   4. otherwise it is unanswered: inbound and outcome not in NOT_CONNECTED set -> missed_incoming,
 *                                                        else -> no_pickup
 *      ("Not Connected" is an unanswered OUTBOUND dial even when the row is tagged inbound (legacy) or carries
 *       1-5 s of ring time; an unknown outcome with 0 s is classified by direction only.)
 * An outcome that merely CONTAINS a keyword ("not connected - callback requested", "Rejected by IVR note") is NOT
 * in a set, so it falls through to the duration/direction rule - by design.
 *
 * Direction: "in" / "inbound" / "incoming" = inbound, everything else = outbound. "Outbound dials" (the pickup
 * denominator) = every outbound-direction call + every no_pickup call (legacy rows tagged inbound).
 * PICKUP RATE (one definition everywhere): answered OUTBOUND calls (conversation or short with direction
 * outbound) / OUTBOUND dials. Calls and DISTINCT LEADS are always counted separately.
 *
 */
export const OUTCOME_NOT_CONNECTED = [
  "not connected", "not pick", "not picked", "not pickup", "not picked up",
  "no answer", "no pickup", "not answered", "unanswered", "busy",
];
export const OUTCOME_MISSED = ["missed", "missed call", "missed incoming", "never attended"];
export const OUTCOME_REJECTED = ["rejected", "call rejected", "declined"];
export const NOT_CONNECTED_OUTCOMES = new Set(OUTCOME_NOT_CONNECTED);
export const MISSED_OUTCOMES = new Set(OUTCOME_MISSED);
export const REJECTED_OUTCOMES = new Set(OUTCOME_REJECTED);
export const UNANSWERED_OUTCOMES = new Set([...OUTCOME_NOT_CONNECTED, ...OUTCOME_MISSED, ...OUTCOME_REJECTED]);
export const INBOUND_DIRECTIONS = new Set(["in", "inbound", "incoming"]);

export const CALL_BUCKETS = ["conversation", "short", "incoming_short", "no_pickup", "missed_incoming", "rejected"];
export const CALL_BUCKET_LABELS = {
  conversation: `Conversation (${CALL_CONVERSATION_LABEL})`,
  short: `Short call (${CALL_SHORT_LABEL})`,
  incoming_short: `Incoming short (${CALL_SHORT_LABEL})`,
  no_pickup: "Not pick",
  missed_incoming: "Missed (incoming)",
  rejected: "Rejected",
};

/** lower-case, trim, "_" and "-" -> space, collapse spaces. SQL twin: callSqlExprs().outcomeNorm. */
export function normalizeCallOutcome(value) {
  return String(value == null ? "" : value).toLowerCase().replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

export function callDurationSec(call = {}) {
  return Number.isFinite(call.durationSec)
    ? call.durationSec
    : parseCallDurationSeconds(call.duration);
}

/** @returns {"inbound"|"outbound"} raw direction (falls back to the UI `type` only when `direction` is blank). */
export function callDirection(call = {}) {
  const raw = String(call.direction == null ? "" : call.direction).toLowerCase().trim();
  if (raw) return INBOUND_DIRECTIONS.has(raw) ? "inbound" : "outbound";
  const type = String(call.type == null ? "" : call.type).toLowerCase().trim();
  return INBOUND_DIRECTIONS.has(type) ? "inbound" : "outbound";
}

/** @returns {"conversation"|"short"|"incoming_short"|"no_pickup"|"missed_incoming"|"rejected"} */
export function callBucket(call = {}) {
  const sec = callDurationSec(call);
  if (sec >= CALL_CONVERSATION_MIN_SEC) return "conversation";
  const outcome = normalizeCallOutcome(call.outcome);
  if (REJECTED_OUTCOMES.has(outcome)) return "rejected";
  const inbound = callDirection(call) === "inbound";
  if (sec > 0 && !UNANSWERED_OUTCOMES.has(outcome)) return inbound ? "incoming_short" : "short";
  if (inbound && !NOT_CONNECTED_OUTCOMES.has(outcome)) return "missed_incoming";
  return "no_pickup";
}

/** Answered call (conversation, short or incoming short). */
export function isConnectedCall(call = {}) {
  const b = callBucket(call);
  return b === "conversation" || b === "short" || b === "incoming_short";
}

export function isRejectedCall(call = {}) {
  return callBucket(call) === "rejected";
}

/** Answered OUTBOUND call under 2 min (the lead-stage "Short Call" rule). */
export function isShortConnectedCall(call = {}) {
  return callBucket(call) === "short";
}

/** Answered INCOMING call under 2 min. */
export function isIncomingShortCall(call = {}) {
  return callBucket(call) === "incoming_short";
}

/** OUTBOUND call the client did not answer ("Not pick"). Rejected is NOT included. */
export function isNotPickupByClientCall(call = {}) {
  return callBucket(call) === "no_pickup";
}

/** Missed INCOMING call (unanswered inbound). Same as isMissedIncomingCall. */
export function isMissedCall(call = {}) {
  return callBucket(call) === "missed_incoming";
}

export const isMissedIncomingCall = isMissedCall;

/** Not connected, any reason: Not pick + Rejected + Missed (incoming). */
export function isNotConnectedCall(call = {}) {
  return !isConnectedCall(call);
}

/** Outbound DIAL: outbound-direction call, or an unanswered dial legacy-tagged inbound. */
export function isOutboundCall(call = {}) {
  return callDirection(call) === "outbound" || callBucket(call) === "no_pickup";
}

/** Answered outbound call (conversation or short, direction outbound): the pickup-rate numerator. */
export function isAnsweredOutboundCall(call = {}) {
  const b = callBucket(call);
  return (b === "conversation" || b === "short") && callDirection(call) === "outbound";
}

/** ONE pickup-rate formula everywhere: answered outbound / outbound dials, whole percent. */
export function pickupRatePct(answeredOutbound, outboundDials) {
  const den = Number(outboundDials) || 0;
  if (den <= 0) return 0;
  return Math.min(100, Math.round(((Number(answeredOutbound) || 0) / den) * 100));
}

export function callContactKey(call = {}) {
  if (call.leadId != null && call.leadId !== "") return `id:${call.leadId}`;
  const phone = String(call.phone || call.clientPhone || "").replace(/\D/g, "").slice(-10);
  if (phone) return `phone:${phone}`;
  return `call:${call.id ?? ""}`;
}

/**
 * Partition + distinct-lead counts for a list of calls. Always:
 *   total === connected + notConnected
 *   connected === conversation + short + incomingShort
 *   notConnected === noPickup + missedIncoming + rejected
 *   outbound = outbound dials, inbound = the rest (total === inbound + outbound)
 */
export function summarizeCalls(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const FIELDS = ["total", "connected", "conversation", "short", "incomingShort", "notConnected", "noPickup", "missedIncoming", "rejected"];
  const out = {
    inbound: 0, outbound: 0, connectedOutbound: 0, talkSec: 0,
    leads: {},
  };
  const seen = {};
  for (const f of FIELDS) { out[f] = 0; out.leads[f] = 0; seen[f] = new Set(); }
  const BUCKET_KEY = {
    conversation: "conversation", short: "short", incoming_short: "incomingShort",
    no_pickup: "noPickup", missed_incoming: "missedIncoming", rejected: "rejected",
  };
  for (const call of list) {
    const bucket = callBucket(call);
    const key = callContactKey(call);
    const field = BUCKET_KEY[bucket];
    const connected = bucket === "conversation" || bucket === "short" || bucket === "incoming_short";
    const outbound = isOutboundCall(call);
    out.total += 1;
    out[field] += 1;
    seen.total.add(key);
    seen[field].add(key);
    if (connected) {
      out.connected += 1;
      out.talkSec += callDurationSec(call);
      seen.connected.add(key);
      if (isAnsweredOutboundCall(call)) out.connectedOutbound += 1;
    } else {
      out.notConnected += 1;
      seen.notConnected.add(key);
    }
    if (outbound) out.outbound += 1; else out.inbound += 1;
  }
  for (const k of FIELDS) out.leads[k] = seen[k].size;
  out.pickupRate = pickupRatePct(out.connectedOutbound, out.outbound);
  out.avgTalkSec = out.connected > 0 ? Math.round(out.talkSec / out.connected) : 0;
  return out;
}

export function countConversationCalls(calls, { periodFilter } = {}) {
  const list = Array.isArray(calls) ? calls : [];
  const scoped = periodFilter ? periodFilter(list) : list;
  return scoped.filter((c) => callBucket(c) === "conversation").length;
}

/** "25 calls · 21 leads" — calls and distinct leads are different units, always label both. */
export function formatCallsAndLeads(calls, leads) {
  const c = Number(calls) || 0;
  const l = Number(leads) || 0;
  return `${c} ${c === 1 ? "call" : "calls"} · ${l} ${l === 1 ? "lead" : "leads"}`;
}

/**
 * Display status of one call (call log badge): the same rule as callBucket.
 * tone: success = connected (green), warning = Not pick / Missed (amber), danger = Rejected (red).
 */
export function callStatusMeta(call = {}) {
  const bucket = callBucket(call);
  switch (bucket) {
    case "conversation":
    case "short":
    case "incoming_short":
      return { bucket, connected: true, tone: "success", label: "Connected" };
    case "rejected":
      return { bucket, connected: false, tone: "danger", label: "Rejected" };
    case "missed_incoming":
      return { bucket, connected: false, tone: "warning", label: "Missed" };
    default:
      return { bucket, connected: false, tone: "warning", label: "Not pick" };
  }
}

/**
 * Direction of an API call row. Callyzer `callType` (outgoing / rejected / incoming / missed) wins, then the DB
 * `direction`; an unanswered "Not Connected" dial that was legacy-tagged inbound is an OUTBOUND dial.
 * @returns {"inbound"|"outbound"}
 */
export function inferApiCallDirection(apiCall = {}, durationSec = 0) {
  const callType = String(apiCall?.callType ?? apiCall?.call_type ?? "").toLowerCase().trim();
  let direction;
  if (callType === "outgoing" || callType === "rejected") direction = "outbound";
  else if (callType === "incoming" || callType === "missed") direction = "inbound";
  else direction = callDirection({ direction: apiCall?.direction });
  const probe = { direction, outcome: apiCall?.outcome, durationSec };
  return callBucket(probe) === "no_pickup" ? "outbound" : direction;
}

/**
 * Short UI code of a call: "miss" = Missed INCOMING call, "in" = other incoming call (answered / rejected),
 * "out" = outbound dial (answered, Not pick or Rejected - read the status badge for which).
 */
export function callTypeCode(call = {}) {
  if (callBucket(call) === "missed_incoming") return "miss";
  return isOutboundCall(call) ? "out" : "in";
}

/** Deduplicate period calls (Month views can get DB + Callyzer duplicates). */
export function dedupePeriodCalls(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  const seen = new Set();
  const out = [];
  for (const call of list) {
    const key = String(
      call?.callyzerCallId
      || call?.callyzer_call_id
      || call?.id
      || `${call?.phone || call?.clientPhone || ""}:${call?.callAt || call?.startedAt || call?.date || ""}:${call?.durationSec ?? ""}`,
    );
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(call);
  }
  return out;
}

