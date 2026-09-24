import { GlassCard } from "./Primitives.jsx";

export function SettingsMobileTabs({ tabs, activeTab, onTabChange, tabExtra }) {
  const colClass = tabs.length === 3
    ? "grid-cols-3"
    : tabs.length <= 2
      ? "grid-cols-2"
      : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className="lg:hidden min-w-0 col-span-full">
      <div className={`grid ${colClass} gap-2`}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onTabChange(t.id)}
              className={`relative flex flex-col items-center justify-center gap-1 px-1.5 py-2 rounded-xl text-[10px] font-bold transition-all min-w-0 min-h-[44px] ${
                isActive
                  ? "bg-[#be123c] text-white shadow-sm"
                  : "bg-white border border-rose-100 text-slate-700 hover:bg-rose-50/70"
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${isActive ? "text-white" : "text-rose-600/80"}`} />
              <span className="text-center leading-tight line-clamp-2">{t.label}</span>
              {tabExtra?.(t, isActive)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsSidebar({ title, subtitle, tabs, activeTab, onTabChange, tabExtra }) {
  return (
    <GlassCard className="hidden lg:block p-3.5 h-fit space-y-1">
      <div className="px-3 py-2.5 mb-2 border-b border-rose-100">
        <h3 className="text-xs font-black text-rose-700 uppercase tracking-widest">{title}</h3>
        <p className="text-[9px] text-slate-400 mt-0.5">{subtitle}</p>
      </div>
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = activeTab === t.id;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-left text-xs font-bold transition-all relative touch-target ${
              isActive ? "bg-[#be123c] text-white shadow-sm" : "hover:bg-rose-50/70 text-slate-700"
            }`}
          >
            <Icon className={`w-4.5 h-4.5 ${isActive ? "text-white" : "text-rose-600/70"}`} />
            <span>{t.label}</span>
            {tabExtra?.(t, isActive)}
          </button>
        );
      })}
    </GlassCard>
  );
}

export function SettingsPanel({ children, footer }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-6 min-w-0">
      <GlassCard className="p-3 sm:p-6 flex-1 flex flex-col justify-between min-h-0 lg:min-h-[520px]">
        <div className="space-y-3 sm:space-y-6 min-w-0">{children}</div>
        {footer}
      </GlassCard>
    </div>
  );
}

export function PanelSection({ title, subtitle, children }) {
  return (
    <div className="space-y-3 sm:space-y-6 min-w-0">
      <div>
        <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wider">{title}</h3>
        {subtitle && <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

export function PanelFooter({ left, actions }) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 sm:gap-4 mt-4 sm:mt-8 pt-3 sm:pt-5 border-t border-rose-100/50">
      <div className="flex items-center gap-3">{left}</div>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">{actions}</div>
    </div>
  );
}

export const inputClass =
  "w-full min-h-[40px] sm:min-h-[44px] px-3 py-2 border sm:py-2.5 border-slate-200 rounded-lg sm:rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400";

export const labelClass = "text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase block mb-1";
