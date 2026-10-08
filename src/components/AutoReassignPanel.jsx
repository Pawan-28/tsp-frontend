import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Timer, ShieldAlert } from "lucide-react";
import { apiGet, apiPut } from "../lib/api.js";
import { getAdminCrmHeaders } from "../lib/crmContext.js";
import { Badge } from "./Primitives.jsx";
import { PanelSection } from "./SettingsLayout.jsx";

const TEMPERATURE_RULES = [
  { label: "Hot Lead", rule: "will pay within 7 days", tone: "bg-rose-50 text-rose-800 border-rose-200" },
  { label: "Warm Lead", rule: "will pay within 30 days", tone: "bg-amber-50 text-amber-800 border-amber-200" },
  { label: "Cold Lead", rule: "might pay within 90 days", tone: "bg-sky-50 text-sky-800 border-sky-200" },
  { label: "Not Interested", rule: "the customer is not interested", tone: "bg-violet-50 text-violet-800 border-violet-200" },
];

/**
 * Admin switch for the 3-day stuck-lead auto-assign, plus the Gemini Hot / Warm / Cold rules it sits next to.
 * Saves by itself (not part of "Publish Configuration"). The server stamps the switch-on moment: every lead's 3-day window starts then.
 */
export default function AutoReassignPanel() {
  const [cfg, setCfg] = useState(null);
  const [summary, setSummary] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await apiGet("/api/settings", { skipCache: true, cacheTtl: 0 });
      const ar = s?.autoReassign || { enabled: false, days: 3, enabledAt: null };
      setCfg(ar);
      if (ar.enabled) {
        const p = await apiGet("/api/v1/auto-reassign/preview", { headers: getAdminCrmHeaders(), skipCache: true, cacheTtl: 0 }).catch(() => null);
        setSummary(p?.data?.summary || null);
      } else {
        setSummary(null);
      }
    } catch {
      setCfg({ enabled: false, days: 3, enabledAt: null });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (enabled) => {
    setBusy(true);
    try {
      await apiPut("/api/settings", { autoReassign: { enabled } });
      toast.success(enabled ? "Auto-assign is ON - every lead's 3-day timer starts now" : "Auto-assign is OFF");
      setConfirming(false);
      await load();
    } catch (err) {
      toast.error(err.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  const days = cfg?.days || 3;
  const since = cfg?.enabledAt ? new Date(cfg.enabledAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";

  return (
    <PanelSection
      title="Lead Auto-Assign"
      subtitle={`A lead that does not move to the next pipeline stage for ${days} days is auto-assigned to another employee`}
    >
      <div className="space-y-4 max-w-2xl" data-testid="auto-reassign-panel">
        <div className="rounded-2xl border border-rose-100 bg-white p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <span className="flex items-center gap-2 text-xs font-black uppercase text-[#be123c]"><Timer className="h-4 w-4" /> {days}-day timer</span>
            <Badge tone={cfg?.enabled ? "success" : "muted"}>{cfg == null ? "Loading…" : cfg.enabled ? `ON since ${since}` : "OFF"}</Badge>
          </div>
          <ul className="text-[11.5px] leading-relaxed text-slate-600 list-disc pl-4 space-y-1">
            <li>Every lead shows a countdown for its employee: "{days} days / 2 days / 1 day to auto-assign".</li>
            <li>The timer starts when the lead enters its stage (Lead, Not Pick, Short Call, Conversation). More calls that leave it in the same stage do not restart it; moving it forward does.</li>
            <li>When it runs out, the lead goes to the least-loaded other employee. Its stage, calls, notes and meetings stay as they are; the move is saved in the assignment history and both employees are notified.</li>
            <li>Meeting Booked and later stages, Not Interested leads, and leads the AI marked Not Interested have no timer.</li>
            <li>The new employee gets a fresh {days}-day window. At most 50 leads are moved per run (every 30 minutes).</li>
          </ul>

          {cfg && !cfg.enabled && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} className="rounded-xl bg-[#be123c] px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-[#a20f32]">
              Turn on auto-assign
            </button>
          )}
          {cfg && !cfg.enabled && confirming && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
              <p className="flex items-start gap-1.5 text-[11.5px] font-semibold text-amber-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                Every lead gets a full {days} days starting now, so nothing moves today. From day {days + 1} on, leads that are still stuck are handed to other employees (50 per 30 minutes).
              </p>
              <div className="flex gap-2">
                <button type="button" disabled={busy} onClick={() => save(true)} className="rounded-lg bg-[#be123c] px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Yes, turn on</button>
                <button type="button" disabled={busy} onClick={() => setConfirming(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Cancel</button>
              </div>
            </div>
          )}
          {cfg?.enabled && (
            <button type="button" disabled={busy} onClick={() => save(false)} className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-[#be123c] hover:border-rose-400 disabled:opacity-50">
              Turn off
            </button>
          )}
        </div>

        {cfg?.enabled && summary && (
          <div className="rounded-2xl border border-rose-100 bg-white p-4 sm:p-5" data-testid="auto-reassign-summary">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Leads with a timer: {summary.total}</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-center">
              {[["Due now", summary.due, "text-rose-700"], ["1 day left", summary.in1Day, "text-amber-700"], ["2 days left", summary.in2Days, "text-slate-700"], [`${3}+ days left`, summary.in3PlusDays, "text-slate-700"]].map(([label, n, tone]) => (
                <div key={label} className="rounded-xl border border-rose-50 bg-[#fffbfb] py-2">
                  <p className={`text-lg font-black tabular-nums ${tone}`}>{n}</p>
                  <p className="text-[10px] font-semibold text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-rose-100 bg-white p-4 sm:p-5 space-y-2" data-testid="temperature-rules">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Lead temperature - decided by Gemini after each connected call</p>
          <div className="flex flex-wrap gap-2">
            {TEMPERATURE_RULES.map((t) => (
              <span key={t.label} className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${t.tone}`}>{t.label} - {t.rule}</span>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Gemini uses only what the customer said. If the call shows no clear timeline, it picks the colder option.</p>
        </div>
      </div>
    </PanelSection>
  );
}
