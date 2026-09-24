import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";
import { CALLYZER_POLL_INTERVAL_MS } from "./useCallyzerStats.js";

const PERIOD_QUERY = {
  day: "period=today",
  today: "period=today",
  week: "period=week",
  month: "period=month",
};

export function teamCallyzerPeriodQuery(period, month) {
  if (month) return `month=${month}`;
  return PERIOD_QUERY[period] || PERIOD_QUERY.month;
}

/** Per-employee Callyzer stats for Team Management (admin API, DB-backed). */
export function useTeamEmployeeCallyzerStats(employeeId, period = "month", enabled = true) {
  const [stats, setStats] = useState(null);
  const [employeeName, setEmployeeName] = useState(null);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [message, setMessage] = useState(null);
  const [periodLabel, setPeriodLabel] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled || !employeeId) return;
    if (!silent) setLoading(true);

    try {
      const data = await apiGet(
        `/api/team/employees/${employeeId}/callyzer-stats?${teamCallyzerPeriodQuery(period)}`,
        { skipCache: true, cacheTtl: 0 },
      );
      setConfigured(Boolean(data?.configured ?? true));
      setStats(data?.stats || null);
      setEmployeeName(data?.employeeName || data?.stats?.empName || null);
      setMessage(data?.message || null);
      setPeriodLabel(data?.label || "");
    } catch (err) {
      if (!silent) {
        setStats(null);
        setMessage(err.message || "Could not load employee call stats");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId, period, enabled]);

  useEffect(() => {
    if (!enabled || !employeeId) return undefined;

    load({ silent: false });

    const poll = () => {
      if (document.hidden) return;
      load({ silent: true });
    };

    const intervalId = window.setInterval(poll, CALLYZER_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, enabled, employeeId]);

  return { stats, employeeName, loading, configured, message, periodLabel, refresh: () => load({ silent: true }) };
}

/** All employees' call stats for Team Management overview table. */
export function useTeamCallyzerStats(period = "today", enabled = true) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(true);
  const [periodLabel, setPeriodLabel] = useState("");

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    if (!silent) setLoading(true);

    try {
      const data = await apiGet(
        `/api/team/callyzer-stats?${teamCallyzerPeriodQuery(period)}`,
        { skipCache: true, cacheTtl: 0 },
      );
      setConfigured(Boolean(data?.configured ?? true));
      setStats(Array.isArray(data?.stats) ? data.stats : []);
      setPeriodLabel(data?.label || "");
    } catch {
      if (!silent) setStats([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    load({ silent: false });

    const poll = () => {
      if (document.hidden) return;
      load({ silent: true });
    };

    const intervalId = window.setInterval(poll, CALLYZER_POLL_INTERVAL_MS);
    const onVisibility = () => {
      if (!document.hidden) load({ silent: true });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, enabled]);

  return { stats, loading, configured, periodLabel, refresh: () => load({ silent: true }) };
}
