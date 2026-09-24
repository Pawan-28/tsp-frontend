/** Period boundaries aligned with backend buildPeriodDateFilter (Monday week, calendar month, IST). */

import { APP_TZ, appDateKey, parseAppDateTime } from "./timezone.js";

export function localDateKey(date) {
  return appDateKey(date, APP_TZ);
}

export function weekStartMonday(now = new Date()) {
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const day = s.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  s.setDate(s.getDate() + diff);
  return s;
}

export function monthStartLocal(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function todayStartLocal(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * @param {string|null} dateKey YYYY-MM-DD
 * @param {"today"|"week"|"month"|string} period
 */
export function isDateKeyInPeriod(dateKey, period, now = new Date()) {
  if (!dateKey) return false;
  const p = String(period || "month").toLowerCase();
  const todayKey = localDateKey(now);
  if (!todayKey) return false;

  if (p === "today" || p === "day") {
    return dateKey === todayKey;
  }

  if (p === "week" || p === "this_week") {
    const weekStartKey = localDateKey(weekStartMonday(now));
    return Boolean(weekStartKey && dateKey >= weekStartKey && dateKey <= todayKey);
  }

  const monthStartKey = localDateKey(monthStartLocal(now));
  return Boolean(monthStartKey && dateKey >= monthStartKey && dateKey <= todayKey);
}

export function resolveCallDateKey(call) {
  if (!call || typeof call !== "object") return null;
  if (call.callDay) return call.callDay;
  for (const raw of [call.startedAt, call.callAt, call.createdAt, call.endedAt]) {
    if (!raw) continue;
    const parsed = parseAppDateTime(raw) || new Date(raw);
    const key = localDateKey(parsed);
    if (key) return key;
  }
  return null;
}

export function isCallInPeriod(call, period, now = new Date()) {
  return isDateKeyInPeriod(resolveCallDateKey(call), period, now);
}

export function filterCallsForPeriod(calls, period, now = new Date()) {
  const list = Array.isArray(calls) ? calls : [];
  if (!period || period === "all") return list;
  return list.filter((c) => isCallInPeriod(c, period, now));
}

export function filterLeadsByActivityPeriod(leads, period, now = new Date()) {
  const list = Array.isArray(leads) ? leads : [];
  if (!period || period === "all") return list;
  return list.filter((lead) => {
    const raw = lead.updatedAt || lead.lastActivityAt || lead.createdAt || lead.last;
    if (!raw) return period === "month";
    const key = localDateKey(new Date(raw));
    return isDateKeyInPeriod(key, period, now);
  });
}
