import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import { CustomDatePopover } from "./DateRangeFilter.jsx";
import { PERIOD_PILL_BTN, PERIOD_PILL_ACTIVE, PERIOD_PILL_INACTIVE } from "../lib/dateRange.js";
import { useHeaderPopover } from "../hooks/useHeaderPopover.js";

// Lead pipeline board tabs: Today | Yesterday | Week | Month | Custom
const PIPELINE_TABS = [
  { id: "today", label: "Today", shortLabel: "Today" },
  { id: "yesterday", label: "Yesterday", shortLabel: "Yest." },
  { id: "week", label: "Week", shortLabel: "Week" },
  { id: "month", label: "Month", shortLabel: "Month" },
  { id: "custom", label: "Custom", shortLabel: "Custom" },
];

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pipeline date filter shared by the admin and employee headers: Today | Yesterday | Week | Month | Custom,
 * with the same pill styling and custom From/To popover as the Admin Dashboard (DateRangeFilter).
 * State lives in the URL (?period=custom&from=YYYY-MM-DD&to=YYYY-MM-DD) so it survives refresh; the
 * Pipeline pages (admin Pipeline.jsx, employee EmployeeLeads.jsx) turn it into the board API query.
 */
export default function PipelineDateFilter({ currentPeriod, fromDate, toDate, onSelect, onApplyCustom, compact = false }) {
  // Same store as the other header menus: opening it closes them, and Esc / outside click close it.
  const popoverId = useId();
  const [showCalendar, setShowCalendar] = useHeaderPopover(`pipeline-date-${popoverId}`);
  const [draftFrom, setDraftFrom] = useState(fromDate || "");
  const [draftTo, setDraftTo] = useState(toDate || "");
  const customBtnRef = useRef(null);

  useEffect(() => {
    setDraftFrom(fromDate || "");
    setDraftTo(toDate || "");
  }, [fromDate, toDate]);

  const hasCustom = currentPeriod === "custom" && fromDate && toDate;

  return (
    <div className={compact ? "grid grid-cols-5 gap-1 w-full min-w-0" : "flex items-center gap-0.5 sm:gap-1 flex-shrink-0 min-w-0"}>
      {PIPELINE_TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          ref={t.id === "custom" ? customBtnRef : undefined}
          onClick={() => {
            if (t.id === "custom") {
              setShowCalendar(true);
            } else {
              setShowCalendar(false);
              onSelect(t.id);
            }
          }}
          className={`${PERIOD_PILL_BTN} ${compact ? "w-full inline-flex items-center justify-center px-1 text-[9px] sm:text-[10px]" : ""} ${currentPeriod === t.id ? PERIOD_PILL_ACTIVE : PERIOD_PILL_INACTIVE}`}
        >
          {t.id === "custom" && hasCustom ? (
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
        {showCalendar && (
          <CustomDatePopover
            fromDate={draftFrom}
            setFromDate={setDraftFrom}
            toDate={draftTo}
            setToDate={setDraftTo}
            onApply={() => {
              // Both dates are required; keep the popover open until they're set.
              if (!DATE_KEY_RE.test(draftFrom) || !DATE_KEY_RE.test(draftTo)) return;
              // Keep From <= To (To date is inclusive on the server).
              const [from, to] = draftFrom <= draftTo ? [draftFrom, draftTo] : [draftTo, draftFrom];
              onApplyCustom(from, to);
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
