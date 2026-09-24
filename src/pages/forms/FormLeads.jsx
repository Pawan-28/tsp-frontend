import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  Download, Plus, Search, Flame, ClipboardList,
  CheckCircle2, Calendar, Filter, ChevronLeft, ChevronRight as ChevronRightIcon,
  IndianRupee, Clock,
} from "lucide-react";
import toast from "react-hot-toast";
import AddLeadDrawer from "../../components/AddLeadDrawer.jsx";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { FORM_SERVICES, formatFormRevenue } from "../../data/formsMock.js";
import { apiGet } from "../../lib/api.js";
import { fetchAllLeads } from "../../lib/leadSync.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";

const LEAD_STATUS_TONE = {
  NEW: "info",
  HOT: "danger",
  QUALIFIED: "purple",
  CONTACTED: "warning",
  CONVERTED: "success",
};

const PAGE_SIZE = 8;

function mapApiLeadToFormRow(lead, fallbackService) {
  const revenue = Number(lead.expectedRevenue ?? lead.expected_revenue ?? 0);
  const stage = String(lead.pipelineStage || lead.pipeline_stage || lead.status || "NEW").toUpperCase();
  const temp = String(lead.temperature || "").toUpperCase();
  let status = "NEW";
  if (stage.includes("CONVERT") || stage.includes("WON")) status = "CONVERTED";
  else if (temp.includes("HOT")) status = "HOT";
  else if (stage.includes("QUAL")) status = "QUALIFIED";
  else if (stage.includes("CONTACT") || stage.includes("ATTEMPT")) status = "CONTACTED";

  const assignedTo = lead.assignedTo;
  const agent = (typeof assignedTo === "object" && assignedTo?.name)
    || lead.assigneeName
    || lead.assignee_name
    || "Unassigned";

  return {
    id: lead.id,
    name: lead.leadName || lead.lead_name || "Unknown",
    email: lead.email || "",
    service: lead.formName || lead.form_name || lead.requirements || fallbackService || "—",
    budget: revenue,
    status,
    agent,
    revenue,
    created: (lead.createdAt || lead.created_at || new Date().toISOString()).split("T")[0],
  };
}

function mapLeadToFormRow(newLead, fallbackService) {
  return mapApiLeadToFormRow(newLead, fallbackService);
}

export default function FormLeads() {
  const { formId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [form, setForm] = useState(null);
  const [baseLeads, setBaseLeads] = useState([]);
  const [extraLeads, setExtraLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const allLeads = useMemo(() => [...extraLeads, ...baseLeads], [extraLeads, baseLeads]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const formsRes = await apiGet("/api/forms", { skipCache: true, cacheTtl: 0 });
        const forms = formsRes?.forms || [];
        const matched = forms.find((f) => String(f.id) === String(formId)) || null;
        if (cancelled) return;
        setForm(matched);

        const items = await fetchAllLeads(apiGet, { headers: getAdminCrmHeaders() });
        const formName = matched?.name?.toLowerCase();
        const formService = matched?.service?.toLowerCase();
        const filtered = items.filter((lead) => {
          const leadForm = String(lead.formName || lead.form_name || "").toLowerCase();
          const leadSource = String(lead.source || "").toLowerCase();
          const leadService = String(lead.requirements || lead.service || "").toLowerCase();
          if (formName && leadForm === formName) return true;
          if (formName && leadSource.includes(formName.split(" ")[0])) return true;
          if (formService && leadService.includes(formService)) return true;
          return false;
        });
        setBaseLeads(filtered.map((l) => mapApiLeadToFormRow(l, matched?.service)));
      } catch {
        if (!cancelled) {
          setForm(null);
          setBaseLeads([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [formId]);

  useEffect(() => {
    if (searchParams.get("action") === "addLead") setAddOpen(true);
  }, [searchParams]);

  const handleAddClose = (newLead) => {
    if (newLead) {
      setExtraLeads((prev) => [mapLeadToFormRow(newLead, form?.service), ...prev]);
      toast.success("Lead added to form");
    }
    setAddOpen(false);
    if (searchParams.get("action")) {
      setSearchParams({}, { replace: true });
    }
  };

  const filtered = useMemo(() => {
    return allLeads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (serviceFilter !== "all" && l.service !== serviceFilter) return false;
      const q = search.toLowerCase();
      if (q && !l.name.toLowerCase().includes(q) && !l.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allLeads, search, statusFilter, serviceFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLeads = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hotCount = allLeads.filter((l) => l.status === "HOT").length;
  const convertedCount = allLeads.filter((l) => l.status === "CONVERTED").length;
  const totalRevenue = allLeads.reduce((sum, l) => sum + (l.revenue || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-slate-400">Loading form leads…</p>
      </div>
    );
  }

  if (!form) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm text-slate-600">Form not found.</p>
        <Link to="/forms" className="text-xs font-bold text-rose-700 mt-2 inline-block">Back to Forms</Link>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-4 page-shell min-w-0">
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link to="/forms" className="text-[10px] font-bold text-rose-600 hover:underline">← Forms</Link>
            <h1 className="text-lg font-black text-slate-900 mt-1">{form.name}</h1>
            <p className="text-[11px] text-slate-500">{form.source} · {form.service || "—"}</p>
          </div>
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="h-10 px-4 rounded-full bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 inline-flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Lead
          </button>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Leads" value={String(allLeads.length)} icon={ClipboardList} iconBg="bg-rose-50" iconColor="text-rose-600" hover={false} />
        <StatCard label="Hot Leads" value={String(hotCount)} icon={Flame} iconBg="bg-red-50" iconColor="text-red-600" hover={false} />
        <StatCard label="Converted" value={String(convertedCount)} icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" hover={false} />
        <StatCard label="Revenue" value={formatFormRevenue(totalRevenue)} icon={IndianRupee} iconBg="bg-sky-50" iconColor="text-sky-600" hover={false} />
      </div>

      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-300" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search leads…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-rose-100 text-sm outline-none focus:border-rose-400"
            />
          </div>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="h-10 px-3 rounded-xl border border-rose-100 text-xs font-semibold">
            <option value="all">All statuses</option>
            {Object.keys(LEAD_STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }} className="h-10 px-3 rounded-xl border border-rose-100 text-xs font-semibold">
            <option value="all">All services</option>
            {FORM_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {pageLeads.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No leads linked to this form yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-rose-50">
                  <th className="py-2 pr-2">Lead</th>
                  <th className="py-2 pr-2">Service</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Agent</th>
                  <th className="py-2 pr-2">Revenue</th>
                  <th className="py-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {pageLeads.map((lead) => (
                  <tr key={lead.id} className="border-b border-rose-50/80 hover:bg-rose-50/30">
                    <td className="py-2.5 pr-2">
                      <p className="font-bold text-slate-800">{lead.name}</p>
                      <p className="text-[10px] text-slate-400">{lead.email || "—"}</p>
                    </td>
                    <td className="py-2.5 pr-2 text-slate-600">{lead.service}</td>
                    <td className="py-2.5 pr-2"><Badge tone={LEAD_STATUS_TONE[lead.status] || "muted"}>{lead.status}</Badge></td>
                    <td className="py-2.5 pr-2 text-slate-600">{lead.agent}</td>
                    <td className="py-2.5 pr-2 font-bold text-rose-700 tabular-nums">{formatFormRevenue(lead.revenue)}</td>
                    <td className="py-2.5 text-slate-500">{lead.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-2 rounded-lg border border-rose-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-[10px] text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-rose-100 disabled:opacity-40"><ChevronRightIcon className="w-4 h-4" /></button>
          </div>
        )}
      </GlassCard>

      <AddLeadDrawer open={addOpen} onClose={handleAddClose} />
    </div>
  );
}
