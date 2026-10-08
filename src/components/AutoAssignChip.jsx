import { Timer } from "lucide-react";
import { autoAssignLabel, autoAssignTone, autoAssignTitle } from "../lib/autoAssignClock.js";

const TONE = {
  normal: "bg-slate-50 text-slate-600 border-slate-200",
  urgent: "bg-amber-50 text-amber-800 border-amber-200",
  due: "bg-rose-50 text-rose-700 border-rose-200",
};

/** "2 days to auto-assign" - the time left before the lead is handed to another employee. Nothing when the lead has no clock. */
export default function AutoAssignChip({ clock, className = "" }) {
  const label = autoAssignLabel(clock);
  if (!label) return null;
  const tone = autoAssignTone(clock);
  return (
    <span
      data-testid="auto-assign-chip"
      title={autoAssignTitle(clock)}
      className={`inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-[9.5px] font-bold leading-none ${TONE[tone]} ${className}`}
    >
      <Timer className="h-2.5 w-2.5 shrink-0" />
      <span className="truncate">{label}</span>
    </span>
  );
}
