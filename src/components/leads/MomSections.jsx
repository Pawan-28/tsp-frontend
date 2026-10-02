import { MOM_SECTION_ORDER, MOM_SECTION_TITLES, getMomSections, getMomPlainText, getGeminiCharges } from "../../lib/momFormat.js";

/** Per-call Gemini transcript + MoM charges, shown at the top of the MoM. */
export function GeminiChargesBar({ call }) {
  const charges = getGeminiCharges(call);
  if (!charges) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-2.5 py-1.5 mb-2">
      <p className="text-[10px] font-extrabold text-amber-900 uppercase tracking-wide">
        Gemini charges (this call): <span className="tabular-nums normal-case">{charges.total}</span>
      </p>
      {charges.lines.map((l) => (
        <p key={l} className="text-[9.5px] text-amber-800/90 tabular-nums">{l}</p>
      ))}
    </div>
  );
}

/** Renders a call's AI MoM as 4 readable sections, with legacy plain-text fallback. Never dumps raw JSON. */
export default function MomSections({ call, emptyText = "No AI MoM generated yet for this call." }) {
  const sections = getMomSections(call);

  if (sections) {
    return (
      <div className="space-y-3">
        <GeminiChargesBar call={call} />
        {MOM_SECTION_ORDER.map((key) => {
          const value = String(sections[key] || "").trim();
          if (!value) return null;
          return (
            <div key={key} className="space-y-1">
              <h4 className="text-[10.5px] font-extrabold text-rose-700 uppercase tracking-wide">
                {MOM_SECTION_TITLES[key]}
              </h4>
              <p className="text-xs text-slate-800 leading-relaxed font-medium whitespace-pre-line">
                {value}
              </p>
            </div>
          );
        })}
      </div>
    );
  }

  const plainText = getMomPlainText(call);
  if (plainText) {
    return (
      <div>
        <GeminiChargesBar call={call} />
        <div className="text-xs text-slate-800 leading-relaxed font-medium whitespace-pre-line">
          {plainText}
        </div>
      </div>
    );
  }

  return <p className="text-xs text-slate-400 italic">{emptyText}</p>;
}
