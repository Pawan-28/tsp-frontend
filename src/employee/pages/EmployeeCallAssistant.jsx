import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { GlassCard, Badge, Drawer } from "../../components/Primitives.jsx";
import { EMP_SOP_CHECKLIST, EMP_SOP_SCRIPTS, normalizeCallSop } from "../../data/employeeMock.js";
import useIsMobile from "../../lib/useIsMobile.js";
import { phonesMatchLoose } from "../../lib/callMetrics.js";
import { RoseHero, EmpModal, ChooseLeadPanel, BtnSecondary } from "../components/EmpUI.jsx";
import { notifyCallStarted } from "../utils/empToast.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import {
  Search, Star, Clock, Check, ChevronRight, ClipboardList,
  Sparkles, MessageSquare, Shield, DollarSign, Award, Copy,
  CheckCircle2, ArrowRight, Play, BookOpen, AlertTriangle,
  RotateCcw, Info, User, HelpCircle, Flame, StarHalf, FileText, Phone,
  ChevronDown,
} from "lucide-react";

function SopStepCTA({ steps, activeStepIndex, onStepChange, isMobile, completionPercentage, sopTitle, embedded = false, desktopBar = false }) {
  if (!steps?.length) return null;

  const pillClass = (isCompleted, isActive) => {
    if (isActive) return "bg-rose-700 border-rose-700 text-white shadow-sm";
    if (isCompleted) return "bg-rose-50 border-rose-200 text-rose-800";
    return "bg-white border-slate-100 text-slate-500 hover:border-rose-200 hover:bg-rose-50/30";
  };

  const stepPillsDesktop = (
    <div
      className="grid gap-1.5 w-full min-w-0"
      style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
    >
      {steps.map((step, idx) => {
        const isCompleted = idx < activeStepIndex;
        const isActive = idx === activeStepIndex;
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onStepChange(idx)}
            className={`${desktopBar ? "h-9" : "h-10"} flex items-center justify-center min-w-0 text-center px-1.5 rounded-xl border text-[10px] font-bold transition ${pillClass(isCompleted, isActive)}`}
          >
            <div className="flex items-center justify-center gap-1 w-full min-w-0">
              {isCompleted && <Check className="w-3 h-3 text-rose-700 shrink-0" />}
              <span className="truncate leading-tight">{step.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );

  if (desktopBar) {
    return (
      <div className="min-w-0 flex-1 flex flex-col justify-center py-0.5">
        <div className="flex items-center justify-between gap-3 mb-1.5 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 shrink-0">
              Call Stages
            </span>
            {sopTitle && (
              <>
                <span className="text-slate-200 shrink-0" aria-hidden="true">|</span>
                <span className="text-[11px] font-semibold text-slate-700 truncate">{sopTitle}</span>
              </>
            )}
          </div>
          <span className="text-[10px] font-black text-rose-600 tabular-nums shrink-0">
            {activeStepIndex + 1}/{steps.length}
            <span className="text-slate-400 font-semibold"> · {completionPercentage}%</span>
          </span>
        </div>
        {stepPillsDesktop}
      </div>
    );
  }

  const content = (
    <>
      <div className="flex items-center justify-between gap-2 mb-2 min-w-0">
        <div className="min-w-0">
          <p className="text-[9px] sm:text-[10px] font-black uppercase text-slate-400 tracking-wider">
            Call Stages
          </p>
          {sopTitle && (
            <p className="text-[10px] sm:text-[11px] font-semibold text-slate-600 truncate mt-0.5">{sopTitle}</p>
          )}
        </div>
        <span className="text-[10px] font-black text-rose-600 tabular-nums shrink-0">
          {activeStepIndex + 1}/{steps.length}
          <span className="hidden sm:inline text-slate-400 font-semibold"> · {completionPercentage}%</span>
        </span>
      </div>

      {isMobile ? (
        <div className="flex gap-1 overflow-x-auto scrollbar-none pb-0.5 -mx-0.5 px-0.5">
          {steps.map((step, idx) => {
            const isCompleted = idx < activeStepIndex;
            const isActive = idx === activeStepIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => onStepChange(idx)}
                className={`shrink-0 min-w-[4.5rem] h-9 flex flex-col items-center justify-center gap-0.5 px-2 rounded-lg border text-[9px] font-bold transition ${pillClass(isCompleted, isActive)}`}
              >
                {isCompleted && <Check className="w-2.5 h-2.5 shrink-0" />}
                <span className="truncate max-w-[5.5rem] leading-tight">{step.label.split(" ")[0]}</span>
              </button>
            );
          })}
        </div>
      ) : (
        stepPillsDesktop
      )}

      {isMobile && (
        <div className="flex items-center gap-2 min-w-0 mt-2">
          <div className="flex-1 h-1.5 bg-rose-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-rose-500 to-rose-600 rounded-full transition-all duration-300"
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
          <span className="text-[9px] font-black text-rose-700 tabular-nums shrink-0">{completionPercentage}%</span>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="min-w-0 flex-1 lg:flex lg:flex-col lg:justify-center">{content}</div>;
  }

  return (
    <div className="rounded-xl sm:rounded-2xl border border-rose-100/60 bg-white p-2.5 sm:p-3 shadow-sm min-w-0">
      {content}
    </div>
  );
}

export default function EmployeeCallAssistant() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const urlLead = searchParams.get("lead");
  const urlLeadId = searchParams.get("leadId");
  const urlPhone = searchParams.get("phone");
  const urlSop = searchParams.get("sop");
  const urlFollowUp = searchParams.get("followUp");

  const {
    leads,
    employee,
    sops,
    startCallyzerCall,
    syncCallyzerData,
    completeFollowUp,
    completeFollowUpWithMom,
    markFollowUpNotPicked,
    markFollowUpCallAgain,
  } = useEmployee();

  const [selectedSopId, setSelectedSopId] = useState(1);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [leadName, setLeadName] = useState(urlLead || "");
  const [repName, setRepName] = useState(employee?.name || "Employee");

  // Dynamic status tracking
  const [favorites, setFavorites] = useState([1]);
  const [recentlyUsed, setRecentlyUsed] = useState([1, 2]);
  const [checkedQuestions, setCheckedQuestions] = useState({});
  const [selectedBudget, setSelectedBudget] = useState(null);
  const [selectedObjectionIndex, setSelectedObjectionIndex] = useState(0);
  const [generalNotes, setGeneralNotes] = useState("");
  const [discoveryAnswers, setDiscoveryAnswers] = useState({});

  const [callDuration, setCallDuration] = useState(0);
  const [callyzerCallActive, setCallyzerCallActive] = useState(false);
  useEffect(() => {
    if (!callyzerCallActive) return undefined;
    const timer = setInterval(() => {
      setCallDuration((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [callyzerCallActive]);

  useEffect(() => {
    if (employee?.name) setRepName(employee.name);
  }, [employee?.name]);

  const formatDuration = (totalSecs) => {
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const [isEndingCall, setIsEndingCall] = useState(false);
  const [sopPickerOpen, setSopPickerOpen] = useState(false);
  const [outcomeSaving, setOutcomeSaving] = useState(false);

  const matchedLead = useMemo(() => {
    if (urlLeadId) {
      const byId = leads.find((l) => String(l.id) === String(urlLeadId));
      if (byId) return byId;
    }
    if (urlPhone) {
      return leads.find((l) => phonesMatchLoose(l.phone || l.clientPhone, urlPhone)) || null;
    }
    return null;
  }, [leads, urlLeadId, urlPhone]);

  const companyName = matchedLead ? matchedLead.company : "TechSales Lead";

  const handleStartCallyzerCall = async () => {
    if (!matchedLead) {
      toast.error("Select a valid lead before calling");
      return;
    }
    const session = await startCallyzerCall(matchedLead);
    if (session) {
      setCallyzerCallActive(true);
      setCallDuration(0);
      toast.success("Opening Callyzer — call from your phone. Recording syncs automatically.");
    }
  };

  const handleWrapUpClick = () => {
    setIsEndingCall(true);
  };

  const handleCallOutcome = async (outcome) => {
    if (outcomeSaving) return;
    setOutcomeSaving(true);
    try {
      const followUpArgs = {
        followUpId: urlFollowUp || undefined,
        leadId: matchedLead?.id,
        leadName: leadName || matchedLead?.name,
      };

      if (outcome === "completed") {
        if (urlFollowUp) {
          await completeFollowUp(urlFollowUp);
        } else if (matchedLead?.id) {
          await completeFollowUpWithMom({
            ...followUpArgs,
            mom: generalNotes?.trim() || "Call completed via Callyzer",
          });
        }
        toast.success("Call marked completed");
        setIsEndingCall(false);
        setCallyzerCallActive(false);
        syncCallyzerData();
        navigate("/employee/follow-ups?filter=completed");
        return;
      }

      if (outcome === "not_picked") {
        await markFollowUpNotPicked(urlFollowUp, followUpArgs);
        toast.success("Marked not picked — follow-up stays open for retry");
        setIsEndingCall(false);
        setCallyzerCallActive(false);
        syncCallyzerData();
        navigate("/employee/follow-ups");
        return;
      }

      if (outcome === "call_again") {
        await markFollowUpCallAgain(urlFollowUp, followUpArgs);
        toast.success("Follow-up kept open — call again when ready");
        setIsEndingCall(false);
        setCallyzerCallActive(false);
        syncCallyzerData();
        navigate("/employee/follow-ups");
      }
    } finally {
      setOutcomeSaving(false);
    }
  };

  // Active SOP calculations
  const activeSop = useMemo(() => {
    if (!sops.length) return null;
    const sop = sops.find((s) => s.id === selectedSopId) || sops[0];
    return normalizeCallSop(sop);
  }, [selectedSopId, sops]);

  useEffect(() => {
    if (sops.length && !sops.some((s) => Number(s.id) === Number(selectedSopId))) {
      setSelectedSopId(Number(sops[0].id));
    }
  }, [sops, selectedSopId]);

  useEffect(() => {
    if (!urlSop || !sops.length) return;
    const id = Number(urlSop);
    const match = sops.find((s) => s.id === id || String(s.id) === urlSop);
    if (match) setSelectedSopId(match.id);
  }, [urlSop, sops]);

  const sopCategories = useMemo(
    () => ["All", ...Array.from(new Set(sops.map((s) => s.category).filter(Boolean)))],
    [sops],
  );

  const activeStep = useMemo(() => {
    if (!activeSop?.steps?.length) return null;
    return activeSop.steps[activeStepIndex] || activeSop.steps[0];
  }, [activeSop, activeStepIndex]);

  const scriptContent = useMemo(() => {
    const stepScripts = activeStep?.scripts;
    const defaultBody = EMP_SOP_SCRIPTS[0]?.body || "";
    const opening = stepScripts?.opening
      || defaultBody
        .replace(/\[Name\]/g, leadName || "there")
        .replace(/\[Your Name\]/g, repName || "your rep")
        .replace(/\[Product\]/g, activeSop?.title || "our solution")
        .replace(/\[benefit\]/g, activeSop?.sub || "better results");
    return {
      opening,
      talkingPoints: stepScripts?.talkingPoints?.length
        ? stepScripts.talkingPoints
        : [EMP_SOP_SCRIPTS[0]?.use, activeSop?.sub].filter(Boolean),
      tips: stepScripts?.tips || "Use the checklist on the left. Call recording syncs from Callyzer after you dial.",
      label: activeStep?.label || "Opening",
    };
  }, [activeStep, leadName, repName, activeSop]);

  // Overall checklist progress of active SOP
  const completionPercentage = useMemo(() => {
    if (!activeSop?.steps?.length) return 0;
    const allQs = activeSop.steps.flatMap((step) => step.questions || []);
    if (allQs.length === 0) return 0;
    const checkedCount = allQs.filter((q) => !!checkedQuestions[`${selectedSopId}-${q.id}`]).length;
    return Math.round((checkedCount / allQs.length) * 100);
  }, [activeSop, checkedQuestions, selectedSopId]);

  // Filtered SOPs list
  const filteredSops = useMemo(() => {
    return sops.filter((s) => {
      const haystack = `${s.title || ""} ${s.sub || ""} ${s.category || ""}`.toLowerCase();
      const matchesSearch = haystack.includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === "All" || s.category === categoryFilter;
      return matchesSearch && matchesCategory;
    });
  }, [sops, searchQuery, categoryFilter]);

  const notifiedLeadRef = useRef(null);

  useEffect(() => {
    if (matchedLead?.name) setLeadName(matchedLead.name);
  }, [matchedLead?.name]);

  useEffect(() => {
    if (!urlLead || notifiedLeadRef.current === urlLead) return;
    notifiedLeadRef.current = urlLead;
    setLeadName(urlLead);
    notifyCallStarted(urlLead);
  }, [urlLead]);

  const toggleFavorite = (id, e) => {
    e.stopPropagation();
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
    toast.success(favorites.includes(id) ? "Removed from Favorites" : "Added to Favorites");
  };

  const handleSopSelect = (id) => {
    setSelectedSopId(id);
    setActiveStepIndex(0);
    setSelectedBudget(null);
    setSopPickerOpen(false);
    if (!recentlyUsed.includes(id)) {
      setRecentlyUsed((prev) => [id, ...prev.slice(0, 3)]);
    }
    toast.success(`Loaded SOP: ${sops.find(s => s.id === id)?.title}`);
  };

  const handleQuestionToggle = (qId) => {
    const key = `${selectedSopId}-${qId}`;
    setCheckedQuestions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const handleStepChange = (index) => {
    if (activeSop?.steps && index >= 0 && index < activeSop.steps.length) {
      setActiveStepIndex(index);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text);
    toast.success("Script copied to clipboard!");
  };

  const formatScriptText = (text) => {
    if (!text) return "";
    return text
      .replace(/{leadName}/g, leadName || "Lead")
      .replace(/{repName}/g, repName || "Rep");
  };

  const handleDiscoveryChange = (key, value) => {
    setDiscoveryAnswers((prev) => ({
      ...prev,
      [`${selectedSopId}-${key}`]: value,
    }));
  };

  const handleSaveNotes = () => {
    toast.success("Notes & Discovery saved to CRM local memory");
  };



  if (!activeSop) {
    return (
      <div className="page-shell min-w-0 p-4 text-sm text-slate-500">
        No SOP guides available.
      </div>
    );
  }

  const needsLeadPick = Boolean(urlSop && !urlLead);

  if (needsLeadPick) {
    return (
      <div className="space-y-4 page-shell min-w-0 animate-fade-in pb-10 max-w-lg mx-auto">
        <GlassCard className="p-4 sm:p-5">
          <h1 className="text-base sm:text-lg font-display font-bold text-slate-900">Choose a lead</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Select who you want to call using <span className="font-semibold text-slate-700">{activeSop.title}</span>
          </p>
        </GlassCard>
        <GlassCard className="p-4 sm:p-5">
          <ChooseLeadPanel
            leads={leads}
            onSelect={(lead) => {
              navigate(
                `/employee/call-assistant?sop=${urlSop}&lead=${encodeURIComponent(lead.name)}`,
                { replace: true },
              );
            }}
          />
          <BtnSecondary onClick={() => navigate(-1)} className="w-full mt-4 !rounded-xl">
            Cancel
          </BtnSecondary>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-4 page-shell min-w-0 animate-fade-in pb-6 sm:pb-10 relative">

      {/* Top bar — mobile layout unchanged; desktop web gets a compact single-row bar */}
      <div className="sticky top-0 z-20 rounded-xl sm:rounded-2xl border border-rose-100/60 bg-white p-2.5 sm:p-3.5 shadow-sm min-w-0 overflow-hidden">
        {/* Mobile / tablet — keep existing stacked layout */}
        <div className="flex flex-col gap-3 min-w-0 lg:hidden">
          <div className="flex flex-col gap-2 min-w-0 pb-3 border-b border-rose-50">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-1">
                <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
                <h1 className="text-xs sm:text-sm font-bold text-slate-800 truncate">
                  Call Assistant
                </h1>
              </div>
              <span className="font-mono text-[10px] sm:text-[11px] text-rose-700 font-extrabold bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100/70 tracking-wider tabular-nums shrink-0">
 {callyzerCallActive ? formatDuration(callDuration) : "—"}
              </span>
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {callyzerCallActive ? (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[9px] sm:text-[10px] font-bold border border-emerald-200 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Callyzer active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-50 text-slate-600 text-[9px] sm:text-[10px] font-bold border border-slate-200 shrink-0">
                  Dial from Callyzer app
                </span>
              )}
              {callyzerCallActive && (
                <span className="font-mono text-[10px] sm:text-[11px] text-rose-700 font-extrabold bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-100/70 tabular-nums shrink-0">
                  {formatDuration(callDuration)}
                </span>
              )}
              <button
                type="button"
                onClick={handleStartCallyzerCall}
                className="inline-flex items-center justify-center gap-1 px-3 h-8 sm:h-9 rounded-lg sm:rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-[11px] sm:text-xs font-bold transition shadow-sm active:scale-95 shrink-0"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>Call on Callyzer</span>
              </button>
              <button
                type="button"
                onClick={handleWrapUpClick}
                className="inline-flex items-center justify-center gap-1 px-3 h-8 sm:h-9 rounded-lg sm:rounded-xl bg-white border border-slate-200 text-slate-700 text-[11px] sm:text-xs font-bold hover:bg-slate-50 transition shrink-0 ml-auto"
              >
                Log Outcome
              </button>
            </div>
          </div>

          <SopStepCTA
            embedded
            steps={activeSop.steps || []}
            activeStepIndex={activeStepIndex}
            onStepChange={handleStepChange}
            isMobile={isMobile}
            completionPercentage={completionPercentage}
            sopTitle={activeSop.title}
          />
        </div>

        {/* Desktop web — single balanced row */}
        <div className="hidden lg:flex lg:items-center lg:gap-5 xl:gap-6 min-w-0">
          <div className="flex items-center gap-2.5 xl:gap-3 shrink-0">
            <div className="flex items-center gap-2 shrink-0">
              <div className="w-8 h-8 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center shrink-0">
                <Play className="w-4 h-4 text-rose-600" />
              </div>
              <h1 className="text-sm font-bold text-slate-800 whitespace-nowrap">
                Call Assistant Workspace
              </h1>
            </div>

            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 text-[10px] font-bold border border-slate-200 shrink-0">
              {callyzerCallActive ? "Callyzer call in progress" : "Ready — use Callyzer to dial"}
            </span>

            {callyzerCallActive && (
              <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-rose-700 font-extrabold bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-100/70 tracking-wider tabular-nums shrink-0">
                <Clock className="w-3.5 h-3.5 text-rose-500" />
                {formatDuration(callDuration)}
              </span>
            )}

            <button
              type="button"
              onClick={handleStartCallyzerCall}
              className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition shadow-sm hover:shadow-md active:scale-[0.98] shrink-0"
            >
              <Phone className="w-3.5 h-3.5" />
              Call on Callyzer
            </button>

            <button
              type="button"
              onClick={handleWrapUpClick}
              className="inline-flex items-center justify-center gap-1.5 px-4 h-9 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 transition shrink-0"
            >
              Log Outcome
            </button>
          </div>

          <div className="w-px self-stretch bg-gradient-to-b from-transparent via-rose-100 to-transparent shrink-0" aria-hidden="true" />

          <SopStepCTA
            desktopBar
            steps={activeSop.steps || []}
            activeStepIndex={activeStepIndex}
            onStepChange={handleStepChange}
            isMobile={false}
            completionPercentage={completionPercentage}
            sopTitle={activeSop.title}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 sm:gap-4 md:gap-5 items-start">

        {/* ── LEFT SIDEBAR (25%) ── */}
        <div className="xl:col-span-3 space-y-3 sm:space-y-4 order-2 xl:order-1 min-w-0">

          {/* Search and Filters — desktop / browse mode */}
          <GlassCard className="hidden sm:block p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-rose-500" /> Search SOP Library
            </h3>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search scripts & guides..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-350 transition"
              />
            </div>

            {/* Service/Category Filter Pills */}
            <div className="flex flex-wrap gap-1 pt-1">
              {sopCategories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition ${categoryFilter === cat
                      ? "bg-rose-700 text-white border-rose-700 shadow-sm"
                      : "bg-white text-slate-600 border-rose-100 hover:border-rose-200 hover:bg-rose-50"
                    }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* SOP Library List */}
          <GlassCard className="hidden sm:block p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center justify-between">
              <span>Guides & SOPs</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-600 font-bold border border-rose-100">
                {filteredSops.length} of {sops.length}
              </span>
            </h3>

            <div className="space-y-2 max-h-[min(280px,calc(100dvh-360px))] sm:max-h-[min(420px,calc(100dvh-320px))] overflow-y-auto pr-1 scrollbar-thin">
              {filteredSops.map((sop) => {
                const isActive = sop.id === selectedSopId;
                const isFav = favorites.includes(sop.id);
                return (
                  <div
                    key={sop.id}
                    onClick={() => handleSopSelect(sop.id)}
                    className={`w-full text-left rounded-xl border p-2.5 transition cursor-pointer flex items-center justify-between gap-2 group ${isActive
                        ? "border-rose-500 bg-rose-50/50"
                        : "border-slate-100 bg-white hover:border-rose-200"
                      }`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="text-base shrink-0">{sop.icon}</span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-850 truncate group-hover:text-rose-700 transition">
                          {sop.title}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate mt-0.5">
                          {sop.category} · {sop.duration}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => toggleFavorite(sop.id, e)}
                      className="p-1 rounded-lg hover:bg-rose-100/50 text-slate-300 hover:text-amber-500 transition shrink-0"
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
                    </button>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Favorite & Recently Used Widgets */}
          <GlassCard className="hidden md:block p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <div>
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" /> Favorite Guides
              </h4>
              {favorites.length === 0 ? (
                <p className="text-[10px] text-slate-400 italic">No favorites starred.</p>
              ) : (
                <div className="space-y-1.5">
                  {favorites.map((favId) => {
                    const item = sops.find((s) => s.id === favId);
                    if (!item) return null;
                    return (
                      <button
                        key={favId}
                        type="button"
                        onClick={() => handleSopSelect(favId)}
                        className="w-full text-left text-xs font-semibold text-slate-650 hover:text-rose-700 truncate block py-0.5"
                      >
                        ★ {item.title}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-rose-100 pt-3">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-rose-500" /> Recently Active
              </h4>
              <div className="space-y-1.5">
                {recentlyUsed.map((recentId) => {
                  const item = sops.find((s) => s.id === recentId);
                  if (!item) return null;
                  return (
                    <button
                      key={recentId}
                      type="button"
                      onClick={() => handleSopSelect(recentId)}
                      className="w-full text-left text-[11px] text-slate-650 hover:text-rose-700 truncate block"
                    >
 {item.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </GlassCard>

          {/* Overall Call Qualification Progress status */}
          <GlassCard className="hidden sm:block p-4 bg-gradient-to-br from-rose-50/50 to-rose-100/20 border border-rose-100">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider">
                Checklist Progress
              </span>
              <span className="text-xs font-black text-rose-800">{completionPercentage}%</span>
            </div>
            <div className="w-full bg-rose-100 rounded-full h-2 mb-2">
              <div
                className="bg-gradient-to-r from-rose-500 to-rose-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              Complete qualification questions across all steps to increase score.
            </p>
          </GlassCard>

        </div>

        {/* ── MAIN WORKSPACE (41.6%) ── */}
        <div className="xl:col-span-5 space-y-3 sm:space-y-4 min-w-0 order-1 xl:order-2">

          {/* Active SOP Details and Stepper */}
          <GlassCard className="p-2.5 sm:p-5 space-y-3 sm:space-y-4 min-w-0 overflow-hidden">

            {/* Heading Section */}
            <div className="flex flex-col gap-2 sm:gap-3 border-b border-rose-50 pb-3 sm:pb-4 min-w-0">
              <div className="flex items-start gap-2 sm:gap-3 min-w-0">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 grid place-items-center text-white text-base sm:text-lg shrink-0">
                  {activeSop.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-sm sm:text-base font-black text-slate-900 leading-tight line-clamp-2">
                    {activeSop.title}
                  </h2>
                  <p className="text-[10px] sm:text-xs text-slate-500 mt-0.5 line-clamp-2">{activeSop.sub}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setSopPickerOpen(true)}
                  className="sm:hidden inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-bold shrink-0 active:scale-95 transition"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Change
                  <ChevronDown className="w-3 h-3 opacity-70" />
                </button>
              </div>

              <div className="flex flex-wrap gap-1 min-w-0">
                <span className="text-[7px] sm:hidden font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-100">
                  {activeSop.category}
                </span>
                <span className="text-[7px] sm:hidden font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-100 truncate max-w-full">
                  {activeSop.budgetRange}
                </span>
                <span className="text-[7px] sm:hidden font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-sky-50 text-sky-700 border-sky-100">
                  {activeSop.steps.length} steps
                </span>
                <span className="hidden sm:flex flex-wrap gap-1.5">
                  <Badge tone="primary">{activeSop.category}</Badge>
                  <Badge tone="success">Budget: {activeSop.budgetRange}</Badge>
                  <Badge tone="info">{activeSop.steps.length} Steps</Badge>
                </span>
              </div>
            </div>

          </GlassCard>

          {/* Active Step Content Workspace Card */}
          {activeStep && (
            <div className="space-y-4">

              {/* Qualification Checkbox Cards */}
              <GlassCard className="p-2.5 sm:p-5 space-y-2 sm:space-y-3 min-w-0">
                <div className="flex items-start justify-between gap-2 min-w-0">
                  <h3 className="text-[10px] sm:text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1 min-w-0">
                    <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-600 shrink-0" />
                    <span className="line-clamp-2">{isMobile ? "Qualification" : "Dynamic Qualification Questions"}</span>
                  </h3>
                  <span className="text-[9px] font-bold text-slate-450 shrink-0 hidden sm:inline">Active Stage Questions</span>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:gap-2.5">
                  {(activeStep.questions || []).map((q) => {
                    const isChecked = !!checkedQuestions[`${selectedSopId}-${q.id}`];
                    return (
                      <div
                        key={q.id}
                        onClick={() => handleQuestionToggle(q.id)}
                        className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border transition cursor-pointer flex items-start gap-2 sm:gap-3 hover:border-rose-200 hover:bg-rose-50/10 min-w-0 ${isChecked
                            ? "bg-rose-50/30 border-rose-250 shadow-sm"
                            : "bg-white border-slate-100"
                          }`}
                      >
                        <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors ${isChecked ? "bg-rose-700 border-rose-700 text-white" : "border-slate-350 bg-white"
                          }`}>
                          {isChecked && <Check className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[3]" />}
                        </div>
                        <span className={`text-[11px] sm:text-xs font-semibold leading-snug min-w-0 ${isChecked ? "text-slate-800 line-through opacity-70" : "text-slate-750"}`}>
                          {q.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </GlassCard>

              {/* Discovery Notes Area */}
              <GlassCard className="p-2.5 sm:p-5 space-y-2 sm:space-y-3 min-w-0">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-4 h-4 text-rose-600" /> Discovery Information
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(activeStep.discovery || []).map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                        {f.label}
                      </label>
                      <input
                        type="text"
                        placeholder={f.placeholder}
                        value={discoveryAnswers[`${selectedSopId}-${f.key}`] || ""}
                        onChange={(e) => handleDiscoveryChange(f.key, e.target.value)}
                        className="w-full h-9 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-350 transition text-slate-800 font-semibold"
                      />
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* Dynamic Content: Budget Section (Only on Budget step, otherwise hidden/generic) */}
              {activeStep.id === "budget" && (
                <GlassCard className="p-5 space-y-3 border-l-4 border-l-rose-600">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-extrabold text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
                      <DollarSign className="w-4 h-4 text-rose-600" /> Budget Qualification Section
                    </h3>
                    <span className="text-[10px] bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full font-bold">Standard Pricing</span>
                  </div>

                  <p className="text-xs text-slate-500 leading-tight">
                    Highlight the budget scale appropriate for the lead's service.
                  </p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {["₹1L - ₹3L", "₹3L - ₹8L", "₹8L - ₹15L", "₹15L+"].map((tier, i) => {
                      const isSelected = selectedBudget === tier;
                      const isBestFit = tier === activeSop.budgetRange || (activeSop.id === 1 && tier === "₹3L - ₹8L");
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => { setSelectedBudget(tier); toast.success(`Selected range: ${tier}`); }}
                          className={`p-3 rounded-xl border text-center transition flex flex-col items-center justify-center gap-1.5 ${isSelected
                              ? "bg-rose-700 text-white border-rose-700 shadow-glow"
                              : "bg-white border-slate-100 hover:border-rose-200"
                            }`}
                        >
                          <span className="text-xs font-black">{tier}</span>
                          {isBestFit && (
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${isSelected ? "bg-white/20 text-white" : "bg-rose-50 text-rose-700"
                              }`}>
                              Best Fit
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>
              )}

              {/* Eligibility Checklist Card */}
              <GlassCard className="p-2.5 sm:p-5 space-y-2 sm:space-y-3 min-w-0">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-rose-600" /> Eligibility & Quality Criteria
                </h3>

                <div className="space-y-2">
                  {(activeStep.checklist || []).map((cText, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs text-slate-700 font-semibold bg-slate-50/50 p-2.5 rounded-xl border border-slate-100">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                      <span>{cText}</span>
                    </div>
                  ))}
                </div>
              </GlassCard>

              {/* Stepper Navigation Buttons */}
              <div className="flex justify-between items-center gap-2 min-w-0">
                <button
                  type="button"
                  disabled={activeStepIndex === 0}
                  onClick={() => handleStepChange(activeStepIndex - 1)}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-9 sm:h-10 px-3 sm:px-5 rounded-lg sm:rounded-xl border border-slate-200 bg-white text-slate-650 text-[11px] sm:text-xs font-bold hover:bg-slate-50 transition active:scale-[0.98] disabled:opacity-40 min-w-0"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={handleSaveNotes}
                  className="hidden sm:inline-flex items-center justify-center gap-1.5 h-10 px-5 rounded-xl border border-rose-100 bg-rose-50 text-rose-750 text-xs font-bold hover:bg-rose-100 transition active:scale-[0.98]"
                >
                  Save Progress
                </button>

                <button
                  type="button"
                  disabled={activeStepIndex === activeSop.steps.length - 1}
                  onClick={() => handleStepChange(activeStepIndex + 1)}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 h-9 sm:h-10 px-3 sm:px-5 rounded-lg sm:rounded-xl bg-rose-700 text-white text-[11px] sm:text-xs font-bold hover:bg-rose-800 transition active:scale-[0.98] disabled:opacity-40 min-w-0"
                >
                  Next <ArrowRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              </div>

            </div>
          )}

          {/* General Note Taking Card */}
          <GlassCard className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <div className="flex justify-between items-center">
              <label className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                Real-time Call Notes
              </label>
              <button
                type="button"
                onClick={() => { setGeneralNotes(""); toast.success("Notes cleared"); }}
                className="text-[9px] font-bold text-slate-450 hover:text-rose-700 flex items-center gap-1"
              >
                <RotateCcw className="w-2.5 h-2.5" /> Clear Notes
              </button>
            </div>

            <textarea
              rows={3}
              placeholder="Write specific custom requests, objections, or deal timelines here..."
              value={generalNotes}
              onChange={(e) => setGeneralNotes(e.target.value)}
              className="w-full p-3 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-350 transition text-slate-800 font-semibold resize-y"
            />
          </GlassCard>

        </div>

        {/* ── RIGHT STICKY PANEL (33.3%) ── */}
        <div className="xl:col-span-4 space-y-3 sm:space-y-4 xl:sticky xl:top-24 max-h-none sm:max-h-[85vh] xl:overflow-y-auto xl:pr-1 xl:scrollbar-thin order-3 min-w-0">

          {/* Live Script Controller */}
          <GlassCard className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
            <h3 className="text-xs font-extrabold text-slate-850 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-rose-500" /> Live Script Variables
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-slate-400">Lead Name</span>
                <input
                  type="text"
                  value={leadName}
                  onChange={(e) => setLeadName(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                />
              </div>
              <div className="space-y-1">
                <span className="text-[8px] font-black uppercase text-slate-400">Rep Name</span>
                <input
                  type="text"
                  value={repName}
                  onChange={(e) => setRepName(e.target.value)}
                  className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                />
              </div>
            </div>
          </GlassCard>

          {/* Live Script Card */}
          {scriptContent && (
            <GlassCard className="p-4 space-y-3 bg-rose-50/20 border border-rose-100">
              <div className="flex items-center justify-between">
                <span className="text-[9px] font-black uppercase text-rose-700 tracking-wider">
                  {scriptContent.label} Call Script
                </span>
                <button
                  type="button"
                  onClick={() => copyToClipboard(formatScriptText(scriptContent.opening || ""))}
                  className="p-1 rounded-lg hover:bg-rose-100/50 text-rose-700 transition"
                  title="Copy Script"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="p-3 bg-white border border-rose-100 rounded-xl">
                <p className="text-xs text-slate-700 leading-relaxed font-semibold italic">
                  "{formatScriptText(scriptContent.opening || "")}"
                </p>
              </div>

              <div>
                <span className="text-[9px] font-black uppercase text-slate-455 tracking-wider block mb-1">
                  Important Talking Points
                </span>
                <ul className="space-y-1 pl-1">
                  {(scriptContent.talkingPoints || []).map((tp, idx) => (
                    <li key={idx} className="text-[10px] text-slate-655 flex items-start gap-1 font-semibold">
                      <span className="text-rose-500">•</span>
                      <span>{tp}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-rose-50 border border-rose-150 p-2.5 rounded-xl flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-rose-800 leading-snug font-bold">
                  {scriptContent.tips}
                </p>
              </div>
            </GlassCard>
          )}

          {/* Objection Rebuttal Assistant */}
          {activeSop.objections && activeSop.objections.length > 0 && (
            <GlassCard className="p-3 sm:p-4 space-y-2.5 sm:space-y-3">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Objection Handling
              </h3>

              <div className="space-y-2">
                {activeSop.objections.map((obj, idx) => {
                  const isOpen = selectedObjectionIndex === idx;
                  return (
                    <div key={idx} className="border border-slate-100 rounded-xl overflow-hidden bg-white">
                      <button
                        type="button"
                        onClick={() => setSelectedObjectionIndex(isOpen ? null : idx)}
                        className="w-full flex items-center justify-between p-2.5 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
                      >
                        <span>{obj.trigger}</span>
                        <span className={`text-[8px] text-slate-400 transition-transform ${isOpen ? "rotate-90" : ""}`}>
                          ▶
                        </span>
                      </button>
                      {isOpen && (
                        <div className="p-3 bg-slate-50 border-t border-slate-100 space-y-2">
                          <p className="text-[11px] text-slate-650 leading-relaxed italic">
                            "{obj.rebuttal}"
                          </p>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(obj.rebuttal)}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-white border border-slate-200 text-[10px] font-bold text-slate-600 hover:bg-slate-55 transition"
                          >
                            <Copy className="w-3 h-3" /> Copy Rebuttal
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
          )}

          {/* Cross-Selling Suggestion Box */}
          {activeSop.crossSell && (
            <GlassCard className="p-4 bg-gradient-to-br from-rose-500/10 via-rose-50/50 to-white border border-rose-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase text-rose-700 tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-rose-600" /> Recommended Cross-Sell
                </span>
                <Badge tone="success">{activeSop.crossSell.success}% Success</Badge>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl shrink-0">{activeSop.crossSell.icon}</span>
                <div>
                  <h4 className="text-xs font-black text-slate-900 leading-tight">
                    {activeSop.crossSell.product}
                  </h4>
                  <p className="text-[9px] text-slate-500 mt-0.5">
                    {activeSop.crossSell.deals} deals closed this month
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-slate-600 leading-relaxed font-bold bg-white/70 p-2.5 rounded-xl border border-rose-100 mb-2">
                {activeSop.crossSell.pitch}
              </p>

              <button
                type="button"
                onClick={() => toast.success(`Pitched cross-sell: ${activeSop.crossSell.product}`)}
                className="w-full py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-bold transition flex items-center justify-center gap-1 shadow-sm"
              >
                Confirm Pitch Selection
              </button>
            </GlassCard>
          )}

        </div>
      </div>

      {/* Mobile SOP picker — desktop uses left sidebar library */}
      <Drawer
        open={sopPickerOpen}
        onClose={() => setSopPickerOpen(false)}
        title="Choose SOP Guide"
        width="w-full max-w-md"
      >
        <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100">
          Switch call script and checklist without leaving the call workspace.
        </p>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search scripts & guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-350 transition"
          />
        </div>

        <div className="flex flex-wrap gap-1 mb-4">
          {sopCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold border transition ${categoryFilter === cat
                  ? "bg-rose-700 text-white border-rose-700 shadow-sm"
                  : "bg-white text-slate-600 border-rose-100 hover:border-rose-200 hover:bg-rose-50"
                }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="space-y-2 pb-6">
          {filteredSops.map((sop) => {
            const isActive = sop.id === selectedSopId;
            const isFav = favorites.includes(sop.id);
            return (
              <button
                key={sop.id}
                type="button"
                onClick={() => handleSopSelect(sop.id)}
                className={`w-full text-left rounded-xl border p-3 transition flex items-center justify-between gap-2 ${isActive
                    ? "border-rose-500 bg-rose-50/50"
                    : "border-slate-100 bg-white hover:border-rose-200"
                  }`}
              >
                <div className="min-w-0 flex items-center gap-2.5">
                  <span className="text-lg shrink-0">{sop.icon}</span>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-850 truncate">{sop.title}</p>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5">
                      {sop.category} · {sop.duration} · {sop.steps?.length || 0} steps
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isActive && (
                    <span className="text-[9px] font-black uppercase text-rose-600 bg-rose-100 px-1.5 py-0.5 rounded">
                      Active
                    </span>
                  )}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => toggleFavorite(sop.id, e)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") toggleFavorite(sop.id, e);
                    }}
                    className="p-1 rounded-lg hover:bg-rose-100/50 text-slate-300 hover:text-amber-500 transition"
                  >
                    <Star className={`w-3.5 h-3.5 ${isFav ? "fill-amber-400 text-amber-400" : ""}`} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>

      <EmpModal
        open={isEndingCall}
        onClose={() => !outcomeSaving && setIsEndingCall(false)}
        title="How did the call go?"
        subtitle={`${leadName || "Lead"} · recording & duration sync from Callyzer`}
        footer={null}
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-500 leading-relaxed">
            Pick an outcome for this follow-up. Call details and recordings are pulled from Callyzer automatically — no manual logging needed.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              disabled={outcomeSaving}
              onClick={() => handleCallOutcome("completed")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-emerald-200 bg-emerald-50 hover:bg-emerald-100 transition text-center disabled:opacity-60"
            >
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
              <span className="text-xs font-bold text-emerald-800">Call Completed</span>
            </button>
            <button
              type="button"
              disabled={outcomeSaving}
              onClick={() => handleCallOutcome("not_picked")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-amber-200 bg-amber-50 hover:bg-amber-100 transition text-center disabled:opacity-60"
            >
              <Phone className="w-6 h-6 text-amber-700 rotate-12" />
              <span className="text-xs font-bold text-amber-900">Not Picked</span>
            </button>
            <button
              type="button"
              disabled={outcomeSaving}
              onClick={() => handleCallOutcome("call_again")}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-sky-200 bg-sky-50 hover:bg-sky-100 transition text-center disabled:opacity-60"
            >
              <RotateCcw className="w-6 h-6 text-sky-700" />
              <span className="text-xs font-bold text-sky-900">Call Again</span>
            </button>
          </div>
          <button
            type="button"
            disabled={outcomeSaving}
            onClick={() => setIsEndingCall(false)}
            className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 rounded-xl border border-slate-200"
          >
            Back to script
          </button>
        </div>
      </EmpModal>
    </div>
  );
}
