import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";

export const CALLYZER_PERIOD_MAP = {
  Today: "today",
  "This Week": "week",
  "This Month": "month",
  today: "today",
  week: "week",
  month: "month",
};

/** How often the UI polls for fresh Callyzer stats while the tab is visible. */
export const CALLYZER_POLL_INTERVAL_MS = 45_000;
/** Full Callyzer API sync runs at most this often (background). */
export const CALLYZER_FULL_SYNC_INTERVAL_MS = 60_000;

// Global in-flight deduplication + result cache (per key)
const inflight = new Map();
const resultCache = new Map();
const CACHE_TTL = 30_000;

function fetchCallyzerStats(employeeId, mapped, { force = false, sync = false } = {}) {
  const key = `callyzer_emp_${employeeId}_${mapped}_sync${sync ? 1 : 0}`;

  if (force) {
    resultCache.delete(key);
  } else {
    const cached = resultCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
  }

  if (inflight.has(key)) return inflight.get(key);

  const syncQuery = sync ? "sync=1" : "sync=0";
  const forceQuery = force && sync ? "&force=1" : "";
  const promise = apiGet(
    `/api/v1/employee/${employeeId}/callyzer/stats?period=${mapped}&${syncQuery}${forceQuery}`,
    { cacheTtl: sync ? 0 : CACHE_TTL, skipCache: sync || force },
  )
    .then((res) => {
      const data = res?.data ?? res;
      resultCache.set(key, { data, ts: Date.now() });
      // Fast DB reads satisfy both cache keys until a full sync completes.
      if (!sync) {
        resultCache.set(`callyzer_emp_${employeeId}_${mapped}_sync1`, { data, ts: Date.now() });
      }
      return data;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
  return promise;
}

export function invalidateCallyzerStatsCache(employeeId, period) {
  if (employeeId != null && period != null) {
    const mapped = CALLYZER_PERIOD_MAP[period] || period || "today";
    resultCache.delete(`callyzer_emp_${employeeId}_${mapped}_sync0`);
    resultCache.delete(`callyzer_emp_${employeeId}_${mapped}_sync1`);
    return;
  }
  resultCache.clear();
  teamResultCache.clear();
}

export function useCallyzerStats(employeeId, period, enabled = true) {
  const mapped = CALLYZER_PERIOD_MAP[period] || "today";
  const statsCacheRef = useRef({});
  const [stats, setStats] = useState(() => statsCacheRef.current[mapped] ?? null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const lastFullSyncRef = useRef(0);

  const applyStats = useCallback((data, mappedPeriod) => {
    if (!data) return;
    setConfigured(Boolean(data?.configured));
    if (data?.stats) {
      statsCacheRef.current[mappedPeriod] = data.stats;
      setStats(data.stats);
    }
    setMessage(data?.message || null);
    setLastUpdated(data?.syncedAt ? new Date(data.syncedAt) : new Date());
  }, []);

  const loadStats = useCallback(async ({ silent = false, force = false, sync = false } = {}) => {
    if (!enabled || !employeeId) return;

    const periodKey = CALLYZER_PERIOD_MAP[period] || "today";
    const hasCached = Boolean(statsCacheRef.current[periodKey]);

    if (!silent && !hasCached) setLoading(true);
    if (sync) setSyncing(true);

    try {
      const data = await fetchCallyzerStats(employeeId, periodKey, { force, sync });
      applyStats(data, periodKey);
      if (sync) lastFullSyncRef.current = Date.now();
    } catch (err) {
      if (!silent && !hasCached) {
        setStats(null);
        setMessage(err.message || "Could not load Callyzer stats");
      }
    } finally {
      if (sync) setSyncing(false);
      if (!silent) setLoading(false);
    }
  }, [employeeId, period, enabled, applyStats]);

  // Instant DB stats on period switch, then background Callyzer sync.
  useEffect(() => {
    if (!enabled || !employeeId) return undefined;

    const periodKey = CALLYZER_PERIOD_MAP[period] || "today";
    if (statsCacheRef.current[periodKey]) {
      setStats(statsCacheRef.current[periodKey]);
    }

    loadStats({ silent: Boolean(statsCacheRef.current[periodKey]), force: false, sync: false });

    // Don't re-sync Callyzer on every Today/Week/Month toggle — only when cooldown expires.
    let syncTimer;
    const needsFullSyncOnOpen = Date.now() - lastFullSyncRef.current >= CALLYZER_FULL_SYNC_INTERVAL_MS;
    if (needsFullSyncOnOpen) {
      syncTimer = window.setTimeout(() => {
        loadStats({ silent: true, force: true, sync: true });
      }, 500);
    }

    const poll = () => {
      if (document.hidden) return;
      const needsFullSync = Date.now() - lastFullSyncRef.current >= CALLYZER_FULL_SYNC_INTERVAL_MS;
      loadStats({ silent: true, force: !needsFullSync, sync: needsFullSync });
    };

    const intervalId = window.setInterval(poll, CALLYZER_POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) {
        loadStats({ silent: true, force: false, sync: false });
        if (Date.now() - lastFullSyncRef.current >= CALLYZER_FULL_SYNC_INTERVAL_MS) {
          window.setTimeout(() => loadStats({ silent: true, force: true, sync: true }), 500);
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onManualRefresh = (event) => {
      const detailId = event?.detail?.employeeId;
      if (detailId != null && String(detailId) !== String(employeeId)) return;
      loadStats({ silent: true, force: true, sync: true });
    };
    window.addEventListener("callyzer:refresh", onManualRefresh);

    return () => {
      window.clearTimeout(syncTimer);
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("callyzer:refresh", onManualRefresh);
    };
  }, [employeeId, period, enabled, loadStats]);

  useEffect(() => {
    if (!enabled || !employeeId) return undefined;
    ["today", "week", "month"].forEach((p) => {
      const active = CALLYZER_PERIOD_MAP[period] || "today";
      if (p === active || statsCacheRef.current[p]) return;
      fetchCallyzerStats(employeeId, p, { sync: false })
        .then((data) => {
          if (data?.stats) statsCacheRef.current[p] = data.stats;
        })
        .catch(() => {});
    });
  }, [employeeId, period, enabled]);

  return {
    stats,
    loading,
    syncing,
    configured,
    message,
    lastUpdated,
    refresh: () => {
      loadStats({ silent: true, force: false, sync: false });
      return loadStats({ silent: true, force: true, sync: true });
    },
  };
}

const teamInflight = new Map();
const teamResultCache = new Map();

function fetchCallyzerTeamStats(mapped, { force = false } = {}) {
  const key = `callyzer_team_${mapped}`;

  if (force) {
    teamResultCache.delete(key);
  } else {
    const cached = teamResultCache.get(key);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return Promise.resolve(cached.data);
    }
  }

  if (teamInflight.has(key)) return teamInflight.get(key);

  const promise = apiGet(
    `/api/v1/callyzer/team-stats?period=${mapped}`,
    { cacheTtl: CACHE_TTL, skipCache: force },
  )
    .then((res) => {
      const data = res?.data ?? res;
      teamResultCache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => {
      teamInflight.delete(key);
    });

  teamInflight.set(key, promise);
  return promise;
}

export function useCallyzerTeamStats(period, enabled = true) {
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [configured, setConfigured] = useState(false);

  const loadStats = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!enabled) return;

    const mapped = CALLYZER_PERIOD_MAP[period] || period || "today";
    if (!silent) setLoading(true);

    try {
      const data = await fetchCallyzerTeamStats(mapped, { force });
      setConfigured(Boolean(data?.configured));
      setStats(Array.isArray(data?.stats) ? data.stats : []);
    } catch {
      if (!silent) setStats([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [period, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;

    loadStats({ silent: false, force: false });

    const poll = () => {
      if (document.hidden) return;
      loadStats({ silent: true, force: false });
    };

    const intervalId = window.setInterval(poll, CALLYZER_POLL_INTERVAL_MS);

    const onVisibility = () => {
      if (!document.hidden) loadStats({ silent: true, force: false });
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [period, enabled, loadStats]);

  return { stats, loading, configured, refresh: () => loadStats({ silent: true, force: true }) };
}

export function dispatchCallyzerRefresh(employeeId) {
  window.dispatchEvent(new CustomEvent("callyzer:refresh", {
    detail: employeeId != null ? { employeeId } : {},
  }));
}
