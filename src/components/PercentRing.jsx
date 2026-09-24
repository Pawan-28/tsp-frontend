import { useEffect, useState } from "react";

const RING_VIEW = 56;
const RING_R = 22;
const RING_STROKE = 5;
export const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

/** SVG progress ring — arc length matches `value` percent (0–100). */
export default function PercentRing({
  value = 0,
  color = "#e11d48",
  sizeClass = "w-10 h-10 sm:w-14 sm:h-14",
  labelClass = "text-[9px] sm:text-[11px]",
  trackColor = "#ffe4e6",
  showLabel = true,
}) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const targetOffset = RING_CIRCUMFERENCE * (1 - pct / 100);
  const [offset, setOffset] = useState(RING_CIRCUMFERENCE);

  useEffect(() => {
    const t = window.setTimeout(() => setOffset(targetOffset), 80);
    return () => window.clearTimeout(t);
  }, [targetOffset]);

  return (
    <div className={`relative shrink-0 mx-auto sm:mx-0 ${sizeClass}`}>
      <svg width="100%" height="100%" viewBox={`0 0 ${RING_VIEW} ${RING_VIEW}`} className="-rotate-90">
        <circle
          cx={RING_VIEW / 2}
          cy={RING_VIEW / 2}
          r={RING_R}
          fill="none"
          stroke={trackColor}
          strokeWidth={RING_STROKE}
        />
        <circle
          cx={RING_VIEW / 2}
          cy={RING_VIEW / 2}
          r={RING_R}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-[1.2s] ease-out"
        />
      </svg>
      {showLabel && (
        <div className={`absolute inset-0 grid place-items-center font-black tabular-nums ${labelClass}`} style={{ color }}>
          {Math.round(pct)}%
        </div>
      )}
    </div>
  );
}

/** Conic-gradient disk — filled wedge length matches percent (admin dashboard key metrics). */
export function PercentDisk({
  value = 0,
  color = "#e11d48",
  glow = color,
  size = 72,
  compact = false,
  className = "",
}) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  const inner = Math.max(compact ? 8 : 10, Math.round(size * 0.14));

  return (
    <div
      className={`relative rounded-full flex items-center justify-center ${className}`}
      style={{
        width: size,
        height: size,
        background: `conic-gradient(${color} 0deg ${pct * 3.6}deg, #e2e8f0 ${pct * 3.6}deg 360deg)`,
        boxShadow: `0 4px 18px ${glow}33`,
      }}
    >
      <div
        className="absolute rounded-full bg-white flex items-center justify-center border border-slate-100 pointer-events-none"
        style={{ inset: inner }}
      >
        <span
          className="font-bold text-slate-900 tabular-nums leading-none"
          style={{ fontSize: compact ? 11 : 15 }}
        >
          {Math.round(pct)}%
        </span>
      </div>
    </div>
  );
}
