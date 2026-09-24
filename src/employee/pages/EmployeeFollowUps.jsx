import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock, List, Mail, MessageCircle, Phone, Plus, Search, UserPlus, Video, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { CustomSelect } from "../../components/CustomSelect.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { EMP_APP_TODAY, isFollowUpCompleted, isTodayUncontactedNewLead, isStaleUncontactedAdminLead } from "../../data/employeeMock.js";
import { dedupePeriodCalls, phonesMatchLoose } from "../../lib/callMetrics.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";
import { formatRelativeTime } from "../../lib/leadSync.js";
import { formatTelUrl } from "../../lib/phoneUtils.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import {
  EmpEmptyState, EmpModal, BtnPrimary, BtnSecondary, BtnGhost,
  FormLabel, FormInput, FormSelect, FormGroup, FormRow, AvatarCircle,
} from "../components/EmpUI.jsx";
import { TimeOfDaySelects } from "../components/TimeOfDaySelects.jsx";
import WhatsAppScriptPicker from "../components/WhatsAppScriptPicker.jsx";

const URGENCY = {
  overdue: {
    label: "Overdue",
    section: "Overdue",
    tone: "danger",
    time: "text-red-600",
    icon: AlertCircle,
  },
  today: {
    label: "Due Today",
    section: "Due Today",
    tone: "warning",
    time: "text-amber-700",
    icon: Clock,
  },
  upcoming: {
    label: "Upcoming",
    section: "Upcoming",
    tone: "success",
    time: "text-emerald-700",
    icon: CalendarClock,
  },
  completed: {
    label: "Completed",
    section: "Completed",
    tone: "success",
    time: "text-emerald-700",
    icon: CheckCircle2,
  },
};

const FILTERS = [
  { id: "all", label: "All", short: "All", icon: List },
  { id: "new", label: "New Leads", short: "New", icon: UserPlus },
  { id: "overdue", label: "Overdue", short: "Late", icon: AlertCircle },
  { id: "today", label: "Due Today", short: "Today", icon: Clock },
  { id: "upcoming", label: "Upcoming", short: "Soon", icon: CalendarClock },
  { id: "completed", label: "Completed", short: "Done", icon: CheckCircle2 },
];

const TYPE_ICON = {
  Call: Phone,
  WhatsApp: MessageCircle,
  Email: Mail,
  Meeting: Video,
};

const CARD_BTN =
  "inline-flex items-center justify-center gap-1 w-full py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg sm:rounded-xl text-[10px] sm:text-[11px] font-semibold border transition min-h-[36px] sm:min-h-0";

function getFollowUpDisplayName(itemOrLead, fallbackPhone = "") {
  if (!itemOrLead) return fallbackPhone ? formatIndianPhone(fallbackPhone) : "No Number";
  const raw = String(itemOrLead.name || itemOrLead.leadName || "").trim();
  const phoneNum = itemOrLead.phone || itemOrLead.clientPhone || fallbackPhone || "";
  const isUnknown =
    !raw ||
    raw.toLowerCase() === "unknown" ||
    raw.toLowerCase() === "unknown lead" ||
    raw === phoneNum ||
    (phoneNum && raw.replace(/\D/g, "") === phoneNum.replace(/\D/g, ""));

  if (!isUnknown) return raw;
  if (phoneNum) return formatIndianPhone(phoneNum);
  return "No Number";
}

function CompletedFollowUpCard({ item }) {
  const TypeIcon = TYPE_ICON[item.type] || Phone;

  return (
    <article className="rounded-xl sm:rounded-2xl border border-emerald-200/80 bg-emerald-50/30 p-2.5 sm:p-4 min-w-0">
      <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
        <AvatarCircle initials={item.av} color={item.color} size={28} />
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{getFollowUpDisplayName(item, item.phone)}</p>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">{item.company}</p>
        </div>
        <Badge tone="success">Completed</Badge>
      </div>

      <p className="text-[10px] sm:text-xs text-slate-600 leading-snug line-clamp-2">{item.note}</p>

      <div className="flex items-center justify-between gap-2 mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-emerald-100">
        <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[9px] sm:text-[10px] font-semibold text-slate-600 bg-white px-1.5 sm:px-2 py-0.5 rounded-md border border-emerald-100 shrink-0">
          <TypeIcon className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
          {item.type}
        </span>
        <span className="text-[9px] sm:text-[10px] font-bold text-emerald-800 tabular-nums text-right">
          {item.completedTime || "—"}
        </span>
      </div>
      {item.momSnippet && (
        <p className="text-[9px] sm:text-[10px] text-slate-500 mt-2 line-clamp-2 italic border-t border-emerald-100 pt-2">
          MOM saved · {item.momSnippet}
        </p>
      )}
    </article>
  );
}

function NewLeadCard({ lead, onLiveCall, onWhatsApp }) {
  const phone = lead?.phone || "";
  const assignedLabel = formatRelativeTime(lead.assignedAt || lead.createdAt || lead.updatedAt);

  return (
    <article className="group flex flex-col rounded-xl sm:rounded-2xl border border-rose-200 bg-gradient-to-b from-rose-50/40 to-white p-2.5 sm:p-4 hover:border-rose-300 hover:shadow-[0_8px_24px_rgba(225,29,72,0.08)] transition-all duration-200 min-w-0">
      <div className="flex items-center gap-2 mb-1 sm:mb-2">
        <AvatarCircle initials={lead.av} color={lead.color} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <p className="text-xs sm:text-sm font-bold text-slate-900 truncate">{getFollowUpDisplayName(lead, phone)}</p>
            <span className="shrink-0 text-[7px] sm:text-[8px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded border bg-rose-100 text-rose-800 border-rose-200">
              New
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">{lead.company}</p>
        </div>
      </div>

      <div className="flex items-start justify-between gap-2 mt-0.5">
        <div className="min-w-0 flex-1">
          <p className="text-[10px] sm:text-xs text-slate-600 leading-snug">
            New lead · {lead.service && lead.service !== "—" ? lead.service : lead.source || "First contact pending"}
          </p>
          {phone ? (
            <p className="text-[9px] sm:text-[10px] text-slate-400 mt-0.5 tabular-nums">{formatIndianPhone(phone)}</p>
          ) : null}
        </div>
        <span className="text-[9px] sm:text-[10px] font-bold text-rose-600 tabular-nums shrink-0">{assignedLabel}</span>
      </div>

      <div className="grid grid-cols-3 gap-1 mt-2.5 pt-2.5 border-t border-rose-100">
        <button
          type="button"
          onClick={() => {
            if (!phone) {
              toast.error("Phone number not found for this lead");
              return;
            }
            const telUrl = formatTelUrl(phone);
            if (telUrl) window.location.href = telUrl;
          }}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold border border-rose-200 bg-white text-rose-800 hover:bg-rose-50 transition active:scale-95 shadow-sm"
        >
          <Phone className="w-3 h-3 text-rose-600 shrink-0" />
          Call
        </button>

        <button
          type="button"
          onClick={() => {
            if (!phone) {
              toast.error("Phone number not found for this lead");
              return;
            }
            onWhatsApp?.({ lead, phone });
          }}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold border border-emerald-200 bg-emerald-50/20 text-emerald-800 hover:bg-emerald-50 transition active:scale-95 shadow-sm"
        >
          <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
          WhatsApp
        </button>

        <button
          type="button"
          onClick={() => onLiveCall(lead)}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold bg-rose-700 text-white hover:bg-rose-800 transition active:scale-95 shadow-sm"
        >
          <Zap className="w-3 h-3 fill-white text-white shrink-0" />
          Live Call
        </button>
      </div>
    </article>
  );
}

function NewLeadGrid({ leads, onLiveCall, onWhatsApp }) {
  return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
      {leads.map((lead) => (
        <NewLeadCard key={`new-lead-${lead.id}`} lead={lead} onLiveCall={onLiveCall} onWhatsApp={onWhatsApp} />
      ))}
    </div>
  );
}

function leadToStaleFollowUp(lead) {
  const assignedLabel = formatRelativeTime(lead.assignedAt || lead.createdAt || lead.updatedAt);
  return {
    id: `stale-admin-${lead.id}`,
    leadId: lead.id,
    name: lead.name,
    company: lead.company || "—",
    note: "Admin assigned — first contact pending",
    urgency: "overdue",
    type: "Call",
    time: assignedLabel,
    av: lead.av,
    color: lead.color,
    _fromStaleAdminLead: true,
  };
}

function FollowUpCard({ item, onCall, onWhatsApp, leads = [] }) {
  const u = URGENCY[item.urgency] || URGENCY.upcoming;
  const statusLabel = item.notPicked
    ? "Not Picked"
    : item.urgency === "overdue"
      ? "Overdue"
      : item.urgency === "today"
        ? "Today"
        : "Upcoming";
  const statusPill = {
    overdue: "bg-red-50 text-red-700 border-red-200",
    today: "bg-amber-50 text-amber-800 border-amber-200",
    upcoming: "bg-emerald-50 text-emerald-700 border-emerald-200",
    notpicked: "bg-slate-100 text-slate-700 border-slate-300",
  }[item.notPicked ? "notpicked" : item.urgency] || "bg-slate-50 text-slate-600 border-slate-200";

  // Find matching lead for phone lookup (by id or phone — never by name)
  const lead = leads.find((l) => {
    if (item.leadId != null && String(l.id) === String(item.leadId)) return true;
    if (item.phone && phonesMatchLoose(l.phone || l.clientPhone, item.phone)) return true;
    return false;
  });
  const phone = lead?.phone || "";

  return (
    <article className="group flex flex-col rounded-xl sm:rounded-2xl border border-slate-200/80 bg-white p-2.5 sm:p-4 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all duration-200 min-w-0">
      <div className="flex items-center gap-2 mb-1 sm:mb-2">
        <AvatarCircle initials={item.av} color={item.color} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1.5">
            <button
              type="button"
              onClick={() => onCall(item)}
              className="text-xs sm:text-sm font-bold text-slate-900 truncate text-left hover:text-rose-700 transition"
            >
              {getFollowUpDisplayName(item, phone)}
            </button>
            <span className={`sm:hidden shrink-0 text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${statusPill}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">{item.company}</p>
        </div>
        <span className="hidden sm:inline-flex shrink-0">
          <Badge tone={item.notPicked ? "muted" : u.tone}>{statusLabel}</Badge>
        </span>
      </div>

      <div className="flex items-start justify-between gap-3 mt-1">
        <p className="text-[10px] sm:text-xs text-slate-600 leading-snug line-clamp-2 flex-1 min-w-0">
          {item.note}
        </p>
        <span className={`text-[9px] sm:text-[10px] font-bold tabular-nums shrink-0 mt-0.5 ${u.time}`}>
          {item.time}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-1 mt-2.5 pt-2.5 border-t border-slate-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!phone) {
              toast.error("Phone number not found for this lead");
              return;
            }
            const telUrl = formatTelUrl(phone);
            if (telUrl) window.location.href = telUrl;
          }}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold border border-rose-200 bg-white text-rose-800 hover:bg-rose-50 transition active:scale-95 shadow-sm"
        >
          <Phone className="w-3 h-3 text-rose-600 shrink-0" />
          Call
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!phone) {
              toast.error("Phone number not found for this lead");
              return;
            }
            onWhatsApp?.({ item, lead, phone });
          }}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold border border-emerald-200 bg-emerald-50/20 text-emerald-800 hover:bg-emerald-50 transition active:scale-95 shadow-sm"
        >
          <MessageCircle className="w-3 h-3 text-emerald-600 shrink-0" />
          WhatsApp
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCall(item);
          }}
          className="inline-flex items-center justify-center gap-0.5 py-1 px-1.5 rounded-lg text-[9px] sm:text-[10px] font-bold bg-rose-700 text-white hover:bg-rose-800 transition active:scale-95 shadow-sm"
        >
          <Zap className="w-3 h-3 fill-white text-white shrink-0" />
          Live Call
        </button>
      </div>
    </article>
  );
}

function FollowUpGrid({ items, onCall, onWhatsApp, leads = [] }) {
  return (
    <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
      {items.map((item) => (
        <FollowUpCard key={item.id} item={item} onCall={onCall} onWhatsApp={onWhatsApp} leads={leads} />
      ))}
    </div>
  );
}

const EMPTY_SCHEDULE = {
  leadId: "",
  date: EMP_APP_TODAY,
  time: "14:00",
  type: "Call",
  note: "",
};

export default function EmployeeFollowUps() {
  const { leads, followUps, scheduleFollowUp, refreshLeads, calls, employee } = useEmployee();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(searchParams.get("action") === "add");
  const [form, setForm] = useState(EMPTY_SCHEDULE);
  const [waPicker, setWaPicker] = useState({ open: false, lead: null, phone: "" });

  useEffect(() => {
    const urlFilter = searchParams.get("filter");
    if (urlFilter && FILTERS.some((f) => f.id === urlFilter)) {
      setFilter(urlFilter);
    }
  }, [searchParams]);

  useEffect(() => {
    if (searchParams.get("action") === "add") setModalOpen(true);
  }, [searchParams]);

  useEffect(() => {
    refreshLeads?.();
  }, [refreshLeads]);

  const allCalls = useMemo(() => dedupePeriodCalls(calls || []), [calls]);

  const newAssignedLeads = useMemo(() => {
    let list = leads.filter((l) => isTodayUncontactedNewLead(l, allCalls, employee?.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(q) ||
          (l.company || "").toLowerCase().includes(q) ||
          (l.phone || "").includes(q),
      );
    }
    return list.sort((a, b) => {
      const ta = new Date(a.assignedAt || a.createdAt || 0).getTime();
      const tb = new Date(b.assignedAt || b.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [leads, search, allCalls, employee?.id]);

  const staleAdminFollowUps = useMemo(() => {
    return leads
      .filter((l) => isStaleUncontactedAdminLead(l, allCalls, employee?.id))
      .map(leadToStaleFollowUp);
  }, [leads, allCalls, employee?.id]);

  const openFollowUps = useMemo(
    () => followUps.filter((f) => !isFollowUpCompleted(f)),
    [followUps],
  );

  const openFollowUpsWithStale = useMemo(() => {
    const seenLeadIds = new Set(openFollowUps.map((f) => String(f.leadId)).filter(Boolean));
    const extra = staleAdminFollowUps.filter((f) => !seenLeadIds.has(String(f.leadId)));
    return [...openFollowUps, ...extra];
  }, [openFollowUps, staleAdminFollowUps]);

  const completedFollowUps = useMemo(
    () => followUps
      .filter((f) => isFollowUpCompleted(f))
      .sort((a, b) => new Date(b.completedAt || 0) - new Date(a.completedAt || 0)),
    [followUps],
  );

  const filterCounts = useMemo(() => ({
    all: openFollowUpsWithStale.length,
    new: newAssignedLeads.length,
    overdue: openFollowUpsWithStale.filter((f) => f.urgency === "overdue").length,
    today: openFollowUpsWithStale.filter((f) => f.urgency === "today").length,
    upcoming: openFollowUpsWithStale.filter((f) => f.urgency === "upcoming").length,
    completed: completedFollowUps.length,
  }), [openFollowUpsWithStale, completedFollowUps, newAssignedLeads.length]);

  const stats = useMemo(() => ({
    overdue: filterCounts.overdue,
    today: filterCounts.today,
    upcoming: filterCounts.upcoming,
    total: filterCounts.all,
    completed: filterCounts.completed,
  }), [filterCounts]);

  const filtered = useMemo(() => {
    if (filter === "new") return [];
    let list = filter === "completed" ? completedFollowUps : openFollowUpsWithStale;
    if (filter !== "all" && filter !== "completed") {
      list = list.filter((f) => f.urgency === filter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.company.toLowerCase().includes(q) ||
          f.note.toLowerCase().includes(q) ||
          f.type.toLowerCase().includes(q) ||
          (f.momSnippet || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [filter, search, openFollowUps, completedFollowUps]);

  const filteredCompleted = useMemo(() => {
    if (filter !== "all") return [];
    let list = completedFollowUps;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.company.toLowerCase().includes(q) ||
          f.note.toLowerCase().includes(q) ||
          (f.momSnippet || "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [filter, search, completedFollowUps]);

  const leadOptions = useMemo(() => {
    return [...leads]
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "en", { sensitivity: "base" }))
      .map((l) => {
        const phone = formatIndianPhone(l.phone);
        const company = l.company && l.company !== "—" ? l.company : "";
        return {
          value: String(l.id),
          label: l.name || "Unnamed lead",
          subtitle: phone !== "—" ? phone : (company || ""),
          searchText: `${l.name || ""} ${l.phone || ""} ${l.company || ""}`,
        };
      });
  }, [leads]);

  const grouped = useMemo(() => {
    if (filter !== "all") return null;
    return ["overdue", "today", "upcoming"]
      .map((key) => ({
        key,
        meta: URGENCY[key],
        items: filtered.filter((f) => f.urgency === key),
      }))
      .filter((g) => g.items.length > 0);
  }, [filter, filtered]);

  const handleCall = (item) => {
    const params = new URLSearchParams();
    if (item.leadId) params.set("leadId", String(item.leadId));
    if (item.name) params.set("lead", item.name);
    if (item.id) params.set("followUp", String(item.id));
    navigate(`/employee/call-assistant?${params.toString()}`);
  };

  const handleNewLeadLiveCall = (lead) => {
    const params = new URLSearchParams();
    if (lead?.id) params.set("leadId", String(lead.id));
    if (lead?.name) params.set("lead", lead.name);
    navigate(`/employee/call-assistant?${params.toString()}`);
  };

  const handleWhatsApp = ({ lead, phone }) => {
    setWaPicker({
      open: true,
      lead: lead || { name: "", company: "" },
      phone: phone || "",
    });
  };

  const closeModal = () => {
    setModalOpen(false);
    if (searchParams.get("action") === "add") {
      setSearchParams({}, { replace: true });
    }
  };

  const handleSchedule = () => {
    if (!form.leadId) {
      toast.error("Select a lead");
      return;
    }
    if (!form.date || !form.time) {
      toast.error("Pick date and time");
      return;
    }
    const lead = leads.find((l) => String(l.id) === String(form.leadId));
    if (!lead) {
      toast.error("Selected lead not found");
      return;
    }
    scheduleFollowUp({
      leadName: lead.name,
      company: lead.company,
      type: form.type,
      date: form.date,
      time: form.time,
      note: form.note,
      leadId: lead.id,
    });
    closeModal();
    setForm(EMPTY_SCHEDULE);
    toast.success("Follow-up scheduled — added to My Tasks");
  };

  return (
    <div className="space-y-3 sm:space-y-5 page-shell min-w-0 animate-fade-in">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <StatCard
          compact
          label="Overdue"
          value={String(stats.overdue)}
          icon={AlertCircle}
          tone="danger"
          change="needs action"
          changeTone="danger"
          sub=""
        />
        <StatCard
          compact
          label="Due Today"
          value={String(stats.today)}
          icon={Clock}
          tone="warning"
          change="scheduled today"
          sub=""
        />
        <StatCard
          compact
          label="Upcoming"
          value={String(stats.upcoming)}
          icon={CalendarClock}
          tone="success"
          change="this week"
          sub=""
        />
        <StatCard
          compact
          label="Total Open"
          value={String(stats.total)}
          icon={List}
          tone="primary"
          change={`${stats.completed} completed`}
          changeTone="success"
          sub=""
        />
      </div>

      <GlassCard className="p-2.5 sm:p-4">
        <div className="flex flex-col gap-2 sm:gap-3">
          {/* Mobile: 6 equal filter pills in grid of 3 columns */}
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-slate-100/70 border border-slate-200/50 sm:hidden">
            {FILTERS.map(({ id, short, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1 rounded-lg text-[9px] font-extrabold transition-all border shrink-0 ${
                  filter === id
                    ? "border-rose-600 bg-gradient-to-r from-red-600 via-rose-500 to-pink-500 text-white shadow-sm"
                    : "border-slate-200/60 bg-white text-slate-750 hover:text-rose-600"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {short}
              </button>
            ))}
          </div>

          <div className={`${SEGMENT_WRAP} hidden sm:inline-flex max-w-full`}>
            {FILTERS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id)}
                className={`flex items-center gap-1 ${SEGMENT_BTN} ${
                  filter === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {label}
                <span className={`min-w-[18px] h-[18px] rounded-full grid place-items-center text-[9px] font-black ${
                  filter === id ? "bg-rose-700 text-white" : "bg-slate-200/80 text-slate-500"
                }`}>
                  {filterCounts[id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contacts, notes…"
                className="w-full h-9 sm:h-10 pl-8 sm:pl-9 pr-3 rounded-xl bg-white border border-rose-100 text-xs sm:text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-300 transition"
              />
            </div>
            <BtnPrimary onClick={() => setModalOpen(true)} className="w-full sm:w-auto shrink-0 !min-h-[36px] sm:!min-h-0 !py-2 !text-xs sm:!text-sm">
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> Schedule
            </BtnPrimary>
          </div>

          <p className="text-[9px] sm:text-[11px] font-semibold text-slate-400">
            {filterCounts.new} new · {filterCounts.overdue} overdue · {filterCounts.today} today · {filtered.length} open shown
            <span className="hidden sm:inline"> · {filterCounts.upcoming} upcoming · {filterCounts.completed} completed</span>
          </p>
        </div>
      </GlassCard>

      {filter === "new" ? (
        newAssignedLeads.length === 0 ? (
          <GlassCard className="py-4">
            <EmpEmptyState
              icon=""
              title={search ? "No new leads match your search" : "No new leads today"}
              subtitle={search ? "Try a different keyword" : "Leads you add or receive today appear here until first outbound call"}
            />
          </GlassCard>
        ) : (
          <GlassCard className="p-2.5 sm:p-4 md:p-5">
            <div className="flex items-center gap-2 mb-2 sm:mb-4">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 bg-rose-100 text-rose-700 border border-rose-200">
                <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">New Leads</h3>
                  <span className="inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full bg-rose-100 border border-rose-200 text-[9px] sm:text-[10px] font-bold text-rose-800 tabular-nums">
                    {newAssignedLeads.length}
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                  Added or assigned today — call or WhatsApp now
                </p>
              </div>
            </div>
            <NewLeadGrid
              leads={newAssignedLeads}
              onLiveCall={handleNewLeadLiveCall}
              onWhatsApp={handleWhatsApp}
            />
          </GlassCard>
        )
      ) : filter === "completed" ? (
        filtered.length === 0 ? (
          <GlassCard className="py-4">
            <EmpEmptyState
              icon=""
              title="No completed follow-ups yet"
              subtitle="Mark follow-ups done or finish a call — completed items appear here with date & time"
            />
          </GlassCard>
        ) : (
          <GlassCard className="p-2.5 sm:p-4 md:p-5">
            <div className="flex items-center gap-2 mb-2 sm:mb-4">
              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">Completed</h3>
                  <span className="inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full bg-emerald-100 border border-emerald-200 text-[9px] sm:text-[10px] font-bold text-emerald-800 tabular-nums">
                    {filtered.length}
                  </span>
                </div>
                <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                  Finished follow-ups with completion date & time
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
              {filtered.map((item) => (
                <CompletedFollowUpCard key={`completed-${item.id}`} item={item} />
              ))}
            </div>
          </GlassCard>
        )
      ) : filtered.length === 0 && filteredCompleted.length === 0 && newAssignedLeads.length === 0 ? (
        <GlassCard className="py-4">
          <EmpEmptyState
            icon=""
            title={search ? "No follow-ups match your search" : "All caught up"}
            subtitle={search ? "Try a different keyword" : "Nothing pending in this category"}
          />
          {!search && filter !== "all" && (
            <div className="flex justify-center pb-6">
              <BtnPrimary onClick={() => setFilter("all")}>View all follow-ups</BtnPrimary>
            </div>
          )}
        </GlassCard>
          ) : (
        <div className="space-y-2 sm:space-y-5">
          {filter === "all" && newAssignedLeads.length > 0 && (
            <GlassCard className="p-2.5 sm:p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2 sm:mb-4">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 bg-rose-100 text-rose-700 border border-rose-200">
                  <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">New Leads</h3>
                    <span className="inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full bg-rose-100 border border-rose-200 text-[9px] sm:text-[10px] font-bold text-rose-800 tabular-nums">
                      {newAssignedLeads.length}
                    </span>
                  </div>
                  <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                    Added or assigned today — also in Pipeline → Lead (Today)
                  </p>
                </div>
              </div>
              <NewLeadGrid
                leads={newAssignedLeads}
                onLiveCall={handleNewLeadLiveCall}
                onWhatsApp={handleWhatsApp}
              />
            </GlassCard>
          )}

          {grouped ? (
            grouped.map(({ key, meta, items }) => {
              const SectionIcon = meta.icon;
              return (
                <GlassCard key={key} className="p-2.5 sm:p-4 md:p-5">
                  <div className="flex items-center gap-2 mb-2 sm:mb-4">
                    <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 ${
                      key === "overdue" ? "bg-red-100 text-red-700 border border-red-200" :
                      key === "today" ? "bg-amber-100 text-amber-800 border border-amber-200" :
                      "bg-emerald-100 text-emerald-700 border border-emerald-200"
                    }`}>
                      <SectionIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 sm:gap-2">
                        <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">{meta.section}</h3>
                        <span className="inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full bg-slate-100 border border-slate-200 text-[9px] sm:text-[10px] font-bold text-slate-600 tabular-nums">
                          {items.length}
                        </span>
                      </div>
                      <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                        {key === "overdue" ? "Past due — includes uncontacted admin assignments" :
                         key === "today" ? "Scheduled for today" : "Later this week"}
                      </p>
                    </div>
                  </div>
                  <FollowUpGrid items={items} onCall={handleCall} onWhatsApp={handleWhatsApp} leads={leads} />
                </GlassCard>
              );
            })
          ) : (
            <GlassCard className="p-2.5 sm:p-4 md:p-5">
              <div className="flex items-center justify-between gap-2 mb-2 sm:mb-4">
                <div>
                  <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">
                    {FILTERS.find((f) => f.id === filter)?.label}
                  </h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium">{filtered.length} follow-ups</p>
                </div>
              </div>
              <FollowUpGrid items={filtered} onCall={handleCall} onWhatsApp={handleWhatsApp} leads={leads} />
            </GlassCard>
          )}

          {filter === "all" && filteredCompleted.length > 0 && (
            <GlassCard className="p-2.5 sm:p-4 md:p-5">
              <div className="flex items-center gap-2 mb-2 sm:mb-4">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">Completed</h3>
                    <span className="inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full bg-emerald-100 border border-emerald-200 text-[9px] sm:text-[10px] font-bold text-emerald-800 tabular-nums">
                      {filteredCompleted.length}
                    </span>
                  </div>
                  <p className="hidden sm:block text-[11px] text-slate-500 font-medium">
                    Finished follow-ups with completion date & time
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
                {filteredCompleted.map((item) => (
                  <CompletedFollowUpCard key={`completed-${item.id}`} item={item} />
                ))}
              </div>
            </GlassCard>
          )}
        </div>
      )}

      <EmpModal
        open={modalOpen}
        onClose={closeModal}
        title="Schedule Follow-Up"
        subtitle="Set a reminder for a lead"
        footer={
          <>
            <BtnGhost onClick={closeModal}>Cancel</BtnGhost>
            <BtnPrimary onClick={handleSchedule}>Schedule</BtnPrimary>
          </>
        }
      >
        <FormGroup>
          <FormLabel>Lead</FormLabel>
          <CustomSelect
            value={form.leadId}
            onChange={(val) => setForm((p) => ({ ...p, leadId: val }))}
            options={leadOptions}
            searchable
            searchPlaceholder="Search by name or phone number…"
            placeholder="Select lead…"
            compact
          />
        </FormGroup>
        <FormRow>
          <FormGroup>
            <FormLabel>Date</FormLabel>
            <FormInput
              type="date"
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            />
          </FormGroup>
          <FormGroup>
            <FormLabel>Time</FormLabel>
            <TimeOfDaySelects
              value={form.time}
              onChange={(time) => setForm((p) => ({ ...p, time }))}
            />
          </FormGroup>
        </FormRow>
        <FormGroup>
          <FormLabel>Type</FormLabel>
          <FormSelect
            value={form.type}
            onChange={(e) => setForm((p) => ({ ...p, type: e.target.value }))}
          >
            <option>Call</option>
            <option>WhatsApp</option>
            <option>Email</option>
            <option>Meeting</option>
          </FormSelect>
        </FormGroup>
        <FormGroup>
          <FormLabel>Note</FormLabel>
          <FormInput
            placeholder="e.g. Proposal follow-up"
            value={form.note}
            onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))}
          />
        </FormGroup>
        <p className="text-[11px] text-slate-500 -mt-2">
          This will also appear in <strong className="text-slate-700">My Tasks</strong> on the selected date.
        </p>
      </EmpModal>

      <WhatsAppScriptPicker
        open={waPicker.open}
        onClose={() => setWaPicker({ open: false, lead: null, phone: "" })}
        lead={waPicker.lead}
        phone={waPicker.phone}
      />
    </div>
  );
}
