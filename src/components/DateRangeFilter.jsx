import { useEffect, useId, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, X } from "lucide-react";
import { useDateRange } from "../context/DateRangeContext.jsx";
import {
  RANGE_TABS,
  PERIOD_PILL_BTN,
  PERIOD_PILL_ACTIVE,
  PERIOD_PILL_INACTIVE,
  customRangeError,
  formatRangeLabel,
  isValidCustomRange,
} from "../lib/dateRange.js";
import { useDismissable } from "../hooks/useDismissable.js";
import { closeHeaderPopovers, useHeaderPopover } from "../hooks/useHeaderPopover.js";

// Exported so the Employee Pipeline page reuses the exact Admin custom-range popover.
// Apply stays disabled until BOTH dates are set and From <= To (inline message otherwise).
export function CustomDatePopover({ fromDate, setFromDate, toDate, setToDate, onApply, onClose, onClear, anchorRef }) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const error = customRangeError(fromDate, toDate);
  const canApply = !error;

  useEffect(() => {
    const update = () => {
      if (!anchorRef?.current) return;
      const rect = anchorRef.current.getBoundingClientRect();
      const w = 288;
      let left = rect.right - w;
      left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
      setPos({ top: rect.bottom + 8, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  // Esc / click outside (popover + its Custom pill count as "inside").
  useDismissable({ open: true, onDismiss: onClose, refs: [popoverRef, anchorRef] });

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
      className="p-4 rounded-xl border border-rose-200 bg-white shadow-xl w-72 max-w-[calc(100vw-2rem)]"
      role="dialog"
      aria-label="Custom date range"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-800">Custom Date Range</span>
        <button type="button" onClick={onClose} aria-label="Close" className="w-6 h-6 rounded-md hover:bg-rose-50 grid place-items-center">
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
          <input
            type="date"
            value={fromDate}
            max={toDate || undefined}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
          <input
            type="date"
            value={toDate}
            min={fromDate || undefined}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
          />
        </div>
        {error && (
          <p role="alert" className="text-[11px] font-medium text-rose-600 leading-snug">{error}</p>
        )}
        <button
          type="button"
          onClick={() => { if (canApply) onApply(); }}
          disabled={!canApply}
          aria-disabled={!canApply}
          className="w-full py-2 rounded-lg gradient-primary text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Apply Range
        </button>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="w-full text-[11px] font-semibold text-slate-500 hover:text-rose-600 transition"
          >
            Reset to default
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

export default function DateRangeFilter({ className = "", compact = false }) {
  const { preset: effectivePreset, uiPreset, fromDate, toDate, setPreset, setCustomDates, resetRange } = useDateRange();
  const preset = uiPreset || effectivePreset;
  const instanceId = useId();
  // Global "one header popover at a time" slot (also taken over by Activity / Bell / menus opening).
  const [showCalendar, setShowCalendar] = useHeaderPopover(`custom-date-${instanceId}`);
  const customApplied = preset === "custom" && isValidCustomRange(fromDate, toDate);
  const [draftFrom, setDraftFrom] = useState(customApplied ? fromDate : "");
  const [draftTo, setDraftTo] = useState(customApplied ? toDate : "");
  const customBtnRef = useRef(null);

  // Re-seed the drafts from the applied range every time the popover opens.
  useEffect(() => {
    if (!showCalendar) return;
    setDraftFrom(customApplied ? fromDate : "");
    setDraftTo(customApplied ? toDate : "");
  }, [showCalendar]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the popover is open Custom is the "pending" tab; closing without Apply reverts to the real preset.
  const highlighted = showCalendar ? "custom" : preset;

  const clearCustom = () => {
    resetRange();
    closeHeaderPopovers();
  };

  return (
    <div className={`${compact ? "grid grid-cols-4 gap-1 w-full min-w-0" : "flex items-center gap-0.5 sm:gap-1 flex-shrink-0 min-w-0"} ${className}`}>
      {RANGE_TABS.map((t) => {
        const isCustomTab = t.id === "custom";
        const showRange = isCustomTab && customApplied;
        const pill = (
          <button
            key={t.id}
            type="button"
            ref={isCustomTab ? customBtnRef : undefined}
            aria-pressed={highlighted === t.id}
            title={showRange ? formatRangeLabel(fromDate, toDate) : undefined}
            onClick={() => {
              if (isCustomTab) {
                setShowCalendar(true);
              } else {
                // Choosing a preset also closes any open header popover (custom range, activity, ...).
                setPreset(t.id);
                closeHeaderPopovers();
              }
            }}
            className={`${PERIOD_PILL_BTN} ${compact ? "w-full inline-flex items-center justify-center px-1 text-[9px] sm:text-[10px]" : ""} ${showRange ? "pr-6 min-w-0" : ""} ${highlighted === t.id ? PERIOD_PILL_ACTIVE : PERIOD_PILL_INACTIVE}`}
          >
            {showRange ? (
              <span className="inline-flex items-center gap-1 min-w-0">
                <CalendarDays className="w-2.5 h-2.5 sm:w-3 sm:h-3 shrink-0" />
                <span className="truncate">{formatRangeLabel(fromDate, toDate, !compact)}</span>
              </span>
            ) : (
              <>
                <span className="sm:hidden">{t.shortLabel ?? t.label}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </>
            )}
          </button>
        );
        if (!showRange) return pill;
        return (
          <div key={t.id} className={`relative ${compact ? "flex min-w-0" : "inline-flex shrink-0"}`}>
            {pill}
            <button
              type="button"
              onClick={clearCustom}
              aria-label="Clear custom date range"
              title="Clear custom range"
              className="absolute right-1 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full grid place-items-center text-white/90 hover:bg-white/25"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        );
      })}
      <AnimatePresence>
        {showCalendar && (
          <CustomDatePopover
            fromDate={draftFrom}
            setFromDate={setDraftFrom}
            toDate={draftTo}
            setToDate={setDraftTo}
            onApply={() => {
              if (setCustomDates(draftFrom, draftTo)) setShowCalendar(false);
            }}
            onClose={() => setShowCalendar(false)}
            onClear={customApplied ? clearCustom : undefined}
            anchorRef={customBtnRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
