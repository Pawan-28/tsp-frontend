import { Sparkles } from "lucide-react";

const TEMPERATURE_CHIP = {
  Hot: "bg-rose-100 border-rose-200 text-rose-800",
  Warm: "bg-amber-100 border-amber-200 text-amber-800",
  Cold: "bg-sky-100 border-sky-200 text-sky-800",
};

/**
 * EXTRA INFO - compact customer-level sales profile (label + value grid). Rendered on the lead card directly BELOW the header card
 * (Hot/Warm/Cold, Follow-up, owner, Dialed) and ABOVE the notes / call history. Values come from lib/extraInfo.js; anything that
 * was not discussed shows "Not discussed" / "Unknown" - never a blank and never a guess.
 */
export default function ExtraInfoCard({ rows = [], hasAnalysedCall = false }) {
  return (
    <section
      className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm"
      aria-label="Extra info"
      data-testid="extra-info-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-1 border-b border-rose-50 pb-2">
        <h4 className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-rose-500" /> Extra Info
        </h4>
        <span className="text-[9.5px] font-semibold text-slate-400">From call recordings · updates with every connected call</span>
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
        {rows.map((r) => (
          <div key={r.key} className="min-w-0" data-extra-key={r.key}>
            <dt className="text-[9.5px] font-extrabold uppercase tracking-wider text-slate-400">{r.label}</dt>
            <dd className="mt-0.5 text-[11.5px] leading-snug break-words">
              {r.key === "temperature" && TEMPERATURE_CHIP[r.value] ? (
                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10.5px] font-bold ${TEMPERATURE_CHIP[r.value]}`}>{r.value}</span>
              ) : (
                <span className={r.known ? "font-bold text-slate-900" : "font-semibold italic text-slate-400"}>{r.value}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>

      {!hasAnalysedCall && (
        <p className="mt-3 text-[10px] text-slate-400 italic">No analysed call yet - fields fill in after a connected call is processed by AI.</p>
      )}
    </section>
  );
}
