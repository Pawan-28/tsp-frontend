import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders } from "./crmContext.js";
import { callFromApiLite } from "./callFromApiLite.js";
import { unwrapApiList } from "./leadSync.js";

const SYNC_COOLDOWN_MS = 90_000;
let lastFullSyncAt = 0;
let adminInitialSyncDone = false;
const sharedCache = new Map();

/** Admin tenant calls for pipeline — Callyzer DB only (no dummy data). */
export function useAdminSyncedPeriodCalls(period = "month", leads = [], enabled = true) {
  const rawRef = useRef([]);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;
  const reqIdRef = useRef(0);

  const cacheKey = `admin:${period}`;
  const [calls, setCalls] = useState(() => sharedCache.get(cacheKey) || []);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const applyMapped = useCallback((rawItems, key) => {
    const mapped = Array.isArray(rawItems)
      ? rawItems.map((c) => callFromApiLite(c, leadsRef.current))
      : [];
    rawRef.current = rawItems || [];
    if (key) sharedCache.set(key, mapped);
    setCalls(mapped);
  }, []);

  const fetchCalls = useCallback(async ({ sync = false, silent = false } = {}) => {
    if (!enabled) {
      setCalls([]);
      setLoading(false);
      return;
    }

    const key = `admin:${period}`;
    const cached = sharedCache.get(key);
    if (!sync && cached?.length) {
      setCalls(cached);
      if (!silent) setLoading(false);
      return;
    }

    if (!silent && !cached?.length) setLoading(true);
    if (sync) setSyncing(true);

    const reqId = ++reqIdRef.current;
    try {
      const res = await apiGet(
        `/api/v1/calls?period=${encodeURIComponent(period)}&limit=10000&sync=${sync ? 1 : 0}`,
        { headers: getAdminCrmHeaders(), skipCache: sync, cacheTtl: sync ? 0 : 30_000 },
      );
      if (reqId !== reqIdRef.current) return;
      applyMapped(unwrapApiList(res) || [], key);
      if (sync) lastFullSyncAt = Date.now();
    } catch {
      if (reqId !== reqIdRef.current) return;
      if (!cached?.length) setCalls([]);
    } finally {
      if (reqId === reqIdRef.current) {
        if (sync) setSyncing(false);
        if (!silent) setLoading(false);
      }
    }
  }, [enabled, period, applyMapped]);

  useEffect(() => {
    if (!enabled) return undefined;

    const key = `admin:${period}`;
    const cached = sharedCache.get(key);
    if (cached?.length) {
      setCalls(cached);
      setLoading(false);
    }

    const firstVisit = !adminInitialSyncDone;
    if (firstVisit) {
      adminInitialSyncDone = true;
      fetchCalls({ sync: false, silent: Boolean(cached?.length) });
      fetchCalls({ sync: true, silent: true });
    } else if (!cached?.length) {
      fetchCalls({ sync: false, silent: false });
    }

    let syncTimer;
    if (!firstVisit && Date.now() - lastFullSyncAt >= SYNC_COOLDOWN_MS) {
      syncTimer = window.setTimeout(() => fetchCalls({ sync: true, silent: true }), 500);
    }

    return () => {
      if (syncTimer) window.clearTimeout(syncTimer);
    };
  }, [period, enabled, fetchCalls]);

  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (!enabled || !adminInitialSyncDone || prefetchedRef.current) return undefined;
    prefetchedRef.current = true;

    ["today", "week", "month"].forEach((p) => {
      const key = `admin:${p}`;
      if (sharedCache.get(key)?.length) return;
      apiGet(`/api/v1/calls?period=${p}&limit=5000&sync=0`, {
        headers: getAdminCrmHeaders(),
        cacheTtl: 30_000,
      })
        .then((res) => {
          const mapped = (unwrapApiList(res) || []).map((c) => callFromApiLite(c, leadsRef.current));
          if (mapped.length > 0) sharedCache.set(key, mapped);
        })
        .catch(() => {});
    });
  }, [enabled]);

  useEffect(() => {
    if (!rawRef.current.length) return;
    applyMapped(rawRef.current, `admin:${period}`);
  }, [leads, period, applyMapped]);

  return { calls, loading, syncing };
}
