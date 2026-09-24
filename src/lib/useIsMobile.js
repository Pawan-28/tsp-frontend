import { useEffect, useState } from "react";

export default function useIsMobile(bp = 640) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < bp : false,
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < bp);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [bp]);
  return isMobile;
}

/** True when the observed element is narrower than `bp` (for drawer/card layouts). */
export function useContainerNarrow(ref, bp = 720) {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;

    const measure = () => setNarrow(el.getBoundingClientRect().width < bp);
    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, bp]);

  return narrow;
}
