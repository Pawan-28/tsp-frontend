import { Link } from "react-router-dom";
import { ChevronRight, PanelLeftClose, PanelLeftOpen, X, LogOut } from "lucide-react";

export const SIDEBAR_SHELL = `
  fixed lg:sticky top-0 left-0 z-[100] h-screen h-[100dvh] shrink-0
  bg-[#0a0f1d] border-r border-slate-800/60
  flex flex-col overflow-hidden
  transition-[width,transform] duration-300 ease-out
  shadow-[8px_0_32px_rgba(0,0,0,0.25)] lg:shadow-none
`;

export function SidebarLogo({ initials, title, subtitle, to, onNavigate, isExpanded, logo }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 min-w-0 group" onClick={onNavigate}>
      {logo ? (
        <div className="shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10 group-hover:ring-rose-500/40 shadow-[0_2px_8px_rgba(0,0,0,0.35)] group-hover:shadow-[0_4px_16px_rgba(244,63,94,0.2)] transition-all duration-200">
          {logo}
        </div>
      ) : (
        <div className="w-9 h-9 rounded-xl bg-slate-850 border border-slate-800 shadow-sm grid place-items-center shrink-0 group-hover:bg-slate-800 transition-colors">
          <span className="text-[10px] font-black text-white tracking-tight">{initials}</span>
        </div>
      )}
      {isExpanded && (
        <div className="overflow-hidden min-w-0">
          <div className="font-display text-[15px] font-extrabold tracking-tight whitespace-nowrap text-slate-100 truncate leading-tight">
            {title}
          </div>
          <div className="text-[10px] font-semibold text-slate-500 whitespace-nowrap truncate mt-0.5">
            {subtitle}
          </div>
        </div>
      )}
    </Link>
  );
}


export function SidebarHeader({ children, isExpanded, onClose, onToggleCollapse, collapsed }) {
  return (
    <div className="flex items-center gap-2 px-3.5 h-16 shrink-0 border-b border-slate-800/60 bg-[#0a0f1d]">
      <div className="flex-1 min-w-0">{children}</div>
      <button
        type="button"
        onClick={onClose}
        className="lg:hidden p-2 rounded-xl hover:bg-slate-800/80 text-slate-400 hover:text-slate-200 shrink-0 border border-transparent hover:border-slate-700/60 transition"
      >
        <X className="w-5 h-5" />
      </button>
      {isExpanded && onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg bg-slate-800/40 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 transition shrink-0"
          title={collapsed ? "Pin sidebar open" : "Collapse sidebar"}
        >
          {collapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
        </button>
      )}
    </div>
  );
}

export function SidebarSectionLabel({ children, isExpanded }) {
  if (!isExpanded) return null;
  return (
    <div className="flex items-center gap-2 px-2.5 mb-2 mt-1">
      <span className="text-[9.5px] font-extrabold uppercase tracking-[0.14em] text-slate-500 shrink-0">
        {children}
      </span>
      <div className="flex-1 h-px bg-slate-800/60" />
    </div>
  );
}

export function SidebarNavItem({ isActive, isExpanded, icon: Icon, label }) {
  return (
    <div
      className={`relative flex items-center gap-2.5 rounded-lg transition-all duration-200 ${
        !isExpanded ? "justify-center p-2 mx-auto w-9.5 h-9.5" : "pl-3 pr-3 py-2.5 min-h-[38px]"
      } ${
        isActive
          ? "bg-slate-800/80 text-slate-50 border border-slate-700/65 font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
          : "text-slate-400 hover:text-slate-100 hover:bg-slate-850/50 font-semibold"
      }`}
      title={!isExpanded ? label : undefined}
    >
      {isActive && isExpanded && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4.5 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]" />
      )}
      <Icon
        className={`shrink-0 w-4 h-4 transition-colors duration-200 ${
          isActive ? "text-rose-500" : "text-slate-500 group-hover:text-slate-350"
        }`}
        strokeWidth={isActive ? 2.5 : 2}
      />
      {isExpanded && (
        <span className="truncate text-[12px] leading-none">{label}</span>
      )}
    </div>
  );
}

export function SidebarSwitchLink({ to, onClick, icon: Icon, label, isExpanded }) {
  if (!isExpanded) return null;
  return (
    <Link
      to={to}
      onClick={onClick}
      className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[11px] font-bold text-slate-400 hover:text-slate-100 bg-slate-900/40 hover:bg-slate-850/80 border border-slate-800/80 hover:border-slate-700 transition mb-2"
    >
      <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500 group-hover:text-slate-350" />
      <span className="truncate">{label}</span>
      <ChevronRight className="w-3.5 h-3.5 ml-auto text-slate-650 group-hover:text-slate-450 shrink-0" />
    </Link>
  );
}

export function SidebarProfileCard({ isExpanded, onClick, avatar, name, role, title, onSignOut }) {
  if (!isExpanded) {
    return (
      <div className="flex flex-col items-center gap-2.5 py-1">
        <button
          type="button"
          onClick={onClick}
          title={title || name}
          className="rounded-full ring-2 ring-slate-700/80 shadow-md hover:ring-rose-500/50 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-rose-500/50 focus:ring-offset-2 focus:ring-offset-[#0a0f1d]"
        >
          {avatar}
        </button>
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            className="w-8 h-8 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-400 hover:text-rose-500 border border-slate-800 hover:border-slate-700 flex items-center justify-center transition active:scale-95 shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="group w-full flex items-center justify-between gap-1.5 px-2.5 py-2.5 rounded-xl bg-[#111827]/60 border border-slate-800 hover:border-slate-700/80 transition duration-200"
    >
      <button
        type="button"
        onClick={onClick}
        className="flex items-center gap-2.5 flex-1 min-w-0 text-left focus:outline-none group/info"
      >
        <div className="shrink-0 scale-95 origin-left">{avatar}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-extrabold text-slate-100 truncate leading-tight group-hover/info:text-rose-400 transition">{name}</div>
          <div className="text-[10px] text-slate-500 font-semibold truncate mt-0.5">{role}</div>
        </div>
      </button>
      <div className="flex items-center gap-2 shrink-0">
        {onSignOut && (
          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            className="w-8 h-8 rounded-lg bg-slate-850/60 hover:bg-slate-800 text-slate-400 hover:text-rose-500 border border-slate-850 hover:border-slate-700 flex items-center justify-center transition active:scale-95 shadow-sm"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="Online" />
      </div>
    </div>
  );
}

export function SidebarCollapseHint({ show }) {
  if (!show) return null;
  return (
    <div className="absolute bottom-20 left-0 right-0 flex justify-center pointer-events-none">
      <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 grid place-items-center shadow-sm">
        <ChevronRight className="w-3 h-3 text-slate-500" />
      </div>
    </div>
  );
}

export function SidebarAvatarInitials({ initials }) {
  return (
    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-600 to-slate-800 border border-slate-600 grid place-items-center shrink-0">
      <span className="text-[9px] font-bold text-white">{initials}</span>
    </div>
  );
}

export function SidebarNav({ children }) {
  return (
    <nav className="flex-1 px-2 py-2.5 space-y-0.5 overflow-y-auto overflow-x-hidden scrollbar-none">
      {children}
    </nav>
  );
}

export function SidebarFooter({ children }) {
  return (
    <div className="p-2.5 border-t border-slate-800 shrink-0 bg-[#0f172a]">
      {children}
    </div>
  );
}
