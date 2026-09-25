import { MOM_SECTION_ORDER, MOM_SECTION_TITLES, getMomSections, getMomPlainText } from "../../lib/momFormat.js";

/** Renders a call's AI MoM as 4 readable sections, with legacy plain-text fallback. Never dumps raw JSON. */
export default function MomSections({ call, emptyText = "No AI MoM generated yet for this call." }) {
  const sections = getMomSections(call);

  if (sections) {
    return (
      <div className="space-y-3">
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
      <div className="text-xs text-slate-800 leading-relaxed font-medium whitespace-pre-line">
        {plainText}
      </div>
    );
  }

  return <p className="text-xs text-slate-400 italic">{emptyText}</p>;
}
