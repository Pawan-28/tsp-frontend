import { parseCallDurationSeconds, phonesMatchLoose } from "./callMetrics.js";
import { localDateKey } from "./periodFilter.js";
import { APP_TZ, parseAppDateTime } from "./timezone.js";

function phoneIndexKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

/** Precompute card time labels once per kanban render (avoids per-card scans). */
export function buildLeadActivityLabelMap(grouped = {}, periodCalls = [], callIndex = null) {
  const map = new Map();
  const index = callIndex || buildLeadCallTimestampIndex(periodCalls);
  for (const list of Object.values(grouped)) {
    if (!Array.isArray(list)) continue;
    for (const lead of list) {
      if (!lead?.id || map.has(lead.id)) continue;
      map.set(lead.id, resolveLeadLastActivityLabel(lead, periodCalls, index));
    }
  }
  return map;
}

/** O(1) lookup maps for last call time per lead (build once per period). */
export function buildLeadCallTimestampIndex(periodCalls = []) {
  const byLeadId = new Map();
  const byPhone = new Map();
  const byCallId = new Map();

  for (const call of Array.isArray(periodCalls) ? periodCalls : []) {
    const raw = call.callAt || call.startedAt || call.createdAt || call.date;
    const d = parseCallDate(raw);
    if (!d) continue;
    const ms = d.getTime();

    if (call.leadId != null) {
      const id = String(call.leadId);
      const prev = byLeadId.get(id) || 0;
      if (ms > prev) byLeadId.set(id, ms);
    }

    const phone = call.phone || call.clientPhone;
    if (phone) {
      const key = phoneIndexKey(phone);
      if (key) {
        const prev = byPhone.get(key) || 0;
        if (ms > prev) byPhone.set(key, ms);
      }
    }

    if (call.id != null) {
      byCallId.set(String(call.id), raw);
    }
  }

  return { byLeadId, byPhone, byCallId };
}

function resolveCallTimestamp(raw) {
  if (raw == null || raw === "" || raw === "—") return null;
  const parsed = parseCallDate(raw);
  return parsed ? parsed.toISOString() : null;
}

/** Best timestamp for a pipeline card — latest call, assignment, or activity. */
export function resolveLeadLastCallTimestamp(lead, periodCalls = [], callIndex = null) {
  if (!lead) return null;

  for (const raw of [lead.callAt, lead.startedAt, lead.lastCallAt, lead.latestCallAt]) {
    const ts = resolveCallTimestamp(raw);
    if (ts) return ts;
  }

  if (lead._fromCall && lead._callId != null) {
    const callId = String(lead._callId);
    const indexedRaw = callIndex?.byCallId?.get(callId);
    if (indexedRaw) {
      const ts = resolveCallTimestamp(indexedRaw);
      if (ts) return ts;
    }
    const call = (Array.isArray(periodCalls) ? periodCalls : []).find(
      (c) => String(c.id) === callId,
    );
    if (call) {
      const ts = resolveCallTimestamp(call.callAt || call.startedAt || call.createdAt || call.date);
      if (ts) return ts;
    }
  }

  if (callIndex) {
    const leadId = String(lead.id);
    const leadPhone = lead.phone || lead.clientPhone;
    const phoneKey = phoneIndexKey(leadPhone);
    const indexedMs = Math.max(
      callIndex.byLeadId.get(leadId) || 0,
      phoneKey ? (callIndex.byPhone.get(phoneKey) || 0) : 0,
    );
    if (indexedMs > 0) return new Date(indexedMs).toISOString();
  } else {
    let latestMs = 0;
    let latestRaw = null;
    for (const call of Array.isArray(periodCalls) ? periodCalls : []) {
      const matchesLead = call.leadId != null && String(call.leadId) === String(lead.id);
      const leadPhone = lead.phone || lead.clientPhone;
      const callPhone = call.phone || call.clientPhone;
      const matchesPhone = leadPhone && callPhone && phonesMatchLoose(leadPhone, callPhone);
      if (!matchesLead && !matchesPhone) continue;

      const raw = call.callAt || call.startedAt || call.createdAt || call.date;
      const d = parseCallDate(raw);
      if (!d) continue;
      const ms = d.getTime();
      if (ms > latestMs) {
        latestMs = ms;
        latestRaw = raw;
      }
    }
    if (latestRaw) {
      const ts = resolveCallTimestamp(latestRaw);
      if (ts) return ts;
    }
  }

  for (const raw of [
    lead.lastActivityAt,
    lead.assignedAt,
    lead.assigned_at,
    lead.updatedAt,
    lead.updated_at,
    lead.createdAt,
    lead.created_at,
  ]) {
    const ts = resolveCallTimestamp(raw);
    if (ts) return ts;
  }

  if (lead.last && lead.last !== "—") {
    const ts = resolveCallTimestamp(lead.last);
    if (ts) return ts;
  }

  return null;
}

function startOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatTimePart(d) {
  return d.toLocaleTimeString("en-IN", {
    timeZone: APP_TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Parse API / mock call timestamps into a local Date. */
export function parseCallDate(value) {
  if (value == null || value === "" || value === "—") return null;
  const raw = String(value).trim();
  if (!raw) return null;

  if (/^today(\s|,|$)/i.test(raw)) {
    const m = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    if (m) {
      const d = startOfDay(new Date());
      const parsed = new Date(`${localDateKey(d)} ${m[1]}`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return startOfDay(new Date());
  }
  if (/^yesterday(\s|,|$)/i.test(raw)) {
    const m = raw.match(/(\d{1,2}:\d{2}\s*[AP]M)/i);
    const d = startOfDay(new Date());
    d.setDate(d.getDate() - 1);
    if (m) {
      const parsed = new Date(`${localDateKey(d)} ${m[1]}`);
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }
    return d;
  }

  const isoLike = raw.includes("T") ? raw : raw.replace(" ", "T");
  const appParsed = parseAppDateTime(isoLike);
  if (appParsed) return appParsed;
  const parsed = new Date(isoLike);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const withYear = raw.match(/^(\d{1,2}\s+\w+),?\s+(\d{1,2}:\d{2}\s*[AP]M)$/i);
  if (withYear) {
    const d = new Date(`${withYear[1]} ${new Date().getFullYear()} ${withYear[2]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const fallback = new Date(raw);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

/**
 * Human-friendly call timestamp:
 * Today → "Today, 11:47 am", Yesterday → "Yesterday, 4:20 pm", else "17 Jul, 11:47 am"
 */
export function formatCallDisplayDate(value, now = new Date()) {
  const d = parseCallDate(value);
  if (!d) return value ? String(value) : "—";

  const todayKey = localDateKey(now);
  const yesterdayKey = localDateKey(startOfDay(new Date(now.getTime() - 86400000)));
  const callKey = localDateKey(d);
  const timePart = formatTimePart(d);

  if (callKey === todayKey) return `Today, ${timePart}`;
  if (callKey === yesterdayKey) return `Yesterday, ${timePart}`;

  const nowYear = Number(new Intl.DateTimeFormat("en", { timeZone: APP_TZ, year: "numeric" }).format(now));
  const callYear = Number(new Intl.DateTimeFormat("en", { timeZone: APP_TZ, year: "numeric" }).format(d));
  const datePart = d.toLocaleDateString("en-IN", {
    timeZone: APP_TZ,
    day: "numeric",
    month: "short",
    year: callYear !== nowYear ? "numeric" : undefined,
  });
  return `${datePart}, ${timePart}`;
}

/** Latest call in period for a lead → friendly label; falls back to lead activity date. */
export function resolveLeadLastActivityLabel(lead, periodCalls = [], callIndex = null) {
  const ts = resolveLeadLastCallTimestamp(lead, periodCalls, callIndex);
  if (ts) return formatCallDisplayDate(ts);
  return "—";
}

/** Format seconds as mm:ss or h:mm:ss for connected calls. */
export function formatCallDuration(durationOrSec) {
  const sec = Number.isFinite(durationOrSec)
    ? Math.max(0, Math.floor(durationOrSec))
    : parseCallDurationSeconds(durationOrSec);
  if (!sec) return "—";
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const secs = sec % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

export function resolveCallDurationSec(call = {}) {
  if (Number.isFinite(call.durationSec) && call.durationSec > 0) {
    return call.durationSec;
  }
  const fromDuration = parseCallDurationSeconds(call.duration);
  return fromDuration > 0 ? fromDuration : 0;
}

/** Connected = client picked up (duration > 0). */
export function isCallConnected(call = {}) {
  return resolveCallDurationSec(call) > 0;
}

export function formatCallDurationLabel(call = {}) {
  if (!isCallConnected(call)) return null;
  if (call.duration && call.duration !== "—") return call.duration;
  return formatCallDuration(resolveCallDurationSec(call));
}
