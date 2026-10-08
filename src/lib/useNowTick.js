import { useEffect, useState } from "react";

/**
 * "Now", refreshed on a timer. ONE interval per period is shared by every component that asks for it, so a page with hundreds of
 * cards (or a header counting down to the second) does not start hundreds of timers.
 */
const shared = new Map(); // periodMs -> { listeners:Set<fn>, timer }

function subscribe(periodMs, listener) {
  let entry = shared.get(periodMs);
  if (!entry) {
    entry = { listeners: new Set(), timer: null };
    entry.timer = setInterval(() => entry.listeners.forEach((fn) => fn(Date.now())), periodMs);
    shared.set(periodMs, entry);
  }
  entry.listeners.add(listener);
  return () => {
    entry.listeners.delete(listener);
    if (!entry.listeners.size) {
      clearInterval(entry.timer);
      shared.delete(periodMs);
    }
  };
}

export function useNowTick(periodMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(periodMs, setNow), [periodMs]);
  return now;
}
