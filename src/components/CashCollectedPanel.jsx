import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Banknote, Calendar, CreditCard, FileText, Loader2, Paperclip, Plus, Receipt, Upload } from "lucide-react";
import { apiGet, apiPostForm, invalidateCache } from "../lib/api.js";

const PAYMENT_MODES = [
  { value: "UPI", label: "UPI" },
  { value: "Bank Transfer", label: "Bank Transfer" },
  { value: "Cash", label: "Cash" },
  { value: "Card", label: "Card" },
  { value: "Cheque", label: "Cheque" },
  { value: "Other", label: "Other" },
];

function formatINR(amount) {
  const n = Number(amount) || 0;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function formatDateTime(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toLocalDateTimeInput(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function resolveApiBase() {
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl && String(envUrl).trim()) return String(envUrl).replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:5000";
    return "https://lavenderblush-butterfly-422992.hostingersite.com";
  }
  return "";
}

function resolveSlipUrl(url) {
  if (!url) return null;
  if (url.startsWith("http")) return url;
  const base = resolveApiBase();
  return base ? `${base}${url}` : url;
}

const emptyForm = () => ({
  amount: "",
  paymentMode: "UPI",
  paymentAt: toLocalDateTimeInput(),
  transactionId: "",
  notes: "",
  slip: null,
});

export default function CashCollectedPanel({
  leadId,
  leadName,
  employeeId,
  compact = false,
  onTotalChange,
}) {
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const numericLeadId = useMemo(() => {
    const raw = leadId;
    if (raw == null) return null;
    const str = String(raw);
    return /^\d+$/.test(str) ? str : null;
  }, [leadId]);

  const loadRecords = useCallback(async () => {
    if (!numericLeadId) return;
    setLoading(true);
    try {
      const res = await apiGet(`/api/v1/leads/${numericLeadId}/cash-collections`, {
        skipCache: true,
        cacheTtl: 0,
      });
      if (res?.success) {
        const items = Array.isArray(res.data) ? res.data : [];
        setRecords(items);
        const nextTotal = Number(res.total ?? items.reduce((sum, r) => sum + (Number(r.amount) || 0), 0)) || 0;
        setTotal(nextTotal);
        onTotalChange?.(nextTotal);
      }
    } catch {
      // keep empty state
    } finally {
      setLoading(false);
    }
  }, [numericLeadId, onTotalChange]);

  useEffect(() => {
    if (!numericLeadId) {
      setRecords([]);
      setTotal(0);
      return;
    }
    loadRecords();
  }, [numericLeadId, loadRecords]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!numericLeadId) {
      toast.error("Save this lead to the database before recording cash");
      return;
    }

    const amount = Number(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid amount");
      return;
    }
    if (!form.paymentMode) {
      toast.error("Select a payment mode");
      return;
    }
    if (!form.transactionId.trim() && !form.slip) {
      toast.error("Add a transaction ID or upload a payment slip");
      return;
    }

    setSaving(true);
    try {
      const payload = new FormData();
      payload.append("amount", String(amount));
      payload.append("paymentMode", form.paymentMode);
      payload.append("paymentAt", new Date(form.paymentAt).toISOString());
      if (form.transactionId.trim()) payload.append("transactionId", form.transactionId.trim());
      if (form.notes.trim()) payload.append("notes", form.notes.trim());
      if (employeeId) payload.append("employeeId", String(employeeId));
      if (form.slip) payload.append("slip", form.slip);

      const res = await apiPostForm(`/api/v1/leads/${numericLeadId}/cash-collections`, payload);
      if (!res?.success) throw new Error(res?.message || "Failed to save payment");

      toast.success("Cash collection recorded");
      setForm(emptyForm());
      setShowForm(false);
      invalidateCache("/api/v1/");
      await loadRecords();
    } catch (err) {
      toast.error(err.message || "Could not record payment");
    } finally {
      setSaving(false);
    }
  };

  if (!numericLeadId) {
    return (
      <div className="rounded-2xl border border-dashed border-rose-200 bg-rose-50/30 p-4 text-xs text-slate-500">
        Cash collection is available once this lead is synced to the database.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/40 via-white to-white ${compact ? "p-3" : "p-4"} space-y-3 shadow-sm`}>
      <div className="flex items-start justify-between gap-3 border-b border-emerald-100/80 pb-2">
        <div>
          <h4 className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider flex items-center gap-1.5">
            <Banknote className="w-3.5 h-3.5" /> Cash Collected
          </h4>
          {leadName && (
            <p className="text-[10px] text-slate-500 mt-0.5 font-medium truncate">{leadName}</p>
          )}
        </div>
        <div className="text-right shrink-0">
          <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Total</p>
          <p className="text-sm font-black text-emerald-700 tabular-nums">{formatINR(total)}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading payments...
        </div>
      ) : records.length === 0 ? (
        <p className="text-xs text-slate-400 py-2">No payments recorded yet for this lead.</p>
      ) : (
        <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
          {records.map((record) => (
            <div key={record.id} className="rounded-xl border border-emerald-100 bg-white/90 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-black text-slate-800 tabular-nums">{formatINR(record.amount)}</p>
                  <p className="text-[10px] font-bold text-emerald-700 mt-0.5">{record.paymentMode}</p>
                </div>
                <p className="text-[10px] text-slate-400 shrink-0">{formatDateTime(record.paymentAt)}</p>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-500">
                {record.transactionId && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-50 border border-slate-100">
                    <Receipt className="w-3 h-3" /> {record.transactionId}
                  </span>
                )}
                {record.slipUrl && (
                  <a
                    href={resolveSlipUrl(record.slipUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 font-semibold hover:bg-emerald-100"
                  >
                    <Paperclip className="w-3 h-3" /> View slip
                  </a>
                )}
                {record.employeeName && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-50 border border-rose-100 text-rose-700">
                    {record.employeeName}
                  </span>
                )}
              </div>
              {record.notes && (
                <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">{record.notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="w-full py-2.5 rounded-xl border border-emerald-200 bg-white text-[11px] font-bold text-emerald-800 hover:bg-emerald-50 transition flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" /> Record Cash Collected
        </button>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3 border-t border-emerald-100 pt-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Amount (₹)</span>
              <input
                type="number"
                min="1"
                step="0.01"
                required
                value={form.amount}
                onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-xl border border-emerald-100 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-400"
                placeholder="120000"
              />
            </label>

            <label className="block">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Mode of Payment</span>
              <select
                value={form.paymentMode}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentMode: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-xl border border-emerald-100 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-400"
              >
                {PAYMENT_MODES.map((mode) => (
                  <option key={mode.value} value={mode.value}>{mode.label}</option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Calendar className="w-3 h-3" /> Date & Time
              </span>
              <input
                type="datetime-local"
                required
                value={form.paymentAt}
                onChange={(e) => setForm((prev) => ({ ...prev, paymentAt: e.target.value }))}
                className="mt-1 w-full h-9 px-3 rounded-xl border border-emerald-100 bg-white text-xs font-bold text-slate-800 outline-none focus:border-emerald-400"
              />
            </label>

            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <CreditCard className="w-3 h-3" /> Transaction ID
                </span>
                <input
                  type="text"
                  value={form.transactionId}
                  onChange={(e) => setForm((prev) => ({ ...prev, transactionId: e.target.value }))}
                  className="mt-1 w-full h-9 px-3 rounded-xl border border-emerald-100 bg-white text-xs font-semibold text-slate-800 outline-none focus:border-emerald-400"
                  placeholder="UPI ref / bank txn id"
                />
              </label>

              <label className="block">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <Upload className="w-3 h-3" /> Payment Slip
                </span>
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setForm((prev) => ({ ...prev, slip: e.target.files?.[0] || null }))}
                  className="mt-1 block w-full h-9 text-[11px] text-slate-600 file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-700 file:font-bold"
                />
                {form.slip && (
                  <p className="text-[9px] text-emerald-700 mt-1 font-semibold truncate">{form.slip.name}</p>
                )}
              </label>
            </div>

            <p className="sm:col-span-2 text-[9px] text-slate-400 -mt-1">
              Transaction ID and payment slip upload are both available — add one or both before saving.
            </p>

            <label className="block sm:col-span-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Notes
              </span>
              <textarea
                rows={2}
                value={form.notes}
                onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                className="mt-1 w-full px-3 py-2 rounded-xl border border-emerald-100 bg-white text-xs text-slate-700 outline-none focus:border-emerald-400 resize-none"
                placeholder="Optional notes about this payment"
              />
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setShowForm(false); setForm(emptyForm()); }}
              className="flex-1 py-2 rounded-xl border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold disabled:opacity-60 flex items-center justify-center gap-1.5"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Banknote className="w-3.5 h-3.5" />}
              Save Payment
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export { formatINR as formatCashINR, formatDateTime as formatCashDateTime, resolveSlipUrl };
