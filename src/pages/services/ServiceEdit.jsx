import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Save, Bot, Database, Target, Briefcase, Code, Plus, Trash2,
  Users, Shuffle, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, Badge } from "../../components/Primitives.jsx";
import {
  SERVICE_CATEGORIES, formatServicePriceLabel,
} from "../../data/servicesMock.js";
import { apiGet, apiPost } from "../../lib/api.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";
import { apiEmployeeToAdmin, unwrapApiData } from "../../lib/leadSync.js";

const ICON_MAP = {
  bot: Bot,
  database: Database,
  target: Target,
  briefcase: Briefcase,
  code: Code,
};

const TABS = [
  "General Information",
  "Lead Distribution",
  "Pricing & Plans",
  "Features & Workflow",
];

const CATEGORY_OPTIONS = SERVICE_CATEGORIES.filter((c) => c.id !== "all");
const BADGE_OPTIONS = ["ACTIVE", "POPULAR", "ENTERPRISE"];
const STATUS_OPTIONS = ["ACTIVE", "PAUSED", "DRAFT"];

const inputClass =
  "w-full h-10 px-3 rounded-xl border border-rose-100 bg-white text-sm font-medium text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition";
const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5";
const textareaClass =
  "w-full px-3 py-2.5 rounded-xl border border-rose-100 bg-white text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 resize-none transition";

function parsePriceNum(price) {
  const n = Number(String(price).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function initDraft(service) {
  if (!service) return null;
  return {
    ...service,
    tags: [...(service.tags || [])],
    tiers: (service.tiers || []).map((t) => ({ ...t, features: [...(t.features || [])] })),
    features: (service.features || []).map((f) => ({ ...f })),
    distributionEnabled: Boolean(service.distributionEnabled),
    distributionEmployeeIds: (service.distributionEmployeeIds || []).map(String),
    distributionRrIndex: Number(service.distributionRrIndex) || 0,
    lastDistributedAt: service.lastDistributedAt || null,
  };
}

function FormSection({ title, subtitle, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-rose-100 bg-[#fffbfb] p-4 sm:p-5 space-y-4 ${className}`}>
      {(title || subtitle) && (
        <div className="pb-3 border-b border-rose-50">
          {title && (
            <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider">{title}</h3>
          )}
          {subtitle && <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );
}

function SegmentedControl({ options, value, onChange, formatLabel = (v) => v }) {
  return (
    <div className="inline-flex flex-wrap gap-1 p-1 rounded-xl bg-white border border-rose-100">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition whitespace-nowrap ${
            value === opt
              ? "bg-rose-700 text-white shadow-sm"
              : "text-slate-600 hover:bg-rose-50 hover:text-rose-800"
          }`}
        >
          {formatLabel(opt)}
        </button>
      ))}
    </div>
  );
}

export default function ServiceEdit() {
  const { serviceId } = useParams();
  const navigate = useNavigate();
  const [service, setService] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("General Information");
  const [draft, setDraft] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [distributing, setDistributing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [svcRes, empRes] = await Promise.all([
          apiGet("/api/services", { skipCache: true, cacheTtl: 0 }),
          apiGet("/api/team/employees", { skipCache: true, cacheTtl: 0 })
            .then((res) => {
              if (res?.success && Array.isArray(res.employees) && res.employees.length) {
                return res.employees;
              }
              throw new Error("empty");
            })
            .catch(() =>
              apiGet("/api/v1/employees", { headers: getAdminCrmHeaders(), skipCache: true, cacheTtl: 0 })
                .then((res) => unwrapApiData(res).map(apiEmployeeToAdmin))
                .catch(() => []),
            ),
        ]);
        const found = (svcRes?.services || []).find((s) => String(s.id) === String(serviceId)) || null;
        if (!cancelled) {
          setService(found);
          setDraft(initDraft(found));
          setEmployees(Array.isArray(empRes) ? empRes : []);
          setActiveTab("General Information");
        }
      } catch {
        if (!cancelled) {
          setService(null);
          setDraft(null);
          setEmployees([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [serviceId]);

  if (loading) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm text-slate-400">Loading service…</p>
      </GlassCard>
    );
  }

  if (!service || !draft) {
    return (
      <GlassCard className="p-10 text-center">
        <p className="text-sm text-slate-600">Service not found.</p>
        <Link to="/services" className="text-xs font-bold text-rose-700 mt-2 inline-block">Back to Services</Link>
      </GlassCard>
    );
  }

  const Icon = ICON_MAP[draft.icon] || Bot;

  const patch = (updates) => setDraft((prev) => ({ ...prev, ...updates }));

  const updateTier = (index, field, value) => {
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => (i === index ? { ...t, [field]: value } : t)),
    }));
  };

  const setPopularTier = (index) => {
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.map((t, i) => ({ ...t, popular: i === index })),
    }));
  };

  const updateTierFeatures = (index, text) => {
    const features = text.split("\n").map((s) => s.trim()).filter(Boolean);
    updateTier(index, "features", features);
  };

  const addTier = () => {
    setDraft((prev) => ({
      ...prev,
      tiers: [...prev.tiers, { name: "New Tier", price: "₹0/mo", features: ["Feature 1"], popular: false }],
    }));
  };

  const removeTier = (index) => {
    setDraft((prev) => ({
      ...prev,
      tiers: prev.tiers.filter((_, i) => i !== index),
    }));
  };

  const updateFeature = (index, field, value) => {
    setDraft((prev) => ({
      ...prev,
      features: prev.features.map((f, i) => (i === index ? { ...f, [field]: value } : f)),
    }));
  };

  const addFeature = () => {
    setDraft((prev) => ({
      ...prev,
      features: [...prev.features, { title: "New Feature", desc: "Describe this capability" }],
    }));
  };

  const removeFeature = (index) => {
    setDraft((prev) => ({
      ...prev,
      features: prev.features.filter((_, i) => i !== index),
    }));
  };

  const toggleDistributionEmployee = (employeeId) => {
    const id = String(employeeId);
    setDraft((prev) => {
      const current = new Set((prev.distributionEmployeeIds || []).map(String));
      if (current.has(id)) current.delete(id);
      else current.add(id);
      return { ...prev, distributionEmployeeIds: [...current] };
    });
  };

  const runDistributionNow = async () => {
    if (!draft.distributionEmployeeIds?.length) {
      toast.error("Select at least one employee first");
      return;
    }
    setDistributing(true);
    try {
      await apiPost("/api/services", {
        ...draft,
        id: service.id,
        distributionEnabled: draft.distributionEnabled,
        distributionEmployeeIds: draft.distributionEmployeeIds,
      });
      const res = await apiPost(`/api/services/${service.id}/distribute`, {});
      const count = res?.assigned ?? 0;
      toast.success(count ? `${count} lead(s) distributed for ${draft.name}` : "No unassigned leads matched this service");
      if (res?.details?.[0]?.assigned != null) {
        setDraft((prev) => ({ ...prev, lastDistributedAt: new Date().toISOString() }));
      }
    } catch {
      toast.error("Distribution failed — save settings and ensure backend is running");
    } finally {
      setDistributing(false);
    }
  };

  const handleSave = async () => {
    if (!draft.name.trim()) {
      toast.error("Service name is required");
      return;
    }
    const priceNum = parsePriceNum(draft.price);
    const payload = {
      ...draft,
      id: service.id,
      name: draft.name.trim(),
      description: draft.description.trim(),
      price: formatServicePriceLabel(draft.price, priceNum),
      priceNum,
      distributionEnabled: Boolean(draft.distributionEnabled),
      distributionEmployeeIds: (draft.distributionEmployeeIds || []).map(String),
      distributionRrIndex: Number(draft.distributionRrIndex) || 0,
      tiers: (draft.tiers || []).map((tier) => ({
        ...tier,
        price: formatServicePriceLabel(tier.price),
      })),
    };
    try {
      await apiPost("/api/services", payload);
      if (payload.distributionEnabled && payload.distributionEmployeeIds.length) {
        await apiPost(`/api/services/${service.id}/distribute`, {}).catch(() => {});
      }
      toast.success(`${payload.name} saved`);
      navigate(`/services/${service.id}`);
    } catch {
      toast.error("Could not save service. Ensure the backend is running.");
    }
  };

  return (
    <div className="space-y-4 page-shell min-w-0 max-w-5xl">

      <GlassCard className="p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={`/services/${service.id}`}
              className="w-9 h-9 rounded-xl border border-rose-100 bg-white text-rose-700 grid place-items-center shrink-0 hover:bg-rose-50 transition"
              aria-label="Back to service"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0">
              <Icon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-black text-slate-900 truncate">Edit · {draft.name}</h1>
              <p className="text-[11px] text-slate-500">Update catalog details, pricing, and features</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-4 rounded-xl bg-rose-700 text-white text-[11px] font-bold hover:bg-rose-800 shadow-sm shrink-0 self-start sm:self-auto ml-12 sm:ml-0 transition"
          >
            <Save className="w-3.5 h-3.5" />
            Save Changes
          </button>
        </div>
      </GlassCard>

      <GlassCard className="overflow-hidden">
        <div className="flex flex-wrap gap-0 border-b border-rose-100 px-2 sm:px-4 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`relative px-3 sm:px-4 py-3 text-[11px] font-bold transition whitespace-nowrap ${
                activeTab === tab ? "text-rose-800" : "text-slate-500 hover:text-rose-700"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <span className="absolute bottom-0 left-2 right-2 sm:left-3 sm:right-3 h-0.5 rounded-full bg-rose-600" />
              )}
            </button>
          ))}
        </div>

        <div className="p-4 sm:p-5 bg-white/40">
          {activeTab === "General Information" && (
            <div className="space-y-4">
              <FormSection title="Basics" subtitle="Core service identity shown in the catalog">
                <div>
                  <label className={labelClass}>Service Name</label>
                  <input
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    placeholder="e.g. Strategic Consulting"
                    className={inputClass}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass}>Category</label>
                    <select
                      value={draft.category}
                      onChange={(e) => {
                        const opt = CATEGORY_OPTIONS.find((c) => c.id === e.target.value);
                        patch({ category: e.target.value, categoryLabel: opt?.label?.replace(/^Category: /, "") || e.target.value });
                      }}
                      className={inputClass}
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c.id} value={c.id}>{c.label.replace(/^Category: /, "")}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>List Price</label>
                    <input
                      value={draft.price}
                      onChange={(e) => patch({ price: e.target.value })}
                      placeholder="₹12,000/mo"
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={4}
                    placeholder="What does this service include?"
                    className={textareaClass}
                  />
                </div>
              </FormSection>
              <FormSection title="Catalog Settings" subtitle="How this service appears and behaves in the catalog">
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <label className={labelClass}>Status</label>
                    <SegmentedControl
                      options={STATUS_OPTIONS}
                      value={draft.status}
                      onChange={(status) => patch({ status })}
                      formatLabel={(s) => s.charAt(0) + s.slice(1).toLowerCase()}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Tags (comma separated)</label>
                  <input
                    value={draft.tags.join(", ")}
                    onChange={(e) => patch({ tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                    placeholder="ADVISORY, RETAINER"
                    className={inputClass}
                  />
                  <p className="text-[10px] text-slate-400 mt-1.5">Used for filtering and card labels on the services catalog.</p>
                </div>
              </FormSection>
            </div>
          )}

          {activeTab === "Lead Distribution" && (
            <div className="space-y-4">
              <FormSection
                title="Auto Distribution"
                subtitle="Unassigned leads with this service name are shared equally across selected employees every 10 minutes."
              >
                <div>
                  <label className={labelClass}>Distribution</label>
                  <SegmentedControl
                    options={[false, true]}
                    value={draft.distributionEnabled}
                    onChange={(distributionEnabled) => patch({ distributionEnabled })}
                    formatLabel={(v) => (v ? "ON · every 10 min" : "OFF")}
                  />
                  <p className="text-[10px] text-slate-400 mt-2 leading-relaxed">
                    Matches leads whose <strong>Service</strong> field equals “{draft.name}” (from n8n or manual add).
                    Assignments rotate evenly across the team you select below.
                  </p>
                </div>

                <div>
                  <label className={labelClass}>Select employees</label>
                  {employees.length === 0 ? (
                    <p className="text-xs text-slate-400 py-3">No team members loaded — add employees in Team Management.</p>
                  ) : (
                    <div className="rounded-xl border border-rose-100 bg-white max-h-56 overflow-y-auto divide-y divide-rose-50">
                      {employees.map((emp) => {
                        const checked = (draft.distributionEmployeeIds || []).map(String).includes(String(emp.id));
                        return (
                          <label
                            key={emp.id}
                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition ${checked ? "bg-rose-50/80" : "hover:bg-rose-50/40"}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleDistributionEmployee(emp.id)}
                              className="accent-rose-600"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
                              <p className="text-[10px] text-slate-400 truncate">{emp.department || emp.role || "Sales"}</p>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    {(draft.distributionEmployeeIds || []).length} employee{(draft.distributionEmployeeIds || []).length === 1 ? "" : "s"} selected
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={distributing || !draft.distributionEmployeeIds?.length}
                    onClick={runDistributionNow}
                    className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 disabled:opacity-50 transition"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    {distributing ? "Distributing…" : "Distribute now"}
                  </button>
                  {draft.lastDistributedAt && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 self-center">
                      <Shuffle className="w-3 h-3" />
                      Last run {new Date(draft.lastDistributedAt).toLocaleString("en-IN")}
                    </span>
                  )}
                </div>
              </FormSection>

              <div className="rounded-xl border border-dashed border-rose-200 bg-rose-50/30 p-4 flex gap-3">
                <Users className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="text-[11px] text-slate-600 leading-relaxed">
                  <p className="font-bold text-slate-800 mb-1">How it works</p>
                  <ul className="list-disc pl-4 space-y-1 text-slate-500">
                    <li>Only <strong>unassigned</strong> leads with service “{draft.name}” are included.</li>
                    <li>Leads rotate one-by-one across selected employees (equal load).</li>
                    <li>Turn <strong>Distribution ON</strong> and save — the server runs every 10 minutes automatically.</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === "Pricing & Plans" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider">Pricing Tiers</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Define plans customers can choose from on the detail page.</p>
                </div>
                <button
                  type="button"
                  onClick={addTier}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-xl border border-rose-200 bg-white text-[10px] font-bold text-rose-800 hover:bg-rose-50 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add tier
                </button>
              </div>

              {draft.tiers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-rose-200 bg-[#fffbfb] p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700">No pricing tiers yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Add at least one tier for customers to select a plan.</p>
                  <button
                    type="button"
                    onClick={addTier}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add your first tier
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {draft.tiers.map((tier, index) => (
                    <div
                      key={`${tier.name}-${index}`}
                      className={`rounded-xl border p-4 space-y-3 ${
                        tier.popular ? "border-rose-300 bg-rose-50/50 ring-1 ring-rose-200" : "border-rose-100 bg-[#fffbfb]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 min-h-[24px]">
                        {tier.popular ? <Badge tone="danger">Most Popular</Badge> : <span className="text-[10px] font-bold text-slate-400 uppercase">Tier {index + 1}</span>}
                        <button
                          type="button"
                          onClick={() => removeTier(index)}
                          className="w-7 h-7 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 grid place-items-center transition"
                          aria-label="Remove tier"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div>
                        <label className={labelClass}>Tier Name</label>
                        <input value={tier.name} onChange={(e) => updateTier(index, "name", e.target.value)} className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Price</label>
                        <input value={tier.price} onChange={(e) => updateTier(index, "price", e.target.value)} className={inputClass} />
                      </div>
                      <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-700 cursor-pointer select-none">
                        <input
                          type="radio"
                          name="popular-tier"
                          checked={tier.popular}
                          onChange={() => setPopularTier(index)}
                          className="accent-rose-600"
                        />
                        Mark as most popular
                      </label>
                      <div>
                        <label className={labelClass}>Features (one per line)</label>
                        <textarea
                          value={tier.features.join("\n")}
                          onChange={(e) => updateTierFeatures(index, e.target.value)}
                          rows={4}
                          placeholder={"Feature one\nFeature two"}
                          className={textareaClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "Features & Workflow" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-[11px] font-extrabold text-rose-700 uppercase tracking-wider">Features & Workflow</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">Highlight key capabilities on the service detail page.</p>
                </div>
                <button
                  type="button"
                  onClick={addFeature}
                  className="inline-flex items-center gap-1 h-8 px-3 rounded-xl border border-rose-200 bg-white text-[10px] font-bold text-rose-800 hover:bg-rose-50 transition shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> Add feature
                </button>
              </div>

              {draft.features.length === 0 ? (
                <div className="rounded-xl border border-dashed border-rose-200 bg-[#fffbfb] p-8 text-center">
                  <p className="text-sm font-semibold text-slate-700">No features added</p>
                  <p className="text-[11px] text-slate-400 mt-1">Add feature blocks to explain what this service delivers.</p>
                  <button
                    type="button"
                    onClick={addFeature}
                    className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add your first feature
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {draft.features.map((feature, index) => (
                    <div key={index} className="rounded-xl border border-rose-100 bg-[#fffbfb] p-4 space-y-3">
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-rose-50">
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Feature {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeFeature(index)}
                          className="w-7 h-7 rounded-lg hover:bg-rose-100 text-slate-400 hover:text-rose-600 grid place-items-center transition"
                          aria-label="Remove feature"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div>
                        <label className={labelClass}>Title</label>
                        <input
                          value={feature.title}
                          onChange={(e) => updateFeature(index, "title", e.target.value)}
                          placeholder="e.g. GTM Strategy Workshop"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Description</label>
                        <textarea
                          value={feature.desc}
                          onChange={(e) => updateFeature(index, "desc", e.target.value)}
                          rows={2}
                          placeholder="Brief explanation of this capability"
                          className={textareaClass}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
