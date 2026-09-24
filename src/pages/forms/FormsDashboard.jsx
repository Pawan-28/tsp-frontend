import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search, ClipboardList, Users, CheckCircle2, Star,
  MousePointerClick, Instagram, Globe, Linkedin, MessageCircle,
  Eye, Pencil, Pause, Play, Trash2, Filter,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import {
  FORM_SOURCES, FORM_STATUSES, FORM_SERVICES,
  formatFormRevenue, getFormsSummary,
} from "../../data/formsMock.js";
import { apiGet, apiPost, apiPut, invalidateCache } from "../../lib/api.js";
import FormBuilderDrawer from "./FormBuilder.jsx";

const SOURCE_ICONS = {
  google_ads: MousePointerClick,
  instagram: Instagram,
  website: Globe,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
};

function statusTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "PAUSED") return "warning";
  return "muted";
}

export default function FormsDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderFormId, setBuilderFormId] = useState(null);
  const [savingForm, setSavingForm] = useState(false);

  const loadForms = async () => {
    try {
      const data = await apiGet("/api/forms", { skipCache: true, cacheTtl: 0 });
      if (data.success && Array.isArray(data.forms)) {
        setForms(data.forms);
        return;
      }
    } catch {
      // keep current list / mock fallback
    }
  };

  useEffect(() => {
    loadForms();
  }, []);

  useEffect(() => {
    const action = searchParams.get("action");
    const formId = searchParams.get("formId");
    if (action === "createForm") {
      setBuilderFormId(null);
      setBuilderOpen(true);
    } else if (action === "editForm" && formId) {
      setBuilderFormId(formId);
      setBuilderOpen(true);
    }
  }, [searchParams]);

  const closeBuilder = () => {
    setBuilderOpen(false);
    setBuilderFormId(null);
    if (searchParams.get("action")) {
      setSearchParams({}, { replace: true });
    }
  };

  const openCreateForm = () => {
    setBuilderFormId(null);
    setBuilderOpen(true);
  };

  const openEditForm = (formId) => {
    setBuilderFormId(formId);
    setBuilderOpen(true);
  };

  const saveLocalForm = (payload, isDraft, existingId = null) => {
    const id = existingId || `local-${Date.now()}`;
    const form = { ...payload, id };
    setForms((prev) => {
      if (existingId) {
        return prev.map((f) => (f.id === existingId ? { ...f, ...form } : f));
      }
      return [form, ...prev];
    });
    closeBuilder();
    toast.success(isDraft ? "Draft saved locally (server unavailable)" : "Form saved locally (server unavailable)");
  };

  const handleSaveForm = async (payload, isDraft) => {
    setSavingForm(true);
    try {
      const data = builderFormId
        ? await apiPut(`/api/forms/${builderFormId}`, payload)
        : await apiPost("/api/forms", payload);

      if (data.success && data.form?.id) {
        setForms((prev) => {
          if (builderFormId) {
            return prev.map((f) => (f.id === builderFormId ? data.form : f));
          }
          return [data.form, ...prev];
        });
        invalidateCache("/api/forms");
        closeBuilder();
        toast.success(isDraft ? "Draft saved" : builderFormId ? "Form updated" : "Form published");
        return;
      }

      toast.error(data.message || "Failed to save form");
      saveLocalForm(payload, isDraft, builderFormId);
    } catch (error) {
      console.error("Save form error:", error);
      toast.error(error.message || "Could not reach server");
      saveLocalForm(payload, isDraft, builderFormId);
    } finally {
      setSavingForm(false);
    }
  };

  const editingForm = builderFormId ? forms.find((f) => f.id === builderFormId) || null : null;

  const filtered = useMemo(() => {
    return forms.filter((f) => {
      if (sourceFilter !== "all" && f.sourceKey !== sourceFilter) return false;
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (serviceFilter !== "all" && f.service !== serviceFilter) return false;
      if (search.trim() && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [forms, search, sourceFilter, statusFilter, serviceFilter]);

  const summary = useMemo(() => getFormsSummary(forms), [forms]);

  const togglePause = (id) => {
    setForms((prev) =>
      prev.map((f) => {
        if (f.id !== id) return f;
        const next = f.status === "ACTIVE" ? "PAUSED" : "ACTIVE";
        toast.success(`${f.name} ${next === "ACTIVE" ? "activated" : "paused"}`);
        return { ...f, status: next };
      }),
    );
  };

  const deleteForm = (id) => {
    setForms((prev) => prev.filter((f) => f.id !== id));
    toast.success("Form removed");
  };

  return (
    <div className="space-y-5 page-shell min-w-0">

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Forms" value={String(summary.totalForms)} icon={ClipboardList} iconBg="bg-rose-50" iconColor="text-rose-600" />
        <StatCard label="Total Leads Generated" value={summary.totalLeads >= 1000 ? `${(summary.totalLeads / 1000).toFixed(1)}k` : String(summary.totalLeads)} icon={Users} iconBg="bg-emerald-50" iconColor="text-emerald-600" />
        <StatCard label="Active Forms" value={String(summary.activeForms)} icon={CheckCircle2} iconBg="bg-sky-50" iconColor="text-sky-600" hover={false} />
        <StatCard label="Top Performing Source" value={summary.topSource} icon={Star} iconBg="bg-amber-50" iconColor="text-amber-600" hover={false} />
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
            />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { value: sourceFilter, set: setSourceFilter, opts: FORM_SOURCES },
              { value: statusFilter, set: setStatusFilter, opts: FORM_STATUSES },
              { value: serviceFilter, set: setServiceFilter, opts: FORM_SERVICES },
            ].map(({ value, set, opts }, i) => (
              <select
                key={i}
                value={value}
                onChange={(e) => set(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white text-slate-800 text-xs font-semibold py-2.5 px-3 outline-none focus:border-rose-400"
              >
                {opts.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            ))}
            <div className="hidden sm:flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Filters
            </div>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((form) => {
          const Icon = SOURCE_ICONS[form.sourceKey] || ClipboardList;
          return (
            <GlassCard key={form.id} hover className="p-3.5 sm:p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-xs font-bold text-slate-900 truncate">{form.name}</h3>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">Source: {form.source}</p>
                  </div>
                </div>
                <Badge tone={statusTone(form.status)}>{form.status}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-3 flex-1">
                {[
                  ["Leads", form.leads.toLocaleString()],
                  ["Revenue", formatFormRevenue(form.revenue)],
                  ["Conversion", `${form.conversion}%`],
                  ["Service", form.service],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-md bg-slate-50/80 border border-slate-100 px-2 py-1.5">
                    <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{label}</p>
                    <p className="text-[11px] font-bold text-slate-800 mt-1 truncate">{val}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-2.5 border-t border-rose-50">
                <Link
                  to={`/forms/${form.id}`}
                  className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 hover:text-rose-800"
                >
                  <Eye className="w-3 h-3" />
                  View Leads
                </Link>
                <div className="flex items-center gap-0.5">
                  <button type="button" onClick={() => openEditForm(form.id)} className="w-7 h-7 rounded-md hover:bg-rose-50 text-slate-500 hover:text-rose-700 grid place-items-center" title="Edit">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button type="button" onClick={() => togglePause(form.id)} className="w-7 h-7 rounded-md hover:bg-rose-50 text-slate-500 hover:text-rose-700 grid place-items-center" title={form.status === "ACTIVE" ? "Pause" : "Activate"}>
                    {form.status === "ACTIVE" ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button type="button" onClick={() => deleteForm(form.id)} className="w-7 h-7 rounded-md hover:bg-rose-50 text-rose-500 hover:text-rose-700 grid place-items-center" title="Delete">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </GlassCard>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <GlassCard className="p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">No forms match your filters</p>
          <button type="button" onClick={openCreateForm} className="mt-3 text-xs font-bold text-rose-700 hover:underline">
            Create your first form
          </button>
        </GlassCard>
      )}

      <FormBuilderDrawer
        open={builderOpen}
        onClose={closeBuilder}
        existingForm={editingForm}
        onSave={handleSaveForm}
        saving={savingForm}
      />
    </div>
  );
}
