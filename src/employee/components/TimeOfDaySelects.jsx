import { FormSelect } from "./EmpUI.jsx";
import {
  formatTime24,
  parseTime12,
  TIME_HOUR_OPTIONS,
  TIME_MINUTE_OPTIONS,
} from "../../lib/time12.js";

const TIME_SELECT_BASE =
  "min-h-[40px] py-2 border border-slate-200 rounded-lg sm:rounded-xl bg-slate-50 text-slate-800 text-xs sm:text-sm font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 appearance-auto";

const HOUR_SELECT_CLASS =
  "!w-14 !min-w-[3.25rem] shrink-0 text-center px-1.5 tabular-nums";
const MINUTE_SELECT_CLASS =
  "!w-14 !min-w-[3.25rem] shrink-0 text-center px-1.5 tabular-nums";
const AMPM_SELECT_CLASS =
  "!w-16 !min-w-[3.5rem] shrink-0 text-center px-1.5";

export function TimeOfDaySelects({
  value = "14:00",
  onChange,
  selectClassName = "",
  SelectComponent = FormSelect,
}) {
  const { hour, minute, ampm } = parseTime12(value);
  const selectClass = (extra) => [TIME_SELECT_BASE, selectClassName, extra].filter(Boolean).join(" ");

  const update = (nextHour, nextMinute, nextAmpm) => {
    onChange(formatTime24(nextHour, nextMinute, nextAmpm));
  };

  return (
    <div className="flex gap-1.5 items-center min-w-0">
      <SelectComponent
        value={hour}
        onChange={(e) => update(e.target.value, minute, ampm)}
        className={selectClass(HOUR_SELECT_CLASS)}
        aria-label="Hour"
      >
        {TIME_HOUR_OPTIONS.map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </SelectComponent>
      <span className="text-slate-400 font-bold shrink-0">:</span>
      <SelectComponent
        value={minute}
        onChange={(e) => update(hour, e.target.value, ampm)}
        className={selectClass(MINUTE_SELECT_CLASS)}
        aria-label="Minute"
      >
        {TIME_MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{m}</option>
        ))}
      </SelectComponent>
      <SelectComponent
        value={ampm}
        onChange={(e) => update(hour, minute, e.target.value)}
        className={selectClass(AMPM_SELECT_CLASS)}
        aria-label="AM or PM"
      >
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </SelectComponent>
    </div>
  );
}
