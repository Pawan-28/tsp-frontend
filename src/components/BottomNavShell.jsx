import { NavLink } from "react-router-dom";

/** Fixed bottom navigation shell — safe-area aware, thumb-friendly tap targets. */
export default function BottomNavShell({ label, children }) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-rose-100/80 bg-white/95 backdrop-blur-md shadow-[0_-4px_24px_rgba(15,23,42,0.06)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label={label}
    >
      <div className="flex items-center justify-around h-16 max-w-[100vw] px-2">
        {children}
      </div>
    </nav>
  );
}

export function BottomNavItem({ to, end, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center justify-center min-w-0 max-w-[5.5rem] py-1 text-[9.5px] font-extrabold leading-tight transition-all duration-200 ${
          isActive ? "text-[#DC143C]" : "text-[#4B5563] hover:text-[#111827]"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <div
            className={`flex items-center justify-center px-4 py-1.5 rounded-full transition-all duration-300 ${
              isActive
                ? "bg-[#FFF0F5] text-[#DC143C] scale-105 shadow-[0_2px_8px_rgba(220,20,60,0.08)] border border-[#FFD6E5]"
                : "text-[#4B5563]"
            }`}
          >
            <Icon className="w-5 h-5 shrink-0" strokeWidth={2} aria-hidden />
          </div>
          <span className="truncate max-w-full text-center mt-1 font-bold">{label}</span>
        </>
      )}
    </NavLink>
  );
}
