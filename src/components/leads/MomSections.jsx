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

/** Key Highlights: 5-6 "Label: value" lines, label bold, value bold + highlighted. */
function KeyHighlights({ value }) {
  const lines = String(value).split("\n").map((l) => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean);
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 px-3 py-2.5 space-y-1.5 shadow-sm">
      <h4 className="text-[10.5px] font-extrabold text-amber-900 uppercase tracking-wide">⭐ Key Highlights</h4>
      <ul className="space-y-1">
        {lines.map((line, i) => {
          const idx = line.indexOf(":");
          const label = idx > 0 ? line.slice(0, idx) : "";
          const val = idx > 0 ? line.slice(idx + 1).trim() : line;
          return (
            <li key={i} className="text-xs leading-relaxed text-slate-900">
              {label && <span className="font-extrabold text-slate-700">{label}: </span>}
              <mark className="font-extrabold text-slate-900 bg-yellow-200 rounded px-1 py-0.5">{val}</mark>
            </li>
          );
        })}
      </ul>
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
          if (key === "keyHighlights") return <KeyHighlights key={key} value={value} />;
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
