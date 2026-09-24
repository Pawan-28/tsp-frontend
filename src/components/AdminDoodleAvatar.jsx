/** Friendly hand-drawn avatar for the logged-in admin */

const S = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export default function AdminDoodleAvatar({ size = 32, className = "", shape = "circle", photoUrl = "" }) {
  const radius = shape === "circle" ? "rounded-full" : size >= 44 ? "rounded-2xl" : "rounded-xl";

  if (photoUrl) {
    return (
      <div
        className={`relative shrink-0 overflow-hidden border-2 border-slate-200/90 bg-slate-50 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${radius} ${className}`}
        style={{ width: size, height: size }}
      >
        <img src={photoUrl} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`relative shrink-0 overflow-hidden border-2 border-slate-200/90 bg-gradient-to-br from-rose-50 via-white to-slate-50 shadow-[0_2px_8px_rgba(15,23,42,0.06)] ${radius} ${className}`}
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg viewBox="0 0 80 80" className="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* soft blobs */}
        <circle cx="62" cy="20" r="9" fill="#fecdd3" fillOpacity="0.4" />
        <circle cx="18" cy="56" r="8" fill="#e2e8f0" fillOpacity="0.55" />
        <path d="M66 58 l2.5 1.5 -2.5 1.5 -1.5 -2.5z" fill="#fbbf24" fillOpacity="0.65" />

        {/* hair — neat admin cut */}
        <path
          d="M24 34 C26 18 34 14 40 14 C46 14 54 18 56 34 C54 26 48 21 40 21 C32 21 26 26 24 34Z"
          fill="#334155"
          fillOpacity="0.15"
          stroke="#334155"
          strokeWidth="2.2"
          {...S}
        />
        <path d="M28 28 Q34 17 40 16 Q46 17 52 28" stroke="#334155" strokeWidth="2" {...S} />

        {/* face */}
        <ellipse cx="40" cy="40" rx="16" ry="17" fill="#fde68a" stroke="#334155" strokeWidth="2.2" {...S} />

        {/* blush */}
        <ellipse cx="31" cy="44" rx="3" ry="1.8" fill="#fda4af" fillOpacity="0.4" />
        <ellipse cx="49" cy="44" rx="3" ry="1.8" fill="#fda4af" fillOpacity="0.4" />

        {/* eyes behind glasses */}
        <circle cx="34" cy="38" r="2" fill="#1e293b" />
        <circle cx="46" cy="38" r="2" fill="#1e293b" />
        <circle cx="34.6" cy="37.4" r="0.6" fill="white" />
        <circle cx="46.6" cy="37.4" r="0.6" fill="white" />

        {/* glasses — admin vibe */}
        <circle cx="34" cy="38" r="6.5" fill="none" stroke="#475569" strokeWidth="2" {...S} />
        <circle cx="46" cy="38" r="6.5" fill="none" stroke="#475569" strokeWidth="2" {...S} />
        <path d="M40.5 38 L39.5 38" stroke="#475569" strokeWidth="2" {...S} />
        <path d="M27.5 37 L24 36" stroke="#475569" strokeWidth="2" {...S} />
        <path d="M52.5 37 L56 36" stroke="#475569" strokeWidth="2" {...S} />

        {/* smile */}
        <path d="M34 47 Q40 51 46 47" stroke="#334155" strokeWidth="2" {...S} />

        {/* shirt + tie */}
        <path
          d="M28 58 L40 66 L52 58 L52 72 L28 72 Z"
          fill="#f8fafc"
          stroke="#64748b"
          strokeWidth="2"
          {...S}
        />
        <path d="M40 58 L40 72" stroke="#94a3b8" strokeWidth="1.5" {...S} />
        <path d="M40 58 L36 66 L40 72 L44 66 Z" fill="#be123c" stroke="#9f1239" strokeWidth="1.5" {...S} />

        {/* tiny shield — super admin badge */}
        <path
          d="M58 22 L62 24 L62 30 C62 34 60 36 58 37 C56 36 54 34 54 30 L54 24 Z"
          fill="#fff1f2"
          stroke="#e11d48"
          strokeWidth="1.8"
          {...S}
        />
        <path d="M58 26 L58 33 M55.5 29.5 L60.5 29.5" stroke="#e11d48" strokeWidth="1.5" {...S} />

        {/* sparkles */}
        <path d="M12 24 l1.2 2.4 -2.4 1.2 2.4 1.2 -1.2 2.4 1.2 -2.4 2.4 -1.2 -2.4 -1.2z" fill="#f472b6" fillOpacity="0.65" />
      </svg>
    </div>
  );
}
