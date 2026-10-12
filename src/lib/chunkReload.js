import { lazy } from "react";

/**
 * "This page couldn't load - refresh" after a new version was uploaded.
 * Every page is a separate file (lazy import) with a hashed name. When a new build replaces the old one, a tab that was opened BEFORE
 * still asks for the old file names, which no longer exist -> the import fails. The fix is simply to reload once and pick up the new
 * version. Done automatically here (at most once a minute, so a real outage can never cause a reload loop).
 */
const RELOAD_KEY = "crm_chunk_reload_at";
const RELOAD_WINDOW_MS = 60_000;

const CHUNK_ERROR_RE = /dynamically imported module|importing a module script failed|loading chunk [\w-]+ failed|loading css chunk|unable to preload css|chunkloaderror|failed to fetch dynamically/i;

/** Is this the "the file of this page could not be loaded" kind of error (not a bug in the page itself)? */
export function isChunkLoadError(err) {
  if (!err) return false;
  if (err.name === "ChunkLoadError") return true;
  return CHUNK_ERROR_RE.test(String(err.message || err));
}

function defaultStorage() {
  try {
    return typeof window !== "undefined" ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Reload the page ONCE for a chunk-load error. Returns true when it reloaded (the caller should just wait).
 * Without usable session storage it never reloads (it could not remember that it already did).
 */
export function reloadOnceForChunkError(err, { storage = defaultStorage(), now = Date.now(), reload = () => window.location.reload() } = {}) {
  if (!isChunkLoadError(err) || !storage) return false;
  try {
    const last = Number(storage.getItem(RELOAD_KEY) || 0);
    if (last && now - last < RELOAD_WINDOW_MS) return false;
    storage.setItem(RELOAD_KEY, String(now));
  } catch {
    return false;
  }
  reload();
  return true;
}

/**
 * Runs the import; a chunk-load error reloads the page once (and the promise then never settles, the page is going away).
 * Any other error is passed on unchanged.
 */
export function retryImport(factory, options) {
  return factory().catch((err) => {
    if (reloadOnceForChunkError(err, options)) return new Promise(() => {});
    throw err;
  });
}

/** React.lazy that recovers from a stale-version chunk error by reloading once. */
export function lazyWithRetry(factory) {
  return lazy(() => retryImport(factory));
}
