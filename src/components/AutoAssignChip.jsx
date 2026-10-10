import { Timer, PauseCircle } from "lucide-react";
import { autoAssignLabel, autoAssignCountdownLabel, autoAssignTone, autoAssignTitle } from "../lib/autoAssignClock.js";
import { useNowTick } from "../lib/useNowTick.js";

// Green while there is more than a day left, yellow in the last 24 hours, red in the last 3 hours (and when it is over);
// blue on a Sunday, when the clock stands still.
const TONE = {
  normal: "bg-emerald-50 text-emerald-700 border-emerald-200",
  urgent: "bg-amber-50 text-amber-800 border-amber-300",
  critical: "bg-rose-50 text-rose-700 border-rose-300",
  due: "bg-rose-100 text-rose-800 border-rose-300",
  paused: "bg-sky-50 text-sky-700 border-sky-200",
};

/**
 * The time left before the lead is handed to another employee, in hours and minutes, counting down from 72 hours:
 * "63h 20m to auto-assign" (no days, no seconds). Used on the cards and in the lead header alike; one shared ticker keeps every chip
 * current. `live={false}` gives the short words ("3 days to auto-assign"). Sundays do not count: on a Sunday it shows
 * "Paused on Sunday" and the time stands still.
 * Nothing is drawn when the lead has no clock.
 */
export default function AutoAssignChip({ clock, live = true, className = "" }) {
  const now = useNowTick(15_000); // minutes are shown: refresh a few times a minute
  const label = live ? autoAssignCountdownLabel(clock, now) : autoAssignLabel(clock, now);
  if (!label) return null;
  const tone = autoAssignTone(clock, now);
  const Icon = tone === "paused" ? PauseCircle : Timer;
  return (
    <span
      data-testid="auto-assign-chip"
      data-tone={tone}
      title={autoAssignTitle(clock, now)}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold leading-none tabular-nums ${TONE[tone]} ${className}`}
    >
      <Icon className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
