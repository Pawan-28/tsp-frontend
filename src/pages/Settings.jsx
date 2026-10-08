import { useState, useMemo, useEffect } from "react";
import {
  Target, Scale, Percent, FileSliders,
  AlertTriangle, RefreshCw, Users, KeyRound, Lock, Timer,
} from "lucide-react";
import AutoReassignPanel from "../components/AutoReassignPanel.jsx";
import { Badge } from "../components/Primitives.jsx";
import toast from "react-hot-toast";
import AdminProfileHeader, { DashboardScrollbarStyles } from "../components/AdminProfileHeader.jsx";
import { SettingsSidebar, SettingsMobileTabs, SettingsPanel, PanelFooter, PanelSection, inputClass, labelClass } from "../components/SettingsLayout.jsx";
import { CustomSelect, EmployeeListPicker, colorForName } from "../components/CustomSelect.jsx";
import { initialsFromName } from "../lib/adminProfile.js";
import { apiGet, apiPut } from "../lib/api.js";
import { useAuth } from "../context/AuthContext.jsx";
import { roleLabel } from "../lib/roleLabel.js";
import { formatIndianNumber } from "../lib/indianFormat.js";
import { PASSWORD_HINT, validateNewPassword } from "../lib/passwordPolicy.js";
import {
  defaultKpiWeights,
  normalizeKpiWeights,
  validateIncentiveConfig,
  countConfigChanges,
  resolveTarget,
} from "../lib/incentiveSettings.js";

const DRAFT_STORAGE_KEY = "crm-settings-draft-v1";

function readStoredDraft() {
  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStoredDraft(draft) {
  try {
    if (draft) window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    /* storage unavailable - draft just isn't kept */
  }
}

/** "₹1,00,000" caption for an amount input. */
function rupeeCaption(value) {
  return `₹${formatIndianNumber(Number(value) || 0)}`;
}

function mapEmployeeToTarget(emp, savedTargets) {
  const saved = Array.isArray(savedTargets)
    ? savedTargets.find((row) => Number(row.id) === Number(emp.id))
    : null;
  return {
    id: emp.id,
    name: emp.name,
    team: roleLabel(emp.department || emp.role, "General"),
    // Same precedence the Incentives page uses: employee record target, then saved Settings value.
    calls: resolveTarget(emp.call_target, saved?.calls),
    leads: resolveTarget(emp.qualified_lead_target, saved?.leads),
    meetings: resolveTarget(emp.meeting_target, saved?.meetings),
    revenue: resolveTarget(emp.cash_target, saved?.revenue),
  };
}

function mergeEmployeeTargets(employees, savedTargets) {
  if (!Array.isArray(employees) || !employees.length) return [];
  return employees.map((emp) => mapEmployeeToTarget(emp, savedTargets));
}

// ─── TABS DEFINITION ──────────────────────────────────────────────────────────
const tabs = [
  { id: "targets",       label: "Target Management",    icon: Target },
  { id: "kpis",          label: "KPI Weightages",       icon: Scale },
  { id: "incentives",    label: "Incentive & Slabs",    icon: Percent },
  { id: "calculations",  label: "Performance Formulas", icon: FileSliders },
  { id: "autoassign",    label: "Lead Auto-Assign",     icon: Timer },
  { id: "password",      label: "Change Password",      icon: KeyRound },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState("targets");
  const [currentVersion, setCurrentVersion] = useState("v2.3");
  // Last loaded/published config - pending edits are a diff against this, never a counter.
  const [savedSnapshot, setSavedSnapshot] = useState(null);
  const [storedDraft, setStoredDraft] = useState(null);

  // ─── 1. Target Management State ───
  const [employeeTargets, setEmployeeTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetSearch, setTargetSearch] = useState("");
  const [selectedTargetEmp, setSelectedTargetEmp] = useState(null);
  const [bulkTeam, setBulkTeam] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkField, setBulkField] = useState("calls");

  // ─── 2. KPI Weightages State ───
  const [kpiWeights, setKpiWeights] = useState(defaultKpiWeights);

  // ─── 3. Incentive slabs State ───
  const [incentiveSlabs, setIncentiveSlabs] = useState([
    { id: 1, tier: "Bronze", min: 0, max: 100000, rate: 3 },
    { id: 2, tier: "Silver", min: 100000, max: 250000, rate: 4.5 },
    { id: 3, tier: "Gold", min: 250000, max: 400000, rate: 6 },
    { id: 4, tier: "Platinum", min: 400000, max: 1000000, rate: 8 },
  ]);
  const [baseIncentiveRate, setBaseIncentiveRate] = useState(2.5);
  const [targetBonusAmount, setTargetBonusAmount] = useState(2500);

  // ─── 4. Performance Calculations State ───
  const [formulaType, setFormulaType] = useState("weighted");
  const [ratingThresholds, setRatingThresholds] = useState({
    outstanding: 110,
    excellent: 100,
    good: 85,
    average: 70,
  });

  // ─── 5. Change Password State ───
  const { user, changePassword } = useAuth();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (!oldPassword) {
      toast.error("Please enter your old password");
      return;
    }
    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      toast.error(passwordError);
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("New password and confirm password do not match");
      return;
    }
    if (newPassword === oldPassword) {
      toast.error("New password must be different from your old password");
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(oldPassword, newPassword);
      toast.success("Password updated successfully");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err?.message || "Could not update password");
    } finally {
      setPasswordBusy(false);
    }
  };

  useEffect(() => {
    (async () => {
      setTargetsLoading(true);
      try {
        const [teamRes, settingsRes] = await Promise.all([
          apiGet("/api/team/employees", { skipCache: true, cacheTtl: 0 }),
          apiGet("/api/settings", { skipCache: true, cacheTtl: 0 }).catch(() => ({})),
        ]);

        const employees = teamRes?.success && Array.isArray(teamRes.employees) ? teamRes.employees : [];
        const mergedTargets = mergeEmployeeTargets(employees, settingsRes?.employeeTargets);
        setEmployeeTargets(mergedTargets);
        if (mergedTargets.length) {
          setSelectedTargetEmp(mergedTargets[0].id);
          setBulkTeam(mergedTargets[0].team);
        }

        const loadedKpis = normalizeKpiWeights(settingsRes?.kpiWeights);
        const loadedSlabs = settingsRes?.incentiveSlabs?.length ? settingsRes.incentiveSlabs : incentiveSlabs;
        const loadedBase = settingsRes?.baseIncentiveRate != null ? Number(settingsRes.baseIncentiveRate) : baseIncentiveRate;
        const loadedBonus = settingsRes?.targetBonusAmount != null ? Number(settingsRes.targetBonusAmount) : targetBonusAmount;
        const loadedFormula = settingsRes?.formulaType || formulaType;
        const loadedRatings = settingsRes?.ratingThresholds || ratingThresholds;

        setKpiWeights(loadedKpis);
        setIncentiveSlabs(loadedSlabs);
        setBaseIncentiveRate(loadedBase);
        setTargetBonusAmount(loadedBonus);
        setFormulaType(loadedFormula);
        setRatingThresholds(loadedRatings);
        if (settingsRes?.currentVersion) setCurrentVersion(settingsRes.currentVersion);

        setSavedSnapshot({
          employeeTargets: mergedTargets,
          kpiWeights: loadedKpis,
          incentiveSlabs: loadedSlabs,
          baseIncentiveRate: loadedBase,
          targetBonusAmount: loadedBonus,
          formulaType: loadedFormula,
          ratingThresholds: loadedRatings,
        });
        setStoredDraft(readStoredDraft());
      } catch {
        setEmployeeTargets([]);
      } finally {
        setTargetsLoading(false);
      }
    })();
  }, []);

  // ─── Live Validation: Sum of Weights ───
  const totalKpiWeight = useMemo(() => {
    return kpiWeights.reduce((sum, item) => sum + (item.enabled ? Number(item.weight) : 0), 0);
  }, [kpiWeights]);

  const isWeightValid = totalKpiWeight === 100;

  // ─── Live Validation: baseline rate + slab ordering ───
  const incentiveValidation = useMemo(
    () => validateIncentiveConfig({ baseIncentiveRate, incentiveSlabs }),
    [baseIncentiveRate, incentiveSlabs],
  );

  // ─── Pending edits: diff against the last loaded/published config ───
  const currentConfig = useMemo(
    () => ({
      employeeTargets,
      kpiWeights,
      incentiveSlabs,
      baseIncentiveRate,
      targetBonusAmount,
      formulaType,
      ratingThresholds,
    }),
    [employeeTargets, kpiWeights, incentiveSlabs, baseIncentiveRate, targetBonusAmount, formulaType, ratingThresholds],
  );
  const pendingCount = useMemo(
    () => (savedSnapshot ? countConfigChanges(savedSnapshot, currentConfig) : 0),
    [savedSnapshot, currentConfig],
  );
  const canSave = pendingCount > 0 && isWeightValid && incentiveValidation.valid;
  const saveBlockedReason = !isWeightValid
    ? `KPI weights total ${totalKpiWeight}% - must equal 100%`
    : !incentiveValidation.valid
      ? "Fix the highlighted incentive slab errors first"
      : pendingCount === 0
        ? "No changes to save"
        : "";

  const draftDiffersFromLoaded = useMemo(
    () => Boolean(storedDraft?.config && savedSnapshot && countConfigChanges(savedSnapshot, storedDraft.config) > 0),
    [storedDraft, savedSnapshot],
  );

  // ─── Selected Target Employee computed details ───
  const activeTargetEmp = useMemo(() => {
    if (!employeeTargets.length) return null;
    return employeeTargets.find((e) => e.id === Number(selectedTargetEmp)) || employeeTargets[0];
  }, [employeeTargets, selectedTargetEmp]);

  const bulkTeams = useMemo(() => {
    const teams = [...new Set(employeeTargets.map((e) => e.team).filter(Boolean))];
    return teams.length ? teams : ["General"];
  }, [employeeTargets]);

  // ─── Handlers ───
  const handleSaveDraft = () => {
    if (!canSave) return;
    const draft = { savedAt: new Date().toISOString(), config: currentConfig };
    writeStoredDraft(draft);
    setStoredDraft(draft);
    toast.success("Draft saved on this device. Publish to apply it to the CRM.");
  };

  const handleRestoreDraft = () => {
    if (!storedDraft?.config) return;
    const cfg = storedDraft.config;
    setEmployeeTargets(cfg.employeeTargets);
    setKpiWeights(cfg.kpiWeights);
    setIncentiveSlabs(cfg.incentiveSlabs);
    setBaseIncentiveRate(cfg.baseIncentiveRate);
    setTargetBonusAmount(cfg.targetBonusAmount);
    setFormulaType(cfg.formulaType);
    setRatingThresholds(cfg.ratingThresholds);
    toast.success("Draft restored");
  };

  const handleDiscardDraft = () => {
    writeStoredDraft(null);
    setStoredDraft(null);
  };

  const handlePublish = async () => {
    if (!isWeightValid) {
      toast.error("Cannot publish: KPI Weightages must sum to 100%. Current: " + totalKpiWeight + "%");
      return;
    }
    if (!incentiveValidation.valid) {
      toast.error(`Cannot publish: ${incentiveValidation.messages[0]}`);
      return;
    }
    if (pendingCount === 0) return;
    const nextVerNum = "v2." + (Number(currentVersion.split(".")[1]) + 1);
    const payload = {
      ...currentConfig,
      currentVersion: nextVerNum,
    };
    try {
      await apiPut("/api/settings", payload);
      setCurrentVersion(nextVerNum);
      setSavedSnapshot(currentConfig);
      writeStoredDraft(null);
      setStoredDraft(null);
      toast.success(`Published to database! Rule Engine upgraded to ${nextVerNum}`);
    } catch (err) {
      toast.error(err.message || "Failed to save settings");
    }
  };

  // Bulk target assignment logic
  const handleBulkUpdate = () => {
    if (!bulkValue || isNaN(Number(bulkValue))) {
      toast.error("Please enter a valid numeric bulk update value.");
      return;
    }
    const numVal = Number(bulkValue);
    setEmployeeTargets(prev =>
      prev.map(e => (e.team === bulkTeam ? { ...e, [bulkField]: numVal } : e))
    );

    toast.success(`Successfully bulk updated ${bulkField} targets for all ${bulkTeam} employees.`);
  };

  // Add target handler
  const handleTargetChange = (field, value) => {
    if (!activeTargetEmp || value === "" || isNaN(Number(value))) return;
    setEmployeeTargets(prev =>
      prev.map(e => (e.id === activeTargetEmp.id ? { ...e, [field]: Number(value) } : e))
    );
  };

  // KPI weight updates
  const handleWeightChange = (id, val) => {
    const num = Number(val);
    if (isNaN(num)) return;
    setKpiWeights(prev =>
      prev.map(item => (item.id === id ? { ...item, weight: num } : item))
    );
  };

  const handleKpiToggle = (id) => {
    setKpiWeights(prev =>
      prev.map(item => (item.id === id ? { ...item, enabled: !item.enabled } : item))
    );
  };

  // slabs handlers
  const handleSlabChange = (id, field, val) => {
    const num = Number(val);
    if (isNaN(num)) return;
    setIncentiveSlabs(prev =>
      prev.map(s => (s.id === id ? { ...s, [field]: num } : s))
    );
  };

  return (
    <div className="space-y-4 sm:space-y-6 page-shell min-w-0">
      <DashboardScrollbarStyles />
      <AdminProfileHeader />

      {/* ── Main Two-Column Control Center Layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 sm:gap-6 min-w-0">
        <SettingsMobileTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabExtra={(t) =>
            (t.id === "kpis" && !isWeightValid) || (t.id === "incentives" && !incentiveValidation.valid) ? (
              <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-600 animate-ping" />
            ) : null
          }
        />

        <SettingsSidebar
          title="Business Control"
          subtitle="Configure operational business rules"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          tabExtra={(t) =>
            (t.id === "kpis" && !isWeightValid) || (t.id === "incentives" && !incentiveValidation.valid) ? (
              <span className="absolute right-3 w-2 h-2 rounded-full bg-rose-600 animate-ping" />
            ) : null
          }
        />

        {/* Right Side Control Panels */}
        <SettingsPanel
          footer={
            activeTab === "password" || activeTab === "autoassign" ? null : (
            <PanelFooter
              left={
                <Badge tone={pendingCount > 0 ? "warning" : "muted"}>
                  {pendingCount > 0
                    ? `${pendingCount} Pending Edit${pendingCount === 1 ? "" : "s"}`
                    : "No Pending Edits"}
                </Badge>
              }
              actions={
                <>
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={!canSave}
                    title={saveBlockedReason}
                    className="flex-1 sm:flex-initial px-4 py-2 border border-rose-200 hover:border-rose-400 text-[#be123c] rounded-xl text-xs font-bold transition-all shadow-sm bg-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-rose-200"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={!canSave}
                    title={saveBlockedReason}
                    className="flex-1 sm:flex-initial px-4 py-2 bg-[#be123c] hover:bg-[#a20f32] text-white rounded-xl text-xs font-bold transition-all shadow-md active:translate-y-px flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:translate-y-0 disabled:hover:bg-[#be123c]"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Publish Configuration
                  </button>
                </>
              }
            />
            )
          }
        >
              {draftDiffersFromLoaded && activeTab !== "password" && activeTab !== "autoassign" && (
                <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-200 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-amber-800 font-medium flex-1 min-w-0">
                    A draft saved on this device{storedDraft?.savedAt ? ` (${new Date(storedDraft.savedAt).toLocaleString("en-IN")})` : ""} differs from the published configuration.
                  </span>
                  <button type="button" onClick={handleRestoreDraft} className="px-3 py-1 rounded-lg bg-white border border-amber-300 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                    Restore draft
                  </button>
                  <button type="button" onClick={handleDiscardDraft} className="px-3 py-1 rounded-lg text-[11px] font-bold text-slate-500 hover:text-slate-700">
                    Discard
                  </button>
                </div>
              )}
              {activeTab === "targets" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Employee Target Slates</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Manage quotas and target levels assigned to performers</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Select Employee Card */}
                    <div className="p-4 border border-rose-100/60 rounded-2xl bg-gradient-to-b from-white to-rose-50/30 shadow-[0_2px_12px_rgba(244,63,94,0.04)] flex flex-col min-h-[280px]">
                      <EmployeeListPicker
                        employees={employeeTargets}
                        selectedId={selectedTargetEmp}
                        onSelect={setSelectedTargetEmp}
                        search={targetSearch}
                        onSearchChange={setTargetSearch}
                        loading={targetsLoading}
                        emptyMessage="No employees found. Add team members on the Team page."
                      />
                    </div>

                    {/* Employee Target Form */}
                    <div className="md:col-span-2 p-4 border border-rose-100/50 rounded-2xl bg-white space-y-4">
                      {!activeTargetEmp ? (
                        <p className="text-xs text-slate-400 py-8 text-center">Select an employee to edit targets.</p>
                      ) : (
                      <>
                      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                        <span
                          className="w-10 h-10 rounded-xl grid place-items-center text-xs font-bold text-white shrink-0 shadow-sm"
                          style={{ background: colorForName(activeTargetEmp.name) }}
                        >
                          {initialsFromName(activeTargetEmp.name)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{activeTargetEmp.name}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">Monthly target slate</p>
                        </div>
                        <Badge tone="primary">{activeTargetEmp.team}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Monthly Call Target</label>
                          <input
                            type="number"
                            value={activeTargetEmp.calls}
                            onChange={(e) => handleTargetChange("calls", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Qualified Leads Target</label>
                          <input
                            type="number"
                            value={activeTargetEmp.leads}
                            onChange={(e) => handleTargetChange("leads", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Meetings Scheduled Target</label>
                          <input
                            type="number"
                            value={activeTargetEmp.meetings}
                            onChange={(e) => handleTargetChange("meetings", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Revenue Collection Target (₹)</label>
                          <input
                            type="number"
                            value={activeTargetEmp.revenue}
                            onChange={(e) => handleTargetChange("revenue", e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400"
                          />
                          <span className="text-[9px] text-slate-400 mt-1 block tabular-nums">{rupeeCaption(activeTargetEmp.revenue)}</span>
                        </div>
                      </div>
                      </>
                      )}
                    </div>

                  </div>

                  {/* Bulk Target updates panel */}
                  <div className="p-4 border border-rose-100 rounded-2xl bg-gradient-to-r from-rose-50/10 via-rose-50/20 to-rose-50/10">
                    <div className="mb-3">
                      <span className="text-[10px] font-black text-rose-700 uppercase tracking-wider block">Bulk Target Slate Assigner</span>
                      <span className="text-[10px] text-slate-400 font-medium">Re-assign targets to all team members collectively</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                      <CustomSelect
                        label="Target Team"
                        value={bulkTeam}
                        onChange={setBulkTeam}
                        options={bulkTeams.map((team) => ({ value: team, label: team }))}
                        icon={Users}
                        compact
                      />
                      <CustomSelect
                        label="Metric Target Field"
                        value={bulkField}
                        onChange={setBulkField}
                        options={[
                          { value: "calls", label: "Call Volume" },
                          { value: "leads", label: "Qualified Leads" },
                          { value: "meetings", label: "Scheduled Meetings" },
                          { value: "revenue", label: "Revenue Quota (₹)" },
                        ]}
                        compact
                      />
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">New Target Value</label>
                        <input
                          type="number"
                          placeholder="e.g. 500"
                          value={bulkValue}
                          onChange={(e) => setBulkValue(e.target.value)}
                          className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-white text-slate-700 text-xs outline-none"
                        />
                      </div>
                      <div>
                        <button
                          onClick={handleBulkUpdate}
                          className="w-full py-1.5 bg-[#be123c] hover:bg-[#a20f32] text-white rounded-xl text-xs font-bold shadow-sm active:translate-y-px transition"
                        >
                          Apply Bulk Change
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── 2. KPI WEIGHTAGE CONFIGURATION ── */}
              {activeTab === "kpis" && (
                <div className="space-y-6">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">KPI Rules & Weightages</h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5">Score weight allocation for the core KPIs - the Incentives page uses these same metrics and weights</p>
                    </div>
                    {isWeightValid ? (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200 flex items-center gap-1">
                        ✓ Total validated: 100%
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-3 py-1 rounded-full border border-rose-200 flex items-center gap-1">
 Weights Total: {totalKpiWeight}% (must equal 100%)
                      </span>
                    )}
                  </div>

                  <div className="space-y-4">
                    {kpiWeights.map(item => (
                      <div
                        key={item.id}
                        className={`p-4 border rounded-2xl transition flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                          item.enabled ? "bg-white border-rose-100" : "bg-slate-50/60 border-slate-100 opacity-60"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleKpiToggle(item.id)}
                            className={`w-9 h-5 rounded-full transition relative shrink-0 ${item.enabled ? "bg-[#be123c]" : "bg-slate-200"}`}
                          >
                            <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all ${item.enabled ? "translate-x-4" : ""}`} />
                          </button>
                          <div>
                            <span className="text-xs font-bold text-slate-800 block">{item.label}</span>
                            <span className="text-[10px] text-slate-400">{item.enabled ? "Active rule vector" : "De-activated vector"}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            disabled={!item.enabled}
                            value={item.enabled ? item.weight : 0}
                            onChange={(e) => handleWeightChange(item.id, e.target.value)}
                            className="w-36 h-1.5 rounded-lg bg-slate-100 accent-[#be123c]"
                          />
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              disabled={!item.enabled}
                              value={item.enabled ? item.weight : 0}
                              onChange={(e) => handleWeightChange(item.id, e.target.value)}
                              className="w-16 px-2 py-1 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold text-center outline-none focus:border-rose-400"
                            />
                            <span className="text-xs font-bold text-slate-400">%</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {!isWeightValid && (
                    <div className="p-4 rounded-2xl bg-rose-50/40 border border-rose-200 flex items-center gap-3">
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 animate-bounce" />
                      <span className="text-xs text-rose-700 font-medium">
                        Live Validation Notice: Total weight sum is <strong>{totalKpiWeight}%</strong>. You must scale the percentages so they sum to <strong>100%</strong> to enable publishing configurations.
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* ── 3. INCENTIVE & SALARY RULES ── */}
              {activeTab === "incentives" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Incentive Slabs & Salary Rules</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Configure commission slabs, default baseline rates, and target bonuses</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 border border-rose-100/50 rounded-2xl bg-slate-50/40">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Baseline Incentive Rate (%)</label>
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        value={baseIncentiveRate}
                        onChange={(e) => setBaseIncentiveRate(Number(e.target.value))}
                        aria-invalid={Boolean(incentiveValidation.baseError)}
                        className={`w-full px-3 py-2 border rounded-xl bg-white text-slate-800 text-xs font-bold outline-none ${
                          incentiveValidation.baseError ? "border-rose-400 ring-1 ring-rose-300" : "border-slate-200"
                        }`}
                      />
                      {incentiveValidation.baseError ? (
                        <span className="text-[10px] text-rose-600 font-semibold mt-1 block" role="alert">{incentiveValidation.baseError}</span>
                      ) : (
                        <span className="text-[9px] text-slate-400 mt-1 block">Default rate when target threshold achievements are below bronze levels (cannot exceed the Bronze rate)</span>
                      )}
                    </div>

                    <div className="p-4 border border-rose-100/50 rounded-2xl bg-slate-50/40">
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Monthly Target Reached Bonus (₹)</label>
                      <input
                        type="number"
                        value={targetBonusAmount}
                        onChange={(e) => setTargetBonusAmount(Number(e.target.value))}
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white text-slate-800 text-xs font-bold outline-none"
                      />
                      <span className="text-[9px] text-slate-400 mt-1 block">
                        Standard target achievement cash incentive bonus · <span className="font-bold tabular-nums">{rupeeCaption(targetBonusAmount)}</span>
                      </span>
                    </div>
                  </div>

                  {/* Slabs configuration */}
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Target Performance Slabs</span>
                      <Badge tone="info">{incentiveSlabs.length} Slabs Configured</Badge>
                    </div>

                    {!incentiveValidation.valid && (
                      <div className="mb-3 p-3 rounded-2xl bg-rose-50/60 border border-rose-200 flex items-start gap-2.5" role="alert">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div className="text-xs text-rose-700 font-medium space-y-0.5">
                          <p className="font-bold">Fix these before saving or publishing:</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {incentiveValidation.messages.map((m) => <li key={m}>{m}</li>)}
                          </ul>
                        </div>
                      </div>
                    )}

                    <div className="space-y-3">
                      {incentiveSlabs.map((slab, slabIndex) => {
                        const slabErrs = incentiveValidation.slabErrors[slab.id ?? slab.tier ?? slabIndex] || [];
                        return (
                        <div key={slab.id} className={`p-4 border rounded-2xl bg-white ${slabErrs.length ? "border-rose-300" : "border-rose-50"}`}>
                         <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
                          <span className="text-xs font-extrabold text-slate-800 w-24">{slab.tier} Tier</span>
                          <div className="flex flex-1 flex-wrap gap-4 items-center justify-end">
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Min collection (₹)</span>
                              <input
                                type="number"
                                value={slab.min}
                                onChange={(e) => handleSlabChange(slab.id, "min", e.target.value)}
                                className="w-28 px-2 py-1 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none"
                              />
                              <span className="text-[9px] text-slate-400 mt-0.5 block tabular-nums">{rupeeCaption(slab.min)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Max collection (₹)</span>
                              <input
                                type="number"
                                value={slab.max}
                                onChange={(e) => handleSlabChange(slab.id, "max", e.target.value)}
                                className="w-28 px-2 py-1 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none"
                              />
                              <span className="text-[9px] text-slate-400 mt-0.5 block tabular-nums">{rupeeCaption(slab.max)}</span>
                            </div>
                            <div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase block mb-0.5">Commission Rate (%)</span>
                              <input
                                type="number"
                                step="0.1"
                                value={slab.rate}
                                onChange={(e) => handleSlabChange(slab.id, "rate", e.target.value)}
                                className="w-20 px-2 py-1 border border-slate-200 rounded-xl bg-slate-50 text-slate-800 text-xs font-bold outline-none text-center"
                              />
                            </div>
                          </div>
                         </div>
                         {slabErrs.length > 0 && (
                           <ul className="mt-2 space-y-0.5" role="alert">
                             {slabErrs.map((m) => (
                               <li key={m} className="text-[10px] text-rose-600 font-semibold">{m}</li>
                             ))}
                           </ul>
                         )}
                        </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ── 4. PERFORMANCE CALCULATION SETTINGS ── */}
              {activeTab === "calculations" && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Performance Formula Configurations</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Select and calibrate calculation formulas for scoring teammates</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-4 border border-rose-100 rounded-2xl bg-white flex flex-col justify-between">
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 uppercase block mb-1">Calculation Rule Sets</span>
                        <span className="text-[10px] text-slate-400">Formula used to combine weighted KPI scores</span>
                      </div>

                      <div className="space-y-2 mt-4">
                        {[
                          { id: "weighted", label: "Weighted Summation", desc: "Linear sum of weights multiplied by achievement percentages" },
                          { id: "threshold", label: "Threshold Gated", desc: "Allows scoring only if base minimum thresholds are cleared" },
                          { id: "stepped", label: "Stepped slab Matrix", desc: "Gradual multiplier increases as target vectors hit increments" },
                        ].map(f => (
                          <div
                            key={f.id}
                            onClick={() => setFormulaType(f.id)}
                            className={`p-3 rounded-xl border cursor-pointer transition ${
                              formulaType === f.id
                                ? "bg-rose-50 border-rose-200 text-rose-700"
                                : "bg-slate-50/50 hover:bg-slate-50 border-slate-100 text-slate-600"
                            }`}
                          >
                            <span className="text-xs font-bold block">{f.label}</span>
                            <span className="text-[9px] text-slate-400">{f.desc}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="p-4 border border-rose-100 rounded-2xl bg-white space-y-4">
                      <div>
                        <span className="text-xs font-extrabold text-slate-800 uppercase block mb-1">Grading & Rating Limits</span>
                        <span className="text-[10px] text-slate-400">Target performance thresholds for rating slates</span>
                      </div>

                      <div className="space-y-3">
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Outstanding limit threshold</span>
                            <span>{ratingThresholds.outstanding}%</span>
                          </div>
                          <input
                            type="range" min="95" max="150" value={ratingThresholds.outstanding}
                            onChange={(e) => setRatingThresholds({ ...ratingThresholds, outstanding: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-100 accent-[#be123c]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Excellent limit threshold</span>
                            <span>{ratingThresholds.excellent}%</span>
                          </div>
                          <input
                            type="range" min="80" max="110" value={ratingThresholds.excellent}
                            onChange={(e) => setRatingThresholds({ ...ratingThresholds, excellent: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-100 accent-[#be123c]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Good limit threshold</span>
                            <span>{ratingThresholds.good}%</span>
                          </div>
                          <input
                            type="range" min="70" max="95" value={ratingThresholds.good}
                            onChange={(e) => setRatingThresholds({ ...ratingThresholds, good: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-100 accent-[#be123c]"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between text-[10px] font-bold text-slate-500 mb-1">
                            <span>Average limit threshold</span>
                            <span>{ratingThresholds.average}%</span>
                          </div>
                          <input
                            type="range" min="50" max="80" value={ratingThresholds.average}
                            onChange={(e) => setRatingThresholds({ ...ratingThresholds, average: Number(e.target.value) })}
                            className="w-full h-1 bg-slate-100 accent-[#be123c]"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── LEAD AUTO-ASSIGN (3-day timer) - saves by itself ── */}
              {activeTab === "autoassign" && <AutoReassignPanel />}

              {/* ── 5. CHANGE PASSWORD ── */}
              {activeTab === "password" && (
                <PanelSection
                  title="Change Password"
                  subtitle="Update your workspace account password using your old password"
                >
                  <form onSubmit={handlePasswordSubmit} className="p-4 sm:p-6 border border-rose-100 rounded-2xl bg-white space-y-4 max-w-xl">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <span className="text-xs font-black text-[#be123c] uppercase">Security Credentials</span>
                      <Badge tone="muted">{user?.loginId || user?.email || "Account"}</Badge>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed">
                      Enter your current (old) password, then provide and confirm your new password.
                    </p>

                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>Old Password (Current)</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="password"
                            value={oldPassword}
                            onChange={(e) => setOldPassword(e.target.value)}
                            placeholder="Enter your old password"
                            autoComplete="current-password"
                            className={`${inputClass} pl-9`}
                          />
                        </div>
                      </div>

                      <div>
                        <label className={labelClass}>New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="password"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="Enter new password (min. 8 characters)"
                            autoComplete="new-password"
                            className={`${inputClass} pl-9`}
                          />
                        </div>
                        <p className={`text-[10px] mt-1 ${newPassword && validateNewPassword(newPassword) ? "text-rose-600 font-semibold" : "text-slate-400"}`}>
                          {newPassword && validateNewPassword(newPassword) ? validateNewPassword(newPassword) : PASSWORD_HINT}
                        </p>
                      </div>

                      <div>
                        <label className={labelClass}>Confirm New Password</label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm new password"
                            autoComplete="new-password"
                            className={`${inputClass} pl-9`}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="submit"
                        disabled={passwordBusy}
                        className="px-5 py-2.5 bg-[#be123c] hover:bg-[#a20f32] disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all shadow-md active:translate-y-px"
                      >
                        {passwordBusy ? "Updating Password…" : "Update Password"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOldPassword("");
                          setNewPassword("");
                          setConfirmPassword("");
                        }}
                        className="px-4 py-2.5 border border-rose-200 text-[#be123c] rounded-xl text-xs font-bold bg-white hover:bg-rose-50 transition-all"
                      >
                        Clear
                      </button>
                    </div>
                  </form>
                </PanelSection>
              )}

        </SettingsPanel>
      </div>

    </div>
  );
}