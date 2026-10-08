import { Timer, PauseCircle } from "lucide-react";
import { autoAssignLabel, autoAssignCountdownLabel, autoAssignTone, autoAssignTitle } from "../lib/autoAssignClock.js";
import { useNowTick } from "../lib/useNowTick.js";

const TONE = {
  normal: "bg-slate-50 text-slate-600 border-slate-200",
  urgent: "bg-amber-50 text-amber-800 border-amber-200",
  paused: "bg-sky-50 text-sky-700 border-sky-200",
  due: "bg-rose-50 text-rose-700 border-rose-200",
};

/**
 * The time left before the lead is handed to another employee. Nothing when the lead has no clock.
 *   default  - short words for a card ("2 days to auto-assign"), refreshed once a minute
 *   live     - the exact time with seconds for the lead header ("2d 05h 12m 33s to auto-assign"), ticking every second
 * Sundays do not count: on a Sunday the chip shows "Paused on Sunday" and the time stands still.
 */
export default function AutoAssignChip({ clock, live = false, className = "" }) {
  const now = useNowTick(live ? 1000 : 60_000);
  const label = live ? autoAssignCountdownLabel(clock, now) : autoAssignLabel(clock, now);
  if (!label) return null;
  const tone = autoAssignTone(clock, now);
  const Icon = tone === "paused" ? PauseCircle : Timer;
  return (
    <span
      data-testid="auto-assign-chip"
      title={autoAssignTitle(clock, now)}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold leading-none ${live ? "tabular-nums" : ""} ${TONE[tone]} ${className}`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
