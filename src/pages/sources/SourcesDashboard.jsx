import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search, Radio, Users, IndianRupee, Star, Eye,
  MousePointerClick, Instagram, Globe, Linkedin, MessageCircle,
  Share2, Zap, Filter, Trash2,
} from "lucide-react";
import { GlassCard, StatCard } from "../../components/Primitives.jsx";
import { apiGet, apiPut } from "../../lib/api.js";
import { fetchAllLeads } from "../../lib/leadSync.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";
import {
  aggregateLeadsBySource,
  formatSourceRevenue,
  getSourcesSummary,
  SOURCE_CATALOG,
  filterLeadsForSourceDashboard,
  isSourceDismissed,
} from "../../lib/leadSource.js";

const SOURCE_ICONS = {
  meta_ads: Instagram,
  google_ads: MousePointerClick,
  website: Globe,
  linkedin: Linkedin,
  whatsapp: MessageCircle,
  referral: Share2,
  n8n: Zap,
  manual: Users,
  api: Radio,
  landing_page: Globe,
  campaign: MousePointerClick,
  form: Globe,
  other: Radio,
};

function SourceIcon({ sourceKey }) {
  const Icon = SOURCE_ICONS[sourceKey] || Radio;
  return <Icon className="w-4 h-4" />;
}

export default function SourcesDashboard() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dismissedSources, setDismissedSources] = useState({});
  const [deletingKey, setDeletingKey] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const items = await fetchAllLeads(apiGet, { headers: getAdminCrmHeaders() });
        if (!cancelled) setLeads(Array.isArray(items) ? items : []);
      } catch {
        if (!cancelled) setLeads([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    apiGet("/api/settings", { headers: getAdminCrmHeaders(), skipCache: true })
      .then((res) => {
        if (!cancelled) setDismissedSources(res?.dismissedSources || {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const marketingLeads = useMemo(() => filterLeadsForSourceDashboard(leads), [leads]);
  const allSourceGroups = useMemo(() => aggregateLeadsBySource(marketingLeads), [marketingLeads]);
  const sourceGroups = useMemo(
    () => allSourceGroups.filter((g) => !isSourceDismissed(g, dismissedSources[g.key])),
    [allSourceGroups, dismissedSources],
  );
  const summary = useMemo(() => getSourcesSummary(sourceGroups), [sourceGroups]);

  const handleDeleteSource = async (group) => {
    if (!window.confirm(`Remove "${group.label}" from this dashboard? It'll come back automatically if a new lead comes in from this source.`)) return;
    setDeletingKey(group.key);
    const next = { ...dismissedSources, [group.key]: new Date().toISOString() };
    try {
      await apiPut("/api/settings", { dismissedSources: next }, { headers: getAdminCrmHeaders() });
      setDismissedSources(next);
    } catch {
      // leave the card in place if the save failed
    } finally {
      setDeletingKey(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sourceGroups;
    return sourceGroups.filter(
      (g) => g.label.toLowerCase().includes(q) || g.key.toLowerCase().includes(q),
    );
  }, [sourceGroups, search]);

  const catalogOrder = useMemo(
    () => Object.fromEntries(SOURCE_CATALOG.map((s, i) => [s.key, i])),
    [],
  );

  const sorted = useMemo(
    () => [...filtered].sort((a, b) => {
      const orderA = catalogOrder[a.key] ?? 999;
      const orderB = catalogOrder[b.key] ?? 999;
      if (orderA !== orderB) return orderA - orderB;
      return b.leadCount - a.leadCount;
    }),
    [filtered, catalogOrder],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <p className="text-sm text-slate-400">Loading lead sources…</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 page-shell min-w-0">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Sources" value={String(summary.totalSources)} icon={Radio} iconBg="bg-rose-50" iconColor="text-rose-600" hover={false} />
        <StatCard
          label="Total Leads"
          value={summary.totalLeads >= 1000 ? `${(summary.totalLeads / 1000).toFixed(1)}k` : String(summary.totalLeads)}
          icon={Users}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          hover={false}
        />
        <StatCard label="Total Earnings" value={formatSourceRevenue(summary.totalEarnings)} icon={IndianRupee} iconBg="bg-sky-50" iconColor="text-sky-600" hover={false} />
        <StatCard label="Top Source" value={summary.topSource} icon={Star} iconBg="bg-amber-50" iconColor="text-amber-600" hover={false} />
      </div>

      <GlassCard className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Filter by source name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 text-sm outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
            />
          </div>
          <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-500 text-xs font-semibold gap-1.5 px-4 py-2.5 shrink-0">
            <Filter className="w-3.5 h-3.5" />
            {sorted.length} source{sorted.length === 1 ? "" : "s"}
          </div>
        </div>
      </GlassCard>

      {sorted.length === 0 ? (
        <GlassCard className="p-10 text-center">
          <p className="text-sm font-semibold text-slate-600">No leads synced yet</p>
          <p className="text-xs text-slate-400 mt-1">Leads from n8n (Meta, Google, Website, etc.) will appear here grouped by source.</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {sorted.map((group) => (
            <GlassCard key={group.key} hover className="p-3.5 sm:p-4 flex flex-col">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                    <SourceIcon sourceKey={group.key} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 truncate">{group.label}</h3>
                    <p className="text-[9px] text-slate-500 mt-0.5 truncate">Source channel</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteSource(group)}
                  disabled={deletingKey === group.key}
                  title="Remove this source from the dashboard"
                  className="shrink-0 w-7 h-7 rounded-md grid place-items-center text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5 mb-3 flex-1">
                {[
                  ["Leads", group.leadCount.toLocaleString("en-IN")],
                  ["Earnings", formatSourceRevenue(group.totalRevenue)],
                  ["Converted", String(group.convertedCount)],
                  ["Conversion", `${group.conversion}%`],
                ].map(([label, val]) => (
                  <div key={label} className="rounded-md bg-slate-50/80 border border-slate-100 px-2 py-1.5">
                    <p className="text-[8px] font-bold text-slate-400 uppercase leading-none">{label}</p>
                    <p className="text-[11px] font-bold text-slate-800 mt-1 truncate">{val}</p>
                  </div>
                ))}
              </div>

              <div className="pt-2.5 border-t border-rose-50">
                <Link
                  to={`/sources/${encodeURIComponent(group.key)}`}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-rose-700 hover:text-rose-800"
                >
                  <Eye className="w-3.5 h-3.5" />
                  View Leads
                </Link>
              </div>
            </GlassCard>
          ))}
        </div>
      )}
    </div>
  );
}
