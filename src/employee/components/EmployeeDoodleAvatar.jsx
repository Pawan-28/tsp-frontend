/** Friendly hand-drawn avatar for the logged-in employee */

const DOODLE_STROKE = {
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export default function EmployeeDoodleAvatar({ size = 48, className = "", shape = "rounded", photoUrl = "" }) {
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
        {/* soft background blobs */}
        <circle cx="62" cy="18" r="10" fill="#fde68a" fillOpacity="0.45" />
        <circle cx="16" cy="58" r="8" fill="#bfdbfe" fillOpacity="0.5" />
        <path d="M68 52 l3 2 -3 2 -2 -3z" fill="#fca5a5" fillOpacity="0.6" />

        {/* hair doodle */}
        <path
          d="M22 36 C24 20 36 14 40 14 C44 14 56 20 58 36 C56 28 48 22 40 22 C32 22 24 28 22 36Z"
          fill="#475569"
          fillOpacity="0.12"
          stroke="#334155"
          strokeWidth="2.2"
          {...DOODLE_STROKE}
        />
        <path
          d="M26 30 Q32 18 40 17 Q48 18 54 30"
          stroke="#334155"
          strokeWidth="2"
          {...DOODLE_STROKE}
        />

        {/* face */}
        <ellipse cx="40" cy="40" rx="17" ry="18" fill="#fde68a" stroke="#334155" strokeWidth="2.2" {...DOODLE_STROKE} />

        {/* blush */}
        <ellipse cx="30" cy="44" rx="3.5" ry="2" fill="#fda4af" fillOpacity="0.45" />
        <ellipse cx="50" cy="44" rx="3.5" ry="2" fill="#fda4af" fillOpacity="0.45" />

        {/* eyes */}
        <circle cx="34" cy="38" r="2.2" fill="#1e293b" />
        <circle cx="46" cy="38" r="2.2" fill="#1e293b" />
        <circle cx="34.8" cy="37.2" r="0.7" fill="white" />
        <circle cx="46.8" cy="37.2" r="0.7" fill="white" />

        {/* smile */}
        <path d="M33 46 Q40 51 47 46" stroke="#334155" strokeWidth="2" {...DOODLE_STROKE} />

        {/* headset — sales rep vibe */}
        <path
          d="M24 40 C24 28 31 22 40 22 C49 22 56 28 56 40"
          stroke="#6366f1"
          strokeWidth="2.2"
          {...DOODLE_STROKE}
        />
        <rect x="19" y="37" width="7" height="11" rx="3.5" fill="#e0e7ff" stroke="#6366f1" strokeWidth="2" />
        <rect x="54" y="37" width="7" height="11" rx="3.5" fill="#e0e7ff" stroke="#6366f1" strokeWidth="2" />
        <path d="M40 48 L40 54" stroke="#6366f1" strokeWidth="2" {...DOODLE_STROKE} />
        <rect x="37" y="54" width="6" height="4" rx="2" fill="#6366f1" />

        {/* collar / shirt */}
        <path
          d="M28 58 L40 66 L52 58 L52 72 L28 72 Z"
          fill="#f8fafc"
          stroke="#64748b"
          strokeWidth="2"
          {...DOODLE_STROKE}
        />
        <path d="M40 58 L40 66" stroke="#94a3b8" strokeWidth="1.5" {...DOODLE_STROKE} />

        {/* tiny sparkle doodles */}
        <path d="M14 22 l1.5 3 -3 1.5 3 1.5 -1.5 3 1.5 -3 3 -1.5 -3 -1.5z" fill="#fbbf24" fillOpacity="0.7" />
        <path d="M66 62 l1 2 -2 1 2 1 -1 2 -1 -2 -2 -1 2 -1z" fill="#60a5fa" fillOpacity="0.65" />
      </svg>
    </div>
  );
}
