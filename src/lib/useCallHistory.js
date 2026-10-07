import { useEffect, useState } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders, getCrmHeaders } from "./crmContext.js";

/**
 * Full call history per person (phone) — what the Pipeline needs to place a lead in
 * Lead / Not Pick / Short Call / Conversation from what really happened on the phone (all employees, all dates),
 * not from a stale stored stage or from only the calls of the selected period / current owner.
 * See backend/src/utils/callHistory.js and columnFromCallHistory() in lib/leadKanban.js.
 *
 * Returns { callHistory, callHistoryVersion }. While it is loading (or if the request fails) `callHistory` is
 * null and the board falls back to its previous period-calls rule — it never breaks the page.
 */
const cache = new Map(); // scope key -> { data, version }

export function invalidateCallHistory() {
  cache.clear();
}

export function useCallHistory({ scope = "employee", employeeId = null, enabled = true, refreshKey = "" } = {}) {
  const key = scope === "employee" ? `emp:${employeeId}` : "admin";
  const ready = enabled && (scope !== "employee" || Boolean(employeeId));
  const [state, setState] = useState(() => ({ key, ...(cache.get(key) || { data: null, version: 0 }) }));

  useEffect(() => {
    if (!ready) return undefined;
    let cancelled = false;
    const cached = cache.get(key);
    if (cached) setState({ key, ...cached });
    const path = scope === "employee"
      ? `/api/v1/employee/${employeeId}/call-history`
      : "/api/v1/pipeline/call-history";
    const headers = scope === "employee" ? getCrmHeaders("employee") : getAdminCrmHeaders();
    // refreshKey changes when new calls arrive -> bypass the response cache so the columns follow the new call
    apiGet(path, { headers, skipCache: Boolean(cached), cacheTtl: cached ? 0 : 30_000 })
      .then((res) => {
        if (cancelled) return;
        const data = res?.data && typeof res.data === "object" && !Array.isArray(res.data) ? res.data : null;
        if (!data) return;
        const next = { data, version: (cache.get(key)?.version || 0) + 1 };
        cache.set(key, next);
        setState({ key, ...next });
      })
      .catch(() => { /* keep whatever we had; the board falls back to the period-calls rule */ });
    return () => { cancelled = true; };
  }, [key, ready, scope, employeeId, refreshKey]);

  const current = state.key === key ? state : { data: cache.get(key)?.data ?? null, version: cache.get(key)?.version ?? 0 };
  return { callHistory: current.data, callHistoryVersion: current.version };
}
