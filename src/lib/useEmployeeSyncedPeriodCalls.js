import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";
import { callFromApiLite } from "./callFromApiLite.js";
import { unwrapApiList } from "./leadSync.js";

const SYNC_COOLDOWN_MS = 90_000;
const CACHE_TTL_MS = 60_000;
const lastFullSyncAt = new Map();
const initialSyncDone = new Set();
const sharedCache = new Map();
const callCacheMeta = new Map();

function isCallCacheFresh(key) {
  const meta = callCacheMeta.get(key);
  const cached = sharedCache.get(key);
  if (!meta || !cached || Date.now() - meta.ts >= CACHE_TTL_MS) return false;
  if (cached.length > 0) return true;
  return Boolean(meta.synced);
}

/**
 * Period calls with Callyzer sync — same flow as Employee Call Reporting page.
 * Period switches use cached / DB reads first; full sync is throttled.
 */
export function useEmployeeSyncedPeriodCalls(employeeId, period = "month", leads = [], enabled = true) {
  const rawRef = useRef([]);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const reqIdRef = useRef(0);

  const cacheKey = employeeId ? `${employeeId}:${period}` : "";
  const [calls, setCalls] = useState(() => sharedCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const applyMapped = useCallback((rawItems, key, synced = false) => {
    const mapped = Array.isArray(rawItems)
      ? rawItems.map((c) => callFromApiLite(c, leadsRef.current))
      : [];
    rawRef.current = rawItems || [];
    if (key) {
      sharedCache.set(key, mapped);
      callCacheMeta.set(key, { ts: Date.now(), synced });
    }
    setCalls(mapped);
    return mapped;
  }, []);

  const fetchCalls = useCallback(async ({ sync = false, silent = false } = {}) => {
    if (!enabled || !employeeId) {
      setCalls([]);
      setLoading(false);
      return;
    }

    const key = `${employeeId}:${period}`;
    const cached = sharedCache.get(key);
    if (!sync && isCallCacheFresh(key)) {
      setCalls(cached);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent && !cached?.length) setLoading(true);
    if (sync) setSyncing(true);

    const reqId = ++reqIdRef.current;
    try {
      const res = await apiGet(
        `/api/v1/employee/${employeeId}/calls?period=${encodeURIComponent(period)}&sync=${sync ? 1 : 0}&limit=5000`,
        {
          headers: getCrmHeaders("employee"),
          skipCache: sync,
          cacheTtl: sync ? 0 : 30_000,
        },
      );
      if (reqId !== reqIdRef.current) return;
      applyMapped(unwrapApiList(res) || [], key, sync);
      if (sync) lastFullSyncAt.set(String(employeeId), Date.now());
    } catch {
      if (reqId !== reqIdRef.current) return;
      if (!cached?.length) setCalls([]);
    } finally {
      if (reqId === reqIdRef.current) {
        if (sync) setSyncing(false);
        if (!silent) setLoading(false);
      }
    }
  }, [enabled, employeeId, period, applyMapped]);

  useEffect(() => {
    if (!enabled || !employeeId) return undefined;

    const key = `${employeeId}:${period}`;
    const scope = String(employeeId);
    const cached = sharedCache.get(key);
    if (cached?.length) {
      setCalls(cached);
      setLoading(false);
    }

    const firstVisit = !initialSyncDone.has(scope);
    if (firstVisit) {
      initialSyncDone.add(scope);
      // DB first (instant), then Callyzer sync in background.
      fetchCalls({ sync: false, silent: Boolean(cached?.length) });
      fetchCalls({ sync: true, silent: true });
    } else if (!isCallCacheFresh(key)) {
      fetchCalls({ sync: false, silent: Boolean(cached?.length) });
    }

    const age = Date.now() - (lastFullSyncAt.get(scope) || 0);
    let syncTimer;
    if (!firstVisit && age >= SYNC_COOLDOWN_MS) {
      syncTimer = window.setTimeout(() => {
        fetchCalls({ sync: true, silent: true });
      }, 500);
    }

    const onRefresh = () => {
      fetchCalls({ sync: false, silent: true });
      fetchCalls({ sync: true, silent: true });
    };
    window.addEventListener("callyzer:refresh", onRefresh);

    return () => {
      if (syncTimer) window.clearTimeout(syncTimer);
      window.removeEventListener("callyzer:refresh", onRefresh);
    };
  }, [employeeId, period, enabled, fetchCalls]);

  const prefetchedRef = useRef(null);
  useEffect(() => {
    if (!enabled || !employeeId) return undefined;
    const scope = String(employeeId);
    if (!initialSyncDone.has(scope)) return undefined;
    if (prefetchedRef.current === scope) return undefined;
    prefetchedRef.current = scope;

    ["today", "week", "month"].forEach((p) => {
      const key = `${employeeId}:${p}`;
      if (isCallCacheFresh(key)) return;
      apiGet(
        `/api/v1/employee/${employeeId}/calls?period=${p}&sync=0&limit=5000`,
        { headers: getCrmHeaders("employee"), cacheTtl: 30_000 },
      )
        .then((res) => {
          const mapped = (unwrapApiList(res) || []).map((c) => callFromApiLite(c, leadsRef.current));
          if (mapped.length > 0) {
            sharedCache.set(key, mapped);
            callCacheMeta.set(key, { ts: Date.now(), synced: false });
          }
        })
        .catch(() => {});
    });
  }, [employeeId, enabled]);

  useEffect(() => {
    const key = `${employeeId}:${period}`;
    if (rawRef.current.length) {
      applyMapped(rawRef.current, key);
      return;
    }
    const cached = sharedCache.get(key);
    if (cached?.length) setCalls(cached);
  }, [leads, employeeId, period, applyMapped]);

  return {
    calls,
    loading,
    syncing,
    refresh: () => fetchCalls({ sync: true, silent: true }),
  };
}
