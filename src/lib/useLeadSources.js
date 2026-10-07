import { useCallback, useEffect, useState } from "react";
import { apiGet, apiPost } from "./api.js";

/**
 * The lead sources every source dropdown offers = exactly the sources on the admin Sources page (GET /api/v1/lead-sources), plus any
 * the admin / an employee creates with "+ Add new..." (POST /api/v1/lead-sources) - those show on the admin Sources page at once.
 */
const TTL_MS = 30_000;
let cache = null;          // { at, sources }
let inflight = null;
const listeners = new Set();

const FALLBACK = [
  { key: "meta_ads", label: "Meta" },
  { key: "google_ads", label: "Google Ads" },
  { key: "website", label: "Website" },
  { key: "referral", label: "Referral" },
];

const toList = (res) => {
  const data = res && Array.isArray(res.data) ? res.data : Array.isArray(res) ? res : null;
  return data ? data.filter((s) => s && s.key && s.label).map((s) => ({ key: s.key, label: s.label, leadCount: s.leadCount || 0, custom: Boolean(s.custom) })) : null;
};

function publish(sources) {
  cache = { at: Date.now(), sources };
  for (const fn of listeners) fn(sources);
}

export async function fetchLeadSources(headers, { force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.sources;
  if (inflight) return inflight;
  inflight = apiGet("/api/v1/lead-sources", { headers, skipCache: true })
    .then((res) => {
      const list = toList(res);
      if (!list) throw new Error("Could not load sources");
      publish(list);
      return list;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/** Create a source (or get the existing one). Returns the source { key, label }. Throws with a readable message. */
export async function createLeadSource(label, headers) {
  const res = await apiPost("/api/v1/lead-sources", { label }, { headers });
  const list = toList(res);
  if (list) publish(list);
  const source = res && res.source ? res.source : (list || []).find((s) => s.label.toLowerCase() === String(label).trim().toLowerCase());
  if (!source || !source.key) throw new Error("The source could not be saved");
  return { key: source.key, label: source.label, created: Boolean(res.created), alreadyExists: Boolean(res.alreadyExists) };
}

/** Test helper: forget the cached list. */
export function resetLeadSourcesCache() {
  cache = null;
  inflight = null;
}

/**
 * @param {() => object} getHeaders  getAdminCrmHeaders / getCrmHeaders
 * @returns {{ sources: {key,label}[], options: string[], loading: boolean, failed: boolean, addSource: (label: string) => Promise<{key,label}> }}
 */
export function useLeadSources(getHeaders) {
  const [sources, setSources] = useState(cache ? cache.sources : null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const onChange = (list) => { if (alive) setSources(list); };
    listeners.add(onChange);
    fetchLeadSources(getHeaders()).then((list) => { if (alive) { setSources(list); setFailed(false); } }).catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; listeners.delete(onChange); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addSource = useCallback(async (label) => createLeadSource(label, getHeaders()), []); // eslint-disable-line react-hooks/exhaustive-deps

  // If the list cannot be loaded the form still works with the four core sources (never an empty dropdown).
  const list = sources || (failed ? FALLBACK : []);
  return { sources: list, options: list.map((s) => s.label), loading: !sources && !failed, failed, addSource };
}
