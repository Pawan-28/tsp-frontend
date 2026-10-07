import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  emptyRangeState,
  isValidCustomRange,
  yesterdayKey,
  getDateBounds,
  presetToApiLabel,
} from "../lib/dateRange.js";

const STORAGE_KEY = "crm_date_range_by_route";
const DateRangeContext = createContext(null);

// Never keep a "custom" range that has no valid From/To (empty, malformed or From > To):
// drop it so the route falls back to its default preset instead of showing a dead Custom pill.
function sanitizeRoute(pathname, state) {
  if (!state || typeof state !== "object") return emptyRangeState(pathname);
  if (state.preset === "custom" && !isValidCustomRange(state.fromDate, state.toDate)) {
    return emptyRangeState(pathname);
  }
  return state;
}

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    return Object.fromEntries(Object.entries(parsed).map(([path, st]) => [path, sanitizeRoute(path, st)]));
  } catch {
    return {};
  }
}

export function DateRangeProvider({ children }) {
  const { pathname } = useLocation();
  const [byRoute, setByRoute] = useState(loadStored);

  useEffect(() => {
    const id = window.setTimeout(() => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(byRoute));
      } catch {
        // ignore
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [byRoute]);

  const stored = sanitizeRoute(pathname, byRoute[pathname]);
  // Old sessions may still hold "week" (tab removed) -> fall back to Month.
  const uiPreset = stored.preset === "week" ? "month" : stored.preset;
  // "Yesterday" is served to every page as a one-day custom range, so no page/API needs a new preset.
  const current = uiPreset === "yesterday"
    ? { preset: "custom", fromDate: yesterdayKey(), toDate: yesterdayKey() }
    : { ...stored, preset: uiPreset };

  const setPreset = (preset) => {
    setByRoute((prev) => ({
      ...prev,
      [pathname]: {
        ...(prev[pathname] ?? emptyRangeState(pathname)),
        preset,
        ...(preset !== "custom" ? { fromDate: "", toDate: "" } : {}),
      },
    }));
  };

  const setCustomDates = (fromDate, toDate) => {
    if (!isValidCustomRange(fromDate, toDate)) return false;
    setByRoute((prev) => ({
      ...prev,
      [pathname]: { preset: "custom", fromDate, toDate },
    }));
    return true;
  };

  const resetRange = () => {
    setByRoute((prev) => ({ ...prev, [pathname]: emptyRangeState(pathname) }));
  };

  const value = useMemo(
    () => ({
      pathname,
      preset: current.preset,
      uiPreset,
      fromDate: current.fromDate,
      toDate: current.toDate,
      apiLabel: presetToApiLabel(current.preset),
      bounds: getDateBounds(current.preset, current.fromDate, current.toDate),
      setPreset,
      setCustomDates,
      resetRange,
    }),
    [pathname, current.preset, current.fromDate, current.toDate, uiPreset],
  );

  return (
    <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>
  );
}

export function useDateRange() {
  const ctx = useContext(DateRangeContext);
  if (!ctx) {
    throw new Error("useDateRange must be used within DateRangeProvider");
  }
  return ctx;
}
