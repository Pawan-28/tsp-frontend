import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Info } from "lucide-react";

/**
 * Small "i" button with a definition popover (hover / focus / tap). Keeps the native `title` as a fallback.
 * Place it in StatCard's `corner` slot or next to any label.
 */
export default function MetricInfoTip({ text, align = "right", className = "" }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const [flip, setFlip] = useState(null);

  // Keep the popover inside the viewport: open towards the side that has room.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const POPOVER_W = 250;
    if (align === "right") setFlip(r.right >= POPOVER_W ? "right" : "left");
    else setFlip(window.innerWidth - r.left >= POPOVER_W ? "left" : "right");
  }, [open, align]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  if (!text) return null;
  return (
    <span
      ref={wrapRef}
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="How is this calculated?"
        aria-expanded={open}
        title={text}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full text-slate-400 hover:text-rose-600 focus:text-rose-600 focus:outline-none transition"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && (
        <span
          role="tooltip"
          className={`absolute z-[60] top-full mt-1.5 w-60 max-w-[70vw] whitespace-pre-line rounded-lg border border-slate-200 bg-white p-2.5 text-left text-[11px] font-medium normal-case tracking-normal leading-snug text-slate-600 shadow-lg ${(flip || align) === "left" ? "left-0" : "right-0"}`}
        >
          {text}
        </span>
      )}
    </span>
  );
}
