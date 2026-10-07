import { Fragment } from "react";

/** "[KEY HIGHLIGHTS]" style section heading line (only the bracket headings the AI writes). */
const HEADING_RE = /^\[([A-Z0-9][A-Z0-9 &/,'-]*)\]$/;

export function parseMomLines(text) {
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const m = line.trim().match(HEADING_RE);
      return m ? { heading: m[1].trim() } : { text: line };
    });
}

/**
 * A call's MoM text with its section headings shown BOLD and WITHOUT the square brackets:
 *   [KEY HIGHLIGHTS]  ->  KEY HIGHLIGHTS (bold)      [ACTION ITEMS & NEXT STEPS]  ->  ACTION ITEMS & NEXT STEPS (bold)
 * Everything else is shown exactly as stored (the stored text is not changed).
 */
export default function MomText({ text, className = "" }) {
  const lines = parseMomLines(text);
  return (
    <div className={`whitespace-pre-line ${className}`}>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {l.heading ? (
            <strong className={`block font-extrabold text-slate-900 tracking-wide ${i === 0 ? "" : "mt-2.5"}`}>{l.heading}</strong>
          ) : (
            <>
              {l.text}
              {lines[i + 1] && !lines[i + 1].heading ? "\n" : ""}
            </>
          )}
        </Fragment>
      ))}
    </div>
  );
}
