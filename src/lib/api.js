/**
 * Central API client with in-memory + sessionStorage caching for GET requests.
 * Configure production API via VITE_API_URL (see .env.example).
 */

import { getAuthHeaders, getCrmHeaders } from "./crmContext.js";

const CACHE_PREFIX = "crm_cache:";
const DEFAULT_GET_TTL = 5 * 60 * 1000; // 5 minutes
const memoryCache = new Map();
const inflightGets = new Map();
let lastFetchAt = 0;
const MIN_FETCH_GAP_MS = 350;
const DEFAULT_FETCH_TIMEOUT_MS = 20000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hostinger backend — used when VITE_API_URL is missing from the Vercel build. */
const PRODUCTION_API_BASE =
"https://lavenderblush-butterfly-422992.hostingersite.com";

function isAuthApiPath(path) {
  const raw = String(path || "");
  const pathname = raw.startsWith("http")
    ? (() => { try { return new URL(raw).pathname; } catch { return raw; } })()
    : raw.split("?")[0];
  return pathname.startsWith("/api/auth");
}

/** Private LAN IP (phone/tablet hitting the dev machine's network address). */
function isLanDevHost(host) {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
}

function isLocalDevHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || isLanDevHost(host);
}

function shouldUseDirectBackendUrl() {
  if (typeof window === "undefined") return false;
  if (isLocalDevHost()) return false;
  return true;
}

function resolveDirectApiBase() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl != null && String(envUrl).trim() !== "") {
    return String(envUrl).replace(/\/$/, "");
  }
  return PRODUCTION_API_BASE;
}

export function getApiBase() {
  if (typeof window !== "undefined") {
    return "";
  }
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl != null && String(envUrl).trim() !== "") {
    return String(envUrl).replace(/\/$/, "");
  }
  // SSR / Node must use an absolute backend URL.
  if (import.meta.env.PROD) {
    return PRODUCTION_API_BASE;
  }
  return "https://lavenderblush-butterfly-422992.hostingersite.com";
}

/** True when writes should go to the backend (production API or live session). */
export function shouldPersistToApi(usingApi = false) {
  if (usingApi) return true;
  if (getApiBase()) return true;
  // Browser uses same-origin `/api` (Vercel rewrite or Vite dev proxy).
  return typeof window !== "undefined";
}

function resolveLocalDevApiBase() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl != null && String(envUrl).trim() !== "") {
    return String(envUrl).replace(/\/$/, "");
  }
  // A phone/tablet on the LAN must reach the dev machine's network address, not "localhost".
  if (typeof window !== "undefined" && isLanDevHost(window.location.hostname)) {
    return `http://${window.location.hostname}:5000`;
  }
  return "http://localhost:5000";
}

/** Origin the realtime socket should connect to — mirrors apiUrl's backend resolution. */
export function getSocketBase() {
  if (typeof window === "undefined") return getApiBase();
  if (shouldUseDirectBackendUrl()) return resolveDirectApiBase();
  if (isLocalDevHost()) return resolveLocalDevApiBase();
  return window.location.origin;
}

export function apiUrl(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (typeof window !== "undefined") {
    // Production browsers call Hostinger directly. Vercel /api rewrites share one
    // egress IP; Hostinger rate-limits bursts (429) and the dashboard shows zeros.
    if (shouldUseDirectBackendUrl()) {
      return `${resolveDirectApiBase()}${normalized}`;
    }
    // Local dev: Nitro dev breaks Vite's /api proxy — call Express on :5000 directly.
    if (isLocalDevHost()) {
      return `${resolveLocalDevApiBase()}${normalized}`;
    }
    return normalized;
  }
  const base = getApiBase();
  return base ? `${base}${normalized}` : normalized;
}

function cacheKey(url) {
  return `${CACHE_PREFIX}${url}`;
}

function readSession(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() > parsed.expires) {
      sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function readStaleSession(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data ?? null;
  } catch {
    return null;
  }
}

function readStaleCache(key) {
  const mem = memoryCache.get(key);
  if (mem?.data != null) return mem.data;
  return readStaleSession(key);
}

function staleGetFallback(key) {
  const stale = readStaleCache(key);
  return stale != null ? stale : null;
}

function writeSession(key, data, ttl) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ data, expires: Date.now() + ttl, savedAt: Date.now() }),
    );
  } catch {
    // sessionStorage full — ignore
  }
}

export function invalidateCache(match = "") {
  const needle = match.toLowerCase();
  for (const key of memoryCache.keys()) {
    if (!needle || key.toLowerCase().includes(needle)) {
      memoryCache.delete(key);
    }
  }
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(CACHE_PREFIX) && (!needle || key.toLowerCase().includes(needle))) {
        sessionStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

async function performFetch(url, options = {}) {
  const { timeoutMs = DEFAULT_FETCH_TIMEOUT_MS, skipThrottle = false, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  if (method === "GET") {
    const existing = inflightGets.get(url);
    if (existing) return existing;
  }

  if (!skipThrottle) {
    const gap = lastFetchAt + MIN_FETCH_GAP_MS - Date.now();
    if (gap > 0) await sleep(gap);
    lastFetchAt = Date.now();
  }

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  const request = fetch(url, {
    ...fetchOptions,
    signal: controller?.signal,
    headers: {
      Accept: "application/json",
      ...getCrmHeaders(),
      ...getAuthHeaders(),
      ...(fetchOptions.body && !(fetchOptions.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...fetchOptions.headers,
    },
  }).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });

  if (method === "GET") {
    inflightGets.set(url, request);
    request.finally(() => {
      if (inflightGets.get(url) === request) inflightGets.delete(url);
    });
  }

  try {
    return await request;
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(
        `API request timed out after ${Math.round(timeoutMs / 1000)}s. `
        + "Check that the backend is running and auth routes are deployed.",
      );
    }
    throw err;
  }
}

function storeGetCache(key, data, ttl) {
  memoryCache.set(key, { data, expires: Date.now() + ttl });
  writeSession(key, data, ttl);
}

function formatApiError(data, fallback) {
  if (!data || typeof data !== "object") return fallback;
  const base = data.message || data.error || fallback;
  const fieldErrors = data.errors?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") return base;
  const details = Object.entries(fieldErrors)
    .flatMap(([field, messages]) => (
      Array.isArray(messages) ? messages.map((msg) => `${field}: ${msg}`) : []
    ))
    .join("; ");
  return details ? `${base} — ${details}` : base;
}

function parseApiResponseBody(text, contentType) {
  const trimmed = text.trim();
  if (!trimmed) return { parsed: false, data: null };
  const looksJson = contentType.includes("application/json")
    || trimmed.startsWith("{")
    || trimmed.startsWith("[")
    || trimmed === "null";
  if (!looksJson) return { parsed: false, data: null };
  try {
    return { parsed: true, data: JSON.parse(trimmed) };
  } catch {
    return { parsed: false, data: null };
  }
}

function describeNonJsonResponse(status, contentType, preview) {
  if (preview.startsWith("<!DOCTYPE") || preview.startsWith("<html")) {
    if (status === 404) {
      return "Auth API not found (404). Start the backend: cd backend && npm run dev";
    }
    return "API request hit the frontend instead of the backend. Start the backend on port 5000.";
  }
  if (status === 429) return "Too many API requests — wait a moment and try again.";
  if (status === 502 || status === 503 || status === 504) {
    if (preview.trim()) {
      try {
        const body = JSON.parse(preview);
        if (body?.message) return body.message;
      } catch {
        /* fall through */
      }
    }
    return "Backend API is temporarily unavailable. Start the backend (cd backend && npm run dev) and check DB credentials.";
  }
  if (status === 204 || !preview.trim()) {
    const isJson = String(contentType || "").includes("application/json");
    if (isJson) {
      return "API returned an empty JSON response. Is the backend running on port 5000?";
    }
    return `API returned ${status} with an empty response. Try again.`;
  }
  return `Expected JSON from API but got ${contentType || "unknown type"}`;
}

const AUTH_RETRY_PATHS = ["/api/auth/login", "/api/auth/change-password"];

function authRetryDelayMs(retryCount) {
  return 600 + Math.floor(Math.random() * 900) + retryCount * 800;
}

function shouldRetryAuthPost(path, method, status, retryCount, skipAuth429Retry) {
  if (skipAuth429Retry || method !== "POST" || status !== 429 || retryCount >= 1) return false;
  const normalized = path.split("?")[0];
  return AUTH_RETRY_PATHS.some((p) => normalized.endsWith(p));
}

/**
 * Cached fetch — returns parsed JSON for GET when cacheTtl > 0.
 */
export async function apiJson(path, options = {}) {
  const {
    cacheTtl = DEFAULT_GET_TTL,
    skipCache = false,
    method = "GET",
    timeoutMs,
    skipAuth429Retry = false,
    _retry429 = 0,
    ...fetchOptions
  } = options;

  const url = apiUrl(path);
  const httpMethod = method.toUpperCase();
  const isGet = httpMethod === "GET";
  const key = cacheKey(url);

  if (isGet && !skipCache && cacheTtl > 0) {
    const mem = memoryCache.get(key);
    if (mem && Date.now() < mem.expires) {
      return mem.data;
    }
    const stored = readSession(key);
    if (stored != null) {
      storeGetCache(key, stored, cacheTtl);
      return stored;
    }
  }

  let response;
  const skipThrottle = httpMethod !== "GET";
  try {
    response = await performFetch(url, {
      ...fetchOptions,
      method: httpMethod,
      timeoutMs,
      skipThrottle,
    });
  } catch (err) {
    const isNetwork = err instanceof TypeError
      || String(err?.message || "").toLowerCase().includes("failed to fetch");
    if (isGet && isNetwork) {
      const stale = staleGetFallback(key);
      if (stale != null) return stale;
    }
    if (!isNetwork) throw err;
    const target = apiUrl(path).split("?")[0];
    throw new Error(
      `Cannot reach the API at ${target}. `
      + (typeof window !== "undefined"
        ? "Check your connection and that the Hostinger backend is running. "
          + "If testing locally, start the backend: cd backend && npm run dev"
        : "Check your connection and backend deploy."),
    );
  }

  const contentType = response.headers.get("content-type") || "";
  const text = await response.clone().text();
  const { parsed, data } = parseApiResponseBody(text, contentType);

  if (!parsed) {
    const preview = text.slice(0, 80);
    if (isGet && response.status === 429 && _retry429 < 1 && isAuthApiPath(path)) {
      await sleep(2000 * (_retry429 + 1));
      return apiJson(path, {
        cacheTtl,
        skipCache,
        method,
        timeoutMs,
        _retry429: _retry429 + 1,
        ...fetchOptions,
      });
    }
    if (shouldRetryAuthPost(path, httpMethod, response.status, _retry429, skipAuth429Retry)) {
      await sleep(authRetryDelayMs(_retry429));
      return apiJson(path, {
        cacheTtl,
        skipCache,
        method,
        timeoutMs,
        skipAuth429Retry,
        _retry429: _retry429 + 1,
        ...fetchOptions,
      });
    }
    if (isGet && response.status === 429) {
      const stale = staleGetFallback(key);
      if (stale != null) return stale;
    }
    const err = new Error(describeNonJsonResponse(response.status, contentType, preview));
    err.status = response.status;
    throw err;
  }

  if (!response.ok) {
    if (isGet && response.status === 429 && _retry429 < 1 && isAuthApiPath(path)) {
      await sleep(2000 * (_retry429 + 1));
      return apiJson(path, {
        cacheTtl,
        skipCache,
        method,
        timeoutMs,
        _retry429: _retry429 + 1,
        ...fetchOptions,
      });
    }
    if (shouldRetryAuthPost(path, httpMethod, response.status, _retry429, skipAuth429Retry)) {
      await sleep(authRetryDelayMs(_retry429));
      return apiJson(path, {
        cacheTtl,
        skipCache,
        method,
        timeoutMs,
        skipAuth429Retry,
        _retry429: _retry429 + 1,
        ...fetchOptions,
      });
    }
    if (isGet && response.status === 429) {
      const stale = staleGetFallback(key);
      if (stale != null) return stale;
    }
    const message = formatApiError(data, response.statusText || "Request failed");
    const err = new Error(message);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  if (isGet && cacheTtl > 0) {
    storeGetCache(key, data, cacheTtl);
  } else if (!isGet) {
    invalidateCache(path.split("?")[0].replace(/\/[^/]+$/, "") || "/api");
    invalidateCache(path.split("?")[0]);
  }

  return data;
}

export async function apiGet(path, options = {}) {
  return apiJson(path, { ...options, method: "GET" });
}

export async function apiPost(path, body, options = {}) {
  return apiJson(path, {
    ...options,
    method: "POST",
    body: JSON.stringify(body),
    cacheTtl: 0,
  });
}

export async function apiPostForm(path, formData, options = {}) {
  return apiJson(path, {
    ...options,
    method: "POST",
    body: formData,
    cacheTtl: 0,
  });
}

export async function apiPut(path, body, options = {}) {
  return apiJson(path, {
    ...options,
    method: "PUT",
    body: JSON.stringify(body),
    cacheTtl: 0,
  });
}

export async function apiPatch(path, body, options = {}) {
  return apiJson(path, {
    ...options,
    method: "PATCH",
    body: JSON.stringify(body),
    cacheTtl: 0,
  });
}

export async function apiDelete(path, options = {}) {
  return apiJson(path, { ...options, method: "DELETE", cacheTtl: 0 });
}

/** Read cached GET payload synchronously (for instant first paint). */
export function readCachedJson(path) {
  const url = apiUrl(path);
  const key = cacheKey(url);
  const mem = memoryCache.get(key);
  if (mem && Date.now() < mem.expires) return mem.data;
  return readSession(key);
}

/** Read last cached GET payload even if TTL expired (429 / offline fallback). */
export function readStaleCachedJson(path) {
  const url = apiUrl(path);
  const key = cacheKey(url);
  const fresh = readCachedJson(path);
  if (fresh != null) return fresh;
  return readStaleCache(key);
}

export async function fetchPrivateContacts(employeeId) {
  return apiGet(`/api/v1/employee/${employeeId}/private-contacts`);
}

export async function addPrivateContact(employeeId, data) {
  return apiPost(`/api/v1/employee/${employeeId}/private-contacts`, data);
}

export async function deletePrivateContact(employeeId, contactId) {
  return apiDelete(`/api/v1/employee/${employeeId}/private-contacts/${contactId}`);
}

