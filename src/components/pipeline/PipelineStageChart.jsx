import { GlassCard, SectionHeader } from "../Primitives.jsx";

/** Horizontal stage bars — same layout as employee dashboard pipeline. */
export default function PipelineStageChart({
  stages = [],
  loading = false,
  title = "Lead Pipeline",
  subtitle = "Stage-wise breakdown · synced with employee kanban",
  periodLabel = "",
  footerStats = [],
  callSummary = null,
  className = "",
}) {
  const pipelineTotal = stages.reduce((sum, s) => sum + (s.count || 0), 0);
  const proposalSentCount = stages.find((s) => s.id === "proposal_sent" || s.fullLabel === "Proposal Sent" || s.label === "Proposal Sent" || s.label === "Proposal")?.count ?? 0;
  const convertedCount = stages.filter((s) => s.id === "advance_paid" || s.id === "payment_complete" || s.fullLabel === "Advance Paid" || s.fullLabel === "Payment Complete").reduce((sum, s) => sum + (s.count || 0), 0);
  const convRate = pipelineTotal ? `${Math.round(((proposalSentCount + convertedCount) / pipelineTotal) * 100)}%` : "—";

  const defaultFooter = [
    { label: "In pipeline", val: pipelineTotal },
    { label: "Proposal Sent", val: proposalSentCount },
    { label: "Close rate", val: convRate },
  ];
  const footer = footerStats.length ? footerStats : defaultFooter;

  return (
    <GlassCard className={`p-3 sm:p-4 md:p-5 min-w-0 overflow-hidden !bg-white !border-slate-200/80 ${className}`}>
      <SectionHeader
        title={title}
        subtitle={subtitle}
      />

      {callSummary && (
        <p className="text-[10px] text-slate-400 mb-2 px-0.5">{callSummary}</p>
      )}

      <div className="grid grid-cols-3 gap-1.5 sm:gap-2 mb-3 sm:mb-4">
        {footer.map((s) => (
          <div key={s.label} className="rounded-lg sm:rounded-xl bg-slate-50 border border-slate-100 px-2 py-1.5 sm:px-3 sm:py-2 text-center min-w-0">
            <p className="text-sm sm:text-base font-black text-slate-900 tabular-nums">{s.val}</p>
            <p className="text-[8px] sm:text-[10px] font-medium text-slate-500 leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="w-full min-w-0 flex flex-col gap-0.5 sm:gap-1">
        {loading ? (
          <p className="text-center text-sm text-slate-400 py-8">Loading pipeline…</p>
        ) : pipelineTotal === 0 ? (
          <p className="text-center text-sm text-slate-400 py-8">No leads in pipeline yet</p>
        ) : (
          stages.map((s) => (
            <div
              key={s.fullLabel || s.label}
              className="flex items-center gap-1.5 sm:gap-2 min-h-[14px] sm:min-h-[16px]"
              title={s.fullLabel || s.label}
            >
              <span className="text-[8px] sm:text-[9px] font-semibold text-slate-500 w-[54px] sm:w-[64px] shrink-0 truncate leading-tight">
                {s.label}
              </span>
              <div className="flex-1 h-[4px] sm:h-[5px] bg-slate-100 rounded-full overflow-hidden min-w-0">
                <div
                  className="h-full rounded-full opacity-90"
                  style={{
                    width: `${Math.max(s.count > 0 ? 2 : 0, s.pct)}%`,
                    backgroundColor: s.color,
                  }}
                />
              </div>
              <span className="text-[8px] sm:text-[9px] font-bold text-slate-700 w-6 sm:w-7 text-right tabular-nums shrink-0">
                {s.count}
              </span>
            </div>
          ))
        )}
      </div>

      {periodLabel ? (
        <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-100">{periodLabel}</p>
      ) : null}
    </GlassCard>
  );
}
