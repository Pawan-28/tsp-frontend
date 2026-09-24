import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CalendarDays, X } from "lucide-react";
import { useDateRange } from "../context/DateRangeContext.jsx";
import { RANGE_TABS, PERIOD_PILL_BTN, PERIOD_PILL_ACTIVE, PERIOD_PILL_INACTIVE } from "../lib/dateRange.js";

function CustomDatePopover({ fromDate, setFromDate, toDate, setToDate, onApply, onClose, anchorRef }) {
  const popoverRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

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

  useEffect(() => {
    const onDown = (e) => {
      if (
        popoverRef.current?.contains(e.target) ||
        anchorRef.current?.contains(e.target)
      ) {
        return;
      }
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose, anchorRef]);

  if (typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.98 }}
      style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 99999 }}
      className="p-4 rounded-xl border border-rose-200 bg-white shadow-xl w-72 max-w-[calc(100vw-2rem)]"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-800">Custom Date Range</span>
        <button type="button" onClick={onClose} className="w-6 h-6 rounded-md hover:bg-rose-50 grid place-items-center">
          <X className="w-3.5 h-3.5 text-slate-500" />
        </button>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">From</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">To</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full border border-rose-100 rounded-lg px-3 py-2 text-xs text-slate-800 bg-white focus:outline-none focus:border-rose-400"
          />
        </div>
        <button
          type="button"
          onClick={onApply}
          className="w-full py-2 rounded-lg gradient-primary text-white text-xs font-bold"
        >
          Apply Range
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}

export default function DateRangeFilter({ className = "", compact = false }) {
  const { preset, fromDate, toDate, setPreset, setCustomDates } = useDateRange();
  const [showCalendar, setShowCalendar] = useState(false);
  const [draftFrom, setDraftFrom] = useState(fromDate);
  const [draftTo, setDraftTo] = useState(toDate);
  const customBtnRef = useRef(null);

  useEffect(() => {
    setDraftFrom(fromDate);
    setDraftTo(toDate);
  }, [fromDate, toDate, preset]);

  return (
    <div className={`${compact ? "grid grid-cols-4 gap-1 w-full min-w-0" : "flex items-center gap-0.5 sm:gap-1 flex-shrink-0 min-w-0"} ${className}`}>
      {RANGE_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          ref={t.id === "custom" ? customBtnRef : undefined}
          onClick={() => {
            setPreset(t.id);
            if (t.id === "custom") {
              setShowCalendar(true);
            } else {
              setShowCalendar(false);
            }
          }}
          className={`${PERIOD_PILL_BTN} ${compact ? "w-full inline-flex items-center justify-center px-1 text-[9px] sm:text-[10px]" : ""} ${preset === t.id ? PERIOD_PILL_ACTIVE : PERIOD_PILL_INACTIVE}`}
        >
          {t.id === "custom" && preset === "custom" && fromDate && toDate ? (
            <span className="inline-flex items-center gap-0.5">
              <CalendarDays className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              {fromDate.slice(5)} → {toDate.slice(5)}
            </span>
          ) : (
            <>
              <span className="sm:hidden">{t.shortLabel ?? t.label}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          )}
        </button>
      ))}
      <AnimatePresence>
        {showCalendar && preset === "custom" && (
          <CustomDatePopover
            fromDate={draftFrom}
            setFromDate={setDraftFrom}
            toDate={draftTo}
            setToDate={setDraftTo}
            onApply={() => {
              if (draftFrom && draftTo) {
                setCustomDates(draftFrom, draftTo);
              }
              setShowCalendar(false);
            }}
            onClose={() => setShowCalendar(false)}
            anchorRef={customBtnRef}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
