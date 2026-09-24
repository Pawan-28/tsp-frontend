import {
  formatEmpPipelineValue,
  parseEmpBudget,
  EMP_KANBAN_STAGES,
} from "../data/employeeMock.js";
import {
  ADMIN_PIPELINE_TO_DB_STAGE,
  mapStageToId,
  normalizeStageLabel,
} from "./pipelineStages.js";
import { formatCallDisplayDate } from "./callDisplay.js";
import { resolveLeadForCall } from "./leadKanban.js";
import { phonesMatchLoose } from "./callMetrics.js";
import { apiGet } from "./api.js";

/** Canonical pipeline_stage values written to DB (employee kanban labels). */
export const CANONICAL_STAGE_LABELS = EMP_KANBAN_STAGES.map((s) => s.label);

export { ADMIN_PIPELINE_TO_DB_STAGE };

export function adminPipelineIdToDbStage(adminStageId) {
  return ADMIN_PIPELINE_TO_DB_STAGE[adminStageId] || normalizeStageLabel(adminStageId);
}

/** Normalize any legacy stage string to canonical employee label for display/storage. */
export function normalizeToCanonicalStage(raw, status = "") {
  return normalizeStageLabel(raw, status);
}

export function getPipelineQualifiedCount(stats, stageBreakdown) {
  if (stats?.pipelineQualified != null) return stats.pipelineQualified;
  if (Array.isArray(stageBreakdown) && stageBreakdown.length) {
    const booked = stageBreakdown.find((s) => s.id === "meeting_booked" || String(s.label || "").includes("Meeting Booked"))?.count || 0;
    const done = stageBreakdown.find((s) => s.id === "meeting_done" || String(s.label || "").includes("Meeting Done"))?.count || 0;
    return booked + done;
  }
  if (stats?.booked != null || stats?.showedUp != null || stats?.meetingDone != null) {
    return (stats.booked || stats.meetingBooked || 0) + (stats.showedUp || stats.meetingDone || 0);
  }
  return 0;
}

const AVATAR_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#dc2626", "#0ea5e9", "#64748b"];

export function normalizeTemperature(raw) {
  const s = String(raw || "").toLowerCase();
  if (s.includes("hot")) return "hot";
  if (s.includes("cold")) return "cold";
  if (s === "notpick" || s.includes("not pick")) return "notpick";
  if (s === "converted") return "converted";
  if (s === "ni" || s.includes("not interested")) return "ni";
  return "warm";
}

export function temperatureToApi(status) {
  const map = {
    hot: "Hot Lead",
    warm: "Warm Lead",
    cold: "Cold Lead",
    notpick: "Not Pick",
    converted: "Payment Complete",
    ni: "Not Interested",
  };
  return map[status] || "Cold Lead";
}

export function workflowStatusFromTemperature(status) {
  return temperatureToApi(status);
}

export function formatRelativeTime(iso) {
  if (!iso) return "—";
  return formatCallDisplayDate(iso);
}

export function unwrapApiData(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.leads)) return res.leads;
  if (Array.isArray(res?.employees)) return res.employees;
  if (res?.data && typeof res.data === "object") return res.data;
  return res?.data ?? [];
}

/** Extract a list array from common API envelope shapes. Returns null when not a list. */
export function unwrapApiList(res) {
  const direct = unwrapApiData(res);
  if (Array.isArray(direct)) return direct;
  if (Array.isArray(res?.data?.items)) return res.data.items;
  if (Array.isArray(res?.data?.leads)) return res.data.leads;
  if (Array.isArray(res?.items)) return res.items;
  if (Array.isArray(res?.leads)) return res.leads;
  return null;
}

/** Extract employee workspace/dashboard payload from API envelopes. */
export function unwrapWorkspacePayload(res) {
  if (!res || typeof res !== "object") return null;
  if (res.data && typeof res.data === "object" && !Array.isArray(res.data)) {
    return res.data;
  }
  if (Array.isArray(res.leads) || res.employee || res.tasks || res.calls) {
    return res;
  }
  return null;
}

/** Replace list on fetch — used for per-employee workspace (no cross-user merge). */
export function replaceFetchedList(prev, next) {
  if (!Array.isArray(next)) return Array.isArray(prev) ? prev : [];
  return next;
}

/** Keep existing rows when a refetch returns empty (avoids wiping good data on race/429). */
export function mergeFetchedList(prev, next) {
  if (!Array.isArray(next)) return prev;
  if (next.length === 0 && Array.isArray(prev) && prev.length > 0) return prev;
  return next;
}

const WORKFLOW_STATUS = new Set(["notpick", "converted", "ni", "new", "attempted", "contacted", "booked"]);

function workflowStatusFromStage(stageRaw) {
  const s = String(stageRaw || "").toLowerCase();
  if (!s) return null;
  if (s === "new lead" || s === "new" || s === "lead") return "new";
  if (s.includes("not pick")) return "notpick";
  if (s.includes("attempted")) return "attempted";
  if (s.includes("contacted") || s.includes("qualified") || s.includes("conversation")) return "contacted";
  if (s.includes("booked") || s.includes("call booked") || s.includes("meeting booked")) return "booked";
  if (s.includes("showed up") || s.includes("showed-up") || s.includes("show up") || s.includes("meeting done")) {
    return "showed_up";
  }
  if (s.includes("proposal")) return "proposal";
  if (s.includes("objection") || s.includes("negotiation")) return "negotiation";
  if (s.includes("payment complete") || s.includes("converted") || s === "won") return "converted";
  if (s.includes("closed") || s.includes("not interested")) return "ni";
  return null;
}

function normalizeEmployeeLeadStatus(lead) {
  const fromStage = workflowStatusFromStage(
    lead.pipelineStage || lead.pipeline_stage || lead.stage,
  );
  if (fromStage) return fromStage;
  const raw = String(lead.status || lead.lead_status || "").toLowerCase().trim();
  if (raw === "notpick" || raw.includes("not pick")) return "notpick";
  if (raw === "converted" || raw.includes("payment complete")) return "converted";
  if (raw === "ni" || raw.includes("not interested")) return "ni";
  if (raw === "new") return "new";
  if (WORKFLOW_STATUS.has(raw)) return raw;
  return normalizeTemperature(lead.temperature || lead.status);
}

export function apiLeadToEmployee(rawLead, avatarColors = AVATAR_COLORS) {
  if (!rawLead || typeof rawLead !== "object") return {};
  const lead = rawLead?.lead || rawLead;
  const rawName = lead.leadName || lead.lead_name || lead.name;
  const phoneNum = lead.phone || lead.phone_number || "";
  const name = (rawName && rawName.trim().toLowerCase() !== "unknown") ? rawName : (phoneNum || "Lead");
  const id = lead.id ?? lead.lead_id ?? lead.leadId ?? rawLead?.id;
  const av = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const rawStage = lead.pipelineStage || lead.pipeline_stage || lead.stage || "Lead";
  const status = normalizeEmployeeLeadStatus(lead);
  const stage = normalizeToCanonicalStage(rawStage, lead.status || status);
  const revenue = Number(lead.expectedRevenue ?? lead.expected_revenue ?? 0);

  const meta = typeof lead.sourceMeta === "string" ? (() => { try { return JSON.parse(lead.sourceMeta); } catch { return {}; } })() : (lead.sourceMeta || lead.source_meta || {});
  const utmSource = lead.utm_source || lead.utmSource || meta.utm_source || meta.utmSource || "";
  const utmMedium = lead.utm_medium || lead.utmMedium || meta.utm_medium || meta.utmMedium || "";
  const utmCampaign = lead.utm_campaign || lead.utmCampaign || meta.utm_campaign || meta.utmCampaign || "";
  const utmTerm = lead.utm_term || lead.utmTerm || meta.utm_term || meta.utmTerm || "";
  const utmContent = lead.utm_content || lead.utmContent || meta.utm_content || meta.utmContent || "";
  const sop = lead.sop || lead.sopName || meta.sop || meta.sopName || "";
  const sopId = lead.sopId || lead.sop_id || meta.sopId || meta.sop_id || "";
  const serviceId = lead.serviceId || lead.service_id || meta.serviceId || meta.service_id || "";
  const service = lead.service || lead.serviceName || meta.services || meta.service || lead.requirements || lead.insights || "—";

  return {
    id,
    name,
    company: lead.companyName || lead.company_name || "—",
    status,
    stage,
    source: lead.source || meta.source || utmSource || "Website",
    budget: revenue > 0 ? formatEmpPipelineValue(revenue) : "—",
    service,
    serviceId,
    sop,
    sopId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
    sourceMeta: meta,
    last: formatRelativeTime(lead.lastActivityAt || lead.updatedAt || lead.createdAt),
    av,
    color: avatarColors[Number(id) % avatarColors.length],
    phone: lead.phone || "",
    email: lead.email || "",
    city: lead.city || "",
    country: lead.country || "India",
    assignee: (
      (typeof lead.assignedTo === "object" && lead.assignedTo?.name) ||
      lead.assignee_name ||
      lead.assigneeName ||
      lead.assigned_employee ||
      lead.employee_name ||
      lead.employeeName ||
      lead.owner ||
      lead.assignee ||
      (typeof lead.assignedTo === "string" ? lead.assignedTo : "") ||
      "—"
    ),
    assigneeId: (() => {
      const raw = lead.assignedTo ?? lead.assigned_to ?? lead.assigneeId ?? lead.assignee_id;
      if (raw == null) return null;
      if (typeof raw === "object") return raw.id ?? raw._id ?? null;
      return raw;
    })(),
    pipelineStage: stage,
    stageOverride: Boolean(lead.stageIsManual ?? lead.stage_is_manual ?? lead.stageOverride),
    temperature: lead.temperature,
    expectedRevenue: revenue,
    winProbability: lead.winProbability ?? lead.win_probability,
    nextFollowUpAt: lead.nextFollowUpAt || lead.next_follow_up_at,
    createdAt: lead.createdAt || lead.created_at,
    updatedAt: lead.updatedAt || lead.updated_at,
    assignmentStatus: lead.assignmentStatus || lead.assignment_status,
    assignedAt: lead.assignedAt || lead.assigned_at,
    assignedBy: lead.assignedBy || lead.assigned_by,
    assignmentMethod: lead.assignmentMethod || lead.assignment_method,
    acceptedAt: lead.acceptedAt || lead.accepted_at,
    _api: true,
  };
}

export function apiLeadToAdmin(rawLead) {
  if (!rawLead || typeof rawLead !== "object") return {};
  const lead = rawLead?.lead || rawLead;
  const id = lead.id ?? lead.lead_id ?? lead.leadId ?? rawLead?.id;
  const assignedTo = lead.assignedTo;
  const employeeName =
    (typeof assignedTo === "object" && assignedTo?.name) ||
    lead.assigneeName ||
    lead.assignee_name ||
    lead.assigned_employee ||
    lead.employee_name ||
    lead.employeeName ||
    lead.owner ||
    lead.assignee ||
    (typeof assignedTo === "string" ? assignedTo : "") ||
    "—";

  const meta = typeof lead.sourceMeta === "string" ? (() => { try { return JSON.parse(lead.sourceMeta); } catch { return {}; } })() : (lead.sourceMeta || lead.source_meta || {});
  const utmSource = lead.utm_source || lead.utmSource || meta.utm_source || meta.utmSource || "";
  const utmMedium = lead.utm_medium || lead.utmMedium || meta.utm_medium || meta.utmMedium || "";
  const utmCampaign = lead.utm_campaign || lead.utmCampaign || meta.utm_campaign || meta.utmCampaign || "";
  const utmTerm = lead.utm_term || lead.utmTerm || meta.utm_term || meta.utmTerm || "";
  const utmContent = lead.utm_content || lead.utmContent || meta.utm_content || meta.utmContent || "";
  const sop = lead.sop || lead.sopName || meta.sop || meta.sopName || "";
  const sopId = lead.sopId || lead.sop_id || meta.sopId || meta.sop_id || "";
  const serviceId = lead.serviceId || lead.service_id || meta.serviceId || meta.service_id || "";
  const service = lead.requirements || lead.service || meta.services || meta.service || lead.insights || "";

  return {
    id,
    lead_name: lead.leadName || lead.lead_name || lead.name,
    company_name: lead.companyName || lead.company_name,
    phone: lead.phone,
    email: lead.email,
    city: lead.city,
    country: lead.country,
    source: lead.source || meta.source || utmSource,
    form_name: lead.formName || lead.form_name,
    pipeline_stage: normalizeToCanonicalStage(
      lead.pipelineStage || lead.pipeline_stage,
      lead.status,
    ),
    temperature: lead.temperature,
    status: lead.status,
    expected_revenue: lead.expectedRevenue ?? lead.expected_revenue,
    win_probability: lead.winProbability ?? lead.win_probability,
    created_at: lead.createdAt || lead.created_at,
    next_followup_date: lead.nextFollowUpAt || lead.next_follow_up_at,
    requirements: lead.requirements,
    service,
    serviceId,
    sop,
    sopId,
    utm_source: utmSource,
    utm_medium: utmMedium,
    utm_campaign: utmCampaign,
    utm_term: utmTerm,
    utm_content: utmContent,
    sourceMeta: meta,
    assignedTo,
    assignee_name: employeeName,
    employeeName,
    assigned_employee: employeeName,
    owner: employeeName,
    assignee: employeeName,
    assignment_status: lead.assignmentStatus || lead.assignment_status,
    is_bulk_uploaded: meta.integration === "bulk_upload" || lead.source_meta?.integration === "bulk_upload" || false,
  };
}

export function employeeStagePatch(stageLabel, currentStatus) {
  const canonical = normalizeToCanonicalStage(stageLabel, currentStatus);
  return {
    stage: canonical,
    pipelineStage: canonical,
    status: canonical,
    employeeStatus: canonical,
  };
}

export function apiEmployeeToAdmin(emp) {
  return {
    id: emp.id,
    name: emp.name,
    email: emp.email,
    role: emp.role,
    department: emp.department,
    status: emp.status,
  };
}

export function isDummyEmployee(emp) {
  if (!emp) return true;
  const name = String(emp.name || emp.employeeName || "").trim().toLowerCase();
  const email = String(emp.email || "").trim().toLowerCase();
  const idStr = String(emp.id || "").trim().toLowerCase();

  if (idStr.startsWith("mock-") || idStr.startsWith("demo-") || idStr.startsWith("seed-") || idStr.startsWith("test-")) return true;
  if (email.endsWith("@example.com") || email.endsWith("@test.com") || email.endsWith("@demo.com")) return true;

  const dummyNames = [
    "test user",
    "john doe",
    "jane doe",
    "dummy employee",
    "test employee",
  ];

  if (dummyNames.includes(name)) return true;

  return false;
}

/** Active employees only — excludes inactive/demo rows not shown on Team page. */
export function filterAssignableEmployees(employees = []) {
  const seen = new Set();
  return (Array.isArray(employees) ? employees : []).filter((emp) => {
    if (!emp?.id) return false;
    if (isDummyEmployee(emp)) return false;
    const status = String(emp.status || "active").trim().toLowerCase();
    if (status === "inactive") return false;
    const key = String(emp.id);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Fetch all leads from paginated /api/v1/leads (admin lists were capped at 200). */
export async function fetchAllLeads(apiGetFn, { headers, pageSize = 500, maxPages = 40, extraQuery = {}, skipCache = true, cacheTtl = skipCache ? 0 : 60_000 } = {}) {
  const all = [];
  let page = 1;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      ...Object.fromEntries(
        Object.entries(extraQuery).filter(([, v]) => v != null && v !== ""),
      ),
    });
    const res = await apiGetFn(`/api/v1/leads?${params.toString()}`, {
      headers,
      skipCache,
      cacheTtl,
    });
    const items = unwrapApiData(res);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);

    const total = Number(res?.total);
    if (Number.isFinite(total) && all.length >= total) break;
    if (items.length < pageSize) break;
    page += 1;
  }

  return all;
}

/** Leads Assign page: two parallel filtered requests instead of full catalog pagination. */
export async function fetchLeadsForAssignPage(apiGetFn, { headers, skipCache = true } = {}) {
  const all = await fetchAllLeads(apiGetFn, { headers, pageSize: 500, skipCache });
  return all;
}

/** Fetch all leads for an employee (paginates when API returns partial pages). */
export async function fetchAllEmployeeLeads(apiGetFn, employeeId, { headers, pageSize = 500, maxPages = 40, extraQuery = {}, skipCache = true, cacheTtl = skipCache ? 0 : 60_000 } = {}) {
  if (!employeeId) return [];

  const extra = Object.fromEntries(
    Object.entries(extraQuery).filter(([, v]) => v != null && v !== ""),
  );
  const extraQs = new URLSearchParams(extra).toString();
  const bulkPath = `/api/v1/employee/${employeeId}/leads${extraQs ? `?${extraQs}` : ""}`;
  const bulkRes = await apiGetFn(bulkPath, { headers, skipCache, cacheTtl });
  const bulkItems = unwrapApiData(bulkRes);
  const bulkTotal = Number(bulkRes?.total);

  if (Array.isArray(bulkItems) && bulkItems.length) {
    if (!Number.isFinite(bulkTotal) || bulkItems.length >= bulkTotal) return bulkItems;
  }

  const all = Array.isArray(bulkItems) ? [...bulkItems] : [];
  let page = Math.floor(all.length / pageSize) + 1 || 1;

  while (page <= maxPages) {
    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageSize),
      ...extra,
    });
    const res = await apiGetFn(`/api/v1/employee/${employeeId}/leads?${params.toString()}`, {
      headers,
      skipCache,
      cacheTtl,
    });
    const items = unwrapApiData(res);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);

    const total = Number(res?.total);
    if (Number.isFinite(total) && all.length >= total) break;
    if (items.length < pageSize) break;
    page += 1;
  }

  return all;
}

export function apiLeadToPipeline(lead) {
  if (!lead) return null;
  const stageRaw = lead.pipelineStage || lead.pipeline_stage || lead.status || "Lead";
  const stage = mapStageToId(stageRaw, lead.status);
  const temp = String(lead.temperature || "").toLowerCase();
  const priority = temp.includes("hot") ? "HOT" : temp.includes("cold") ? "COLD" : "WARM";
  const assignedTo = lead.assignedTo;
  const owner = (typeof assignedTo === "object" && assignedTo?.name)
    || lead.assigneeName
    || lead.assignee_name
    || lead.assigned_employee
    || lead.employee_name
    || lead.employeeName
    || lead.owner
    || lead.assignee
    || (typeof assignedTo === "string" ? assignedTo : "")
    || "—";

  const rawName = lead.leadName || lead.lead_name || lead.name;
  const phoneNum = lead.phone || lead.phone_number || "";
  const name = (rawName && rawName.trim().toLowerCase() !== "unknown") ? rawName : (phoneNum || "Lead");

  return {
    id: lead.id,
    _dbId: lead.id,
    stage,
    pipelineStage: stageRaw,
    stageOverride: Boolean(lead.stageIsManual ?? lead.stage_is_manual ?? lead.stageOverride),
    name,
    phone: phoneNum,
    company: lead.companyName || lead.company_name || "—",
    value: Number(lead.expectedRevenue ?? lead.expected_revenue ?? 0),
    priority,
    status: lead.status || lead.employeeStatus || "",
    assignmentStatus: lead.assignmentStatus || lead.assignment_status || "",
    assignedAt: lead.assignedAt || lead.assigned_at || null,
    assignedBy: lead.assignedBy || lead.assigned_by || null,
    assignmentMethod: lead.assignmentMethod || lead.assignment_method || "",
    assigneeId: (() => {
      const raw = lead.assignedTo ?? lead.assigned_to ?? lead.assigneeId ?? lead.assignee_id;
      if (raw == null) return null;
      if (typeof raw === "object") return raw.id ?? raw._id ?? null;
      return raw;
    })(),
    acceptedAt: lead.acceptedAt || lead.accepted_at || null,
    createdAt: lead.createdAt || lead.created_at || null,
    updatedAt: lead.updatedAt || lead.updated_at || lead.createdAt || new Date().toISOString(),
    email: lead.email || "",
    city: lead.city || "",
    source: lead.source || "Website",
    service: lead.requirements || lead.insights || lead.sourceMeta?.service || "",
    requirements: lead.requirements || lead.insights || "",
    owner,
    assignee: owner,
    employeeName: owner,
    assigned_employee: owner,
    winProbability: lead.winProbability ?? lead.win_probability ?? 50,
    activities: [],
    tasks: [],
  };
}

const DETAIL_AVATAR_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#7c3aed", "#dc2626", "#0ea5e9", "#64748b"];

function displayLeadName(lead) {
  const raw = String(lead?.name || lead?.lead_name || lead?.leadName || "").trim();
  if (raw && !/^unknown$/i.test(raw) && raw !== "Lead") return raw;
  const phone = String(lead?.phone || lead?.clientPhone || "").replace(/\D/g, "");
  if (phone.length >= 10) return phone.slice(-10);
  return raw || "Lead";
}

/** Normalize admin, pipeline, or employee lead shapes for the shared detail drawer. */
export function normalizeLeadForDetailPanel(lead) {
  if (!lead) return null;

  const name = displayLeadName(lead);
  const av = lead.av || name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const color = lead.color || DETAIL_AVATAR_COLORS[Number(lead.id) % DETAIL_AVATAR_COLORS.length];
  const revenue = Number(
    lead.expectedRevenue ?? lead.expected_revenue ?? lead.value ?? parseEmpBudget(lead.budget) ?? 0,
  );
  const stageRaw = lead.pipelineStage || lead.pipeline_stage || lead.stage || "Lead";
  const stageLabel = normalizeStageLabel(stageRaw, lead.status);
  const assignee = lead.assignee
    || lead.owner
    || lead.assignee_name
    || lead.employeeName
    || (typeof lead.assignedTo === "object" ? lead.assignedTo?.name : "")
    || "—";

  const temp = String(lead.temperature || "").toLowerCase();
  let status = lead.status || "warm";
  if (!["hot", "warm", "cold"].includes(status)) {
    if (temp.includes("hot")) status = "hot";
    else if (temp.includes("cold")) status = "cold";
    else if (temp.includes("warm")) status = "warm";
  }

  return {
    id: lead._dbId ?? lead.id,
    _dbId: lead._dbId ?? (/^\d+$/.test(String(lead.id)) ? lead.id : null),
    name,
    company: lead.company || lead.company_name || "—",
    phone: lead.phone || "",
    email: lead.email || "",
    stage: stageLabel,
    pipelineStage: stageLabel,
    source: lead.source || "—",
    budget: revenue > 0 ? formatEmpPipelineValue(revenue) : (lead.budget || "—"),
    expectedRevenue: revenue,
    service: lead.service || lead.requirements || "—",
    city: lead.city || "",
    last: lead.last || formatRelativeTime(lead.updatedAt || lead.updated_at || lead.createdAt || lead.created_at),
    assignee,
    assigneeId: lead.assigneeId ?? lead.assigned_to ?? lead.assignedTo?.id ?? null,
    status,
    av,
    color,
    temperature: lead.temperature,
  };
}

export function buildDetailDraft(lead) {
  if (!lead) return {};
  const meta = typeof lead.sourceMeta === "string" ? (() => { try { return JSON.parse(lead.sourceMeta); } catch { return {}; } })() : (lead.sourceMeta || lead.source_meta || {});
  return {
    phone: lead.phone || "",
    email: lead.email || "",
    stage: lead.stage || lead.pipelineStage || "Lead",
    source: lead.source || meta.source || meta.utm_source || "",
    city: lead.city || "",
    service: lead.service || meta.services || meta.service || "",
    serviceId: lead.serviceId || meta.serviceId || "",
    sop: lead.sop || meta.sop || meta.sopName || lead.sopId || meta.sopId || "",
    sopId: lead.sopId || meta.sopId || "",
    company: lead.company || lead.company_name || "",
    expectedRevenue: String(lead.expectedRevenue || parseEmpBudget(lead.budget) || ""),
    utm_source: lead.utm_source || meta.utm_source || "",
    utm_medium: lead.utm_medium || meta.utm_medium || "",
    utm_campaign: lead.utm_campaign || meta.utm_campaign || "",
    utm_term: lead.utm_term || meta.utm_term || "",
    utm_content: lead.utm_content || meta.utm_content || "",
  };
}

function isNumericLeadId(id) {
  return /^\d+$/.test(String(id ?? ""));
}

function mergeCallContextOntoLead(crmLead, cardLead, call) {
  if (!crmLead) return cardLead;
  const callAt = call?.callAt || cardLead?.callAt || cardLead?.startedAt || crmLead.callAt;
  return {
    ...crmLead,
    callAt,
    startedAt: callAt,
    last: cardLead?.last && cardLead.last !== "—" ? cardLead.last : crmLead.last,
  };
}

function hasRichCrmFields(lead) {
  if (!lead || !isNumericLeadId(lead.id)) return false;
  const source = String(lead.source || "").trim();
  const service = String(lead.service || lead.requirements || "").trim();
  return (source && source !== "Callyzer" && source !== "—")
    || (service && service !== "—");
}

/** Resolve a pipeline kanban card to a CRM lead using local lists first. */
export function resolvePipelineCardLeadLocal(cardLead, { leads = [], periodCalls = [] } = {}) {
  if (!cardLead) return null;

  if (isNumericLeadId(cardLead.id)) {
    return leads.find((l) => String(l.id) === String(cardLead.id)) || cardLead;
  }

  if (!cardLead._fromCall) return cardLead;

  const call = (periodCalls || []).find((c) => String(c.id) === String(cardLead._callId));
  if (call?.leadId != null) {
    const byId = leads.find((l) => String(l.id) === String(call.leadId));
    if (byId) return mergeCallContextOntoLead(byId, cardLead, call);
  }

  if (call) {
    const byCall = resolveLeadForCall(call, leads);
    if (byCall) return mergeCallContextOntoLead(byCall, cardLead, call);
  }

  if (cardLead._linkedLeadId != null) {
    const byLinked = leads.find((l) => String(l.id) === String(cardLead._linkedLeadId));
    if (byLinked) return mergeCallContextOntoLead(byLinked, cardLead, call);
  }

  if (cardLead.phone) {
    const byPhone = leads.find((l) => phonesMatchLoose(l.phone || l.clientPhone, cardLead.phone));
    if (byPhone) return mergeCallContextOntoLead(byPhone, cardLead, call);
  }

  return cardLead;
}

/** Fetch full CRM lead for orphan Callyzer pipeline cards (source, service, etc.). */
export async function fetchLeadForPipelineCard(
  cardLead,
  {
    leads = [],
    periodCalls = [],
    headers,
    mapLead = apiLeadToEmployee,
  } = {},
) {
  const local = resolvePipelineCardLeadLocal(cardLead, { leads, periodCalls });
  if (hasRichCrmFields(local)) return local;

  const call = cardLead?._fromCall
    ? (periodCalls || []).find((c) => String(c.id) === String(cardLead._callId))
    : null;
  const leadId = call?.leadId ?? cardLead?._linkedLeadId ?? (isNumericLeadId(local?.id) ? local.id : null);

  if (leadId != null && isNumericLeadId(leadId)) {
    try {
      const res = await apiGet(`/api/v1/leads/${leadId}`, { headers, cacheTtl: 30_000 });
      const raw = res?.data ?? res;
      if (raw?.id) {
        return mergeCallContextOntoLead(mapLead(raw), cardLead, call);
      }
    } catch {
      // fall through to phone search
    }
  }

  const phone = cardLead?.phone || call?.phone || call?.clientPhone;
  if (phone) {
    const digits = String(phone).replace(/\D/g, "").slice(-10);
    if (digits.length >= 10) {
      try {
        const res = await apiGet(
          `/api/v1/leads?q=${encodeURIComponent(digits)}&limit=20`,
          { headers, cacheTtl: 30_000 },
        );
        const items = unwrapApiList(res) || [];
        const match = items.find((row) => phonesMatchLoose(row.phone || row.client_phone, phone));
        if (match?.id) {
          return mergeCallContextOntoLead(mapLead(match), cardLead, call);
        }
      } catch {
        // keep local/card fallback
      }
    }
  }

  return local || cardLead;
}
