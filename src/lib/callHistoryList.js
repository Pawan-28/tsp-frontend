import { callStatusMeta, isOutboundCall } from "./callMetrics.js";

/**
 * Items for the lead card's "Activity History": EVERY call of the lead, newest first -
 *   which call (outgoing / incoming), what happened (Connected / Missed / Not pick / Rejected), when, how long it was, and - for a
 *   call that connected - its recording.
 * `calls` are the lead's calls already normalised for display ({ id, date, callAt, duration, outcome, type, recordingUrl ... }).
 */
export function buildCallHistoryItems(calls = []) {
  const list = Array.isArray(calls) ? calls : [];
  return list
    .map((c, idx) => {
      const meta = callStatusMeta(c);
      const outbound = isOutboundCall(c);
      const recordingUrl = String(c.recordingUrl || c.recording_url || c.audioUrl || "").trim();
      const duration = String(c.duration || "").trim();
      const at = c.callAt || c.startedAt || c.date;
      const ms = new Date(c.callAt || c.startedAt || 0).getTime();
      return {
        id: String(c.id ?? `call-${idx}`),
        direction: outbound ? "Outgoing" : "Incoming",
        status: meta.label,                        // Connected | Missed | Not pick | Rejected
        tone: meta.tone,                           // success | warning | danger
        connected: meta.connected,
        when: String(c.date || "").trim() || (at ? String(at) : "Call"),
        // talk time only means something when the call connected
        duration: meta.connected && duration && duration !== "—" ? duration : "",
        recordingUrl: meta.connected ? recordingUrl : "",
        sortMs: Number.isFinite(ms) ? ms : 0,
        order: idx,
      };
    })
    .sort((a, b) => b.sortMs - a.sortMs || a.order - b.order);
}
