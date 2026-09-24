import toast from "react-hot-toast";
import { Phone, CheckCircle2, AlertCircle } from "lucide-react";

const CALL_TOAST_ID = "emp-call-active";

function ToastShell({ t, icon: Icon, iconClass, title, subtitle }) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-2xl border border-slate-200 bg-white shadow-[0_12px_32px_rgba(15,23,42,0.12)] transition-all ${
        t.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
      }`}
      style={{ maxWidth: 360, minWidth: 280 }}
    >
      <div className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${iconClass}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        {subtitle && <p className="text-xs text-slate-500 truncate">{subtitle}</p>}
      </div>
      <button
        type="button"
        onClick={() => toast.dismiss(t.id)}
        className="text-slate-400 hover:text-slate-600 text-lg leading-none px-1 shrink-0"
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}

/** One toast when Call Assistant opens for a lead (deduped by id). */
export function notifyCallStarted(leadName) {
  if (!leadName?.trim()) return;
  toast.custom(
    (t) => (
      <ToastShell
        t={t}
        icon={Phone}
        iconClass="bg-emerald-50 border border-emerald-100 text-emerald-600"
        title="Call Assistant ready"
        subtitle={leadName.trim()}
      />
    ),
    { id: CALL_TOAST_ID, duration: 3500 },
  );
}

export function empToastSuccess(message, id) {
  toast.custom(
    (t) => (
      <ToastShell
        t={t}
        icon={CheckCircle2}
        iconClass="bg-emerald-50 border border-emerald-100 text-emerald-600"
        title={message}
      />
    ),
    { id: id || `success-${message}`, duration: 3000 },
  );
}

export function empToastError(message, id) {
  toast.custom(
    (t) => (
      <ToastShell
        t={t}
        icon={AlertCircle}
        iconClass="bg-red-50 border border-red-100 text-red-600"
        title={message}
      />
    ),
    { id: id || `error-${message}`, duration: 4000 },
  );
}

export const EMP_TOAST_OPTIONS = {
  duration: 3500,
  style: {
    padding: "12px 16px",
    borderRadius: "14px",
    border: "1px solid #e2e8f0",
    background: "#fff",
    color: "#0f172a",
    boxShadow: "0 12px 32px rgba(15, 23, 42, 0.12)",
    fontSize: "13px",
    fontWeight: 600,
    maxWidth: "360px",
  },
  success: {
    iconTheme: { primary: "#059669", secondary: "#fff" },
  },
  error: {
    iconTheme: { primary: "#dc2626", secondary: "#fff" },
  },
};
