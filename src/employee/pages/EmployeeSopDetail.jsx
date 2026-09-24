import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, BookOpen, Clock, Copy, Layers, MessageSquare, Phone,
  Shield, Sparkles, Target,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, Badge } from "../../components/Primitives.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { BtnPrimary, BtnSecondary, ChooseLeadModal } from "../components/EmpUI.jsx";

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">{children}</p>
  );
}

function copyText(text, label = "Copied") {
  navigator.clipboard?.writeText(text);
  toast.success(label);
}

export default function EmployeeSopDetail() {
  const { sopId } = useParams();
  const navigate = useNavigate();
  const { sops, leads } = useEmployee();
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);

  const sop = useMemo(() => {
    const id = Number(sopId);
    return sops.find((s) => s.id === id || String(s.id) === sopId);
  }, [sops, sopId]);

  if (!sop) {
    return (
      <GlassCard className="py-12 text-center">
        <p className="text-sm font-bold text-slate-700">SOP not found</p>
        <BtnPrimary onClick={() => navigate("/employee/sales-process")} className="mt-4">
          <ArrowLeft className="w-4 h-4" /> Back to SOPs
        </BtnPrimary>
      </GlassCard>
    );
  }

  const stepCount = sop.steps?.length || 0;

  const startCallWithLead = (lead) => {
    navigate(
      `/employee/call-assistant?sop=${sop.id}&lead=${encodeURIComponent(lead.name)}`,
    );
  };

  return (
    <div className="space-y-3 sm:space-y-5 page-shell min-w-0 animate-fade-in pb-10">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/employee/sales-process")}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition w-fit"
        >
          <ArrowLeft className="w-4 h-4" /> All SOPs
        </button>
        <BtnPrimary
          onClick={() => setLeadPickerOpen(true)}
          className="!rounded-xl w-full sm:w-auto"
        >
          <Phone className="w-4 h-4" /> Use in Call Assistant
        </BtnPrimary>
      </div>

      <GlassCard className="p-3 sm:p-4 md:p-5">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="w-14 h-14 rounded-2xl bg-slate-50 border border-slate-200 grid place-items-center text-2xl shrink-0">
            {sop.icon || ""}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-start gap-2 mb-1">
              <h1 className="text-lg sm:text-xl font-display font-bold text-slate-900">{sop.title}</h1>
              <Badge tone="muted">{sop.category}</Badge>
            </div>
            <p className="text-sm text-slate-600">{sop.sub}</p>
            <div className="flex flex-wrap gap-3 mt-3 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1"><Layers className="w-3.5 h-3.5" /> {stepCount} steps</span>
              <span className="inline-flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {sop.duration || "—"}</span>
              {sop.budgetRange && sop.budgetRange !== "—" && (
                <span className="inline-flex items-center gap-1"><Target className="w-3.5 h-3.5" /> {sop.budgetRange}</span>
              )}
            </div>
          </div>
        </div>
      </GlassCard>

      {sop.steps?.map((step, index) => (
        <GlassCard key={step.id} className="p-3 sm:p-4 md:p-5 space-y-3 sm:space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
            <span className="w-7 h-7 rounded-lg bg-slate-800 text-white text-xs font-black grid place-items-center shrink-0">
              {index + 1}
            </span>
            <h2 className="text-sm font-bold text-slate-900">{step.label}</h2>
          </div>

          {step.scripts?.opening && (
            <div>
              <SectionLabel>Opening Script</SectionLabel>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 flex flex-col sm:flex-row gap-2">
                <MessageSquare className="w-4 h-4 text-slate-400 shrink-0 mt-0.5 hidden sm:block" />
                <p className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-wrap flex-1">{step.scripts.opening}</p>
                <button
                  type="button"
                  onClick={() => copyText(step.scripts.opening, "Script copied")}
                  className="p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 shrink-0 h-fit self-end sm:self-auto min-h-[40px] min-w-[40px] grid place-items-center"
                  aria-label="Copy script"
                >
                  <Copy className="w-3.5 h-3.5 text-slate-500" />
                </button>
              </div>
            </div>
          )}

          {step.scripts?.talkingPoints?.length > 0 && (
            <div>
              <SectionLabel>Talking Points</SectionLabel>
              <ul className="space-y-1.5">
                {step.scripts.talkingPoints.map((pt) => (
                  <li key={pt} className="text-sm text-slate-700 flex gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                    {pt}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.scripts?.tips && (
            <div>
              <SectionLabel>Tips</SectionLabel>
              <p className="text-sm text-slate-600 leading-relaxed">{step.scripts.tips}</p>
            </div>
          )}

          {step.questions?.length > 0 && (
            <div>
              <SectionLabel>Qualification Checklist</SectionLabel>
              <ul className="space-y-1.5">
                {step.questions.map((q) => (
                  <li key={q.id} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-400">☐</span>
                    {q.text}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.checklist?.length > 0 && (
            <div>
              <SectionLabel>Step Checklist</SectionLabel>
              <ul className="space-y-1.5">
                {step.checklist.map((item) => (
                  <li key={item} className="text-sm text-slate-700 flex gap-2">
                    <span className="text-slate-400">•</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {step.discovery?.length > 0 && (
            <div>
              <SectionLabel>Discovery Fields</SectionLabel>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {step.discovery.map((f) => (
                  <div key={f.key} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{f.label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{f.placeholder}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </GlassCard>
      ))}

      {sop.objections?.length > 0 && (
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">Objection Handling</h2>
          </div>
          <div className="space-y-3">
            {sop.objections.map((o) => (
              <div key={o.trigger} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                <p className="text-xs font-bold text-slate-800">{o.trigger}</p>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">{o.rebuttal}</p>
                <button
                  type="button"
                  onClick={() => copyText(o.rebuttal, "Rebuttal copied")}
                  className="mt-2 text-[10px] font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
                >
                  <Copy className="w-3 h-3" /> Copy rebuttal
                </button>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {sop.crossSell && (
        <GlassCard className="p-4 sm:p-5">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen className="w-4 h-4 text-slate-600" />
            <h2 className="text-sm font-bold text-slate-900">Cross-Sell Guide</h2>
          </div>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{sop.crossSell.icon}</span>
            <div>
              <p className="text-sm font-bold text-slate-900">{sop.crossSell.product}</p>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">{sop.crossSell.pitch}</p>
              <p className="text-xs font-bold text-emerald-600 mt-2">
                {sop.crossSell.success}% success · {sop.crossSell.deals} deals
              </p>
            </div>
          </div>
        </GlassCard>
      )}

      <div className="flex flex-wrap gap-2 pt-2">
        <BtnSecondary onClick={() => navigate("/employee/sales-process")} className="!rounded-xl">
          <ArrowLeft className="w-4 h-4" /> Back
        </BtnSecondary>
        <BtnPrimary onClick={() => setLeadPickerOpen(true)} className="!rounded-xl">
          <Phone className="w-4 h-4" /> Start Call with this SOP
        </BtnPrimary>
      </div>

      <ChooseLeadModal
        open={leadPickerOpen}
        onClose={() => setLeadPickerOpen(false)}
        leads={leads}
        title="Choose a lead to call"
        subtitle={`Using playbook: ${sop.title}`}
        onSelect={startCallWithLead}
      />
    </div>
  );
}
