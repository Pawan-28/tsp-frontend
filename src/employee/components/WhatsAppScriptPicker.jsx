import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageCircle, Search, Send, X } from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "../../components/Primitives.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  fetchWhatsAppScripts,
  resolveWhatsAppScriptBody,
  openWhatsAppChat,
} from "../../lib/whatsappScripts.js";
import { EmpModal, BtnPrimary, BtnSecondary, BtnGhost } from "./EmpUI.jsx";

export default function WhatsAppScriptPicker({ open, onClose, lead, phone }) {
  const navigate = useNavigate();
  const { employee } = useEmployee();
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!open || !employee?.id) return undefined;
    let cancelled = false;
    setLoading(true);
    fetchWhatsAppScripts(employee.id)
      .then((items) => {
        if (!cancelled) {
          setScripts(items);
          setSelectedId(items[0]?.id ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setScripts([]);
          toast.error("Could not load WhatsApp scripts");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [open, employee?.id]);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setSelectedId(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scripts;
    return scripts.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q),
    );
  }, [scripts, search]);

  const selected = filtered.find((s) => s.id === selectedId) || filtered[0] || null;

  const preview = useMemo(
    () => resolveWhatsAppScriptBody(selected?.body, { lead, employee }),
    [selected?.body, lead, employee],
  );

  const handleSend = () => {
    if (!phone) {
      toast.error("Phone number not found for this lead");
      return;
    }
    if (!selected) {
      toast.error("Select a script first");
      return;
    }
    if (!openWhatsAppChat(phone, preview)) {
      toast.error("Invalid phone number");
      return;
    }
    toast.success("Opening WhatsApp…");
    onClose?.();
  };

  if (!open) return null;

  return (
    <EmpModal
      open={open}
      onClose={onClose}
      title="Send WhatsApp Script"
      subtitle={lead?.name ? `${lead.name}${lead.company ? ` · ${lead.company}` : ""}` : "Pick a script to share"}
    >
      <div className="space-y-3">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-8">Loading scripts…</p>
        ) : scripts.length === 0 ? (
          <div className="text-center py-6 space-y-3">
            <p className="text-sm text-slate-500">No WhatsApp scripts yet.</p>
            <BtnSecondary type="button" onClick={() => { onClose?.(); navigate("/employee/whatsapp-scripts"); }}>
              Create scripts
            </BtnSecondary>
          </div>
        ) : (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search scripts…"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
            </div>

            <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-100 rounded-xl p-1.5">
              {filtered.map((script) => {
                const active = selected?.id === script.id;
                return (
                  <button
                    key={script.id}
                    type="button"
                    onClick={() => setSelectedId(script.id)}
                    className={`w-full text-left rounded-lg px-3 py-2 transition ${
                      active ? "bg-emerald-50 border border-emerald-200" : "hover:bg-slate-50 border border-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-slate-900 truncate">{script.title}</p>
                      <Badge tone="muted">{script.category}</Badge>
                    </div>
                    <p className="text-[10px] text-slate-500 line-clamp-1 mt-0.5">{script.body}</p>
                  </button>
                );
              })}
            </div>

            {selected && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1.5">Preview</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{preview}</p>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <BtnGhost type="button" onClick={onClose} className="flex-1">
                <X className="w-4 h-4" />
                Cancel
              </BtnGhost>
              <BtnPrimary type="button" onClick={handleSend} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                <Send className="w-4 h-4" />
                Send on WhatsApp
              </BtnPrimary>
            </div>
          </>
        )}
      </div>
    </EmpModal>
  );
}
