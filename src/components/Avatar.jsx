import { useEffect, useState } from "react";

export function getInitials(name = "") {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Shared avatar: shows the image when `src` loads, otherwise (empty src or <img onError>)
 * a gradient circle with the person's initials. Use everywhere an avatar image is rendered
 * (header, sidebar footer, Settings / Admin profile header, ...).
 */
export default function Avatar({ src = "", name = "", size = 32, shape = "circle", className = "", ring = true }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const radius = shape === "circle" ? "rounded-full" : size >= 44 ? "rounded-2xl" : "rounded-xl";
  const showImage = Boolean(src) && !failed;
  const base = `relative shrink-0 overflow-hidden select-none ${ring ? "border-2 border-slate-200/90 shadow-[0_2px_8px_rgba(15,23,42,0.06)]" : ""} ${radius} ${className}`;

  if (showImage) {
    return (
      <div className={`${base} bg-slate-50`} style={{ width: size, height: size }}>
        <img
          src={src}
          alt={name || "Avatar"}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      </div>
    );
  }

  return (
    <div
      className={`${base} grid place-items-center bg-gradient-to-br from-rose-500 to-pink-600 text-white font-bold`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      role="img"
      aria-label={name || "Avatar"}
      title={name || undefined}
    >
      {getInitials(name)}
    </div>
  );
}
