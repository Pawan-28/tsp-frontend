import { useEffect, useRef } from "react";

/**
 * Close-on-outside-click and close-on-Escape for popovers / menus / panels.
 *
 * useDismissable({ open, onDismiss, refs: [panelRef, triggerRef] })
 *
 * - `refs` are the elements that count as "inside" (panel + its trigger).
 *   Clicks inside any of them never dismiss; clicking the trigger is left to its own onClick toggle.
 * - Listeners are only attached while `open` is true.
 */
export function useDismissable({ open, onDismiss, refs = [], escape = true, outside = true }) {
  const cbRef = useRef(onDismiss);
  const refsRef = useRef(refs);
  cbRef.current = onDismiss;
  refsRef.current = refs;

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      const inside = refsRef.current.some((r) => r?.current && r.current.contains(e.target));
      if (!inside) cbRef.current?.(e);
    };
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Esc") cbRef.current?.(e);
    };

    if (outside) {
      document.addEventListener("mousedown", onPointerDown);
      document.addEventListener("touchstart", onPointerDown, { passive: true });
    }
    if (escape) document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, outside, escape]);
}

export default useDismissable;
