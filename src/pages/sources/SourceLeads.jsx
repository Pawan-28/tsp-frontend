import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Search, ClipboardList, CheckCircle2, IndianRupee, ChevronLeft, ChevronRight as ChevronRightIcon,
} from "lucide-react";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { apiGet } from "../../lib/api.js";
import { fetchAllLeads } from "../../lib/leadSync.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";
import {
  filterLeadsBySourceKey,
  filterLeadsForSourceDashboard,
  formatSourceRevenue,
  getSourceLabel,
  leadRevenue,
  isLeadConverted,
} from "../../lib/leadSource.js";

const LEAD_STATUS_TONE = {
  NEW: "info",
  HOT: "danger",
  QUALIFIED: "purple",
  CONTACTED: "warning",
  CONVERTED: "success",
};

const PAGE_SIZE = 10;

function mapLeadRow(lead) {
  const revenue = leadRevenue(lead);
  const stage = String(lead.pipelineStage || lead.pipeline_stage || lead.status || "NEW").toUpperCase();
  const temp = String(lead.temperature || "").toUpperCase();
  let status = "NEW";
  if (isLeadConverted(lead) || stage.includes("CONVERT") || stage.includes("WON")) status = "CONVERTED";
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
    name: lead.leadName || lead.lead_name || lead.name || "Unknown",
    phone: lead.phone || "—",
    email: lead.email || "",
    service: lead.formName || lead.form_name || lead.requirements || "—",
    status,
    agent,
    amount: revenue,
    created: (lead.createdAt || lead.created_at || new Date().toISOString()).split("T")[0],
  };
}

export default function SourceLeads() {
  const { sourceKey } = useParams();
  const decodedKey = decodeURIComponent(sourceKey || "");
  const sourceLabel = getSourceLabel(decodedKey);

  const [allLeads, setAllLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const items = await fetchAllLeads(apiGet, { headers: getAdminCrmHeaders() });
        if (!cancelled) {
          const marketing = filterLeadsForSourceDashboard(items);
          const filtered = filterLeadsBySourceKey(marketing, decodedKey);
          setAllLeads(filtered.map(mapLeadRow));
        }
      } catch {
        if (!cancelled) setAllLeads([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [decodedKey]);

  const filtered = useMemo(() => {
    return allLeads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (q && !l.name.toLowerCase().includes(q) && !l.email.toLowerCase().includes(q) && !l.phone.includes(q)) {
        return false;
      }
      return true;
    });
  }, [allLeads, search, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageLeads = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const convertedCount = allLeads.filter((l) => l.status === "CONVERTED").length;
  const totalEarnings = allLeads.reduce((sum, l) => sum + (l.amount || 0), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-slate-400">Loading {sourceLabel} leads…</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 page-shell min-w-0">
      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <Link to="/sources" className="text-[10px] font-bold text-rose-600 hover:underline">← Sources</Link>
            <h1 className="text-lg font-black text-slate-900 mt-1">{sourceLabel}</h1>
            <p className="text-[11px] text-slate-500">All leads from this source channel</p>
          </div>
        </div>
      </GlassCard>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Leads" value={String(allLeads.length)} icon={ClipboardList} iconBg="bg-rose-50" iconColor="text-rose-600" hover={false} />
        <StatCard label="Converted" value={String(convertedCount)} icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" hover={false} />
        <StatCard label="Total Earnings" value={formatSourceRevenue(totalEarnings)} icon={IndianRupee} iconBg="bg-sky-50" iconColor="text-sky-600" hover={false} />
        <StatCard
          label="Avg / Lead"
          value={allLeads.length ? formatSourceRevenue(totalEarnings / allLeads.length) : "₹0"}
          icon={IndianRupee}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
          hover={false}
        />
      </div>

      <GlassCard className="p-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-300" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by name, email, phone…"
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-rose-100 text-sm outline-none focus:border-rose-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-10 px-3 rounded-xl border border-rose-100 text-xs font-semibold"
          >
            <option value="all">All statuses</option>
            {Object.keys(LEAD_STATUS_TONE).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {pageLeads.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-10">No leads from {sourceLabel} yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 border-b border-rose-50">
                  <th className="py-2 pr-2">Lead</th>
                  <th className="py-2 pr-2">Phone</th>
                  <th className="py-2 pr-2">Service</th>
                  <th className="py-2 pr-2">Status</th>
                  <th className="py-2 pr-2">Agent</th>
                  <th className="py-2 pr-2">Amount</th>
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
                    <td className="py-2.5 pr-2 text-slate-600 tabular-nums">{lead.phone}</td>
                    <td className="py-2.5 pr-2 text-slate-600">{lead.service}</td>
                    <td className="py-2.5 pr-2">
                      <Badge tone={LEAD_STATUS_TONE[lead.status] || "muted"}>{lead.status}</Badge>
                    </td>
                    <td className="py-2.5 pr-2 text-slate-600">{lead.agent}</td>
                    <td className="py-2.5 pr-2 font-bold text-rose-700 tabular-nums">{formatSourceRevenue(lead.amount)}</td>
                    <td className="py-2.5 text-slate-500">{lead.created}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-2">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="p-2 rounded-lg border border-rose-100 disabled:opacity-40">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="p-2 rounded-lg border border-rose-100 disabled:opacity-40">
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
