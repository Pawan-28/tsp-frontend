import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders } from "./crmContext.js";
import { CALLYZER_PERIOD_MAP, CALLYZER_POLL_INTERVAL_MS } from "./useCallyzerStats.js";

/** Tenant-wide call stats from DB — same shape as employee Callyzer stats. */
export function useTenantCallyzerStats(period, enabled = true) {
  const mapped = CALLYZER_PERIOD_MAP[period] || "month";
  const statsCacheRef = useRef({});
  const [stats, setStats] = useState(() => statsCacheRef.current[mapped] ?? null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) return;
    const hasCached = Boolean(statsCacheRef.current[mapped]);
    if (!silent && !hasCached) setLoading(true);
    try {
      const res = await apiGet(
        `/api/v1/callyzer/stats?period=${mapped}`,
        { headers: getAdminCrmHeaders(), cacheTtl: 30_000 },
      );
      const data = res?.data ?? res;
      if (data?.stats) {
        statsCacheRef.current[mapped] = data.stats;
        setStats(data.stats);
      }
    } catch {
      if (!silent && !hasCached) setStats(null);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [mapped, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    if (statsCacheRef.current[mapped]) setStats(statsCacheRef.current[mapped]);
    loadStats({ silent: Boolean(statsCacheRef.current[mapped]) });
    const intervalId = window.setInterval(() => {
      if (!document.hidden) loadStats({ silent: true });
    }, CALLYZER_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [mapped, enabled, loadStats]);

  return { stats, loading, refresh: () => loadStats({ silent: true }) };
}
