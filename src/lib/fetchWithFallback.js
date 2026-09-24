import { apiGet } from "./api.js";

/**
 * Fetch API data; on failure return fallback (mock). Keeps mock files as offline fallback.
 */
export async function fetchWithFallback(path, fallback, options = {}) {
  try {
    const data = await apiGet(path, { skipCache: true, cacheTtl: 0, ...options });
    return { data, source: "api", ok: true };
  } catch (err) {
    const fb = typeof fallback === "function" ? fallback() : fallback;
    return { data: fb, source: "mock", ok: false, error: err };
  }
}

export function mergeFilterData(_mockFilterData, apiFilterData) {
  if (!apiFilterData) return null;
  return apiFilterData;
}
