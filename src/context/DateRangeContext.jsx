import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  emptyRangeState,
  getDateBounds,
  presetToApiLabel,
} from "../lib/dateRange.js";

const STORAGE_KEY = "crm_date_range_by_route";
const DateRangeContext = createContext(null);

function loadStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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

  const current = byRoute[pathname] ?? emptyRangeState(pathname);

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
    setByRoute((prev) => ({
      ...prev,
      [pathname]: { preset: "custom", fromDate, toDate },
    }));
  };

  const value = useMemo(
    () => ({
      pathname,
      preset: current.preset,
      fromDate: current.fromDate,
      toDate: current.toDate,
      apiLabel: presetToApiLabel(current.preset),
      bounds: getDateBounds(current.preset, current.fromDate, current.toDate),
      setPreset,
      setCustomDates,
    }),
    [pathname, current.preset, current.fromDate, current.toDate],
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
