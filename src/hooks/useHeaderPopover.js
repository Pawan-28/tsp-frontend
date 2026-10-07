import { useCallback, useSyncExternalStore } from "react";

/**
 * Tiny global store so that only ONE header popover (activity, notifications,
 * quick actions, profile menu, custom date range, ...) is open at a time,
 * even when the popovers live in different components.
 */
let activeId = null;
const listeners = new Set();

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function getSnapshot() {
  return activeId;
}

function setActiveId(next) {
  if (next === activeId) return;
  activeId = next;
  listeners.forEach((fn) => fn());
}

export function closeHeaderPopovers() {
  setActiveId(null);
}

/** [activeId, setActiveId] - used by the Topbar, which owns most header popovers. */
export function useActiveHeaderPopover() {
  const active = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const set = useCallback((next) => {
    setActiveId(typeof next === "function" ? next(activeId) : next);
  }, []);
  return [active, set];
}

/** [open, setOpen] for one popover id. Opening it closes whichever other one was open. */
export function useHeaderPopover(id) {
  const active = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const setOpen = useCallback(
    (next) => {
      const value = typeof next === "function" ? next(activeId === id) : next;
      if (value) setActiveId(id);
      else if (activeId === id) setActiveId(null);
    },
    [id],
  );
  return [active === id, setOpen];
}

/** Open a specific header popover from outside the Topbar (e.g. the mobile drawer's "Recent Activity"). */
export function openHeaderPopover(id) {
  setActiveId(id);
}
