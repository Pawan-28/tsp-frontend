import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, MessageCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  WA_SCRIPT_PLACEHOLDERS,
  fetchWhatsAppScripts,
  createWhatsAppScript,
  updateWhatsAppScript,
  deleteWhatsAppScript,
  resolveWhatsAppScriptBody,
} from "../../lib/whatsappScripts.js";
import {
  EmpEmptyState, EmpModal, BtnPrimary, BtnSecondary, BtnGhost,
  FormLabel, FormInput, FormGroup,
} from "../components/EmpUI.jsx";

const CATEGORIES = ["General", "Follow-up", "Introduction", "Proposal", "Payment", "Reminder"];

const EMPTY_FORM = { title: "", body: "", category: "General" };

function ScriptCard({ script, onEdit, onDelete, onCopy, previewLead, employee }) {
  const preview = resolveWhatsAppScriptBody(script.body, { lead: previewLead, employee });

  return (
    <article className="rounded-xl sm:rounded-2xl border border-slate-200/80 bg-white p-3 sm:p-4 hover:border-emerald-200 hover:shadow-sm transition min-w-0">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate">{script.title}</p>
          <Badge tone="muted">{script.category}</Badge>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => onCopy(preview)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Copy">
            <Copy className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onEdit(script)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100" title="Edit">
            <Pencil className="w-4 h-4" />
          </button>
          <button type="button" onClick={() => onDelete(script)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      <p className="text-xs text-slate-600 whitespace-pre-wrap line-clamp-4 leading-relaxed">{preview}</p>
    </article>
  );
}

export default function EmployeeWhatsAppScripts() {
  const { employee, leads } = useEmployee();
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const previewLead = useMemo(
    () => leads?.[0] || { name: "Rajesh", company: "Tech Corp" },
    [leads],
  );

  const loadScripts = useCallback(async () => {
    if (!employee?.id) return;
    setLoading(true);
    try {
      const items = await fetchWhatsAppScripts(employee.id, { includeInactive: true });
      setScripts(items);
    } catch {
      toast.error("Could not load WhatsApp scripts");
      setScripts([]);
    } finally {
      setLoading(false);
    }
  }, [employee?.id]);

  useEffect(() => {
    loadScripts();
  }, [loadScripts]);

  const categories = useMemo(() => {
    const set = new Set(scripts.map((s) => s.category).filter(Boolean));
    return ["all", ...Array.from(set)];
  }, [scripts]);

  const filtered = useMemo(() => {
    let list = scripts;
    if (category !== "all") list = list.filter((s) => s.category === category);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.title.toLowerCase().includes(q) ||
          s.body.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q),
      );
    }
    return list;
  }, [scripts, search, category]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (script) => {
    setEditing(script);
    setForm({ title: script.title, body: script.body, category: script.category || "General" });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast.error("Title and message are required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateWhatsAppScript(editing.id, {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
        });
        toast.success("Script updated");
      } else {
        await createWhatsAppScript(employee.id, {
          title: form.title.trim(),
          body: form.body.trim(),
          category: form.category,
        });
        toast.success("Script created");
      }
      closeModal();
      await loadScripts();
    } catch (err) {
      toast.error(err?.message || "Could not save script");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (script) => {
    if (!window.confirm(`Delete "${script.title}"?`)) return;
    try {
      await deleteWhatsAppScript(script.id);
      toast.success("Script deleted");
      await loadScripts();
    } catch {
      toast.error("Could not delete script");
    }
  };

  const copyText = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success("Copied to clipboard");
  };

  const insertPlaceholder = (key) => {
    setForm((prev) => ({ ...prev, body: `${prev.body}${prev.body ? " " : ""}${key}` }));
  };

  return (
    <div className="space-y-3 sm:space-y-5 page-shell min-w-0 animate-fade-in">
      <div className="grid grid-cols-2 xl:grid-cols-3 gap-2 sm:gap-3">
        <StatCard compact label="Total Scripts" value={String(scripts.length)} icon={MessageCircle} tone="success" change="your templates" sub="" />
        <StatCard compact label="Categories" value={String(Math.max(categories.length - 1, 0))} icon={MessageCircle} tone="info" change="organized" sub="" />
        <StatCard compact label="Use in Follow-ups" value="WhatsApp" icon={MessageCircle} tone="primary" change="pick & send" sub="" />
      </div>

      <GlassCard className="p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scripts…"
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="py-2 px-3 rounded-xl border border-slate-200 text-sm bg-white"
          >
            {categories.map((c) => (
              <option key={c} value={c}>{c === "all" ? "All categories" : c}</option>
            ))}
          </select>
          <BtnPrimary type="button" onClick={openCreate} className="shrink-0 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4" />
            New Script
          </BtnPrimary>
        </div>

        <p className="text-[10px] text-slate-400">
          Use placeholders like {"{name}"}, {"{company}"}, {"{repName}"} — they auto-fill when sending from Follow-ups.
        </p>
      </GlassCard>

      <GlassCard className="p-3 sm:p-4">
        {loading ? (
          <p className="text-sm text-slate-400 text-center py-12">Loading scripts…</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 space-y-3">
            <EmpEmptyState
              title="No WhatsApp scripts yet"
              subtitle="Create message templates to quickly share on WhatsApp from Follow-ups."
            />
            <BtnPrimary type="button" onClick={openCreate} className="mx-auto bg-emerald-600 hover:bg-emerald-700">
              <Plus className="w-4 h-4" />
              Create first script
            </BtnPrimary>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((script) => (
              <ScriptCard
                key={script.id}
                script={script}
                onEdit={openEdit}
                onDelete={handleDelete}
                onCopy={copyText}
                previewLead={previewLead}
                employee={employee}
              />
            ))}
          </div>
        )}
      </GlassCard>

      <EmpModal
        open={modalOpen}
        onClose={closeModal}
        title={editing ? "Edit WhatsApp Script" : "New WhatsApp Script"}
        subtitle="Templates are used when you tap WhatsApp on a follow-up card"
      >
        <div className="space-y-3">
          <FormGroup>
            <FormLabel>Title</FormLabel>
            <FormInput
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="e.g. Follow-up after no pickup"
            />
          </FormGroup>

          <FormGroup>
            <FormLabel>Category</FormLabel>
            <select
              value={form.category}
              onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-sm bg-white"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </FormGroup>

          <FormGroup>
            <FormLabel>Message</FormLabel>
            <textarea
              value={form.body}
              onChange={(e) => setForm((p) => ({ ...p, body: e.target.value }))}
              rows={6}
              placeholder="Hi {name}, this is {repName} from TechSales…"
              className="w-full py-2 px-3 rounded-xl border border-slate-200 text-sm resize-y min-h-[120px] focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </FormGroup>

          <div className="flex flex-wrap gap-1.5">
            {WA_SCRIPT_PLACEHOLDERS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                onClick={() => insertPlaceholder(key)}
                className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-emerald-50 hover:border-emerald-200"
              >
                {key}
                <span className="text-slate-400 ml-1">{label}</span>
              </button>
            ))}
          </div>

          {form.body.trim() && (
            <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 mb-1">Preview</p>
              <p className="text-xs text-slate-700 whitespace-pre-wrap">{resolveWhatsAppScriptBody(form.body, { lead: previewLead, employee })}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <BtnGhost type="button" onClick={closeModal} className="flex-1">Cancel</BtnGhost>
            <BtnPrimary type="button" onClick={handleSave} disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
              {saving ? "Saving…" : editing ? "Update Script" : "Create Script"}
            </BtnPrimary>
          </div>
        </div>
      </EmpModal>
    </div>
  );
}
