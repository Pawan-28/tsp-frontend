import { useMemo, useState } from "react";
import { Badge } from "../../components/Primitives.jsx";
import { inputClass, labelClass } from "../../components/SettingsLayout.jsx";
import { Search } from "lucide-react";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";

const LEAD_TONE = {
  hot: "danger",
  warm: "warning",
  cold: "info",
  converted: "success",
  notpick: "muted",
  ni: "purple",
};

export function LeadStatusBadge({ status, label }) {
  return <Badge tone={LEAD_TONE[status] || "muted"}>{label}</Badge>;
}

export function EmpEmptyState({ icon = "", title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 sm:py-12 px-4 text-center">
      {icon && (
        <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 grid place-items-center text-xl sm:text-2xl mb-2.5 sm:mb-3">
          {icon}
        </div>
      )}
      <p className="text-xs sm:text-sm font-bold text-slate-700">{title}</p>
      {subtitle && <p className="text-[10px] sm:text-xs text-slate-400 mt-1 max-w-xs">{subtitle}</p>}
    </div>
  );
}

export function EmpModal({ open, onClose, title, subtitle, children, footer }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-lg max-h-[92dvh] sm:max-h-[90vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-rose-100 bg-white shadow-[0_20px_60px_rgba(0,0,0,.15)] animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-3 sm:px-5 pt-4 sm:pt-5 pb-2.5 sm:pb-3 border-b border-rose-50">
          <h3 className="text-base sm:text-lg font-display font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-[10px] sm:text-xs text-slate-500 mt-1">{subtitle}</p>}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">{children}</div>
        {footer && (
          <div
            className="shrink-0 px-3 sm:px-5 pt-3 pb-4 sm:pb-5 border-t border-rose-50 bg-white flex flex-col-reverse sm:flex-row justify-end gap-2"
            style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom, 0px))" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function RoseHero({ title, subtitle, children, className = "" }) {
  return (
    <div className={`rounded-2xl sm:rounded-[24px] p-3 sm:p-5 mb-3 sm:mb-4 gradient-primary text-primary-foreground shadow-glow relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_top_right,white,transparent_60%)]" />
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-base sm:text-xl font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs sm:text-sm text-primary-foreground/75 mt-1">{subtitle}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}

export function FilterPills({ items, value, onChange, className = "" }) {
  return (
    <div className={`${SEGMENT_WRAP} max-w-full ${className}`}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`${SEGMENT_BTN} ${
            value === item.id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
          }`}
        >
          {item.shortLabel ? (
            <>
              <span className="sm:hidden">{item.shortLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </>
          ) : (
            item.label
          )}
        </button>
      ))}
    </div>
  );
}

export function TabBar({ tabs, value, onChange, className = "" }) {
  return (
    <div className={`${SEGMENT_WRAP} max-w-full ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`${SEGMENT_BTN} ${
            value === t.id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
          }`}
        >
          {t.shortLabel ? (
            <>
              <span className="sm:hidden">{t.shortLabel}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </>
          ) : (
            t.label
          )}
        </button>
      ))}
    </div>
  );
}

const BTN_BASE = "inline-flex items-center justify-center gap-1.5 min-h-[40px] sm:min-h-0 px-3 sm:px-4 py-2 rounded-full sm:rounded-xl text-xs sm:text-sm font-bold transition active:scale-[0.98]";

export function BtnPrimary({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`${BTN_BASE} bg-[#be123c] hover:bg-[#a20f32] text-white shadow-md ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnSecondary({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`${BTN_BASE} bg-rose-50 text-rose-700 border border-rose-100 hover:bg-rose-100 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function BtnGhost({ children, className = "", ...props }) {
  return (
    <button
      type="button"
      className={`${BTN_BASE} text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function FormLabel({ children }) {
  return <label className={labelClass}>{children}</label>;
}

export function FormInput({ className = "", ...props }) {
  return (
    <input
      className={`${inputClass} ${className}`}
      {...props}
    />
  );
}

export function FormSelect({ className = "", children, ...props }) {
  return (
    <select
      className={`${inputClass} ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function FormTextarea({ className = "", ...props }) {
  return (
    <textarea
      className={`${inputClass} resize-y ${className}`}
      {...props}
    />
  );
}

export function FormRow({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">{children}</div>;
}

export function FormGroup({ children, className = "" }) {
  return <div className={`mb-3 sm:mb-4 ${className}`}>{children}</div>;
}

export function PageSkeleton() {
  return (
    <div className="space-y-3 sm:space-y-4 animate-pulse">
      <div className="h-20 sm:h-28 rounded-2xl bg-rose-50/80" />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3">
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 sm:h-28 rounded-2xl bg-rose-50/60" />)}
      </div>
      <div className="h-48 sm:h-64 rounded-2xl bg-rose-50/50" />
    </div>
  );
}

export function AvatarCircle({ initials, color, size = 32 }) {
  return (
    <div
      style={{ width: size, height: size, background: color }}
      className="rounded-full grid place-items-center text-[10px] font-black text-white shrink-0"
    >
      {initials}
    </div>
  );
}

export function ChooseLeadPanel({ leads, onSelect, className = "" }) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.company || "").toLowerCase().includes(q) ||
        (l.stage || "").toLowerCase().includes(q),
    );
  }, [leads, search]);

  return (
    <div className={className}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, company, or stage…"
          className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition"
          autoFocus
        />
      </div>
      <div className="space-y-2 max-h-[min(52vh,420px)] overflow-y-auto overscroll-contain scrollbar-thin pr-0.5">
        {filtered.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-8">No leads match your search</p>
        ) : (
          filtered.map((lead) => (
            <button
              key={lead.id}
              type="button"
              onClick={() => onSelect(lead)}
              className="w-full flex items-center gap-3 p-3 rounded-xl border border-slate-200/80 bg-white hover:border-rose-200 hover:bg-rose-50/40 text-left transition"
            >
              <AvatarCircle initials={lead.av || lead.name.slice(0, 2).toUpperCase()} color={lead.color || "#be123c"} size={36} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-900 truncate">{lead.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{lead.company}</p>
              </div>
              <div className="shrink-0 text-right">
                <LeadStatusBadge status={lead.status} label={lead.stage || lead.status} />
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

export function ChooseLeadModal({ open, onClose, leads, onSelect, title = "Choose a lead", subtitle = "Select who you want to call" }) {
  return (
    <EmpModal
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={<BtnSecondary onClick={onClose}>Cancel</BtnSecondary>}
    >
      <ChooseLeadPanel
        leads={leads}
        onSelect={(lead) => {
          onSelect(lead);
          onClose();
        }}
      />
    </EmpModal>
  );
}

/** Visible delete/action on touch; hover-only on desktop */
export const MOBILE_ACTION =
  "opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all";

export { default as EmployeeDoodleAvatar } from "./EmployeeDoodleAvatar.jsx";
