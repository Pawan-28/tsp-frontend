/** LRMS v7 employee panel mock data — mirrors lrms-v7.html */
import { CALL_CONVERSATION_MIN_SEC, isConversationCall, isMissedCall as isMissedCallMetric, phonesMatchLoose as phonesMatchLooseMetric, parseCallDurationSeconds } from "../lib/callMetrics.js";
import { mapStageToId, normalizeStageLabel, isPaymentCompleteStageId, PIPELINE_STAGE_DEFINITIONS } from "../lib/pipelineStages.js";
import {
  resolveLeadKanbanColumn,
  groupEmpLeadsKanban as groupLeadsKanbanByCalls,
  filterPipelineLeadsForPeriod,
  countPipelineCallMetrics,
  filterMeetingsForPeriod,
  getPipelineStageDisplayCounts,
  isEmployeeNewAssignedLead,
  isNewPipelineLead,
  isLeadAssignedInPeriod,
  isAdminPanelAssignedLead,
  isTodayUncontactedAdminLead,
  isTodayUncontactedNewLead,
  isStaleUncontactedAdminLead,
} from "../lib/leadKanban.js";
import { isDateKeyInPeriod, localDateKey as periodLocalDateKey } from "../lib/periodFilter.js";

export {
  resolveLeadKanbanColumn,
  filterPipelineLeadsForPeriod,
  countPipelineCallMetrics,
  filterMeetingsForPeriod,
  getPipelineStageDisplayCounts,
  isEmployeeNewAssignedLead,
  isNewPipelineLead,
  isLeadAssignedInPeriod,
  isAdminPanelAssignedLead,
  isTodayUncontactedAdminLead,
  isTodayUncontactedNewLead,
  isStaleUncontactedAdminLead,
};

/** Mock-only id — never exists in MySQL; must be replaced after API bootstrap. */
export const MOCK_EMPLOYEE_ID = 101;

/**
 * Empty shape template for the logged-in employee — NOT sample data.
 * Real values come from the API; every field here is intentionally blank/zero so
 * that a field the API doesn't return renders as empty rather than as a
 * plausible-looking fake number.
 */
export const CURRENT_EMPLOYEE = {
  id: null,
  name: "",
  role: "",
  initials: "",
  email: "",
  phone: "",
  department: "",
  joiningDate: null,
  avatarColor: "#2563eb",
  callsTarget: 0,
  callsDone: 0,
  responseTimeMin: 0,
  pickupRate: 0,
  qualificationRate: 0,
  objectionHandling: 0,
  conversionRate: 0,
  followUpQuality: 0,
  baseSalary: 0,
  incRate: 0,
  incentivePeriod: "",
  incentiveStats: {
    leadsConverted: 0,
    conversionsTarget: 0,
    callTargetPct: 0,
    revenueL: 0,
    revenueTargetL: 0,
    qualifiedLeads: 0,
    meetingsBooked: 0,
  },
  incentiveTrends: {
    pickupRate: 0,
    conversionRate: 0,
    followUpQuality: 0,
    responseTimeMin: 0,
  },
  payoutHistory: [],
};

export const EMP_NAV_BADGES = {
  tasks: 5,
  followup: 8,
  calling: 3,
  leads: 24,
  meetings: 3,
};

export function buildPipelineChartFromLeads(leads = [], calls = [], options = {}, metrics = {}) {
  const { period = "month", meetings = [] } = options;
  const grouped = groupLeadsKanbanByCalls(leads, calls, {
    period,
    meetings,
    visibleLeads: leads,
  });
  const periodMeetings = filterMeetingsForPeriod(meetings, period);
  const callMetrics = countPipelineCallMetrics(calls);
  const counts = getPipelineStageDisplayCounts(grouped, {
    callyzerStats: metrics.callyzerStats,
    callMetrics,
    periodMeetings,
  });

  const max = Math.max(1, ...Object.values(counts));
  return EMP_KANBAN_STAGES.map((s) => ({
    id: s.id,
    label: s.shortLabel || s.label,
    fullLabel: s.label,
    count: counts[s.id] || 0,
    pct: Math.round(((counts[s.id] || 0) / max) * 100),
    color: s.color,
  }));
}

/** Stable key for pipeline chart — only changes when stage counts change. */
export function pipelineStageCountsKey(leads = [], calls = [], options = {}, metrics = {}) {
  const chart = buildPipelineChartFromLeads(leads, calls, options, metrics);
  return chart.map((s) => s.count).join(",");
}

/** Pipeline chart from DB pipeline_stage — matches admin Sales Funnel buckets per employee. */
export function buildPipelineChartFromLeadStages(leads = []) {
  const counts = Object.fromEntries(PIPELINE_STAGE_DEFINITIONS.map((s) => [s.id, 0]));
  for (const lead of leads) {
    const stageId = mapStageToId(lead.pipelineStage || lead.stage, lead.status);
    if (counts[stageId] != null) counts[stageId] += 1;
  }
  const max = Math.max(1, ...Object.values(counts));
  return PIPELINE_STAGE_DEFINITIONS.map((s) => ({
    label: s.shortLabel || s.label,
    fullLabel: s.label,
    count: counts[s.id] || 0,
    pct: Math.round(((counts[s.id] || 0) / max) * 100),
    color: s.color,
  }));
}

export function pipelineLeadStageCountsKey(leads = []) {
  return buildPipelineChartFromLeadStages(leads).map((s) => s.count).join(",");
}

export function buildSourceChartFromLeads(leads = []) {
  if (!leads.length) return [];
  const counts = {};
  for (const lead of leads) {
    const src = lead.source || "Other";
    counts[src] = (counts[src] || 0) + 1;
  }
  const total = leads.length;
  const colors = ["#3b82f6", "#7c3aed", "#0ea5e9", "#10b981", "#f59e0b", "#f97316"];
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([label, count], i) => ({
      label,
      pct: Math.round((count / total) * 100),
      color: colors[i % colors.length],
    }));
}

function localDateKey(date) {
  return periodLocalDateKey(date);
}

function weekStartLocal(now = new Date()) {
  const s = new Date(now);
  s.setHours(0, 0, 0, 0);
  const day = s.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  s.setDate(s.getDate() + diff);
  return s;
}

function parseCallDisplayDate(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return null;
  if (/^today/i.test(s)) return getEmpAppToday();
  if (/^yesterday/i.test(s)) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDateKey(d);
  }
  const daysAgo = s.match(/^(\d+)\s+days?\s+ago/i);
  if (daysAgo) {
    const d = new Date();
    d.setDate(d.getDate() - Number(daysAgo[1]));
    return localDateKey(d);
  }
  const year = new Date().getFullYear();
  const attempts = [
    s,
    `${s}, ${year}`,
    s.replace(/^(\d{1,2}\s+\w+),?\s+/, `$1 ${year} `),
    s.replace(/^(\w+\s+\d{1,2}),?\s+/, `$1, ${year} `),
  ];
  for (const attempt of attempts) {
    const d = new Date(attempt);
    if (!Number.isNaN(d.getTime())) return localDateKey(d);
  }
  return null;
}

/** Resolve a call's local calendar day (YYYY-MM-DD) for period filters. */
export function getCallDateKey(call) {
  if (!call || typeof call !== "object") return null;
  if (call.callDay) return call.callDay;
  for (const raw of [call.callAt, call.startedAt, call.createdAt, call.endedAt]) {
    if (!raw) continue;
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return localDateKey(d);
  }
  return parseCallDisplayDate(call.date);
}

export function isCallInPeriod(call, period, now = new Date()) {
  if (!call || typeof call !== "object") return false;
  const key = getCallDateKey(call);
  if (!key) {
    if (period === "today") return call.period === "today";
    if (period === "week") return call.period === "today" || call.period === "week";
    return true;
  }
  return isDateKeyInPeriod(key, period, now);
}

export function filterCallsForPeriod(calls, period) {
  const list = Array.isArray(calls) ? calls : [];
  return list.filter((c) => isCallInPeriod(c, period));
}

export function computeCallStatsFromCalls(calls, period = "today") {
  const list = filterCallsForPeriod(calls, period);
  const dials = list.length;
  const connected = list.filter((c) => {
    const sec = Number.isFinite(c.durationSec) ? c.durationSec : parseCallDurationSeconds(c.duration);
    return sec > 0 && !isMissedCallMetric(c);
  }).length;
  const missed = list.filter((c) => isMissedCallMetric(c)).length;
  const pickupRate = dials ? Math.min(100, Math.round((connected / dials) * 100)) : 0;
  const missRate = dials ? Math.min(100, Math.round((missed / dials) * 100)) : 0;
  const durations = list
    .map((c) => (Number.isFinite(c.durationSec) ? c.durationSec : parseCallDurationSeconds(c.duration)))
    .filter((s) => s > 0);
  const avgSecs = durations.length
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0;
  const avgDuration = avgSecs ? formatDurationFromSeconds(avgSecs) : "—";
  const totalSecs = durations.reduce((a, b) => a + b, 0);
  const totalTalk = totalSecs
    ? `${Math.floor(totalSecs / 3600)}h ${Math.floor((totalSecs % 3600) / 60)}m`.replace(/^0h /, "")
    : "—";
  const hotLeads = list.filter((c) => /hot|qualified|interested|demo|proposal/i.test(String(c.outcome || ""))).length;
  const callbacks = list.filter((c) => /callback|follow/i.test(String(c.outcome || ""))).length;
  const conversations = list.filter((c) => {
    const sec = Number.isFinite(c.durationSec) ? c.durationSec : parseCallDurationSeconds(c.duration);
    return isConversationCall(sec);
  }).length;
  const ratings = list.map((c) => c.rating).filter((r) => r > 0);
  const quality = ratings.length
    ? Math.min(100, Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 20))
    : (dials ? Math.min(100, Math.round((conversations / dials) * 100)) : 0);
  return { dials, connected, missed, callbacks, pickupRate, quality, missRate, avgDuration, hotLeads, totalTalk, conversations };
}

const DASHBOARD_ACTIVITY_EMOJI = {
  call: "📞", email: "✉️", whatsapp: "💬", meeting: "📅", note: "📝", proposal: "📄",
};

export function buildRecentActivityFeed(activities = {}, calls = [], limit = 5) {
  const items = [];
  const activityMap = activities && typeof activities === "object" && !Array.isArray(activities)
    ? activities
    : {};
  for (const events of Object.values(activityMap)) {
    if (!Array.isArray(events)) continue;
    for (const e of events) {
      items.push({ emoji: DASHBOARD_ACTIVITY_EMOJI[e.type] || "•", text: e.text, time: e.time });
    }
  }
  for (const c of calls.slice(0, 20)) {
    const kind = c.type === "miss" ? "Missed call" : c.type === "in" ? "Inbound call" : "Outbound call";
    items.push({
      emoji: "📞",
      text: `${kind}: ${c.name}${c.duration && c.duration !== "—" ? ` (${c.duration})` : ""}`,
      time: c.date,
    });
  }
  return items.slice(0, limit);
}

export function buildDashboardAgenda({ meetingsUpcoming = [], tasks = {}, followUps = [] }) {
  const today = getEmpAppToday();
  const items = [];
  const meetings = Array.isArray(meetingsUpcoming) ? meetingsUpcoming : [];
  const pendingFollowUps = Array.isArray(followUps) ? followUps : [];
  const taskMap = tasks && typeof tasks === "object" ? tasks : {};

  const formatMeetingTime = (meeting) => {
    if (meeting.scheduledAt) {
      const d = new Date(meeting.scheduledAt);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
      }
    }
    const timeMatch = String(meeting.time || "").match(/(\d{1,2}:\d{2}\s*(?:AM|PM|am|pm)?)/i);
    return timeMatch ? timeMatch[1] : "—";
  };

  const isMeetingToday = (meeting) => {
    if (meeting.date === today) return true;
    if (String(meeting.time || "").toLowerCase().startsWith("today")) return true;
    if (meeting.scheduledAt) {
      const d = new Date(meeting.scheduledAt);
      if (!Number.isNaN(d.getTime()) && localDateKey(d) === today) return true;
    }
    return false;
  };

  for (const m of meetings) {
    if (m.status === "cancelled" || m.status === "completed") continue;
    if (!isMeetingToday(m)) continue;
    items.push({
      id: `meeting-${m.id}`,
      kind: "meeting",
      time: formatMeetingTime(m),
      sortAt: m.scheduledAt ? new Date(m.scheduledAt).getTime() : Number.MAX_SAFE_INTEGER,
      title: `Meeting: ${m.lead || m.title}`,
      sub: m.company || m.agenda || "",
      hot: false,
      meetLink: m.meetLink || "",
    });
  }

  const todayTasks = taskMap[today] || [];
  for (const t of todayTasks) {
    if (t.done || t.status === "done" || t.status === "completed") continue;
    items.push({
      id: `task-${t.id}`,
      kind: "task",
      time: t.deadline || t.deadlineTime || t.time || "—",
      sortAt: parseAgendaSortTime(t.deadline || t.deadlineTime || t.time),
      title: t.name || t.title || "Task",
      sub: t.leadName || t.note || "",
      hot: t.priority === "high" || t.priority === "urgent",
    });
  }

  for (const f of pendingFollowUps) {
    if (f.done) continue;
    if (f.date && f.date !== today && f.urgency !== "today" && f.urgency !== "overdue") continue;
    items.push({
      id: `followup-${f.id}`,
      kind: "followup",
      time: f.time || "—",
      sortAt: parseAgendaSortTime(f.time),
      title: `${f.type || "Follow-up"}: ${f.name}`,
      sub: f.company || f.note || "",
      hot: f.urgency === "overdue" || f.urgency === "today",
    });
  }

  return items.sort((a, b) => (a.sortAt || 0) - (b.sortAt || 0));
}

function parseAgendaSortTime(raw) {
  const s = String(raw || "").trim();
  if (!s || s === "—") return Number.MAX_SAFE_INTEGER;
  const match = s.match(/(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = (match[3] || "").toLowerCase();
  if (meridiem === "pm" && hours < 12) hours += 12;
  if (meridiem === "am" && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export const EMP_PIPELINE = [
  { label: "Lead", count: 48, pct: 100, color: "#64748b" },
  { label: "Conversation 2 min+", count: 72, pct: 100, color: "#3b82f6" },
  { label: "Meeting Booked", count: 44, pct: 61, color: "#0ea5e9" },
  { label: "Meeting Done", count: 32, pct: 44, color: "#7c3aed" },
  { label: "Proposal Sent", count: 18, pct: 25, color: "#f59e0b" },
];

export const EMP_AGENDA = [
  { time: "9:30", title: "Call: Rajesh Mehta", sub: "Tech Corp — Budget follow-up", hot: true, done: false },
  { time: "11:00", title: "Meeting: Anjali Gupta", sub: "MediCare Plus — Demo", hot: true, done: false },
  { time: "14:00", title: "Follow Up: Deepak Singh", sub: "RetailMax — Budget check", hot: false, done: false },
  { time: "16:00", title: "Send Proposal to X", sub: "Meena Pillai — FinServe", hot: false, done: false },
  { time: "17:30", title: "Team Review", sub: "Pipeline check-in", hot: false, done: true },
];

export const EMP_SOURCE_CHART = [
  { label: "Facebook Ads", pct: 35, color: "#3b82f6" },
  { label: "LinkedIn", pct: 22, color: "#7c3aed" },
  { label: "Cold Call", pct: 18, color: "#0ea5e9" },
  { label: "Referral", pct: 15, color: "#10b981" },
  { label: "Website", pct: 10, color: "#f59e0b" },
];

export const EMP_ACTIVITY = [
  { bg: "#fef2f2", text: "Hot lead: Priya Sharma (InfoSystems) assigned", time: "2 mins ago", emoji: "🔥" },
  { bg: "#ecfdf5", text: "Lead converted: InfoSystems — ₹12L closed", time: "1 hour ago", emoji: "✅" },
  { bg: "#eff6ff", text: "Call connected: Anjali Gupta, 12m 34s", time: "3 hours ago", emoji: "📞" },
  { bg: "#fffbeb", text: "Lead circulated: Suresh Jain (5 attempts)", time: "4 hours ago", emoji: "🔄" },
  { bg: "#f5f3ff", text: "Proposal sent: Meena Pillai — FinServe", time: "Yesterday", emoji: "📄" },
];

export const EMP_FOLLOWUPS = [
  { id: 1, name: "Meena Pillai", company: "FinServe India", type: "Call", urgency: "overdue", time: "Yesterday 5PM", av: "MP", color: "#dc2626", note: "Proposal follow-up — urgent" },
  { id: 2, name: "Suresh Jain", company: "BuildNext", type: "WhatsApp", urgency: "overdue", time: "Yesterday 3PM", av: "SJ", color: "#f59e0b", note: "Cold lead — not picking" },
  { id: 3, name: "Vikram Rao", company: "SmartHome", type: "Email", urgency: "overdue", time: "2d ago", av: "VR", color: "#94a3b8", note: "Proposal pending response" },
  { id: 4, name: "Rajesh Mehta", company: "Tech Corp", type: "Call", urgency: "today", time: "Today 2:00 PM", av: "RM", color: "#2563eb", note: "Budget discussion follow-up" },
  { id: 5, name: "Anjali Gupta", company: "MediCare Plus", type: "Call", urgency: "today", time: "Today 4:00 PM", av: "AG", color: "#dc2626", note: "Demo feedback discussion" },
  { id: 6, name: "Kavitha Nair", company: "EduTech Hub", type: "Meeting", urgency: "today", time: "Today 4:30 PM", av: "KN", color: "#7c3aed", note: "Confirm discovery booking" },
  { id: 7, name: "Deepak Singh", company: "RetailMax", type: "WhatsApp", urgency: "today", time: "Today 5:00 PM", av: "DS", color: "#64748b", note: "Budget approval check" },
  { id: 8, name: "Priya Sharma", company: "InfoSystems", type: "Call", urgency: "today", time: "Today 6:00 PM", av: "PS", color: "#10b981", note: "Contract sign-off" },
  { id: 9, name: "Arun Kumar", company: "LogiTrans", type: "WhatsApp", urgency: "upcoming", time: "Tomorrow 10AM", av: "AK2", color: "#0ea5e9", note: "Warm nurturing" },
  { id: 10, name: "Siddharth Roy", company: "DataPro", type: "Call", urgency: "upcoming", time: "Tomorrow 11AM", av: "SR", color: "#8b5cf6", note: "First contact" },
];

export const EMP_CALLS = [
  { id: 101, leadId: "p6", name: "Meera Joshi", company: "Joshi Retail", duration: "22:15", type: "out", date: "Yesterday 4:20 PM", period: "week", outcome: "Discovery call completed", hasRec: true, rating: 5, mood: "positive", phone: "+91 98765 43210", note: "Client is extremely interested in the retail automation suite. Discussed integration with their existing ERP. Budget of ₹1.75L is approved. Next step: Schedule technical demo." },
  { id: 102, leadId: "p1", name: "Ananya Sharma", company: "Penguin India", duration: "10:45", type: "in", date: "2 days ago", period: "week", outcome: "Inbound inquiry check", hasRec: true, rating: 4, mood: "positive", phone: "+91 99112 23344", note: "Ananya requested custom catalog pricing for Q3 media rollout. She represents Penguin India. Pitch urgency is high. Sent initial pricing deck, waiting on selection." },
  { id: 103, leadId: "p11", name: "Sneha Iyer", company: "Iyer Tech Solutions", duration: "15:30", type: "out", date: "Yesterday 10:15 AM", period: "week", outcome: "Technical qualification", hasRec: true, rating: 4, mood: "neutral", phone: "+91 98112 34567", note: "Completed technical qualification with IT head Sneha. Confirmed their server compatibility. Budget of ₹2.8L confirmed for Q3. Next step: Prepare custom scope document." },
  { id: 104, leadId: "p19", name: "Amit Desai", company: "Desai Logistics", duration: "24:10", type: "out", date: "Today 3:30 PM", period: "today", outcome: "Negotiation meeting", hasRec: true, rating: 5, mood: "positive", phone: "+91 97765 43211", note: "Negotiated 8% discount on year-1 licensing fee. Amit agreed in principle. MSA contract drafted and sent to their legal team for review. Expected closure by next week." },
  { id: 1, leadId: 6, name: "Anjali Gupta", company: "MediCare Plus", duration: "12:34", type: "out", date: "Today 11:20 AM", period: "today", outcome: "Proposal discussed", hasRec: true, rating: 5, mood: "positive", phone: "+91 98102 33441", note: "Interested in enterprise tier. Send revised pricing today." },
  { id: 2, leadId: 1, name: "Rajesh Mehta", company: "Tech Corp India", duration: "8:15", type: "in", date: "Today 9:05 AM", period: "today", outcome: "Budget confirmed", hasRec: true, rating: 4, mood: "positive", phone: "+91 98200 11223", note: "Budget approved at ₹8L. Proposal review scheduled." },
  { id: 3, leadId: 3, name: "Suresh Jain", company: "BuildNext Pvt", duration: "—", type: "miss", date: "Today 8:30 AM", period: "today", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98765 99887", note: "3rd attempt — try WhatsApp before next call." },
  { id: 4, leadId: 4, name: "Kavitha Nair", company: "EduTech Hub", duration: "18:42", type: "out", date: "Yesterday 3:45 PM", period: "week", outcome: "Demo scheduled", hasRec: true, rating: 5, mood: "positive", phone: "+91 99001 22334", note: "Demo booked for Friday. Sent calendar invite." },
  { id: 5, leadId: 5, name: "Deepak Singh", company: "RetailMax", duration: "4:10", type: "in", date: "Yesterday 2:15 PM", period: "week", outcome: "Pending approval", hasRec: false, rating: 3, mood: "neutral", phone: "+91 97654 32109", note: "Waiting on finance approval. Follow up Monday." },
  { id: 6, leadId: 7, name: "Meena Pillai", company: "FinServe India", duration: "15:08", type: "out", date: "Apr 28, 4:20 PM", period: "week", outcome: "Negotiation ongoing", hasRec: true, rating: 4, mood: "positive", phone: "+91 98450 66778", note: "CFO joined call. Needs ROI deck." },
  { id: 7, leadId: 10, name: "Vikram Rao", company: "SmartHome Co", duration: "—", type: "miss", date: "Apr 27, 10:15 AM", period: "week", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98111 44556", note: "Voicemail left. Retry after 2 hours." },
  { id: 8, leadId: 2, name: "Priya Sharma", company: "InfoSystems Ltd", duration: "22:30", type: "out", date: "Apr 25, 3:00 PM", period: "month", outcome: "Deal closed", hasRec: true, rating: 5, mood: "positive", phone: "+91 98334 55667", note: "Contract signed — ₹12L. Onboarding kickoff next week." },
  { id: 9, leadId: 8, name: "Arun Kumar", company: "LogiTrans", duration: "6:45", type: "out", date: "Apr 22, 11:30 AM", period: "month", outcome: "Qualified lead", hasRec: true, rating: 4, mood: "positive", phone: "+91 98987 11223", note: "BANT qualified. Moving to proposal stage." },
  { id: 10, leadId: 9, name: "Sneha Verma", company: "FoodChain", duration: "2:18", type: "out", date: "Apr 18, 5:45 PM", period: "month", outcome: "Not interested", hasRec: false, rating: 2, mood: "negative", phone: "+91 98760 55443", note: "Budget too low for our package. Mark as NI." },
  { id: 11, leadId: 1, name: "Rajesh Mehta", company: "Tech Corp India", duration: "11:02", type: "out", date: "Apr 15, 2:10 PM", period: "month", outcome: "Discovery complete", hasRec: true, rating: 4, mood: "positive", phone: "+91 98200 11223", note: "Pain points documented. Demo requested." },
  { id: 12, leadId: 6, name: "Anjali Gupta", company: "MediCare Plus", duration: "9:33", type: "in", date: "Apr 12, 10:00 AM", period: "month", outcome: "Requirements gathered", hasRec: true, rating: 5, mood: "positive", phone: "+91 98102 33441", note: "Healthcare compliance requirements noted." },
  { id: 13, leadId: 4, name: "Kavitha Nair", company: "EduTech Hub", duration: "5:22", type: "out", date: "Today 1:10 PM", period: "today", outcome: "Follow-up confirmed", hasRec: true, rating: 4, mood: "positive", phone: "+91 99001 22334", note: "Confirmed demo slot. Will share case studies before call." },
  { id: 14, leadId: 5, name: "Deepak Singh", company: "RetailMax", duration: "—", type: "miss", date: "Today 12:45 PM", period: "today", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 97654 32109", note: "Line busy. Retry at 4 PM." },
  { id: 15, leadId: 8, name: "Arun Kumar", company: "LogiTrans", duration: "7:48", type: "out", date: "Today 10:30 AM", period: "today", outcome: "Pricing shared", hasRec: true, rating: 4, mood: "positive", phone: "+91 98987 11223", note: "Sent tier-2 pricing on WhatsApp during call." },
  { id: 16, leadId: 7, name: "Meena Pillai", company: "FinServe India", duration: "3:55", type: "in", date: "Today 8:15 AM", period: "today", outcome: "Quick check-in", hasRec: false, rating: 4, mood: "positive", phone: "+91 98450 66778", note: "CFO reviewing ROI deck. Callback tomorrow." },
  { id: 17, leadId: 10, name: "Vikram Rao", company: "SmartHome Co", duration: "14:20", type: "out", date: "Today 7:50 AM", period: "today", outcome: "Connected — warm", hasRec: true, rating: 3, mood: "positive", phone: "+91 98111 44556", note: "Interested in smart home bundle. Send brochure." },
  { id: 18, leadId: 12, name: "Siddharth Roy", company: "DataPro Pvt", duration: "6:12", type: "out", date: "Today 6:30 AM", period: "today", outcome: "First contact", hasRec: true, rating: 3, mood: "neutral", phone: "+91 98190 77889", note: "Cold intro done. Asked to call back Thursday." },
  { id: 19, leadId: 11, name: "Ritu Arora", company: "MediaPlus", duration: "—", type: "miss", date: "Today 5:45 PM", period: "today", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98234 66771", note: "Gatekeeper blocked. Try direct mobile." },
  { id: 20, leadId: 2, name: "Priya Sharma", company: "InfoSystems Ltd", duration: "4:05", type: "in", date: "Today 3:20 PM", period: "today", outcome: "Onboarding check", hasRec: true, rating: 5, mood: "positive", phone: "+91 98334 55667", note: "Post-sale check-in. Client happy with rollout." },
  { id: 21, leadId: 9, name: "Sneha Verma", company: "FoodChain", duration: "—", type: "miss", date: "Today 2:00 PM", period: "today", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98760 55443", note: "Second attempt today. No answer." },
  { id: 22, leadId: 1, name: "Rajesh Mehta", company: "Tech Corp India", duration: "16:44", type: "out", date: "Today 4:50 PM", period: "today", outcome: "Proposal walkthrough", hasRec: true, rating: 5, mood: "positive", phone: "+91 98200 11223", note: "Walked through line items. Legal review next." },
  { id: 23, leadId: 3, name: "Suresh Jain", company: "BuildNext Pvt", duration: "1:48", type: "out", date: "Yesterday 6:10 PM", period: "week", outcome: "Brief connect", hasRec: false, rating: 2, mood: "neutral", phone: "+91 98765 99887", note: "Picked up briefly. Asked to call morning." },
  { id: 24, leadId: 6, name: "Anjali Gupta", company: "MediCare Plus", duration: "21:05", type: "out", date: "Yesterday 11:00 AM", period: "week", outcome: "Demo prep call", hasRec: true, rating: 5, mood: "positive", phone: "+91 98102 33441", note: "Aligned on demo agenda and attendees." },
  { id: 25, leadId: 8, name: "Arun Kumar", company: "LogiTrans", duration: "—", type: "miss", date: "Yesterday 9:30 AM", period: "week", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98987 11223", note: "Traveling — requested callback Friday." },
  { id: 26, leadId: 12, name: "Siddharth Roy", company: "DataPro Pvt", duration: "—", type: "miss", date: "Apr 29, 2:20 PM", period: "week", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98190 77889", note: "No answer. Left WhatsApp voice note." },
  { id: 27, leadId: 11, name: "Ritu Arora", company: "MediaPlus", duration: "9:18", type: "in", date: "Apr 29, 11:45 AM", period: "week", outcome: "Re-engaged", hasRec: true, rating: 3, mood: "positive", phone: "+91 98234 66771", note: "Previously closed — open to Q3 budget discussion." },
  { id: 28, leadId: 5, name: "Deepak Singh", company: "RetailMax", duration: "12:02", type: "out", date: "Apr 28, 10:30 AM", period: "week", outcome: "Finance follow-up", hasRec: true, rating: 4, mood: "positive", phone: "+91 97654 32109", note: "Finance team needs one more week for sign-off." },
  { id: 29, leadId: 4, name: "Kavitha Nair", company: "EduTech Hub", duration: "3:30", type: "in", date: "Apr 28, 9:00 AM", period: "week", outcome: "Logistics query", hasRec: false, rating: 4, mood: "positive", phone: "+91 99001 22334", note: "Asked about LMS integration timeline." },
  { id: 30, leadId: 7, name: "Meena Pillai", company: "FinServe India", duration: "—", type: "miss", date: "Apr 27, 5:00 PM", period: "week", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98450 66778", note: "In meeting. Assistant took message." },
  { id: 31, leadId: 10, name: "Vikram Rao", company: "SmartHome Co", duration: "8:55", type: "out", date: "Apr 27, 1:30 PM", period: "week", outcome: "Needs comparison", hasRec: true, rating: 3, mood: "neutral", phone: "+91 98111 44556", note: "Comparing with two competitors. Send feature matrix." },
  { id: 32, leadId: 3, name: "Suresh Jain", company: "BuildNext Pvt", duration: "5:40", type: "out", date: "Apr 26, 4:15 PM", period: "week", outcome: "Objection raised", hasRec: true, rating: 2, mood: "negative", phone: "+91 98765 99887", note: "Price objection. Offered starter plan." },
  { id: 33, leadId: 1, name: "Rajesh Mehta", company: "Tech Corp India", duration: "7:22", type: "in", date: "Apr 26, 11:20 AM", period: "week", outcome: "Technical questions", hasRec: true, rating: 4, mood: "positive", phone: "+91 98200 11223", note: "IT head joined. API docs requested." },
  { id: 34, leadId: 9, name: "Sneha Verma", company: "FoodChain", duration: "3:08", type: "out", date: "Apr 20, 3:40 PM", period: "month", outcome: "Final attempt", hasRec: false, rating: 1, mood: "negative", phone: "+91 98760 55443", note: "Confirmed not moving forward this quarter." },
  { id: 35, leadId: 11, name: "Ritu Arora", company: "MediaPlus", duration: "2:45", type: "out", date: "Apr 19, 12:10 PM", period: "month", outcome: "Not interested", hasRec: false, rating: 1, mood: "negative", phone: "+91 98234 66771", note: "Budget frozen. Revisit in Q3." },
  { id: 36, leadId: 12, name: "Siddharth Roy", company: "DataPro Pvt", duration: "10:15", type: "out", date: "Apr 17, 9:50 AM", period: "month", outcome: "Discovery started", hasRec: true, rating: 4, mood: "positive", phone: "+91 98190 77889", note: "Pain points around reporting. Good fit." },
  { id: 37, leadId: 8, name: "Arun Kumar", company: "LogiTrans", duration: "13:28", type: "out", date: "Apr 16, 4:30 PM", period: "month", outcome: "Proposal review", hasRec: true, rating: 4, mood: "positive", phone: "+91 98987 11223", note: "Reviewed proposal scope. Minor edits needed." },
  { id: 38, leadId: 5, name: "Deepak Singh", company: "RetailMax", duration: "6:50", type: "out", date: "Apr 14, 2:00 PM", period: "month", outcome: "Stakeholder intro", hasRec: true, rating: 4, mood: "positive", phone: "+91 97654 32109", note: "Introduced to procurement head." },
  { id: 39, leadId: 4, name: "Kavitha Nair", company: "EduTech Hub", duration: "—", type: "miss", date: "Apr 13, 10:45 AM", period: "month", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 99001 22334", note: "First outreach attempt. No answer." },
  { id: 40, leadId: 10, name: "Vikram Rao", company: "SmartHome Co", duration: "—", type: "miss", date: "Apr 10, 3:15 PM", period: "month", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98111 44556", note: "Wrong number on first record. Updated CRM." },
  { id: 41, leadId: 7, name: "Meena Pillai", company: "FinServe India", duration: "19:40", type: "out", date: "Apr 9, 11:00 AM", period: "month", outcome: "Initial pitch", hasRec: true, rating: 5, mood: "positive", phone: "+91 98450 66778", note: "Strong interest in analytics module." },
  { id: 42, leadId: 3, name: "Suresh Jain", company: "BuildNext Pvt", duration: "—", type: "miss", date: "Apr 8, 5:30 PM", period: "month", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98765 99887", note: "First cold call attempt." },
  { id: 43, leadId: 6, name: "Anjali Gupta", company: "MediCare Plus", duration: "5:15", type: "out", date: "Apr 7, 2:45 PM", period: "month", outcome: "Intro call", hasRec: true, rating: 4, mood: "positive", phone: "+91 98102 33441", note: "Met at exhibition. Warm lead follow-up." },
  { id: 44, leadId: 2, name: "Priya Sharma", company: "InfoSystems Ltd", duration: "17:55", type: "out", date: "Apr 5, 3:30 PM", period: "month", outcome: "Negotiation", hasRec: true, rating: 5, mood: "positive", phone: "+91 98334 55667", note: "Final pricing agreed. Legal next step." },
  { id: 45, leadId: 1, name: "Rajesh Mehta", company: "Tech Corp India", duration: "—", type: "miss", date: "Apr 3, 9:00 AM", period: "month", outcome: "Not picked", hasRec: false, rating: 0, mood: "neutral", phone: "+91 98200 11223", note: "Initial outreach — no answer." },
];

export const EMP_CALL_STATS = {
  today: { dials: 42, connected: 28, missed: 14, callbacks: 6, pickupRate: 67, quality: 80, missRate: 33, avgDuration: "7.8m", hotLeads: 5, totalTalk: "5h 48m" },
  week: { dials: 196, connected: 134, missed: 62, callbacks: 22, pickupRate: 68, quality: 75, missRate: 32, avgDuration: "8.0m", hotLeads: 14, totalTalk: "21h 10m" },
  month: { dials: 358, connected: 248, missed: 110, callbacks: 44, pickupRate: 69, quality: 76, missRate: 31, avgDuration: "8.3m", hotLeads: 20, totalTalk: "48h 30m" },
};

export const EMP_LEAD_CALL_ACTIVITY = {
  1: [
    { type: "call", text: "Inbound call — budget confirmed (8m 15s)", time: "Today 9:05 AM" },
    { type: "call", text: "Outbound discovery call (11m 02s)", time: "Apr 15, 2:10 PM" },
    { type: "email", text: "Proposal v2 sent", time: "Apr 14, 6:00 PM" },
    { type: "note", text: "Stage moved to Proposal Sent", time: "Apr 14, 5:45 PM" },
  ],
  2: [
    { type: "call", text: "Closing call — deal signed (22m 30s)", time: "Apr 25, 3:00 PM" },
    { type: "email", text: "Contract & invoice sent", time: "Apr 24, 11:00 AM" },
    { type: "meeting", text: "Final review with legal", time: "Apr 23, 4:00 PM" },
  ],
  3: [
    { type: "call", text: "Missed call — not picked", time: "Today 8:30 AM" },
    { type: "call", text: "Missed call — attempt 2", time: "Yesterday 4:15 PM" },
    { type: "whatsapp", text: "Intro message sent", time: "Yesterday 4:20 PM" },
  ],
  4: [
    { type: "call", text: "Outbound call — demo scheduled (18m 42s)", time: "Yesterday 3:45 PM" },
    { type: "email", text: "Calendar invite sent", time: "Yesterday 4:00 PM" },
  ],
  5: [
    { type: "call", text: "Inbound — pending approval (4m 10s)", time: "Yesterday 2:15 PM" },
    { type: "note", text: "Follow-up set for Monday", time: "Yesterday 2:20 PM" },
  ],
  6: [
    { type: "call", text: "Outbound — proposal discussed (12m 34s)", time: "Today 11:20 AM" },
    { type: "call", text: "Requirements call (9m 33s)", time: "Apr 12, 10:00 AM" },
    { type: "email", text: "Demo recording shared", time: "Apr 11, 3:30 PM" },
  ],
  7: [
    { type: "call", text: "Negotiation call with CFO (15m 08s)", time: "Apr 28, 4:20 PM" },
    { type: "email", text: "ROI deck sent", time: "Apr 28, 5:00 PM" },
    { type: "proposal", text: "Proposal v3 updated", time: "Apr 27, 2:00 PM" },
  ],
  8: [
    { type: "call", text: "Qualified — BANT complete (6m 45s)", time: "Apr 22, 11:30 AM" },
    { type: "note", text: "Moved to Proposal stage", time: "Apr 22, 11:45 AM" },
  ],
  9: [
    { type: "call", text: "Outbound — not interested (2m 18s)", time: "Apr 18, 5:45 PM" },
    { type: "note", text: "Marked as Not Interested", time: "Apr 18, 5:50 PM" },
  ],
  10: [
    { type: "call", text: "Missed call — voicemail left", time: "Apr 27, 10:15 AM" },
    { type: "call", text: "Missed call — attempt 1", time: "Apr 26, 3:00 PM" },
    { type: "call", text: "Outbound — warm connect (14m 20s)", time: "Today 7:50 AM" },
    { type: "call", text: "Competitor comparison call (8m 55s)", time: "Apr 27, 1:30 PM" },
    { type: "email", text: "Feature matrix sent", time: "Apr 27, 2:15 PM" },
  ],
  11: [
    { type: "call", text: "Missed call — gatekeeper", time: "Today 5:45 PM" },
    { type: "call", text: "Inbound — re-engaged (9m 18s)", time: "Apr 29, 11:45 AM" },
    { type: "call", text: "Outbound — not interested (2m 45s)", time: "Apr 19, 12:10 PM" },
    { type: "note", text: "Marked for Q3 re-engagement", time: "Apr 19, 12:15 PM" },
  ],
  12: [
    { type: "call", text: "First contact — cold call (6m 12s)", time: "Today 6:30 AM" },
    { type: "call", text: "Missed call — no answer", time: "Apr 29, 2:20 PM" },
    { type: "call", text: "Discovery call (10m 15s)", time: "Apr 17, 9:50 AM" },
    { type: "whatsapp", text: "Voice note sent after miss", time: "Apr 29, 2:25 PM" },
  ],
};

export function getCallsForPeriod(period) {
  if (period === "today") return EMP_CALLS.filter((c) => c.period === "today");
  if (period === "week") return EMP_CALLS.filter((c) => c.period === "today" || c.period === "week");
  return EMP_CALLS;
}

export const EMP_ASSETS = [
  { id: 1, name: "Enterprise CRM Brochure", cat: "brochure", icon: "", size: "2.4 MB", date: "Today", tag: "PDF" },
  { id: 2, name: "Zee News Podcast Brochure", cat: "brochure", icon: "📄", size: "1.9 MB", date: "Apr 8", tag: "PDF" },
  { id: 3, name: "Healthcare Case Study", cat: "case", icon: "", size: "4.1 MB", date: "Apr 20", tag: "PDF" },
  { id: 4, name: "SaaS Case Study", cat: "case", icon: "📊", size: "2.8 MB", date: "Apr 15", tag: "PDF" },
  { id: 5, name: "Price List 2026", cat: "price", icon: "💰", size: "180 KB", date: "Yesterday", tag: "Excel" },
  { id: 6, name: "Proposal Template — Enterprise", cat: "proposal", icon: "📋", size: "320 KB", date: "Today", tag: "DOCX" },
  { id: 7, name: "WhatsApp Message Templates", cat: "template", icon: "📝", size: "560 KB", date: "Today", tag: "PDF" },
  { id: 8, name: "Sales Training — BANT Module", cat: "training", icon: "🎓", size: "8.2 MB", date: "Apr 15", tag: "PPT" },
];

export const EMP_MEETINGS_UPCOMING = [
  { id: 1, title: "Discovery Call — Rajesh Mehta", time: "Today, 2:00 PM", date: "2026-04-30", platform: "Zoom", lead: "Rajesh Mehta", company: "Tech Corp India", color: "#2563eb", meetLink: "https://zoom.us/j/1234567890" },
  { id: 2, title: "Product Demo — Anjali Gupta", time: "Today, 4:00 PM", date: "2026-04-30", platform: "Google Meet", lead: "Anjali Gupta", company: "MediCare Plus", color: "#dc2626", meetLink: "https://meet.google.com/abc-defg-hij" },
  { id: 3, title: "Follow-up — Kavitha Nair", time: "Tomorrow, 10:30 AM", date: "2026-05-01", platform: "Teams", lead: "Kavitha Nair", company: "EduTech Hub", color: "#7c3aed", meetLink: "https://teams.microsoft.com/l/meetup-join/example" },
  { id: 6, title: "Budget Review — Meena Pillai", time: "Tomorrow, 2:00 PM", date: "2026-05-01", platform: "Google Meet", lead: "Meena Pillai", company: "FinServe India", color: "#dc2626", meetLink: "https://meet.google.com/xyz-abcd-efg" },
];

export const EMP_MEETINGS_HISTORY = [
  { id: 4, title: "Proposal Review — Meena Pillai", time: "Apr 28, 3:00 PM", outcome: "Proposal sent", platform: "Google Meet", color: "#10b981" },
  { id: 5, title: "Intro Call — Deepak Singh", time: "Apr 27, 11:00 AM", outcome: "Qualified", platform: "Zoom", color: "#3b82f6" },
];

export const MEETING_PLATFORMS = [
  { id: "google_meet", label: "Google Meet", icon: "meet", placeholder: "https://meet.google.com/xxx-xxxx-xxx", canGenerate: true },
  { id: "zoom", label: "Zoom Meeting", icon: "zoom", placeholder: "https://zoom.us/j/...", canGenerate: false },
  { id: "teams", label: "Microsoft Teams", icon: "teams", placeholder: "https://teams.microsoft.com/l/meetup-join/...", canGenerate: false },
];

export function generateGoogleMeetLink() {
  const part = () => Math.random().toString(36).slice(2, 6);
  return `https://meet.google.com/${part()}-${part()}-${part()}`;
}

const MEETING_PLATFORM_LABELS = {
  google_meet: "Google Meet",
  zoom: "Zoom",
  teams: "Teams",
};

export function meetingToApiPayload(form, employeeId) {
  const platformLabel = MEETING_PLATFORM_LABELS[form.platform] || form.platform || "Google Meet";
  const leadId = Number(form.leadId);
  const empId = Number(employeeId);
  if (!Number.isFinite(leadId) || leadId <= 0) {
    throw new Error("Select a valid lead before booking a meeting");
  }
  if (!Number.isFinite(empId) || empId <= 0) {
    throw new Error("Employee session invalid — refresh the page and try again");
  }
  const payload = {
    leadId,
    employeeId: empId,
    title: form.title.trim(),
    scheduledAt: `${form.date}T${form.time || "09:00"}:00`,
    location: platformLabel,
    durationMin: 30,
  };
  const meetLink = String(form.meetLink || "").trim();
  if (meetLink) payload.meetLink = meetLink;
  const agenda = String(form.agenda || "").trim();
  if (agenda) payload.agenda = agenda;
  return payload;
}

export function partitionMeetings(apiMeetings, leads = []) {
  const now = Date.now();
  const mapped = (Array.isArray(apiMeetings) ? apiMeetings : []).map((m) => meetingFromApi(m, leads));
  const upcoming = [];
  const history = [];

  for (const meeting of mapped) {
    if (meeting.status === "cancelled") continue;
    const at = new Date(meeting.scheduledAt).getTime();
    if (meeting.status === "completed" || at < now) {
      history.push({
        ...meeting,
        outcome: meeting.outcome || (meeting.status === "completed" ? "Completed" : "Held"),
      });
    } else {
      upcoming.push(meeting);
    }
  }

  upcoming.sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
  history.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));
  return { upcoming, history };
}

export function meetingFromApi(apiMeeting, leads = []) {
  const lead = leads.find((l) => String(l.id) === String(apiMeeting.leadId));
  const scheduled = apiMeeting.scheduledAt ? new Date(apiMeeting.scheduledAt) : new Date();
  const today = getEmpAppToday();
  const schedDay = Number.isNaN(scheduled.getTime())
    ? today
    : localDateKey(scheduled);
  const clock24 = Number.isNaN(scheduled.getTime())
    ? "09:00"
    : `${String(scheduled.getHours()).padStart(2, "0")}:${String(scheduled.getMinutes()).padStart(2, "0")}`;
  const clock12 = Number.isNaN(scheduled.getTime())
    ? clock24
    : scheduled.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = localDateKey(tomorrow);

  let time;
  if (schedDay === today) time = `Today, ${clock12}`;
  else if (schedDay === tomorrowStr) time = `Tomorrow, ${clock12}`;
  else {
    time = `${scheduled.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${clock12}`;
  }

  const platform = apiMeeting.location || "Google Meet";
  const mom = typeof apiMeeting.mom === "object" && apiMeeting.mom ? apiMeeting.mom : {};
  const leadName = apiMeeting.leadName || lead?.name || lead?.leadName || (apiMeeting.leadId ? `Lead #${apiMeeting.leadId}` : "—");
  const source = apiMeeting.source || (apiMeeting.leadId || leadName !== "—" ? "lead" : "direct");

  return {
    id: apiMeeting.id,
    leadId: apiMeeting.leadId,
    title: apiMeeting.title || "Meeting",
    time,
    date: schedDay,
    scheduledAt: apiMeeting.scheduledAt,
    platform,
    lead: leadName,
    company: apiMeeting.leadCompany || lead?.company || "—",
    leadPhone: apiMeeting.leadPhone || lead?.phone || "",
    leadEmail: apiMeeting.leadEmail || lead?.email || "",
    leadService: apiMeeting.leadService || lead?.service || lead?.formName || "",
    source,
    color: lead?.color || "#e11d48",
    meetLink: apiMeeting.meetLink || apiMeeting.meet_link || apiMeeting.meetingLink || apiMeeting.meeting_link || apiMeeting.meeting_url || (typeof apiMeeting.location === "string" && apiMeeting.location.startsWith("http") ? apiMeeting.location : ""),
    status: apiMeeting.status || "scheduled",
    outcome: mom.outcome || undefined,
    agenda: mom.agenda || "",
  };
}

export const EMP_TEAM_CALL = [
  { name: "Priya Singh", av: "PS", color: "#dc2626", calls: 142, score: 94 },
  { name: "Amit Kumar", av: "AK", color: "#2563eb", calls: 98, score: 88 },
  { name: "Rohan Verma", av: "RV", color: "#7c3aed", calls: 115, score: 79 },
  { name: "Neha Patel", av: "NP", color: "#10b981", calls: 89, score: 72 },
];

export const EMP_KANBAN_STAGES = PIPELINE_STAGE_DEFINITIONS;

export function parseEmpBudget(budget) {
  if (!budget || budget === "—") return 0;
  const s = String(budget).replace(/[₹,\s]/g, "");
  const m = s.match(/^([\d.]+)(L|Cr|K)?$/i);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const u = (m[2] || "").toUpperCase();
  if (u === "CR") return n * 10000000;
  if (u === "L") return n * 100000;
  if (u === "K") return n * 1000;
  return n;
}

export function formatEmpPipelineValue(n) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(0)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}K`;
  return `₹${n}`;
}

export function getEmpPipelineSummary(leads) {
  const total = leads.length;
  const hot = leads.filter((l) => {
    const temp = String(l.temperature || "").toLowerCase();
    const status = String(l.status || "").toLowerCase();
    return temp.includes("hot") || status === "hot";
  }).length;
  const warm = leads.filter((l) => {
    const temp = String(l.temperature || "").toLowerCase();
    const status = String(l.status || "").toLowerCase();
    return temp.includes("warm") || status === "warm";
  }).length;
  const cold = leads.filter((l) => {
    const temp = String(l.temperature || "").toLowerCase();
    const status = String(l.status || "").toLowerCase();
    return temp.includes("cold") || status === "cold";
  }).length;
  const value = leads.reduce((sum, l) => sum + parseEmpBudget(l.budget), 0);
  
  const notInterested = leads.filter((l) => {
    const status = String(l.status || "").toLowerCase().trim();
    const stage = String(l.stage || "").toLowerCase().trim();
    return (
      status === "not interested" ||
      status === "not_interested" ||
      status === "ni" ||
      stage === "not interested" ||
      stage === "not_interested" ||
      stage === "ni"
    );
  }).length;
  const converted = leads.filter((l) => {
    const stageId = mapEmpLeadKanbanStage(l.pipelineStage || l.stage, l.status);
    return isPaymentCompleteStageId(stageId)
      || String(l.status || "").toLowerCase().includes("payment complete")
      || String(l.status || "").toLowerCase() === "converted";
  }).length;
  const active = Math.max(0, total - notInterested);
  const winRate = total ? Math.round((converted / total) * 100) : 0;

  return { total, hot, warm, cold, value, notInterested, active, winRate, converted };
}

export function getEmpStageMeta(stageId) {
  if (stageId === "conversation_5") {
    return EMP_KANBAN_STAGES.find((s) => s.id === "conversation_2min") || EMP_KANBAN_STAGES[0];
  }
  return EMP_KANBAN_STAGES.find((s) => s.id === stageId) || EMP_KANBAN_STAGES[0];
}

const DRAWER_WARMTH_TO_STATUS = { "Hot Lead": "hot", "Warm Lead": "warm", "Cold Lead": "cold" };

export function empLeadFromDrawerPayload(raw, avatarColors) {
  const colors = avatarColors || ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#dc2626", "#0ea5e9", "#64748b"];
  const id = Date.now();
  const name = (raw.lead_name || raw.name || "").trim() || "New Lead";
  const av = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const revenue = Number(raw.expected_revenue ?? 0);
  return {
    id,
    name,
    company: raw.company_name || raw.company || "—",
    status: DRAWER_WARMTH_TO_STATUS[raw.temperature] || "cold",
    stage: normalizeStageLabel(raw.pipeline_stage, raw.status),
    source: raw.source || "Website",
    budget: revenue > 0 ? formatEmpPipelineValue(revenue) : "—",
    service: raw.service || raw.interested_service || "—",
    last: "Just now",
    av,
    color: colors[id % colors.length],
    phone: raw.phone || "",
    email: raw.email || "",
    city: raw.city || "",
    state: raw.state || "",
  };
}

export function resolvePipelineStageLabel(input, status = "") {
  if (input == null || input === "") return undefined;
  return normalizeStageLabel(input, status);
}

export function mapEmpLeadKanbanStage(stage, status) {
  return mapStageToId(stage, status);
}

export function groupEmpLeadsKanban(leads, calls = [], options = {}) {
  return groupLeadsKanbanByCalls(leads, calls, options);
}

export const EMP_SOP_SCRIPTS = [
  { title: "Opening Call Script", body: "Hi [Name], I'm [Your Name] from TechSales. I'm calling about [Product] which helps companies like yours achieve [benefit]. Do you have 2 minutes?", use: "First contact with any new lead" },
  { title: "Handling Hesitation", body: "I totally understand. What if I shared one quick success story from a business like yours? It'll take 90 seconds and you can decide from there.", use: "When lead is hesitant to continue" },
  { title: "Closing / Payment", body: "I'll send the secure payment link on WhatsApp right now. It's a 2-minute process and I'll stay on the call to guide you.", use: "Ready-to-buy leads, end of call" },
];

export const EMP_SOP_CROSS = [
  { product: "Enterprise CRM", icon: "🖥", categories: "SaaS · IT · Finance", crossTo: "Sales Training Bundle", success: 58, deals: 14 },
  { product: "Zee News Podcast", icon: "🎙", categories: "Media · Branding", crossTo: "Branding Package", success: 42, deals: 8 },
  { product: "Sales Training", icon: "🎓", categories: "Startup · Agency", crossTo: "CRM + Branding Bundle", success: 35, deals: 6 },
];

export const EMP_SOP_CHECKLIST = {
  morning: ["Review Today's Agenda (Meetings, Follow-ups, Hot Leads)", "Message all cold leads from yesterday", "Call all Hot Leads before 11:00 AM", "Review CRM for overnight lead assignments"],
  evening: ["Log all call outcomes in CRM", "Update lead stages after each interaction", "Send proposals to qualified leads", "Submit daily performance report by 6 PM"],
};

export const EMP_BN_PANELS = {
  pipeline: {
    title: "Pipeline & Overview",
    sections: [
      { label: "Main", items: [
        { icon: "📊", label: "Dashboard", to: "/employee" },
        { icon: "💬", label: "Follow-Up", to: "/employee/follow-ups" },
        { icon: "✅", label: "My Tasks", to: "/employee/tasks" },
        { icon: "👥", label: "All Leads", to: "/employee/leads" },
      ]},
    ],
  },
  leads: {
    title: "Leads",
    sections: [
      { label: "Filter by Status", items: [
        { icon: "👥", label: "All Leads", to: "/employee/leads" },
        { icon: "🔥", label: "Hot Leads", to: "/employee/leads?filter=hot" },
        { icon: "🌡", label: "Warm Leads", to: "/employee/leads?filter=warm" },
        { icon: "❄", label: "Cold Leads", to: "/employee/leads?filter=cold" },
        { icon: "📞", label: "Call Reporting", to: "/employee/calls" },
      ]},
    ],
  },
  process: {
    title: "Sales Process",
    sections: [
      { label: "Content", items: [
        { icon: "📋", label: "SOP Docs", to: "/employee/sales-process" },
        { icon: "📁", label: "Assets", to: "/employee/assets" },
      ]},
    ],
  },
  meetings: {
    title: "Meetings",
    sections: [
      { label: "Schedule", items: [
        { icon: "📅", label: "Book Meeting", to: "/employee/meetings" },
        { icon: "📋", label: "Upcoming", to: "/employee/meetings" },
      ]},
    ],
  },
};

export const EMP_SOP_DOCS = [
  { id: 1, title: "How to Start Talking to Leads", sub: "Intro script · First 30 sec", sections: [
    { title: "Opening Script", items: ["Greet warmly using first name", "Introduce yourself and company", "State reason for calling in 1 sentence", "Ask permission: \"Do you have 2 minutes?\""] },
    { title: "Key Tips", items: ["Keep tone confident and friendly", "Avoid reading script — sound natural", "Listen more in first 30 seconds"] },
  ]},
  { id: 2, title: "BANT Qualification Framework", sub: "Budget · Authority · Need · Timeline", sections: [
    { title: "Budget", items: ["Ask: \"Do you have a rough budget in mind?\"", "Note the budget range in CRM"] },
    { title: "Authority & Timeline", items: ["Confirm decision-maker on call", "Ask: \"When are you looking to implement?\""] },
  ]},
  { id: 3, title: "How to Send Proposal Email", sub: "Template · Product-wise format", sections: [
    { title: "Template Steps", items: ["Open proposal_template.docx from Assets", "Fill: client name, company, product, budget", "Attach as PDF"] },
  ]},
  { id: 4, title: "Lead Not Interested → Escalate", sub: "Talk to Senior · Rebuttal SOP", sections: [
    { title: "Before Escalating", items: ["Try rebuttal script #2", "Ask: \"What would make this a better fit?\"", "Note specific objection in CRM"] },
  ]},
  { id: 5, title: "Lead Converted → Handoff", sub: "Talk to Founder · Onboarding", sections: [
    { title: "Handoff Checklist", items: ["Notify founder via WhatsApp group", "Share summary: name, company, deal size", "Create onboarding task in CRM"] },
  ]},
];

/** Real teammates come from the API (`teamEmployees` in EmployeeContext). */
export const EMP_TEAM = [];

export const LEAD_STATUS_LABELS = {
  hot: "Hot", warm: "Warm", cold: "Cold", converted: "Converted", notpick: "Not Pick", ni: "Not Interested",
  attempted: "Attempted", contacted: "Contacted", booked: "Booked", proposal: "Proposal", negotiation: "Negotiation", new: "New",
};

export const EMP_LEAD_TEMPERATURES = [
  { id: "hot", label: "Hot" },
  { id: "warm", label: "Warm" },
  { id: "cold", label: "Cold" },
];

export const LEAD_STATUS_CLASS = {
  hot: "b-hot", warm: "b-warm", cold: "b-cold", converted: "b-conv", notpick: "b-np", ni: "b-ni",
};

export function getEmpAppToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const EMP_APP_TODAY = getEmpAppToday();

export function priorityToApi(priority) {
  const map = { high: "high", med: "medium", low: "low" };
  return map[priority] || "medium";
}

export function priorityFromApi(priority) {
  const v = String(priority || "").toLowerCase();
  if (v.includes("high")) return "high";
  if (v.includes("low")) return "low";
  return "med";
}

export function tasksMapFromApi(apiTasks, employee) {
  const map = {};
  if (!Array.isArray(apiTasks)) return map;

  for (const t of apiTasks) {
    const due = t.dueAt ? new Date(t.dueAt) : new Date();
    const date = Number.isNaN(due.getTime())
      ? getEmpAppToday()
      : localDateKey(due);
    const deadline = t.dueAt && !Number.isNaN(due.getTime())
      ? `${String(due.getHours()).padStart(2, "0")}:${String(due.getMinutes()).padStart(2, "0")}`
      : "17:00";

    const item = {
      id: t.id,
      name: t.title || t.name || "Task",
      done: t.status === "done" || t.status === "completed",
      priority: priorityFromApi(t.priority),
      assignee: employee?.name || "",
      assigneeAv: employee?.initials || "?",
      assigneeColor: employee?.avatarColor || "#64748b",
      deadline,
      source: t.followUpId ? "followup" : undefined,
      followUpId: t.followUpId,
    };

    if (!map[date]) map[date] = [];
    map[date].push(item);
  }

  return map;
}

export function getFollowUpUrgency(dateStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(`${getEmpAppToday()}T00:00:00`);
  if (d < today) return "overdue";
  if (d.getTime() === today.getTime()) return "today";
  return "upcoming";
}

export function formatFollowUpCompletedAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

export function isFollowUpCompleted(followUp) {
  if (!followUp) return false;
  const status = String(followUp.status || "").toLowerCase();
  return Boolean(
    followUp.done
    || followUp.completedAt
    || followUp.completedWithMom
    || status === "completed"
    || status === "done",
  );
}

export function formatFollowUpSchedule(dateStr, timeStr) {
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(`${getEmpAppToday()}T00:00:00`);
  const urgency = getFollowUpUrgency(dateStr);
  const [h, m] = (timeStr || "09:00").split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  const timeLabel = `${hr}:${String(m).padStart(2, "0")} ${ampm}`;

  if (urgency === "overdue") {
    const diffDays = Math.round((today - d) / 86400000);
    if (diffDays === 1) return `Yesterday ${timeLabel}`;
    return `${diffDays}d ago`;
  }
  if (urgency === "today") return `Today ${timeLabel}`;
  const diffDays = Math.round((d - today) / 86400000);
  if (diffDays === 1) return `Tomorrow ${timeLabel}`;
  return `${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${timeLabel}`;
}

export function buildFollowUpTaskName({ type, name, note }) {
  const base = `${type} follow-up: ${name}`;
  return note?.trim() ? `${base} — ${note.trim()}` : base;
}

export function followUpPriority(urgency) {
  return urgency === "overdue" || urgency === "today" ? "high" : "med";
}

export function isTaskAssignedToEmployee(task, employeeName) {
  if (!task?.assignee || !employeeName) return true;
  const assignee = String(task.assignee).trim().toLowerCase();
  const employee = String(employeeName).trim().toLowerCase();
  if (assignee === employee) return true;
  const empFirst = employee.split(/\s+/)[0];
  const asnFirst = assignee.split(/\s+/)[0];
  return empFirst.length > 0 && empFirst === asnFirst;
}

export function formatTaskDeadlineTime(timeStr) {
  if (!timeStr) return "";
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const hr = h % 12 || 12;
  return `${hr}:${String(m || 0).padStart(2, "0")} ${ampm}`;
}

export function findEmpTeamMember(name) {
  if (!name) return null;
  return (
    EMP_TEAM.find((m) => m.name === name)
    || EMP_TEAM.find((m) => m.name.split(" ")[0] === String(name).split(" ")[0])
  );
}

function initialsFromLeadName(name) {
  if (!name) return "?";
  return String(name).split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export function parseDurationToSeconds(value) {
  if (value == null || value === "" || value === "—") return 0;
  if (typeof value === "number") return value;
  const parts = String(value).split(":").map(Number);
  if (parts.length === 2 && !Number.isNaN(parts[0])) {
    return parts[0] * 60 + (parts[1] || 0);
  }
  return 0;
}

export function isMissedCall(call = {}) {
  return isMissedCallMetric(call);
}

export function phonesMatchLoose(a, b) {
  return phonesMatchLooseMetric(a, b);
}

export function resolveEmployeeCallType(call = {}) {
  if (isMissedCall(call)) return "miss";
  if (call.type === "in" || call.direction === "inbound") return "in";
  return "out";
}

export function formatDurationFromSeconds(totalSecs) {
  if (!totalSecs) return "—";
  const m = Math.floor(totalSecs / 60);
  const s = totalSecs % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function callToApiPayload(call, employeeId) {
  const durationSec = call.durationSec ?? parseDurationToSeconds(call.duration);
  const now = new Date();
  const typeToDir = { in: "inbound", out: "outbound", miss: "outbound" };
  const checklistProgress = call.checkedQuestions
    ? Object.entries(call.checkedQuestions)
      .filter(([, done]) => done)
      .map(([stepId]) => ({ stepId, done: true, at: now.toISOString() }))
    : call.checklistProgress;

  return {
    leadId: call.leadId,
    employeeId,
    direction: typeToDir[call.type] || call.direction || "outbound",
    outcome: call.outcome || null,
    durationSec: durationSec || null,
    startedAt: call.startedAt || now.toISOString(),
    endedAt: call.endedAt || now.toISOString(),
    notes: call.notes || (call.note ? String(call.note).slice(0, 500) : null),
    aiSummary: call.aiMoM || call.note || call.aiSummary || null,
    sopId: call.sopId || null,
    checklistProgress,
  };
}

export function resolveLeadForCall(call, leadList = []) {
  if (!call || !Array.isArray(leadList)) return null;

  if (call.leadId) {
    const byId = leadList.find((l) => String(l.id) === String(call.leadId));
    if (byId) return byId;
  }

  const phone = call.phone || call.clientPhone || "";
  if (phone) {
    const byPhone = leadList.find((l) => phonesMatchLoose(l.phone || l.clientPhone, phone));
    if (byPhone) return byPhone;
  }

  return null;
}

export function mergeCallsById(prev, next) {
  if (!Array.isArray(next) || next.length === 0) {
    return Array.isArray(prev) ? prev : [];
  }
  const map = new Map((Array.isArray(prev) ? prev : []).map((c) => [String(c.id), c]));
  next.forEach((c) => map.set(String(c.id), c));
  return Array.from(map.values()).sort((a, b) => {
    const ta = new Date(a.callAt || a.date || 0).getTime();
    const tb = new Date(b.callAt || b.date || 0).getTime();
    return tb - ta;
  });
}

export function callFromApi(apiCall, leads = []) {
  let lead = apiCall.leadId
    ? leads.find((l) => String(l.id) === String(apiCall.leadId))
    : null;
  if (!lead) {
    lead = resolveLeadForCall({
      leadId: apiCall.leadId,
      phone: apiCall.clientPhone,
      name: apiCall.clientName,
    }, leads);
  }
  const created = apiCall.startedAt || apiCall.createdAt;
  const createdDate = created ? new Date(String(created).replace(" ", "T")) : null;
  const today = getEmpAppToday();
  const isoDay = created ? String(created).match(/^(\d{4}-\d{2}-\d{2})/)?.[1] : null;
  const callDay = isoDay || (createdDate && !Number.isNaN(createdDate.getTime())
    ? localDateKey(createdDate)
    : null);

  let period = "month";
  if (callDay === today) {
    period = "today";
  } else if (callDay) {
    const diff = (new Date(`${today}T12:00:00`) - new Date(`${callDay}T12:00:00`)) / 86400000;
    if (diff >= 0 && diff <= 7) period = "week";
  }

  const dateLabel = callDay === today && createdDate
    ? `Today ${createdDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : createdDate
      ? `${createdDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" })} ${createdDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
      : "—";

  const durationRaw = apiCall.durationSec ?? apiCall.duration_sec;
  const durationSec = Number.isFinite(durationRaw)
    ? durationRaw
    : parseCallDurationSeconds(durationRaw ?? apiCall.duration);
  const directionRaw = String(apiCall.direction || "").toLowerCase();
  const outcomeLower = String(apiCall.outcome || "").toLowerCase();
  // Client no-pick is always an outbound dial (fix legacy inbound mis-tags).
  const direction = (
    durationSec < CALL_CONVERSATION_MIN_SEC
    && /not connected|not pick|rejected|no answer|busy|unanswered|not answered/.test(outcomeLower)
  )
    ? "outbound"
    : (directionRaw === "inbound" || directionRaw === "in" || directionRaw === "incoming"
      ? "inbound"
      : "outbound");
  const dir = direction === "inbound" ? "in" : "out";
  const type = isMissedCall({
    type: dir,
    direction,
    outcome: apiCall.outcome,
    durationSec,
  })
    ? "miss"
    : dir;

  return {
    id: apiCall.id,
    leadId: apiCall.leadId ?? apiCall.lead_id ?? lead?.id ?? null,
    name: lead?.name || lead?.leadName || apiCall.clientName || apiCall.client_name || "Unknown Lead",
    company: lead?.company || lead?.companyName || apiCall.clientCompany || apiCall.client_company || "—",
    duration: formatDurationFromSeconds(durationSec),
    durationSec,
    direction,
    date: dateLabel,
    callAt: created || (createdDate ? createdDate.toISOString() : null),
    callDay,
    period,
    outcome: apiCall.outcome || "Call logged",
    hasRec: Boolean(apiCall.recordingUrl || apiCall.recording_url || apiCall.aiSummary || apiCall.ai_summary || apiCall.notes),
    rating: apiCall.rating !== undefined ? apiCall.rating : 5,
    mood: apiCall.sentiment || apiCall.mood || "neutral",
    phone: lead?.phone || apiCall.clientPhone || apiCall.client_phone || "",
    note: typeof (apiCall.aiSummary || apiCall.ai_summary || apiCall.notes || apiCall.note) === "object"
      ? (
        (apiCall.aiSummary || apiCall.ai_summary || apiCall.notes || apiCall.note)?.summary ||
        JSON.stringify(apiCall.aiSummary || apiCall.ai_summary || apiCall.notes || apiCall.note)
      )
      : String(apiCall.aiSummary || apiCall.ai_summary || apiCall.notes || apiCall.note || ""),
    sopId: apiCall.sopId || apiCall.sop_id,
    recordingUrl: apiCall.recordingUrl || apiCall.recording_url || null,
    source: apiCall.source || null,
  };
}

export function followUpToApiPayload(params, employeeId, leads = []) {
  const { leadName, type, date, time, note, leadId, phone } = params;
  const lead = leadId != null
    ? leads.find((l) => String(l.id) === String(leadId))
    : (phone
      ? leads.find((l) => phonesMatchLoose(l.phone || l.clientPhone, phone))
      : null);
  const resolvedLeadId = leadId ?? lead?.id;
  if (!resolvedLeadId) {
    throw new Error("Select a valid lead to schedule follow-up");
  }

  return {
    leadId: resolvedLeadId,
    employeeId,
    scheduledAt: `${date}T${time || "09:00"}:00`,
    note: note?.trim() || `${type} follow-up scheduled`,
    title: buildFollowUpTaskName({ type, name: leadName, note }),
    priority: priorityToApi(followUpPriority(getFollowUpUrgency(date))),
  };
}

function parseFollowUpSchedule(raw) {
  if (!raw) return { dateStr: getEmpAppToday(), timeStr: "09:00" };
  const text = String(raw).trim();
  const sqlMatch = text.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/);
  if (sqlMatch) {
    return { dateStr: sqlMatch[1], timeStr: sqlMatch[2] };
  }
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (isoMatch) {
    return { dateStr: isoMatch[1], timeStr: isoMatch[2] };
  }
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) {
    return {
      dateStr: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      timeStr: `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`,
    };
  }
  return { dateStr: getEmpAppToday(), timeStr: "09:00" };
}

function inferFollowUpType(note, explicitType) {
  if (explicitType && explicitType !== "Follow-up") return explicitType;
  const n = String(note || "").toLowerCase();
  if (n.includes("whatsapp")) return "WhatsApp";
  if (n.includes("email")) return "Email";
  if (n.includes("meeting")) return "Meeting";
  return "Call";
}

export function followUpFromApi(apiFollowup, leads = [], type) {
  const lead = leads.find((l) => String(l.id) === String(apiFollowup.leadId));
  const { dateStr, timeStr } = parseFollowUpSchedule(apiFollowup.scheduledAt);
  const urgency = getFollowUpUrgency(dateStr);
  const phoneNum = lead?.phone || lead?.clientPhone || apiFollowup.phone || apiFollowup.clientPhone || "";
  const rawName = lead?.name || lead?.leadName || apiFollowup.leadName || "";
  const isUnknownName = !rawName || rawName.trim().toLowerCase() === "unknown" || rawName.trim().toLowerCase() === "unknown lead" || rawName === phoneNum;
  const leadName = !isUnknownName ? rawName : (phoneNum || "Lead");
  const resolvedType = inferFollowUpType(apiFollowup.note, type);
  const status = String(apiFollowup.status || "pending").toLowerCase();
  const isCompleted = status === "completed" || status === "done";
  const completedAt = apiFollowup.completedAt || apiFollowup.completed_at || null;

  return {
    id: apiFollowup.id,
    name: leadName,
    company: lead?.company || lead?.companyName || "—",
    type: resolvedType,
    urgency,
    time: formatFollowUpSchedule(dateStr, timeStr),
    av: lead?.av || initialsFromLeadName(leadName),
    color: lead?.color || "#64748b",
    note: apiFollowup.note || "",
    scheduledDate: dateStr,
    scheduledTime: timeStr,
    status,
    done: isCompleted,
    completedWithMom: Boolean(apiFollowup.completedWithMom || apiFollowup.completed_with_mom),
    completedAt,
    completedTime: formatFollowUpCompletedAt(completedAt),
    taskId: apiFollowup.taskId,
    leadId: apiFollowup.leadId,
  };
}

export function normalizeTasksMap(value, { useMockFallback = true } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return useMockFallback ? createInitialTasks() : {};
  }

  const normalized = {};
  Object.entries(value).forEach(([date, items]) => {
    if (Array.isArray(items)) {
      normalized[date] = items.filter((item) => item && typeof item === "object");
    }
  });

  if (Object.keys(normalized).length) return normalized;
  return useMockFallback ? createInitialTasks() : {};
}

export function createInitialTasks() {
  return {
    "2026-04-30": [
      { id: 1, name: "Call Rajesh Mehta — discuss budget approval", done: false, priority: "high", assignee: "Amit K.", assigneeAv: "AK", assigneeColor: "#2563eb" },
      { id: 2, name: "Send proposal to Anjali Gupta (MediCare)", done: true, priority: "high", assignee: "Priya S.", assigneeAv: "PS", assigneeColor: "#dc2626" },
      { id: 3, name: "Follow up Kavitha Nair — demo feedback", done: false, priority: "med", assignee: "Neha P.", assigneeAv: "NP", assigneeColor: "#10b981" },
      { id: 4, name: "Update CRM for all leads contacted today", done: false, priority: "low", assignee: "Amit K.", assigneeAv: "AK", assigneeColor: "#2563eb" },
      { id: 5, name: "Weekly performance report for team review", done: false, priority: "med", assignee: "Amit K.", assigneeAv: "AK", assigneeColor: "#2563eb" },
    ],
    "2026-04-29": [
      { id: 6, name: "Meeting with Meena Pillai — contract", done: true, priority: "high", assignee: "Amit K.", assigneeAv: "AK", assigneeColor: "#2563eb" },
      { id: 7, name: "WhatsApp to cold leads batch", done: true, priority: "low", assignee: "Rohan V.", assigneeAv: "RV", assigneeColor: "#7c3aed" },
    ],
    "2026-05-01": [
      { id: 9, name: "Team standup at 9:30 AM", done: false, priority: "high", assignee: "Amit K.", assigneeAv: "AK", assigneeColor: "#2563eb" },
      { id: 10, name: "Demo for Suresh Jain", done: false, priority: "high", assignee: "Priya S.", assigneeAv: "PS", assigneeColor: "#dc2626" },
    ],
  };
}

export function parseBudgetL(budget) {
  if (!budget || budget === "—") return 0;
  const match = String(budget).match(/([\d.]+)\s*L/i);
  return match ? parseFloat(match[1]) : 0;
}

export function getEmployeePerformanceSnapshot(employee, leads = []) {
  const convertedLeads = leads.filter((l) => l.status === "converted" || l.stage === "Converted");
  const liveConverted = convertedLeads.length;
  const liveRevenueL = convertedLeads.reduce((sum, l) => sum + parseBudgetL(l.budget), 0);
  const computedCallPct = employee.callsTarget
    ? Math.min(100, Math.round((employee.callsDone / employee.callsTarget) * 100))
    : 0;
  const stats = employee.incentiveStats || {};

  return {
    periodLabel: employee.incentivePeriod || "This Month",
    leadsConverted: stats.leadsConverted ?? Math.max(liveConverted, 1),
    conversionsTarget: stats.conversionsTarget ?? 25,
    callTargetPct: stats.callTargetPct ?? computedCallPct,
    callsDone: employee.callsDone,
    callsTarget: employee.callsTarget,
    revenueL: stats.revenueL ?? (liveRevenueL || 24),
    revenueTargetL: stats.revenueTargetL ?? 30,
    qualifiedLeads: stats.qualifiedLeads ?? 0,
    meetingsBooked: stats.meetingsBooked ?? 0,
    responseTimeMin: employee.responseTimeMin,
    pickupRate: employee.pickupRate,
    qualificationRate: employee.qualificationRate,
    objectionHandling: employee.objectionHandling,
    conversionRate: employee.conversionRate,
    followUpQuality: employee.followUpQuality,
    baseSalary: employee.baseSalary,
    incRate: employee.incRate,
    trends: employee.incentiveTrends || {},
    payoutHistory: employee.payoutHistory || [],
    liveConverted,
    liveRevenueL,
  };
}

export function calcEmployeeIncentive({ converted = 18, callTargetPct = 88, revenueL = 24, baseSalary = 45000, incRate = 6 }) {
  const conversionBonus = converted * 1200;
  const callBonus = Math.round((callTargetPct / 100) * 8000);
  const revenueBonus = Math.round(revenueL * incRate * 100);
  const total = conversionBonus + callBonus + revenueBonus;
  return { conversionBonus, callBonus, revenueBonus, total, totalRemuneration: baseSalary + total };
}

// Rich local SOP dataset structured for real-time calling workflows
export const LOCAL_SOPS = [
  {
    id: 1,
    title: "Intro & Cold Outreach",
    sub: "First contact & permission script",
    category: "SaaS",
    budgetRange: "₹2L - ₹8L",
    duration: "2-3 mins",
    icon: "📞",
    steps: [
      {
        id: "opening",
        label: "Opening",
        questions: [
          { id: "q1", text: "Greet lead warmly using their first name?", type: "check" },
          { id: "q2", text: "Introduce yourself and TechSales?", type: "check" },
          { id: "q3", text: "State reason for calling clearly in 1 sentence?", type: "check" },
          { id: "q4", text: "Ask permission: 'Do you have 2 minutes'?", type: "check" }
        ],
        discovery: [
          { key: "current_system", label: "Lead's Current System", placeholder: "e.g., Excel, competitor CRM..." },
          { key: "pain_point", label: "Primary Pain Point", placeholder: "e.g., Lead leakage, manual follow-ups..." }
        ],
        checklist: [
          "Acknowledge lead's response positively",
          "Ensure no background noise",
          "Speak at a calm, natural pace"
        ],
        scripts: {
          opening: "Hi {leadName}, I'm {repName} from TechSales. I noticed you requested information on our sales automation tools, and I wanted to share a 2-minute overview on how we help similar businesses increase conversions. Do you have 2 minutes?",
          talkingPoints: [
            "Keep the intro under 30 seconds",
            "Be energetic but professional",
            "Pause and let the lead speak"
          ],
          tips: "If they say they are busy, ask: 'No problem, would today at 4:00 PM or tomorrow at 11:00 AM work better for a quick chat?'"
        }
      },
      {
        id: "discovery",
        label: "Discovery",
        questions: [
          { id: "q5", text: "Ask about their current sales process?", type: "check" },
          { id: "q6", text: "Identify their sales team size?", type: "check" },
          { id: "q7", text: "Find out where their leads are coming from?", type: "check" }
        ],
        discovery: [
          { key: "team_size", label: "Team Size", placeholder: "e.g., 5 reps, 50 reps..." },
          { key: "lead_sources", label: "Lead Sources", placeholder: "e.g., FB Ads, Website, Referrals..." }
        ],
        checklist: [
          "Take notes on active CRM tool",
          "Validate their pain points: 'That makes total sense...'",
          "Confirm they are the primary decision maker"
        ],
        scripts: {
          opening: "Got it, {leadName}. To give you the best recommendation, could you tell me a bit about how your team currently tracks leads, and what the biggest bottleneck is right now?",
          talkingPoints: [
            "Ask open-ended questions (How, What, Why)",
            "Do not talk about product features yet",
            "Note down exact vocabulary they use for their problems"
          ],
          tips: "Listen 70% of the time. If they mention a problem, double-down on it: 'How long has that been an issue for you?'"
        }
      },
      {
        id: "qualification",
        label: "Qualification",
        questions: [
          { id: "q8", text: "Confirm if they have authority to purchase?", type: "check" },
          { id: "q9", text: "Determine target timeline for implementation?", type: "check" },
          { id: "q10", text: "Understand if they have budget allocated?", type: "check" }
        ],
        discovery: [
          { key: "go_live", label: "Target Go-Live Date", placeholder: "e.g., This month, next quarter..." },
          { key: "authority_level", label: "Authority Level", placeholder: "e.g., Founder, Manager, Head of Sales..." }
        ],
        checklist: [
          "Ask Timeline: 'When are you hoping to have a solution in place?'",
          "Identify secondary stakeholders: 'Who else would be involved in this decision?'"
        ],
        scripts: {
          opening: "Typically, teams implementing TechSales go live within 7 days. {leadName}, what timeline are you looking at to solve this lead leakage issue?",
          talkingPoints: [
            "Understand timeline urgency",
            "Determine if budget is flexible",
            "Confirm the procurement process"
          ],
          tips: "If they are not the decision maker, ask: 'Who else besides yourself would be evaluating the technical and financial aspects of this?'"
        }
      },
      {
        id: "budget",
        label: "Budget",
        questions: [
          { id: "q11", text: "Establish budget range?", type: "check" },
          { id: "q12", text: "Present pricing tiers clearly?", type: "check" }
        ],
        discovery: [
          { key: "budget_amount", label: "Allocated Budget Amount", placeholder: "e.g., ₹50k - ₹2L, ₹5L+..." }
        ],
        checklist: [
          "Introduce cost as an investment",
          "Compare with cost of lost leads",
          "Check budget flexibility"
        ],
        scripts: {
          opening: "Based on your team of 10, our Enterprise tier is ₹15,000/month, which is usually offset if your team saves just one lead from slipping through. Does that align with what you had planned?",
          talkingPoints: [
            "Present pricing confidently without hesitating",
            "Frame price in terms of ROI",
            "Offer a monthly vs annual discount"
          ],
          tips: "Always anchor high. If they object, highlight that our starter plan is ₹5,000/month, but it lacks advanced automation."
        }
      },
      {
        id: "closing",
        label: "Closing",
        questions: [
          { id: "q13", text: "Schedule a product demo session?", type: "check" },
          { id: "q14", text: "Confirm calendar invite sent during call?", type: "check" },
          { id: "q15", text: "Send introductory WhatsApp message?", type: "check" }
        ],
        discovery: [
          { key: "demo_time", label: "Demo Date/Time", placeholder: "e.g., Fri 3 PM..." }
        ],
        checklist: [
          "Send Calendar Invite before hanging up",
          "Send WhatsApp welcome note with your contact card",
          "Mark lead as 'Demo Scheduled' in CRM"
        ],
        scripts: {
          opening: "Great! I've sent a calendar invitation for the demo on Friday at 3:00 PM. {leadName}, I'll also drop you a quick hi on WhatsApp so you have my direct line. Looking forward to showing you the system!",
          talkingPoints: [
            "Secure a firm calendar time",
            "Verify email address is correct",
            "Set clear expectations for the next call"
          ],
          tips: "Ensure they check their email and accept the invite while still on the line."
        }
      }
    ],
    objections: [
      { trigger: "Price is too high", rebuttal: "I understand price is a factor. But if we can save your team 5 hours a week per rep, the system pays for itself in the first 2 weeks. Shall we look at the ROI breakdown?" },
      { trigger: "Already using competitor", rebuttal: "Competitors are great, but many teams switch to us because of our direct WhatsApp integration. What CRM are you currently using?" },
      { trigger: "No time right now", rebuttal: "I respect your time. I can email you a 2-minute video overview, and we can connect next week. Would Monday or Tuesday work better?" }
    ],
    crossSell: {
      product: "Sales Training Bundle",
      icon: "🎓",
      success: 58,
      deals: 14,
      pitch: "Since you are scaling your sales team, adding our Sales Training Bundle helps reps adopt the CRM 3x faster and improves cold call pitch success by 35%."
    }
  },
  {
    id: 2,
    title: "BANT Qualification",
    sub: "Detailed BANT qualification questions",
    category: "SaaS",
    budgetRange: "₹5L - ₹15L",
    duration: "4-5 mins",
    icon: "📋",
    steps: [
      {
        id: "opening",
        label: "Intro & Budget",
        questions: [
          { id: "b1", text: "Confirm current monthly software spend?", type: "check" },
          { id: "b2", text: "Identify financial year budget cycle?", type: "check" }
        ],
        discovery: [
          { key: "annual_crm", label: "Annual CRM Budget", placeholder: "e.g., ₹5L..." }
        ],
        checklist: [
          "Verify if budget is approved or projected",
          "Check payment term preference (Annual vs Monthly)"
        ],
        scripts: {
          opening: "Hi {leadName}, when budgeting for your operations this year, have you allocated a specific bracket for CRM and database automation, or are you exploring options to define it?",
          talkingPoints: [
            "Identify the budget owner",
            "Learn if they have flex-funds"
          ],
          tips: "If budget is undefined, ask what their cost of acquiring a lead is currently."
        }
      },
      {
        id: "authority",
        label: "Authority",
        questions: [
          { id: "b3", text: "Clarify decision making hierarchy?", type: "check" },
          { id: "b4", text: "Get contact of technical reviewer?", type: "check" }
        ],
        discovery: [
          { key: "dm_name", label: "Decision Maker Name", placeholder: "e.g., Priya Sen, CTO..." }
        ],
        checklist: [
          "Map all buying committee members",
          "Identify potential internal champion"
        ],
        scripts: {
          opening: "Who else on the finance or IT side will be reviewing the integration capabilities before we sign off, {leadName}?",
          talkingPoints: [
            "Avoid bypassing the current contact",
            "Position yourself as helping them look good to the boss"
          ],
          tips: "Ask: 'How have software purchases of this scale been approved in the past?'"
        }
      },
      {
        id: "need",
        label: "Need",
        questions: [
          { id: "b5", text: "List top 3 must-have integrations?", type: "check" },
          { id: "b6", text: "Identify key reporting metrics required?", type: "check" }
        ],
        discovery: [
          { key: "must_integration", label: "Must-Have Integration", placeholder: "e.g. WhatsApp, HubSpot..." }
        ],
        checklist: [
          "Validate pain urgency",
          "Confirm current system limitations"
        ],
        scripts: {
          opening: "What is the single most critical feature that your sales team is missing today, without which this project wouldn't be successful?",
          talkingPoints: [
            "Quantify the pain (e.g. 20% lead loss)",
            "Get agreement on the cost of doing nothing"
          ],
          tips: "If they say 'everything is fine', ask how they handle backup when a rep leaves."
        }
      },
      {
        id: "timeline",
        label: "Timeline",
        questions: [
          { id: "b7", text: "Determine critical launch date?", type: "check" },
          { id: "b8", text: "Define implementation milestones?", type: "check" }
        ],
        discovery: [
          { key: "go_live_bant", label: "Target Go-Live Date", placeholder: "e.g. June 1st..." }
        ],
        checklist: [
          "Check for external timeline constraints (e.g. contract expiry)",
          "Plan onboarding schedule"
        ],
        scripts: {
          opening: "If we decide to move forward, {leadName}, when is the absolute latest you would want the team fully trained and using the new dashboard active?",
          talkingPoints: [
            "Work backward from their target date",
            "Highlight typical 7-day onboarding period"
          ],
          tips: "Ask: 'What happens if this isn't implemented by then?' to gauge urgency."
        }
      },
      {
        id: "closing",
        label: "Summary & Close",
        questions: [
          { id: "b9", text: "Summarize BANT answers to lead?", type: "check" },
          { id: "b10", text: "Get verbal confirmation of next steps?", type: "check" }
        ],
        discovery: [
          { key: "bant_next", label: "Agreed Next Step", placeholder: "e.g. Send customized proposal..." }
        ],
        checklist: [
          "Log BANT criteria in CRM",
          "Set reminder for next action item"
        ],
        scripts: {
          opening: "Excellent. Based on our discussion, you need a solution by next month for a team of 15, with a budget of ₹8L. I'll prepare a customized proposal reflecting this and send it over by 4 PM today.",
          talkingPoints: [
            "Confirm all four BANT points",
            "Show clear commitment to the deadline"
          ],
          tips: "Thank them for their detailed insights. It builds trust."
        }
      }
    ],
    objections: [
      { trigger: "Timeline is too tight", rebuttal: "We have an express onboarding package that can get your team live in 48 hours instead of the standard 7 days. Shall we look at that?" },
      { trigger: "Need to consult procurement", rebuttal: "Understood. I can provide our standard vendor onboarding documentation and security certificates to speed up their evaluation." }
    ],
    crossSell: {
      product: "Branding & Leads Bundle",
      icon: "🎙",
      success: 48,
      deals: 19,
      pitch: "Since you have defined budget and need leads quickly, combining the CRM with our Branding & Leads Package gets you 100 pre-qualified leads in the first month."
    }
  },
  {
    id: 3,
    title: "Zee News Podcast Pitch",
    sub: "For media & branding clients",
    category: "Branding",
    budgetRange: "₹10L - ₹25L",
    duration: "5-6 mins",
    icon: "🎙",
    steps: [
      {
        id: "opening",
        label: "Introduction",
        questions: [
          { id: "p1", text: "Ask if they have watched Zee News podcasts?", type: "check" },
          { id: "p2", text: "Introduce the premium placement opportunity?", type: "check" }
        ],
        discovery: [
          { key: "brand_obj", label: "Brand Objective", placeholder: "e.g., Authority, Lead Gen, Brand Recall..." }
        ],
        checklist: [
          "Establish high credibility immediately",
          "Hook with the size of Zee News audience"
        ],
        scripts: {
          opening: "Hi {leadName}, this is {repName} from TechSales Media. We are selecting 5 leading brand founders for our upcoming special feature on Zee News digital podcast. I wanted to see if your brand is currently active in digital video PR?",
          talkingPoints: [
            "Zee News reaches 50M+ viewers",
            "This is an exclusive invite-only segment"
          ],
          tips: "Name-drop a few similar founders who have been featured recently to create FOMO."
        }
      },
      {
        id: "discovery",
        label: "Brand Discovery",
        questions: [
          { id: "p3", text: "Identify key brand message to convey?", type: "check" },
          { id: "p4", text: "Learn their target demographic?", type: "check" }
        ],
        discovery: [
          { key: "brand_target", label: "Target Audience", placeholder: "e.g., Tier-1 youth, tech founders..." }
        ],
        checklist: [
          "Identify founder's personal story angle",
          "Determine if they want studio or remote recording"
        ],
        scripts: {
          opening: "For this podcast, {leadName}, we focus on the founder's journey. What is the key milestone or story that you think sets your brand apart in the market right now?",
          talkingPoints: [
            "Focus on the human interest angle",
            "Demographics alignment"
          ],
          tips: "Ask them about their passion. People love talking about their brand's origin story."
        }
      },
      {
        id: "closing",
        label: "Pitch & Pricing",
        questions: [
          { id: "p5", text: "Present the package pricing details?", type: "check" },
          { id: "p6", text: "Ask for slot booking deposit?", type: "check" }
        ],
        discovery: [
          { key: "shoot_date", label: "Preferred Shoot Date", placeholder: "e.g., Mid-July..." }
        ],
        checklist: [
          "Explain production, airing, and syndication pricing",
          "Confirm slot availability"
        ],
        scripts: {
          opening: "The complete production and broadcasting package on Zee digital is ₹12 Lakhs. This includes pre-shoot consulting, studio recording, and digital marketing promotion. We have only 2 slots remaining for next month. Can we book your shoot date?",
          talkingPoints: [
            "Create urgency around limited slots",
            "Detail the deliverables: video files, raw cuts, and syndication"
          ],
          tips: "Offer a token booking amount (₹50k) to lock the date."
        }
      }
    ],
    objections: [
      { trigger: "We don't do video marketing", rebuttal: "Video generates 1200% more shares than text and image combined. Plus, featuring on Zee News gives you a permanent badge of authority you can use on your website forever." },
      { trigger: "Budget is out of scope", rebuttal: "We have a smaller syndication tier starting at ₹4L, which features you in a panel discussion format instead of a dedicated solo episode. Would that fit better?" }
    ],
    crossSell: {
      product: "Branding Package",
      icon: "🖼",
      success: 42,
      deals: 8,
      pitch: "Add our digital PR package to distribute the podcast snippets to 50+ media sites (NDTV, MoneyControl) to maximize the SEO value."
    }
  }
];

/** Merge full call playbooks + document SOPs for employee panel & Call Assistant */
export function empDocToSop(doc) {
  return {
    id: doc.id + 100,
    title: doc.title,
    sub: doc.sub,
    category: "Process",
    budgetRange: "—",
    duration: "3–5 mins",
    icon: "📋",
    steps: doc.sections.map((sec, idx) => ({
      id: `s${idx}`,
      label: sec.title,
      questions: sec.items.map((it, qi) => ({ id: `q${idx}-${qi}`, text: it, type: "check" })),
      discovery: [],
      checklist: [...sec.items],
      scripts: {
        opening: sec.items.map((it) => `• ${it}`).join("\n"),
        talkingPoints: [],
        tips: "",
      },
    })),
    objections: [],
    crossSell: null,
  };
}

export function buildAllEmployeeSops() {
  return [...LOCAL_SOPS, ...EMP_SOP_DOCS.map(empDocToSop)];
}

export const ALL_EMP_SOPS = buildAllEmployeeSops();

function normalizeSopScripts(scripts, fallbackOpening = "") {
  const src = scripts && typeof scripts === "object" ? scripts : {};
  return {
    opening: src.opening || fallbackOpening || "",
    talkingPoints: Array.isArray(src.talkingPoints) ? src.talkingPoints : [],
    tips: src.tips || "",
  };
}

function normalizeSopSteps(steps) {
  if (!Array.isArray(steps) || steps.length === 0) {
    return [{
      id: "step-1",
      label: "Step 1",
      questions: [],
      discovery: [],
      checklist: [],
      scripts: normalizeSopScripts(null),
    }];
  }
  return steps.map((step, idx) => {
    if (typeof step === "string") {
      return {
        id: `step-${idx + 1}`,
        label: step.trim() || `Step ${idx + 1}`,
        questions: [],
        discovery: [],
        checklist: [],
        scripts: normalizeSopScripts(null, step),
      };
    }
    return {
      id: step?.id || `step-${idx + 1}`,
      label: step?.label || step?.title || step?.name || `Step ${idx + 1}`,
      questions: Array.isArray(step?.questions) ? step.questions : [],
      discovery: Array.isArray(step?.discovery) ? step.discovery : [],
      checklist: Array.isArray(step?.checklist) ? step.checklist : [],
      scripts: normalizeSopScripts(step?.scripts, step?.script || ""),
    };
  });
}

function sopSubtitle(source, fallback = "") {
  if (source?.sub != null && String(source.sub).trim()) return String(source.sub).trim();
  const desc = source?.description;
  if (typeof desc === "string" && desc.trim()) return desc.trim().slice(0, 80);
  if (source?.category != null && String(source.category).trim()) return String(source.category);
  return fallback;
}

/** Ensure Call Assistant always receives safe SOP shape (prevents runtime .map crashes). */
export function normalizeCallSop(sop) {
  if (!sop || typeof sop !== "object") return null;
  try {
    return {
      ...sop,
      id: sop.id ?? sop.sopId ?? `sop-${sop.title || "unknown"}`,
      title: sop.title || "SOP Guide",
      category: sop.category || "General",
      sub: sopSubtitle(sop, sop.sub || ""),
      budgetRange: sop.budgetRange || "—",
      icon: sop.icon || "📋",
      objections: Array.isArray(sop.objections) ? sop.objections : [],
      crossSell: sop.crossSell && typeof sop.crossSell === "object" ? sop.crossSell : null,
      steps: normalizeSopSteps(sop.steps || sop.instruction_steps || sop.instructionSteps),
    };
  } catch {
    return normalizeCallSop({
      id: sop.id || "fallback",
      title: String(sop.title || "SOP Guide"),
      steps: [],
    });
  }
}

function normalizeQuestionText(q) {
  if (typeof q === "string") return q.trim();
  if (q && typeof q === "object") {
    return String(q.text || q.question || q.q || q.title || "").trim();
  }
  return "";
}

function sopFromApiRow(api) {
  const stepsRaw = api.instruction_steps || api.instructionSteps || api.steps || [];
  const script = api.script || "";
  const questions = (api.questions || []).map(normalizeQuestionText).filter(Boolean);
  const frameworks = (api.frameworks || []).filter(Boolean);

  let steps = normalizeSopSteps(stepsRaw);
  if (steps[0] && (script || questions.length || frameworks.length)) {
    const first = steps[0];
    steps = [{
      ...first,
      scripts: {
        ...first.scripts,
        opening: first.scripts.opening || script,
        tips: first.scripts.tips || frameworks.join("\n"),
      },
      discovery: questions.length
        ? questions.map((q, i) => ({ id: `d${i}`, q, hint: "" }))
        : first.discovery,
      checklist: questions.length && !first.checklist?.length ? questions : first.checklist,
    }, ...steps.slice(1)];
  }

  return normalizeCallSop({
    id: api.id,
    title: api.title || "SOP",
    sub: sopSubtitle(api),
    category: api.category || "General",
    budgetRange: api.budgetRange || "—",
    duration: api.estimated_time || api.estimatedTime || "—",
    icon: api.icon || "📋",
    status: api.status,
    description: api.description,
    steps,
    objections: Array.isArray(api.objections) ? api.objections : [],
    crossSell: api.crossSell || null,
  });
}

/** Employees see all admin SOPs except archived (read-only). */
function isEmployeeVisibleSop(api) {
  const status = String(api?.status || "Active").toLowerCase();
  return status !== "archived";
}

export const EMP_SOP_CACHE_KEY = "crm_employee_sops_v1";
export const ADMIN_SOP_STORAGE_KEY = "admin_dashboard_sops";

/** Parse SOP list from any known API response shape. */
export function extractApiSopList(response) {
  if (!response || response.success === false) return null;
  if (Array.isArray(response.sops)) return response.sops;
  if (Array.isArray(response.data?.sops)) return response.data.sops;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response)) return response;
  return [];
}

export function readCachedEmployeeSops() {
  if (typeof window === "undefined") return [];
  const deleted = new Set(
    (() => {
      try {
        const raw = window.localStorage.getItem("crm_deleted_sops_v1");
        return raw ? JSON.parse(raw).map((s) => String(s).toLowerCase()) : [];
      } catch {
        return [];
      }
    })()
  );
  const keys = [EMP_SOP_CACHE_KEY, ADMIN_SOP_STORAGE_KEY];
  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((s) => {
          if (!s) return false;
          if (s.id != null && deleted.has(String(s.id).toLowerCase())) return false;
          if (s.sop_code && deleted.has(String(s.sop_code).toLowerCase())) return false;
          if (s.title && deleted.has(String(s.title).toLowerCase())) return false;
          return true;
        });
      }
    } catch {
      /* try next key */
    }
  }
  return [];
}

export function persistEmployeeSops(list) {
  if (typeof window === "undefined" || !Array.isArray(list) || !list.length) return;
  try {
    window.localStorage.setItem(EMP_SOP_CACHE_KEY, JSON.stringify(list));
  } catch {
    /* ignore quota errors */
  }
}

/** Map admin/API SOP rows to employee read-only playbooks — no local mock merge. */
export function mapAdminSopsForEmployee(apiSops) {
  if (!Array.isArray(apiSops)) return [];
  return apiSops
    .filter(isEmployeeVisibleSop)
    .map(sopFromApiRow)
    .filter(Boolean);
}

/** @deprecated Use mapAdminSopsForEmployee — kept for imports that expect this name. */
export function mergeApiSopsWithLocal(apiSops) {
  return mapAdminSopsForEmployee(apiSops);
}
