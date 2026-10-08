/**
 * The 3-day stuck-lead clock, as the page shows it. The server decides the deadline per lead (GET /api/v1/auto-reassign/clocks);
 * this turns a deadline into the words: "3 days to auto-assign" on a card, "2d 05h 12m 33s" in the lead header.
 * The days are WORKING days - Sunday (India time) does not count, so the countdown stops on Sunday ("Paused on Sunday").
 * Mirror of backend/src/utils/stageClock.js (the deadline already includes any Sunday in between; the time left is recomputed here
 * from it, so the countdown stays right between fetches).
 */
import { workingMsBetween, isSunday, DAY_MS } from "./workingTime.js";

export { DAY_MS };

/** @returns {{ due: boolean, paused: boolean, daysLeft: number, msLeft: number } | null} null when the lead has no clock */
export function clockState(clock, now = Date.now()) {
  const deadline = clock?.deadlineAt ? new Date(clock.deadlineAt).getTime() : NaN;
  if (!Number.isFinite(deadline)) return null;
  const due = now >= deadline;
  const msLeft = due ? deadline - now : workingMsBetween(now, deadline);
  return { due, paused: !due && isSunday(now), daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)), msLeft };
}

/** 183_753_000 ms -> "2d 03h 02m 33s" (days only when there are some). Never negative. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  if (d > 0) return `${d}d ${two(h)}h ${two(m)}m ${two(s)}s`;
  if (h > 0) return `${h}h ${two(m)}m ${two(s)}s`;
  return `${m}m ${two(s)}s`;
}

/** Short words for a card: "3 days to auto-assign" / "1 day ..." / "Paused on Sunday · 2 days left" / "Auto-assigning soon". */
export function autoAssignLabel(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return null;
  if (s.due || s.daysLeft <= 0) return "Auto-assigning soon";
  const left = `${s.daysLeft} ${s.daysLeft === 1 ? "day" : "days"}`;
  return s.paused ? `Paused on Sunday · ${left} left` : `${left} to auto-assign`;
}

/** Full words for the lead header: the exact time left, with seconds. */
export function autoAssignCountdownLabel(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return null;
  if (s.due) return "Auto-assigning soon";
  const left = formatCountdown(s.msLeft);
  return s.paused ? `Paused on Sunday · ${left} left` : `${left} to auto-assign`;
}

/** "normal" (2+ days) | "urgent" (last day) | "paused" (Sunday) | "due" (window over). null = no clock. */
export function autoAssignTone(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return null;
  if (s.due) return "due";
  if (s.paused) return "paused";
  return s.daysLeft <= 1 ? "urgent" : "normal";
}

/** Longer text for a tooltip: when exactly the lead will be handed to another employee. */
export function autoAssignTitle(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return "";
  const when = new Date(clock.deadlineAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  if (s.due) return "This lead did not move to the next pipeline stage in time - it is about to be auto-assigned to another employee.";
  return `If this lead does not move to the next pipeline stage, it is auto-assigned to another employee on ${when}. Sundays do not count.`;
}
