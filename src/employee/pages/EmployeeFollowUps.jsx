import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  AlertCircle, CalendarClock, CheckCircle2, Clock, List, Mail, MessageCircle, Phone, Plus, Search, UserPlus, Video, Zap,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge } from "../../components/Primitives.jsx";
import { CustomSelect } from "../../components/CustomSelect.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { EMP_APP_TODAY } from "../../data/employeeMock.js";
import { dedupePeriodCalls, phonesMatchLoose } from "../../lib/callMetrics.js";
import { formatIndianPhone } from "../../lib/indianFormat.js";
import { classifyFollowUps, formatAssignedLabel } from "../../lib/followUpCounts.js";
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
    tone: "info",
    time: "text-sky-700",
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

const filterSection = (filterId) => (filterId === "new" ? "newLeads" : filterId);

const SECTION_META = {
  overdue: {
    title: "Overdue",
    subtitle: "Scheduled follow-ups that were missed",
    icon: AlertCircle,
    iconBox: "bg-red-100 text-red-700 border border-red-200",
    countBox: "bg-red-50 border-red-200 text-red-700",
  },
  today: {
    title: "Due Today",
    subtitle: "Scheduled for today",
    icon: Clock,
    iconBox: "bg-amber-100 text-amber-800 border border-amber-200",
    countBox: "bg-amber-50 border-amber-200 text-amber-800",
  },
  newLeads: {
    title: "New Leads",
    subtitle: "Assigned to you, first call still pending — call or WhatsApp now",
    icon: UserPlus,
    iconBox: "bg-rose-100 text-rose-700 border border-rose-200",
    countBox: "bg-rose-100 border-rose-200 text-rose-800",
  },
  upcoming: {
    title: "Upcoming",
    subtitle: "Scheduled for a later date",
    icon: CalendarClock,
    iconBox: "bg-sky-100 text-sky-700 border border-sky-200",
    countBox: "bg-sky-50 border-sky-200 text-sky-700",
  },
  completed: {
    title: "Completed",
    subtitle: "Finished follow-ups with completion date & time",
    icon: CheckCircle2,
    iconBox: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    countBox: "bg-emerald-100 border-emerald-200 text-emerald-800",
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
  const assignedLabel = formatAssignedLabel(lead);

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
        <span className="text-[9px] sm:text-[10px] font-semibold text-slate-500 tabular-nums shrink-0">{assignedLabel}</span>
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
    upcoming: "bg-sky-50 text-sky-700 border-sky-200",
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

const PAGE_SIZE = 30;

/** "Showing 30 of 906" + a "Show more" button (loads PAGE_SIZE more per click). */
function ShowMore({ shown, total, onMore }) {
  if (total <= PAGE_SIZE) return null;
  const remaining = total - shown;
  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3 pt-3 sm:pt-4">
      <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 tabular-nums">
        Showing {shown} of {total}
      </span>
      {remaining > 0 && (
        <button
          type="button"
          onClick={onMore}
          className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg text-[11px] font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition"
        >
          Show {Math.min(PAGE_SIZE, remaining)} more
        </button>
      )}
    </div>
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
  meetLink: "",
};

function isValidMeetingUrl(value) {
  if (!value) return true;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export default function EmployeeFollowUps() {
  const { leads, followUps, scheduleFollowUp, createMeeting, refreshLeads, calls, employee, startCallyzerCall } = useEmployee();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [modalOpen, setModalOpen] = useState(searchParams.get("action") === "add");
  const [form, setForm] = useState(EMPTY_SCHEDULE);
  const [scheduling, setScheduling] = useState(false);
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

  // One classification shared with Dashboard / My Tasks (lib/followUpCounts.js).
  // Overdue / Today / Upcoming = real scheduled follow-up rows only.
  // New Leads = assigned leads with no outbound call yet (never "overdue").
  const sets = useMemo(
    () => classifyFollowUps({ followUps, leads, calls: allCalls, employeeId: employee?.id }),
    [followUps, leads, allCalls, employee?.id],
  );

  const filterCounts = useMemo(() => ({
    all: sets.overdue.length + sets.today.length + sets.upcoming.length + sets.newLeads.length,
    new: sets.newLeads.length,
    overdue: sets.overdue.length,
    today: sets.today.length,
    upcoming: sets.upcoming.length,
    completed: sets.completed.length,
  }), [sets]);

  const scheduledOpen = filterCounts.overdue + filterCounts.today + filterCounts.upcoming;

  const stats = useMemo(() => ({
    overdue: filterCounts.overdue,
    today: filterCounts.today,
    upcoming: filterCounts.upcoming,
    total: filterCounts.all,
    completed: filterCounts.completed,
  }), [filterCounts]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return () => true;
    const has = (v) => String(v || "").toLowerCase().includes(q);
    return (f) => has(f.name) || has(f.company) || has(f.note) || has(f.type) || has(f.momSnippet) || has(f.phone);
  }, [search]);

  const view = useMemo(() => ({
    newLeads: sets.newLeads.filter(matches),
    overdue: sets.overdue.filter(matches),
    today: sets.today.filter(matches),
    upcoming: sets.upcoming.filter(matches),
    completed: sets.completed.filter(matches),
  }), [sets, matches]);

  // Per-section page size: 30 initially, +30 per "Show more" click. Reset when the view changes.
  const [limits, setLimits] = useState({});
  useEffect(() => { setLimits({}); }, [filter, search]);
  const limitOf = (key) => limits[key] || PAGE_SIZE;
  const showMore = (key) => setLimits((prev) => ({ ...prev, [key]: (prev[key] || PAGE_SIZE) + PAGE_SIZE }));

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

  // Overdue first so a real missed follow-up is never buried under new-lead cards.
  const sectionOrder = ["overdue", "today", "newLeads", "upcoming", "completed"];
  const nothingToShow = sectionOrder.every((key) => (
    view[key].length === 0 || (filter !== "all" && filterSection(filter) !== key)
  ));

  const handleCall = (item) => {
    const params = new URLSearchParams();
    if (item.leadId) params.set("leadId", String(item.leadId));
    if (item.name) params.set("lead", item.name);
    if (item.id) params.set("followUp", String(item.id));
    navigate(`/employee/call-assistant?${params.toString()}`);
  };

  // Dials straight away (same as the lead panel's Live Call), then opens the assistant with the timer running.
  const handleNewLeadLiveCall = async (lead) => {
    const session = await startCallyzerCall?.(lead);
    if (!session) return; // startCallyzerCall already showed the reason (no phone, Callyzer error, …)
    const params = new URLSearchParams();
    if (lead?.id) params.set("leadId", String(lead.id));
    if (lead?.name) params.set("lead", lead.name);
    params.set("live", "1");
    navigate(`/employee/call-assistant?${params.toString()}`);
    if (session.message) toast.success(session.message);
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

  const handleSchedule = async () => {
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

    if (form.type === "Meeting") {
      if (!isValidMeetingUrl(form.meetLink)) {
        toast.error("Enter a valid meeting URL (http:// or https://)");
        return;
      }
      setScheduling(true);
      try {
        const created = await createMeeting({
          leadId: lead.id,
          title: `Meeting with ${lead.name}`,
          date: form.date,
          time: form.time,
          platform: "Meeting",
          meetLink: form.meetLink,
          agenda: form.note,
        });
        if (!created) {
          toast.error("Failed to schedule meeting");
          return;
        }
        await refreshLeads();
        closeModal();
        setForm(EMPTY_SCHEDULE);
        toast.success("Meeting booked — added to My Tasks");
      } catch (err) {
        toast.error(err?.message || "Failed to schedule meeting");
      } finally {
        setScheduling(false);
      }
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
          change={stats.overdue > 0 ? "needs action" : "none overdue"}
          changeTone={stats.overdue > 0 ? "danger" : "muted"}
          sub=""
          title="Scheduled follow-ups whose date has passed and are not completed. New leads waiting for a first call are not counted here."
        />
        <StatCard
          compact
          label="Due Today"
          value={String(stats.today)}
          icon={Clock}
          tone="warning"
          change={stats.today > 0 ? "scheduled today" : "none today"}
          changeTone={stats.today > 0 ? "warning" : "muted"}
          sub=""
          title="Scheduled follow-ups dated today that are not completed."
        />
        <StatCard
          compact
          label="Upcoming"
          value={String(stats.upcoming)}
          icon={CalendarClock}
          tone="info"
          change={stats.upcoming > 0 ? "after today" : "none scheduled"}
          changeTone="muted"
          sub=""
          title="Scheduled follow-ups dated after today that are not completed."
        />
        <StatCard
          compact
          label="Total Open"
          value={String(stats.total)}
          icon={List}
          tone="primary"
          change={`${filterCounts.new} new · ${scheduledOpen} scheduled`}
          changeTone="muted"
          sub=""
          title={`Total Open = Overdue + Due Today + Upcoming + New Leads (assigned, first call still pending). Completed follow-ups (${stats.completed}) are not included.`}
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
            {filterCounts.new} new · {filterCounts.overdue} overdue · {filterCounts.today} today · {filterCounts.upcoming} upcoming · {filterCounts.completed} completed
          </p>
        </div>
      </GlassCard>

      {nothingToShow ? (
        <GlassCard className="py-4">
          <EmpEmptyState
            icon=""
            title={
              search
                ? "No follow-ups match your search"
                : filter === "new"
                  ? "No new leads waiting"
                  : filter === "completed"
                    ? "No completed follow-ups yet"
                    : filter === "all"
                      ? "All caught up"
                      : "Nothing pending in this category"
            }
            subtitle={
              search
                ? "Try a different keyword"
                : filter === "new"
                  ? "Leads assigned to you appear here until your first outbound call"
                  : filter === "completed"
                    ? "Mark follow-ups done or finish a call — completed items appear here with date & time"
                    : "Use Schedule to add a follow-up for a lead"
            }
          />
          {!search && filter !== "all" && (
            <div className="flex justify-center pb-6">
              <BtnPrimary onClick={() => setFilter("all")}>View all follow-ups</BtnPrimary>
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-2 sm:space-y-5">
          {sectionOrder.map((key) => {
            const meta = SECTION_META[key];
            const items = view[key];
            if (!items.length) return null;
            if (filter !== "all" && filterSection(filter) !== key) return null;
            const SectionIcon = meta.icon;
            const shown = Math.min(limitOf(key), items.length);
            const page = items.slice(0, shown);
            return (
              <GlassCard key={key} className="p-2.5 sm:p-4 md:p-5">
                <div className="flex items-center gap-2 mb-2 sm:mb-4">
                  <div className={`w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl grid place-items-center shrink-0 ${meta.iconBox}`}>
                    <SectionIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <h3 className="text-xs sm:text-sm font-display font-bold text-slate-900">{meta.title}</h3>
                      <span className={`inline-flex items-center justify-center min-w-[1.125rem] h-4 px-1 rounded-full border text-[9px] sm:text-[10px] font-bold tabular-nums ${meta.countBox}`}>
                        {items.length}
                      </span>
                    </div>
                    <p className="hidden sm:block text-[11px] text-slate-500 font-medium">{meta.subtitle}</p>
                  </div>
                </div>
                {key === "newLeads" ? (
                  <NewLeadGrid leads={page} onLiveCall={handleNewLeadLiveCall} onWhatsApp={handleWhatsApp} />
                ) : key === "completed" ? (
                  <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-2 xl:grid-cols-3 sm:gap-3">
                    {page.map((item) => (
                      <CompletedFollowUpCard key={`completed-${item.id}`} item={item} />
                    ))}
                  </div>
                ) : (
                  <FollowUpGrid items={page} onCall={handleCall} onWhatsApp={handleWhatsApp} leads={leads} />
                )}
                <ShowMore shown={shown} total={items.length} onMore={() => showMore(key)} />
              </GlassCard>
            );
          })}
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
            <BtnPrimary onClick={handleSchedule} disabled={scheduling}>
              {scheduling ? "Scheduling…" : "Schedule"}
            </BtnPrimary>
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
        {form.type === "Meeting" && (
          <FormGroup>
            <FormLabel>Meeting URL</FormLabel>
            <FormInput
              placeholder="https://meet.google.com/…"
              value={form.meetLink}
              onChange={(e) => setForm((p) => ({ ...p, meetLink: e.target.value }))}
            />
          </FormGroup>
        )}
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
