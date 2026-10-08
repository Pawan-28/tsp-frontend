/**
 * The 3-day stuck-lead clock, as the page shows it. The server decides the deadline per lead (GET /api/v1/auto-reassign/clocks);
 * this turns a deadline into the words on a card: "3 days to auto-assign" / "2 days ..." / "1 day ..." / "Auto-assigning soon".
 * Mirror of backend/src/utils/stageClock.js autoAssignLabel (the countdown is recomputed from deadlineAt, so it stays right between fetches).
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/** @returns {{ due: boolean, daysLeft: number, msLeft: number } | null} null when the lead has no clock */
export function clockState(clock, now = Date.now()) {
  const deadline = clock?.deadlineAt ? new Date(clock.deadlineAt).getTime() : NaN;
  if (!Number.isFinite(deadline)) return null;
  const msLeft = deadline - now;
  return { due: msLeft <= 0, daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)), msLeft };
}

export function autoAssignLabel(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return null;
  if (s.due || s.daysLeft <= 0) return "Auto-assigning soon";
  return `${s.daysLeft} ${s.daysLeft === 1 ? "day" : "days"} to auto-assign`;
}

/** "normal" (2+ days) | "urgent" (last day) | "due" (window over). null = no clock. */
export function autoAssignTone(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return null;
  if (s.due) return "due";
  return s.daysLeft <= 1 ? "urgent" : "normal";
}

/** Longer text for a tooltip: when exactly the lead will be handed to another employee. */
export function autoAssignTitle(clock, now = Date.now()) {
  const s = clockState(clock, now);
  if (!s) return "";
  const when = new Date(clock.deadlineAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return s.due
    ? "This lead did not move to the next pipeline stage in time - it is about to be auto-assigned to another employee."
    : `If this lead does not move to the next pipeline stage, it is auto-assigned to another employee on ${when}.`;
}
