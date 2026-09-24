import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Share2, Download, Pencil, Trash2, Bot, Database, Target, Briefcase, Code,
  Users, DollarSign, TrendingUp, CheckCircle2, Zap, UserCheck, RefreshCw, UserPlus, ShieldAlert,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { formatServiceMoney, formatServicePriceLabel, serviceBadgeTone } from "../../data/servicesMock.js";
import { apiGet, apiDelete, apiPost, apiPut } from "../../lib/api.js";
import { extractLeadService, cleanServiceName, leadBelongsToService } from "../../lib/servicesRegistry.js";

const DEFAULT_EMPLOYEES = [
  { id: "1", name: "Amit Kumar", role: "Sales Manager" },
  { id: "2", name: "Aryan gupta", role: "sales" },
  { id: "3", name: "Neha Patel", role: "Sales Executive" },
  { id: "4", name: "Padam Gupta", role: "Manager" },
  { id: "5", name: "Piyush Dhingra", role: "Sales Manager" },
  { id: "6", name: "Priya Sharma", role: "Sales Executive" },
  { id: "7", name: "Ritik Verma", role: "Sales Manager" },
  { id: "8", name: "Rohan Verma", role: "Sales Executive" },
  { id: "9", name: "Sarita", role: "sales manager" },
  { id: "10", name: "Sourav", role: "sales manager" },
  { id: "11", name: "Sushmit Verma", role: "Sales Executive" },
];

const ICON_MAP = {
  bot: Bot,
  database: Database,
  target: Target,
  briefcase: Briefcase,
  code: Code,
};

export default function ServiceDetail() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [serviceLeads, setServiceLeads] = useState([]);
  const [loading, setLoading] = useState(true);

  const [assignedEmpIds, setAssignedEmpIds] = useState([]);
  const [autoTransferEnabled, setAutoTransferEnabled] = useState(true);
  const [allEmployees, setAllEmployees] = useState(DEFAULT_EMPLOYEES);
  const [savingRules, setSavingRules] = useState(false);
  const [distributingNow, setDistributingNow] = useState(false);

  const handleDeleteService = async () => {
    if (!service) return;
    if (!window.confirm(`Are you sure you want to delete the service "${service.name}"?`)) return;
    try {
      await apiDelete(`/api/services/${service.id}`);
      toast.success(`Service "${service.name}" deleted successfully`);
      navigate("/services");
    } catch (err) {
      toast.error(`Failed to delete service: ${err.message || String(err)}`);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const empRes = await apiGet("/api/v1/team/employees", { skipCache: true, cacheTtl: 0 }).catch(() => apiGet("/api/v1/employees", { skipCache: true, cacheTtl: 0 }));
        const list = Array.isArray(empRes) ? empRes : (empRes?.employees || empRes?.data || []);
        const activeOnly = list.filter((e) => {
          const s = String(e.status || "active").trim().toLowerCase();
          return s === "active";
        });
        if (!cancelled) {
          setAllEmployees(activeOnly.map((e) => ({
            id: String(e.id),
            name: e.name || `Employee ${e.id}`,
            role: e.role || e.department || "Sales",
          })));
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [svcRes, leadsRes] = await Promise.allSettled([
          apiGet("/api/services", { skipCache: true, cacheTtl: 0 }),
          apiGet("/api/v1/leads?limit=500&page=1"),
        ]);
        
        const servicesList = svcRes.status === "fulfilled" && Array.isArray(svcRes.value?.services)
          ? svcRes.value.services
          : [];

        const leadsList = leadsRes.status === "fulfilled"
          ? (Array.isArray(leadsRes.value) ? leadsRes.value : (leadsRes.value?.data || leadsRes.value?.leads || []))
          : [];

        const cleanParam = String(serviceId || "").toLowerCase().replace(/^svc-/, "").replace(/[^a-z0-9]+/g, "-");

        let found = servicesList.find((s) => {
          const sIdClean = String(s.id || "").toLowerCase().replace(/^svc-/, "").replace(/[^a-z0-9]+/g, "-");
          const sNameClean = String(s.name || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
          return String(s.id) === String(serviceId) ||
            sIdClean === cleanParam ||
            sNameClean === cleanParam ||
            String(s.name || "").toLowerCase() === String(serviceId).toLowerCase();
        }) || null;

        if (!found && serviceId) {
          let matchedName = "";
          for (const l of leadsList) {
            const extracted = extractLeadService(l);
            if (extracted) {
              const slug = extracted.toLowerCase().replace(/[^a-z0-9]+/g, "-");
              if (slug === cleanParam || extracted.toLowerCase() === String(serviceId).toLowerCase()) {
                matchedName = extracted;
                break;
              }
            }
          }

          if (!matchedName && cleanParam) {
            matchedName = cleanParam
              .split("-")
              .filter(Boolean)
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(" ");
          }

          if (matchedName) {
            found = {
              id: serviceId,
              name: matchedName,
              category: "general",
              categoryLabel: "General Services",
              status: "ACTIVE",
              badge: "POPULAR",
              description: `Auto-created service offering for ${matchedName}`,
              revenue: 0,
              leads: 0,
              converted: 0,
              convRate: 0,
              priceNum: 0,
              price: "Custom",
              icon: "briefcase",
            };
          }
        }

        if (found) {
          const matching = leadsList.filter((l) => leadBelongsToService(l, found.name));
          found.leads = matching.length > 0 ? matching.length : Number(found.leads) || 0;
          found.converted = matching.length > 0
            ? matching.filter((l) => String(l.status || "").toLowerCase().includes("converted") || String(l.status || "").toLowerCase().includes("payment")).length
            : Number(found.converted) || 0;
          found.revenue = matching.length > 0
            ? matching.reduce((acc, l) => acc + (Number(l.expectedRevenue || l.expected_revenue) || 0), 0)
            : Number(found.revenue) || 0;
          found.convRate = found.leads > 0 ? Math.round((found.converted / found.leads) * 100) : Number(found.convRate) || 0;

          if (!cancelled) {
            setService(found);
            setServiceLeads(matching);
            setAutoTransferEnabled(found.distributionEnabled !== false);
            setAssignedEmpIds(Array.isArray(found.distributionEmployeeIds) ? found.distributionEmployeeIds.map((id) => String(id)) : []);
          }
        } else {
          if (!cancelled) {
            setService(null);
            setServiceLeads([]);
          }
        }
      } catch (err) {
        console.error("Error loading service details:", err);
        if (!cancelled) setService(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [serviceId]);

  const toggleEmployee = (empId) => {
    const sId = String(empId);
    setAssignedEmpIds((prev) =>
      prev.includes(sId) ? prev.filter((id) => id !== sId) : [...prev, sId]
    );
  };

  const handleSaveDistributionRules = async () => {
    if (!service) return;
    setSavingRules(true);
    try {
      const selectedNames = allEmployees
        .filter((e) => assignedEmpIds.includes(String(e.id)))
        .map((e) => e.name);

      await apiPut(`/api/services/${service.id}/distribution`, {
        enabled: autoTransferEnabled,
        employeeIds: assignedEmpIds,
        employeeNames: selectedNames,
      });

      setService((prev) => ({
        ...prev,
        distributionEnabled: autoTransferEnabled,
        distributionEmployeeIds: assignedEmpIds,
        distributionEmployeeNames: selectedNames,
      }));

      toast.success(`Saved lead routing rules for "${service.name}"!`);
    } catch (err) {
      toast.error(`Failed to save rules: ${err.message || String(err)}`);
    } finally {
      setSavingRules(false);
    }
  };

  const handleDistributeNow = async () => {
    if (!service) return;
    setDistributingNow(true);
    try {
      const res = await apiPost(`/api/services/${service.id}/distribute`, {});
      if (res?.assigned > 0) {
        toast.success(`Transferred ${res.assigned} unassigned lead(s) for "${service.name}"!`);
        const leadsRes = await apiGet("/api/v1/leads?limit=500&page=1");
        const freshLeads = Array.isArray(leadsRes) ? leadsRes : (leadsRes?.data || leadsRes?.leads || []);
        const matching = freshLeads.filter((l) => leadBelongsToService(l, service.name));
        setServiceLeads(matching);
      } else {
        toast.info(res?.message || `No unassigned leads pending for "${service.name}".`);
      }
    } catch (err) {
      toast.error(`Transfer failed: ${err.message || String(err)}`);
    } finally {
      setDistributingNow(false);
    }
  };

  if (loading) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm text-slate-400">Loading service…</p>
      </GlassCard>
    );
  }

  if (!service) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm text-slate-600">Service not found.</p>
        <Link to="/services" className="text-xs font-bold text-rose-700 mt-2 inline-block">Back to Services</Link>
      </GlassCard>
    );
  }

  const Icon = ICON_MAP[service.icon] || Bot;
  const unassignedCount = serviceLeads.filter((l) => {
    const assignee = l.assignedTo ?? l.assigned_to ?? l.assigneeId;
    const resolved = typeof assignee === "object" ? assignee?.id : assignee;
    return !resolved || String(resolved) === "0" || String(l.assignee_name || "").toLowerCase() === "unassigned";
  }).length;

  return (
    <div className="space-y-4 page-shell min-w-0 max-w-5xl">

      {/* ── Hero Header Card ── */}
      <div className="rounded-2xl overflow-hidden shadow-sm border border-rose-100">
        {/* gradient banner */}
        <div className="bg-gradient-to-r from-rose-600 to-rose-500 px-4 pt-4 pb-10 sm:pb-5 relative">
          <div className="absolute inset-0 opacity-10 pointer-events-none"
            style={{ backgroundImage: "radial-gradient(circle at 80% 20%, white 0%, transparent 60%)" }} />
          {/* back button */}
          <Link
            to="/services"
            className="inline-flex items-center gap-1.5 text-white/80 hover:text-white text-xs font-semibold transition mb-3"
            aria-label="Back to catalog"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm grid place-items-center shrink-0 border border-white/30">
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-black text-white leading-tight break-words drop-shadow-sm">
                {service.name}
              </h1>
              <p className="text-white/75 text-[11px] mt-0.5 font-medium">
                {service.categoryLabel} · {formatServicePriceLabel(service.price, service.priceNum)}
              </p>
            </div>
            {/* Desktop action buttons — shown inline in banner */}
            <div className="hidden sm:flex items-center gap-2 shrink-0 ml-auto">
              <button
                type="button"
                onClick={() => toast.success("Link copied")}
                className="h-8 w-8 rounded-xl bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition border border-white/20"
                title="Share"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toast.success("Export started")}
                className="h-8 w-8 rounded-xl bg-white/15 hover:bg-white/25 text-white inline-flex items-center justify-center transition border border-white/20"
                title="Export"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => navigate(`/services/${service.id}/edit`)}
                className="h-8 px-4 rounded-xl bg-white text-rose-700 text-xs font-bold hover:bg-rose-50 inline-flex items-center gap-1.5 shadow-sm transition"
              >
                <Pencil className="w-3.5 h-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={handleDeleteService}
                className="h-8 w-8 rounded-xl bg-white/15 hover:bg-red-100/30 text-white/80 hover:text-white inline-flex items-center justify-center border border-white/20 transition"
                title="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* white floating panel — mobile only (-mt-6 overlap), desktop hidden */}
        <div className="sm:hidden bg-white -mt-6 rounded-t-2xl px-4 pt-3 pb-4 relative shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          {/* status pill */}
          <div className="flex items-center gap-2 mb-3">
            <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
              service.status === "ACTIVE"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-slate-100 border-slate-200 text-slate-500"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${service.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"}`} />
              {service.status}
            </span>
            {service.badge && service.badge !== service.status && (
              <Badge tone={serviceBadgeTone(service.badge)}>{service.badge}</Badge>
            )}
          </div>
          {/* mobile action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast.success("Link copied")}
              className="h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center transition"
              title="Share"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => toast.success("Export started")}
              className="h-9 w-9 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 inline-flex items-center justify-center transition"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate(`/services/${service.id}/edit`)}
              className="h-9 flex-1 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 inline-flex items-center justify-center gap-1.5 shadow-sm transition"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button
              type="button"
              onClick={handleDeleteService}
              className="h-9 w-9 rounded-xl bg-red-50 hover:bg-red-100 text-red-500 inline-flex items-center justify-center border border-red-100 transition"
              title="Delete"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Desktop status bar */}
        <div className="hidden sm:flex items-center gap-2 bg-white px-5 py-2.5 border-t border-rose-50">
          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
            service.status === "ACTIVE"
              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
              : "bg-slate-100 border-slate-200 text-slate-500"
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${service.status === "ACTIVE" ? "bg-emerald-500" : "bg-slate-400"}`} />
            {service.status}
          </span>
          {service.badge && service.badge !== service.status && (
            <Badge tone={serviceBadgeTone(service.badge)}>{service.badge}</Badge>
          )}
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-2 gap-2.5">
        <StatCard label="Total Leads" value={service.leads >= 1000 ? `${(service.leads / 1000).toFixed(1)}k` : String(service.leads)} icon={Users} iconBg="bg-rose-50" iconColor="text-rose-600" hover={false} />
        <StatCard label="Converted" value={String(service.converted)} icon={CheckCircle2} iconBg="bg-emerald-50" iconColor="text-emerald-600" hover={false} />
        <StatCard label="Revenue" value={formatServiceMoney(service.revenue)} icon={DollarSign} iconBg="bg-sky-50" iconColor="text-sky-600" hover={false} />
        <StatCard label="Conv. Rate" value={`${service.convRate}%`} icon={TrendingUp} iconBg="bg-amber-50" iconColor="text-amber-600" hover={false} />
      </div>


      {/* Automated Lead Routing & Employee Assignment Panel */}
      <GlassCard className="p-4 sm:p-5 border-rose-200/80 bg-gradient-to-br from-rose-50/30 via-white to-rose-50/10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-rose-100 mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-rose-600 animate-pulse" />
              <h3 className="text-sm sm:text-base font-black text-slate-900">
                Automated Lead Transfer & Employee Assignment
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Leads coming for <strong className="text-slate-800">{service.name}</strong> will be automatically transferred to assigned employees every 15 minutes.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={distributingNow}
              onClick={handleDistributeNow}
              className="h-9 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white text-xs font-bold shadow-md shadow-rose-200 active:scale-95 transition inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 fill-white" />
              {distributingNow ? "Transferring Leads…" : "⚡ Run Auto-Transfer Now (Manual)"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          <div className="rounded-xl border border-rose-100 bg-white p-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900">15-Minute Automatic Background Transfer</p>
              <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                {autoTransferEnabled ? "🟢 Active — Runs background transfer every 15 min" : "🔴 Disabled — Manual transfer only"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAutoTransferEnabled(!autoTransferEnabled)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoTransferEnabled ? "bg-emerald-600" : "bg-slate-300"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoTransferEnabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <div className="rounded-xl border border-rose-100 bg-white p-3.5 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-slate-900">Unassigned Leads Pending</p>
              <p className="text-[10px] font-medium text-slate-500 mt-0.5">
                {unassignedCount} lead(s) for {service.name} ready for transfer
              </p>
            </div>
            <span className="text-lg font-black text-rose-700 tabular-nums px-3 py-1 rounded-xl bg-rose-50 border border-rose-200">
              {unassignedCount}
            </span>
          </div>
        </div>

        <div className="mt-4 pt-3.5 border-t border-rose-100">
          <label className="block text-xs font-bold text-slate-800 mb-2">
            Assign Employees to Handle "{service.name}" Leads:
          </label>
          <div className="flex flex-wrap gap-2 mb-3">
            {allEmployees.map((emp) => {
              const isSelected = assignedEmpIds.includes(String(emp.id));
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => toggleEmployee(String(emp.id))}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition cursor-pointer active:scale-95 ${
                    isSelected
                      ? "bg-rose-700 text-white border-rose-700 shadow-sm"
                      : "bg-white text-slate-700 border-slate-200 hover:border-rose-300 hover:bg-rose-50/50"
                  }`}
                >
                  <UserCheck className={`w-3.5 h-3.5 ${isSelected ? "text-white" : "text-slate-400"}`} />
                  <span>{emp.name}</span>
                  {emp.role && <span className="text-[9px] opacity-75 font-normal">({emp.role})</span>}
                </button>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-100">
            <p className="text-[10px] font-semibold text-slate-500">
              {assignedEmpIds.length > 0
                ? `Leads for "${service.name}" will be automatically distributed round-robin between ${assignedEmpIds.length} employee(s).`
                : "⚠️ Select at least 1 employee to enable round-robin lead transfer."}
            </p>
            <button
              type="button"
              disabled={savingRules}
              onClick={handleSaveDistributionRules}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition shadow-sm disabled:opacity-50 cursor-pointer self-end sm:self-auto"
            >
              {savingRules ? "Saving Rules…" : "Save Assignment Rules"}
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider mb-2">
          Service Architecture & Features
        </h3>
        <p className="text-sm text-slate-600 leading-relaxed mb-4">{service.description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {(service.features || []).map((f) => (
            <div key={f.title} className="rounded-xl border border-rose-100 bg-white p-3.5">
              <p className="text-xs font-bold text-slate-900">{f.title}</p>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 sm:p-5">
        <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider mb-3">Service Tiers</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {(service.tiers || []).map((tier) => (
            <div
              key={tier.name}
              className={`rounded-xl border p-3.5 flex flex-col ${
                tier.popular ? "border-rose-400 bg-rose-50/40 ring-1 ring-rose-200" : "border-rose-100 bg-white"
              }`}
            >
              {tier.popular && (
                <span className="self-start text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-rose-700 text-white mb-2">
                  Most Popular
                </span>
              )}
              <p className="text-sm font-black text-slate-900">{tier.name}</p>
              <p className="text-base font-black text-rose-700 mt-0.5">{formatServicePriceLabel(tier.price)}</p>
              <ul className="mt-2.5 space-y-1.5 flex-1">
                {tier.features.map((feat) => (
                  <li key={feat} className="flex items-start gap-2 text-[11px] text-slate-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                    {feat}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className={`mt-3 w-full py-2 rounded-xl text-xs font-bold transition ${
                  tier.popular ? "bg-rose-700 text-white hover:bg-rose-800" : "border border-rose-200 text-rose-800 hover:bg-rose-50"
                }`}
              >
                Select Plan
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

      <GlassCard className="p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider">
            Leads Under This Service ({serviceLeads.length})
          </h3>
          <Link to="/leads" className="text-xs font-bold text-rose-600 hover:text-rose-800">
            View All Leads →
          </Link>
        </div>

        {serviceLeads.length === 0 ? (
          <p className="text-xs text-slate-500 py-4 text-center">No leads currently assigned to this service.</p>
        ) : (
          <div className="max-h-[350px] overflow-y-auto overflow-x-auto border border-rose-100 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-white shadow-xs z-10">
                <tr className="border-b border-rose-100 text-slate-400 font-extrabold text-[10px] uppercase">
                  <th className="py-2.5 px-3">Lead Name</th>
                  <th className="py-2.5 px-3">Phone</th>
                  <th className="py-2.5 px-3">Stage / Status</th>
                  <th className="py-2.5 px-3">Assigned To</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rose-50">
                {serviceLeads.map((lead, idx) => (
                  <tr key={lead.id || idx} className="hover:bg-rose-50/50 transition">
                    <td className="py-2.5 px-3 font-bold text-slate-900">
                      {lead.leadName || lead.lead_name || lead.name || "Unknown Lead"}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-mono">
                      {lead.phone || lead.phone_number || "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="inline-block px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">
                        {lead.status || lead.pipelineStage || lead.pipeline_stage || "New Lead"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 font-medium">
                      {typeof lead.assignedTo === "object" ? lead.assignedTo?.name : (lead.assignee_name || lead.employeeName || "Unassigned")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
