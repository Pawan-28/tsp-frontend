import { useCallback, useEffect, useMemo, useState, useDeferredValue } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders } from "./crmContext.js";
import {
  apiLeadToEmployee,
  fetchAllLeads,
  unwrapApiList,
} from "./leadSync.js";
import {
  buildPipelineChartFromLeads,
  pipelineStageCountsKey,
} from "../data/employeeMock.js";
import { dedupePeriodCalls } from "./callMetrics.js";
import { useTenantCallyzerStats } from "./useTenantCallyzerStats.js";
import { usePipelineBoard } from "./usePipelineBoard.js";
import { usePipelineSync } from "./usePipelineSync.js";
import { CALL_CONVERSATION_LABEL, CALL_SHORT_LABEL } from "./callMetrics.js";

function mapTenantMeeting(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.leadId ?? row.lead_id,
    lead: row.leadName ?? row.lead_name ?? row.title,
    status: row.status,
    scheduledAt: row.scheduledAt ?? row.scheduled_at,
    date: row.scheduledAt ?? row.scheduled_at,
    outcome: row.outcome,
  };
}

function leadMatchesEmployee(lead, employeeName) {
  if (!employeeName || employeeName === "All Employees") return true;
  const name = String(employeeName).toLowerCase();
  const candidates = [
    lead.assignee,
    lead.employeeName,
    lead.assignee_name,
    typeof lead.assignedTo === "object" ? lead.assignedTo?.name : "",
  ].map((v) => String(v || "").toLowerCase());
  return candidates.some((c) => c && c.includes(name));
}

function leadMatchesService(lead, service) {
  if (!service || service === "All Services") return true;
  const s = String(service).toLowerCase();
  return [lead.service, lead.requirements, lead.source].some(
    (v) => String(v || "").toLowerCase().includes(s),
  );
}

/**
 * Admin pipeline data — same kanban + Callyzer sync as employee panel.
 */
export function useAdminPipelineData({
  period = "month",
  service = "All Services",
  employee = "All Employees",
  enabled = true,
} = {}) {
  const [rawLeads, setRawLeads] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    try {
      const [items, meetingsRes] = await Promise.all([
        fetchAllLeads(apiGet, { headers: getAdminCrmHeaders() }),
        apiGet("/api/v1/meetings", { headers: getAdminCrmHeaders(), cacheTtl: 60_000 }).catch(() => null),
      ]);
      setRawLeads(Array.isArray(items) ? items.map((l) => apiLeadToEmployee(l)) : []);
      const meetingItems = unwrapApiList(meetingsRes) || [];
      setMeetings(meetingItems.map(mapTenantMeeting).filter(Boolean));
    } catch {
      setRawLeads([]);
      setMeetings([]);
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    load();
  }, [load]);

  const deferredPeriod = useDeferredValue(period);

  const filteredLeads = useMemo(() => {
    return rawLeads.filter(
      (l) => leadMatchesService(l, service) && leadMatchesEmployee(l, employee),
    );
  }, [rawLeads, service, employee]);

  const { calls: boardCalls, loading: boardCallsLoading } = usePipelineSync({
    scope: "admin",
    period: deferredPeriod,
    enabled: enabled && !loading,
    mapLeads: false,
    attachLeads: filteredLeads,
  });

  const periodCalls = useMemo(
    () => dedupePeriodCalls(boardCalls || []),
    [boardCalls],
  );
  const callsLoading = boardCallsLoading;
  const { stats: callyzerStats } = useTenantCallyzerStats(period, enabled && !loading);

  const board = usePipelineBoard({
    leads: filteredLeads,
    period: deferredPeriod,
    periodCalls,
    callsLoading,
    callyzerStats,
    meetings,
    adminScope: false,
    includeUncontactedAssignments: true,
    scopeCallsByAssignee: true,
    visibleLeads: filteredLeads,
  });

  const kanbanOptions = useMemo(
    () => ({
      period,
      meetings,
    }),
    [period, meetings],
  );

  const pipelineMetrics = useMemo(() => ({ callyzerStats }), [callyzerStats]);

  const pipelineCountsKey = useMemo(
    () => pipelineStageCountsKey(board.baseLeads, periodCalls, kanbanOptions, pipelineMetrics),
    [board.baseLeads, periodCalls, kanbanOptions, pipelineMetrics],
  );

  const pipeline = useMemo(
    () => buildPipelineChartFromLeads(board.baseLeads, periodCalls, kanbanOptions, pipelineMetrics),
    [pipelineCountsKey, board.baseLeads, periodCalls, kanbanOptions, pipelineMetrics],
  );

  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";
  const callSummary = `${periodLabel} · ${board.syncedShortCalls} short calls ${CALL_SHORT_LABEL} · ${board.syncedConversationCalls} calls ${CALL_CONVERSATION_LABEL} · ${board.syncedNotPickupCalls} client no pickup`;

  const tempTotals = useMemo(() => {
    const totals = { Hot: 0, Warm: 0, Cold: 0 };
    for (const lead of board.baseLeads) {
      const st = String(lead.status || "").toLowerCase();
      const temp = String(lead.temperature || "").toLowerCase();
      if (st === "hot" || temp.includes("hot")) totals.Hot += 1;
      else if (st === "cold" || temp.includes("cold")) totals.Cold += 1;
      else totals.Warm += 1;
    }
    return totals;
  }, [board.baseLeads]);

  return {
    loading,
    callsLoading,
    filteredLeads,
    pipeline,
    board,
    tempTotals,
    callSummary,
    periodLabel,
    refresh: load,
  };
}
