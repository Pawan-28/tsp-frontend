import { Coins } from "lucide-react";
import { MOM_SECTION_ORDER, MOM_SECTION_TITLES, getMomSections, getMomPlainText, getGeminiCharges } from "../../lib/momFormat.js";
import MomText from "./MomText.jsx";

/**
 * One line of the charges block -> { label, value, detail }.
 *   "Transcript: ₹0.40 — 1,200 audio + 30 text tokens in, 500 out"  ->  Transcript / ₹0.40 / "1,200 audio + ..."
 *   "Model: gemini-2.5-flash"                                               ->  Model / gemini-2.5-flash
 */
export function parseChargeLine(line) {
  const text = String(line || "").trim();
  const at = text.indexOf(":");
  if (at < 0) return { label: "", value: text, detail: "" };
  const label = text.slice(0, at).trim();
  const rest = text.slice(at + 1).trim();
  const [value, ...detail] = rest.split(" — ");
  return { label, value: value.trim(), detail: detail.join(" — ").trim() };
}

/** Per-call Gemini transcript + MoM charges: a small, compact box shown at the top of the MoM (same look as Extra Info). */
export function GeminiChargesBar({ call }) {
  const charges = getGeminiCharges(call);
  if (!charges) return null;
  const parts = charges.lines.map(parseChargeLine).filter((p) => p.label || p.value);
  return (
    <div
      className="mb-2 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-white to-amber-50/40 px-2.5 py-1.5 shadow-sm"
      data-testid="gemini-charges"
    >
      <div className="flex items-center gap-1.5">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-amber-500 text-white shadow-sm">
          <Coins className="h-3 w-3" />
        </span>
        <span className="text-[9.5px] font-extrabold uppercase tracking-wider text-amber-900">Gemini charges</span>
        <span className="ml-auto text-[12px] font-black tabular-nums text-amber-900">{charges.total}</span>
      </div>
      {parts.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {parts.map((p) => (
            <span
              key={`${p.label}-${p.value}`}
              title={p.detail || undefined}
              className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-white/80 px-2 py-0.5 text-[9.5px] tabular-nums text-amber-900"
            >
              {p.label && <span className="font-bold text-amber-700">{p.label}</span>}
              <span className="font-semibold">{p.value}</span>
            </span>
          ))}
        </div>
      )}
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
        <MomText text={plainText} className="text-xs text-slate-800 leading-relaxed font-medium" />
      </div>
    );
  }

  return <p className="text-xs text-slate-400 italic">{emptyText}</p>;
}
