import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Search, Download, Plus, Bot, Database, Target, Briefcase, Code,
  ChevronRight, Trash2,
} from "lucide-react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from "recharts";
import toast from "react-hot-toast";
import { GlassCard, Badge } from "../../components/Primitives.jsx";
import {
  getAllServices, SERVICE_CATEGORIES, SERVICE_STATUSES, SERVICE_PRICING_SORT,
  formatServiceMoney, formatServicePriceLabel, serviceBadgeTone,
} from "../../data/servicesMock.js";
import { apiGet, apiPost, apiDelete, invalidateCache } from "../../lib/api.js";
import { formatIndianNumber } from "../../lib/indianFormat.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";
import { cleanServiceName, extractLeadService, leadBelongsToService } from "../../lib/servicesRegistry.js";
import AddServiceDrawer from "./AddServiceDrawer.jsx";

const ICON_MAP = {
  bot: Bot,
  database: Database,
  target: Target,
  briefcase: Briefcase,
  code: Code,
};

function normalizeCatalogService(service = {}) {
  const merged = {
    badge: "ACTIVE",
    clients: 0,
    tags: [],
    icon: "bot",
    priceNum: 0,
    price: "",
    ...service,
  };
  return {
    ...merged,
    tags: Array.isArray(merged.tags) ? merged.tags : [],
    clients: Number(merged.clients) || 0,
    priceNum: Number(merged.priceNum) || 0,
    badge: merged.badge || "ACTIVE",
    icon: merged.icon || "bot",
  };
}

function ChartCardHeader({ title, subtitle }) {
  return (
    <div className="mb-2.5 pb-2 border-b border-rose-50">
      <h3 className="text-[11px] font-extrabold text-slate-800 tracking-tight">{title}</h3>
      <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>
    </div>
  );
}

export default function ServicesDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [catalog, setCatalog] = useState([]);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [priceSort, setPriceSort] = useState("high");
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [dataRes, leadsRes] = await Promise.allSettled([
          apiGet("/api/services", { headers: getAdminCrmHeaders(), skipCache: true, cacheTtl: 0 }),
          apiGet("/api/v1/leads?limit=500&page=1", { headers: getAdminCrmHeaders() }),
        ]);
        
        let services = dataRes.status === "fulfilled" && dataRes.value?.services?.length
          ? dataRes.value.services
          : getAllServices();
          
        let leads = leadsRes.status === "fulfilled"
          ? (Array.isArray(leadsRes.value) ? leadsRes.value : (leadsRes.value?.data || leadsRes.value?.leads || []))
          : [];

        const mergedServices = [...services];

        if (leads.length > 0) {
          mergedServices.forEach((svc) => {
            const svcName = svc.name;
            const matching = leads.filter((l) => leadBelongsToService(l, svcName));
            if (matching.length > 0) {
              svc.leads = matching.length;
              svc.converted = matching.filter((l) => 
                String(l.status || "").toLowerCase().includes("converted") || 
                String(l.status || "").toLowerCase().includes("payment")
              ).length;
              svc.revenue = matching.reduce((acc, l) => acc + (Number(l.expectedRevenue || l.expected_revenue) || 0), 0);
              svc.convRate = svc.leads > 0 ? Math.round((svc.converted / svc.leads) * 100) : 0;
            }
          });
        }

        setCatalog(mergedServices.map(normalizeCatalogService));
      } catch {
        setCatalog(getAllServices().map(normalizeCatalogService));
      }
    })();
  }, []);

  const salesDistribution = useMemo(() => {
    const COLORS = ["#be123c", "#881337", "#e11d48", "#fda4af", "#fecdd3", "#f43f5e", "#fb7185"];
    return catalog.map((service, index) => ({
      name: service.name,
      sales: service.converted || 0,
      color: COLORS[index % COLORS.length],
    }));
  }, [catalog]);

  const salesTotal = useMemo(() => {
    return salesDistribution.reduce((sum, item) => sum + item.sales, 0);
  }, [salesDistribution]);

  const salesWithPct = useMemo(() => {
    return salesDistribution.map((item) => ({
      ...item,
      pct: salesTotal ? Math.round((item.sales / salesTotal) * 100) : 0,
    }));
  }, [salesDistribution, salesTotal]);

  const topSalesLine = useMemo(() => {
    if (!salesWithPct.length) return null;
    return [...salesWithPct].sort((a, b) => b.sales - a.sales)[0];
  }, [salesWithPct]);

  const revenueTrajectory = useMemo(
    () => catalog.map((s, i) => ({ period: `S${i + 1}`, revenue: Number(s.revenue) || 0, name: s.name })),
    [catalog],
  );

  const revenueStats = useMemo(() => {
    const values = revenueTrajectory.map((d) => d.revenue);
    if (!values.length) return { start: 0, peak: 0, latest: 0, growth: 0 };
    const start = values[0];
    const peak = Math.max(...values);
    const latest = values[values.length - 1];
    const growth = start ? Math.round(((latest - start) / start) * 100) : 0;
    return { start, peak, latest, growth };
  }, [revenueTrajectory]);

  const openAddService = () => setAddOpen(true);

  const handleDeleteService = async (e, service) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Are you sure you want to delete the service "${service.name}"?`)) return;
    try {
      await apiDelete(`/api/services/${service.id}`);
      setCatalog((prev) => prev.filter((s) => s.id !== service.id && s.name.toLowerCase() !== service.name.toLowerCase()));
      invalidateCache("/api/services");
      toast.success(`Service "${service.name}" deleted successfully`);
      setTimeout(() => window.location.reload(), 300);
    } catch (err) {
      toast.error(`Failed to delete service: ${err.message || String(err)}`);
    }
  };

  const handleAddClose = async (newService) => {
    if (newService) {
      try {
        await apiPost("/api/services", newService);
        invalidateCache("/api/services");
        const data = await apiGet("/api/services", { skipCache: true, cacheTtl: 0 });
        if (data.services?.length) setCatalog(data.services.map(normalizeCatalogService));
        else setCatalog([]);
        toast.success(`${newService.name} saved to catalog`);
      } catch {
        toast.error("Could not save service — API unavailable");
      }
    }
    setAddOpen(false);
    if (searchParams.get("action")) {
      setSearchParams({}, { replace: true });
    }
  };

  useEffect(() => {
    if (searchParams.get("action") === "addService") setAddOpen(true);
  }, [searchParams]);

  const filtered = useMemo(() => {
    let list = catalog.filter((s) => {
      if (category !== "all" && s.category !== category) return false;
      if (status !== "all" && s.status !== status) return false;
      if (search.trim() && !s.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    list = [...list].sort((a, b) =>
      priceSort === "high" ? b.priceNum - a.priceNum : a.priceNum - b.priceNum,
    );
    return list;
  }, [catalog, search, category, status, priceSort]);

  return (
    <div className="space-y-5 page-shell min-w-0">

      {/* Sales distribution + revenue trajectory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <GlassCard className="p-3.5 sm:p-4 flex flex-col min-h-[260px]">
          <ChartCardHeader
            title="Sales Distribution"
            subtitle="Closed deals by service line"
          />
          <div className="flex-1 flex items-center gap-3 sm:gap-4 min-h-[168px]">
            <div className="relative w-[132px] h-[132px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={salesWithPct}
                    dataKey="sales"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={58}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {salesWithPct.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" fill="#881337" fontSize={16} fontWeight="800">
                    {salesTotal.toLocaleString()}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" dominantBaseline="middle" fill="#94a3b8" fontSize={8} fontWeight="600">
                    Total Sales
                  </text>
                  <Tooltip
                    formatter={(val, _name, props) => [
                      `${val.toLocaleString()} sales · ${props.payload.pct}%`,
                      props.payload.name,
                    ]}
                    contentStyle={{ borderRadius: 10, border: "1px solid #fecdd3", fontSize: 10, padding: "6px 10px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="flex-1 min-w-0 space-y-1.5">
              {salesWithPct.map((item) => (
                <div key={item.name} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: item.color }} />
                    <span className="text-[10px] font-semibold text-slate-700 truncate">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-slate-500 tabular-nums">{item.sales.toLocaleString()}</span>
                    <span className="text-[10px] font-black text-rose-800 tabular-nums w-8 text-right">{item.pct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {topSalesLine && (
            <p className="text-[9px] text-slate-500 pt-2.5 mt-2 border-t border-rose-50 leading-snug">
              <span className="font-semibold text-slate-700">{topSalesLine.name}</span>
              {" "}leads with{" "}
              <span className="font-black text-rose-800 tabular-nums">{topSalesLine.sales.toLocaleString()} sales</span>
              {" "}({topSalesLine.pct}% of catalog).
            </p>
          )}
        </GlassCard>

        <GlassCard className="p-3.5 sm:p-4 flex flex-col min-h-[260px]">
          <ChartCardHeader
            title="Revenue Trajectory"
            subtitle="Catalog revenue trend (₹ lakh)"
          />



          <div className="flex-1 min-h-[148px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueTrajectory.length ? revenueTrajectory : [{ period: "—", revenue: 0 }]}
                margin={{ top: 6, right: 8, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="revenueTrajGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#be123c" stopOpacity={0.22} />
                    <stop offset="100%" stopColor="#be123c" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#fff1f2" vertical={false} strokeDasharray="4 4" />
                <XAxis
                  dataKey="period"
                  axisLine={{ stroke: "#fecdd3" }}
                  tickLine={false}
                  tick={{ fill: "#94a3b8", fontSize: 8, fontWeight: 600 }}
                  interval={0}
                />
                <YAxis
                  domain={[0, 20]}
                  ticks={[1, 5, 20]}
                  width={48}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 8, fontWeight: 600 }}
                  tickFormatter={(v) => (v === 1 ? "1 Lakh" : `${v} lakh`)}
                />
                <Tooltip
                  cursor={{ stroke: "#fda4af", strokeWidth: 1, strokeDasharray: "4 4" }}
                  contentStyle={{ borderRadius: 10, border: "1px solid #fecdd3", fontSize: 10, padding: "6px 10px" }}
                  labelFormatter={(_, items) => {
                    const row = items?.[0]?.payload;
                    return row ? `${row.period} · ${row.label}` : "";
                  }}
                  formatter={(val) => [`₹${val}L`, "Revenue"]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#be123c"
                  strokeWidth={2.5}
                  fill="url(#revenueTrajGrad)"
                  dot={{ r: 3, fill: "#be123c", stroke: "#fff", strokeWidth: 1.5 }}
                  activeDot={{ r: 5, fill: "#be123c", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[9px] text-slate-500 pt-2 border-t border-rose-50 leading-snug">
            Revenue peaked at{" "}
            <span className="font-black text-rose-800 tabular-nums">₹{revenueStats.peak}L</span>
            {" "}in the latest period — up from{" "}
            <span className="font-black text-rose-800 tabular-nums">₹{revenueStats.start}L</span>
            {" "}at cycle start.
          </p>
        </GlassCard>
      </div>

      {/* Filters */}
      <GlassCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1 min-w-0 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-300 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter by keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-rose-100 bg-white text-sm outline-none focus:border-rose-400"
            />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <div className="grid grid-cols-2 sm:contents gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 px-3 rounded-xl border border-rose-100 bg-white text-xs font-bold text-rose-800 outline-none focus:border-rose-400"
              >
                {SERVICE_CATEGORIES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="h-10 px-3 rounded-xl border border-rose-100 bg-white text-xs font-bold text-rose-800 outline-none focus:border-rose-400"
              >
                {SERVICE_STATUSES.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
              <select
                value={priceSort}
                onChange={(e) => setPriceSort(e.target.value)}
                className="h-10 px-3 rounded-xl border border-rose-100 bg-white text-xs font-bold text-rose-800 outline-none focus:border-rose-400 col-span-2 sm:col-span-1"
              >
                {SERVICE_PRICING_SORT.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toast.success("Export started")}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl border border-rose-200 text-rose-800 text-xs font-bold hover:bg-rose-50 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Export Reports
              </button>
              <button
                type="button"
                onClick={openAddService}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Service
              </button>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map((service) => {
          const Icon = ICON_MAP[service.icon] || Bot;
          return (
            <Link key={service.id} to={`/services/${service.id}`} className="group block">
              <GlassCard hover className="p-3.5 h-full flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0 group-hover:bg-rose-100 transition">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge tone={serviceBadgeTone(service.badge)}>{service.badge}</Badge>
                    <button
                      type="button"
                      onClick={(e) => handleDeleteService(e, service)}
                      title="Delete service"
                      className="w-7 h-7 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 grid place-items-center transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <h3 className="text-xs font-black text-slate-900 group-hover:text-rose-800 transition leading-snug truncate">
                    {service.name}
                  </h3>
                  {(service.serviceId || service.serviceCode || service.id) && (
                    <span className="shrink-0 text-[9px] font-bold font-mono px-1.5 py-0.5 rounded bg-rose-100/80 text-rose-800 border border-rose-200" title="Unique Service ID">
                      {service.serviceId || service.serviceCode || service.id}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 flex-1 leading-relaxed">{service.description}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  {service.tags.map((tag) => (
                    <span key={tag} className="text-[8px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-1.5 mt-3 pt-2.5 border-t border-rose-50">
                  {[
                    ["Revenue", formatServiceMoney(service.revenue)],
                    ["Clients", String(service.clients)],
                    ["Leads", service.leads >= 1000 ? `${(service.leads / 1000).toFixed(1)}k` : formatIndianNumber(service.leads)],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <p className="text-[7px] font-bold text-slate-400 uppercase leading-none">{label}</p>
                      <p className="text-[11px] font-black text-slate-800 mt-0.5 tabular-nums">{val}</p>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-rose-50">
                  <span className="text-xs font-black text-rose-700">{formatServicePriceLabel(service.price, service.priceNum)}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-600 group-hover:translate-x-0.5 transition" />
                </div>
              </GlassCard>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={openAddService}
          className="rounded-2xl border-2 border-dashed border-rose-200 bg-rose-50/30 p-4 flex flex-col items-center justify-center gap-2 min-h-[240px] hover:border-rose-400 hover:bg-rose-50/60 transition text-center"
        >
          <div className="w-10 h-10 rounded-full bg-white border border-rose-200 grid place-items-center text-rose-600">
            <Plus className="w-5 h-5" />
          </div>
          <p className="text-xs font-bold text-slate-700">Create New Service</p>
          <p className="text-[10px] text-slate-500 max-w-[180px] leading-snug">
            Expand your catalog with a new productized offering
          </p>
        </button>
      </div>

      <AddServiceDrawer open={addOpen} onClose={handleAddClose} />
    </div>
  );
}
