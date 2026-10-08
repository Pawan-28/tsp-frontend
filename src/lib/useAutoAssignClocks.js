import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";

/**
 * The 3-day stuck-lead clocks of the signed-in employee (every lead for an admin). Empty - and nothing is shown - until an admin
 * switches the feature on in Settings. Refreshed every 5 minutes and when the tab comes back to the front; the countdown text itself
 * is recomputed from each deadline, so it stays right in between.
 */
const REFRESH_MS = 5 * 60 * 1000;
const DEDUPE_MS = 30 * 1000;
const shared = new Map(); // variant -> { at, promise }

function loadClocks(variant, getHeaders) {
  const hit = shared.get(variant);
  if (hit && Date.now() - hit.at < DEDUPE_MS) return hit.promise;
  const promise = apiGet("/api/v1/auto-reassign/clocks", { headers: getHeaders?.(), skipCache: true, cacheTtl: 0 })
    .then((res) => res?.data || { enabled: false, clocks: {} })
    .catch(() => ({ enabled: false, clocks: {} }));
  shared.set(variant, { at: Date.now(), promise });
  return promise;
}

export function useAutoAssignClocks(variant = "employee", getHeaders) {
  const [state, setState] = useState({ enabled: false, clocks: {} });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => loadClocks(variant, getHeaders).then((data) => { if (!cancelled) setState({ enabled: Boolean(data.enabled), clocks: data.clocks || {} }); });
    refresh();
    const timer = setInterval(refresh, REFRESH_MS);
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [variant]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The clock of a lead object from the board / lead panel (its database id), or null. */
  const clockFor = useCallback((lead) => {
    if (!state.enabled || !lead) return null;
    const id = lead._dbId ?? lead.id;
    return state.clocks[String(id)] || null;
  }, [state]);

  return { enabled: state.enabled, clocks: state.clocks, clockFor };
}
