import { useState } from "react";
import { User, Phone, Check, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiPut, apiPost, invalidateCache } from "../lib/api.js";
import { getCrmHeaders } from "../lib/crmContext.js";

export async function saveContactNameToDatabase({ leadId, phone, name }) {
  if (!name || !name.trim()) {
    throw new Error("Please enter a valid contact name");
  }
  const cleanName = name.trim();
  const cleanPhone = String(phone || "").replace(/\D/g, "");

  // 1. If leadId exists, update lead directly
  if (leadId && /^\d+$/.test(String(leadId))) {
    try {
      const res = await apiPut(`/api/v1/leads/${leadId}`, {
        leadName: cleanName,
        name: cleanName,
        phone: cleanPhone || phone,
      }, { headers: getCrmHeaders() });
      invalidateCache("/api/v1");
      return res?.data || res;
    } catch {
      /* Fallback to phone upsert */
    }
  }

  // 2. Create or upsert lead by phone number
  const res = await apiPost("/api/v1/leads", {
    leadName: cleanName,
    name: cleanName,
    phone: cleanPhone || phone,
    source: "Callyzer Call",
    pipelineStage: "New Lead",
    temperature: "Cold Lead",
  }, { headers: getCrmHeaders() });

  invalidateCache("/api/v1");
  return res?.data || res;
}

export default function SaveContactModal({ isOpen, onClose, phone, initialName = "", leadId = null, onSaved }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !name.trim()) {
      toast.error("Please enter a contact name");
      return;
    }

    try {
      setSaving(true);
      const cleanName = name.trim();
      const savedLead = await saveContactNameToDatabase({ leadId, phone, name: cleanName });
      toast.success(`Saved contact name "${cleanName}" to database`);
      if (onSaved) onSaved(cleanName, savedLead);
      onClose();
    } catch (err) {
      toast.error(err.message || "Failed to save contact name");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div
        className="bg-white rounded-2xl border border-rose-100 shadow-2xl w-full max-w-md p-5 sm:p-6 space-y-4 relative"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 grid place-items-center text-rose-600 shrink-0">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 leading-tight">Save Contact Name</h3>
            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <Phone className="w-3 h-3 text-rose-500 inline" />
              <span className="font-mono font-bold text-slate-700">{phone || "Unknown Number"}</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              Contact / Lead Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ankit Mehta, Rahul Sharma..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-rose-200 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 font-semibold text-slate-900 text-sm outline-none transition"
              autoFocus
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold text-xs shadow-md shadow-rose-500/20 transition flex items-center gap-2"
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
              <span>{saving ? "Saving to DB..." : "Save Contact"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
