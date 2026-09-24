import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  groupEmpLeadsKanban,
  filterPipelineLeadsForPeriod,
  filterMeetingsForPeriod,
  countPipelineCallMetrics,
  getPipelineStageDisplayCounts,
} from "./leadKanban.js";
import { dedupePeriodCalls } from "./callMetrics.js";

export const MAX_KANBAN_COLUMN_CARDS = 40;

const groupedCache = new Map();
const GROUPED_CACHE_MAX = 48;

const emptyGrouped = () => Object.fromEntries(
  ["lead", "not_pick", "short_call", "conversation_2min", "meeting_booked", "meeting_done", "proposal_sent", "objection", "advance_paid", "payment_complete", "not_interested"].map((id) => [id, []]),
);

export function clearPipelineGroupedCache() {
  groupedCache.clear();
}

function leadStagesSignature(leads = []) {
  if (!Array.isArray(leads) || leads.length === 0) return "";
  const parts = new Array(leads.length);
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    parts[i] = l ? `${l.id}:${l.pipelineStage || l.stage}:${l.stageOverride ? 1 : 0}` : "";
  }
  return parts.join(";");
}

function groupedCacheKey(period, calls, leads, meetingsLen, visibleLen, adminScope, groupRev = 0) {
  const first = calls[0]?.id ?? "";
  const last = calls[calls.length - 1]?.id ?? "";
  const leadsLen = leads?.length || 0;
  const leadSig = leadStagesSignature(leads);
  return `${period}:${adminScope ? "admin" : "emp"}:${calls.length}:${first}:${last}:${leadsLen}:${leadSig}:${meetingsLen}:${visibleLen ?? "all"}:${groupRev}`;
}

function scheduleIdle(work, timeout = 80) {
  if (typeof requestIdleCallback !== "undefined") {
    return new Promise((resolve) => {
      const id = requestIdleCallback(() => resolve(work()), { timeout });
      scheduleIdle._cancel = () => cancelIdleCallback(id);
    });
  }
  return new Promise((resolve) => {
    const id = setTimeout(() => resolve(work()), 0);
    scheduleIdle._cancel = () => clearTimeout(id);
  });
}

/**
 * Shared pipeline kanban logic for admin + employee panels.
 * Heavy grouping runs in idle time so the UI stays responsive.
 */
export function usePipelineBoard({
  leads = [],
  period = "month",
  periodCalls = [],
  callsLoading = false,
  callyzerStats = null,
  meetings = [],
  adminScope = false,
  includeUncontactedAssignments = true,
  visibleLeads = null,
  employeeId = null,
  scopeCallsByAssignee = false,
  groupRev = 0,
}) {
  const callScopedOnly = true;
  const periodLabel = period === "today" ? "Today" : period === "week" ? "This Week" : "This Month";

  const uniqueCalls = useMemo(
    () => dedupePeriodCalls(periodCalls),
    [periodCalls],
  );

  const visibleLen = visibleLeads?.length ?? null;
  const cacheKey = useMemo(
    () => groupedCacheKey(period, uniqueCalls, leads, meetings.length, visibleLen, adminScope, groupRev),
    [period, uniqueCalls, leads, meetings.length, visibleLen, adminScope, groupRev],
  );

  const computedBoardState = useMemo(() => {
    const hit = groupedCache.get(cacheKey);
    if (hit) return hit;

    const periodMeetings = filterMeetingsForPeriod(meetings, period);
    const callMetrics = countPipelineCallMetrics(uniqueCalls);
    const grouped = groupEmpLeadsKanban(leads, uniqueCalls, {
      period,
      meetings,
      searchFiltered: visibleLeads,
      adminScope,
      includeUncontactedAssignments,
      employeeId,
      scopeCallsByAssignee,
    });
    const baseLeads = filterPipelineLeadsForPeriod(leads, uniqueCalls, period, meetings, null, {
      adminScope,
      includeUncontactedAssignments,
      employeeId,
      scopeCallsByAssignee,
    });
    const stageDisplayCounts = getPipelineStageDisplayCounts(grouped, {
      callyzerStats,
      callMetrics,
      periodMeetings,
    });

    const result = {
      grouped,
      baseLeads,
      callMetrics,
      periodMeetings,
      stageDisplayCounts,
      grouping: false,
    };

    groupedCache.set(cacheKey, result);
    if (groupedCache.size > GROUPED_CACHE_MAX) {
      groupedCache.delete(groupedCache.keys().next().value);
    }
    return result;
  }, [
    cacheKey,
    leads,
    period,
    uniqueCalls,
    meetings,
    visibleLeads,
    adminScope,
    includeUncontactedAssignments,
    employeeId,
    scopeCallsByAssignee,
    callyzerStats,
  ]);

  const [localOverrides, setLocalOverrides] = useState({});

  useEffect(() => {
    setLocalOverrides({});
  }, [period, adminScope]);

  const boardState = useMemo(() => {
    if (!Object.keys(localOverrides).length) return computedBoardState;
    const nextGrouped = { ...computedBoardState.grouped };
    for (const [leadId, targetStageId] of Object.entries(localOverrides)) {
      let foundLead = null;
      for (const col of Object.keys(nextGrouped)) {
        if (Array.isArray(nextGrouped[col])) {
          const idx = nextGrouped[col].findIndex(
            (l) => String(l.id) === String(leadId) || String(l._dbId) === String(leadId),
          );
          if (idx !== -1) {
            foundLead = {
              ...nextGrouped[col][idx],
              stage: targetStageId,
              pipelineStage: targetStageId,
              stageOverride: true,
            };
            nextGrouped[col] = nextGrouped[col].filter((_, i) => i !== idx);
            break;
          }
        }
      }
      if (foundLead) {
        nextGrouped[targetStageId] = [foundLead, ...(nextGrouped[targetStageId] || [])];
      }
    }
    return { ...computedBoardState, grouped: nextGrouped };
  }, [computedBoardState, localOverrides]);

  const grouping = false;

  const { grouped, baseLeads, callMetrics, periodMeetings, stageDisplayCounts } = boardState;

  const filteredLeads = useMemo(() => {
    if (!visibleLeads) return baseLeads;
    const ids = new Set(baseLeads.map((l) => String(l.id)));
    return visibleLeads.filter((l) => ids.has(String(l.id)));
  }, [baseLeads, visibleLeads]);

  const hasCalls = Array.isArray(periodCalls) && periodCalls.length > 0;
  const statsConv = Number(callyzerStats?.conversations5MinPlus);
  const statsNotPick = Number(callyzerStats?.notPickupByClient);
  const syncedConversationCalls = hasCalls
    ? (callMetrics.conversations || 0)
    : ((Number.isFinite(statsConv) && statsConv > 0) ? statsConv : (callMetrics.conversations || 0));
  const syncedNotPickupCalls = hasCalls
    ? (callMetrics.notPickupByClient || 0)
    : ((Number.isFinite(statsNotPick) && statsNotPick > 0) ? statsNotPick : (callMetrics.notPickupByClient || 0));
  const syncedShortCalls = hasCalls ? (callMetrics.shortCalls || 0) : 0;
  const syncedConversationLeads = grouped.conversation_2min?.length ?? callMetrics.conversationLeads ?? 0;
  const syncedShortCallLeads = grouped.short_call?.length ?? callMetrics.shortCallLeads ?? 0;
  const syncedNotPickupLeads = grouped.not_pick?.length ?? callMetrics.notPickupLeads ?? 0;
  const moveLeadLocally = useCallback((leadId, targetStageId) => {
    setLocalOverrides((prev) => ({ ...prev, [String(leadId)]: targetStageId }));
  }, []);

  return {
    callScopedOnly,
    periodLabel,
    baseLeads,
    filteredLeads,
    grouped,
    callMetrics,
    periodMeetings,
    stageDisplayCounts,
    syncedConversationCalls,
    syncedConversationLeads,
    syncedShortCalls,
    syncedShortCallLeads,
    syncedNotPickupCalls,
    syncedNotPickupLeads,
    grouping,
    callsLoading,
    moveLeadLocally,
  };
}

/** Slice column cards for render — full count still shown in column header. */
export function visibleKanbanColumnLeads(columnLeads = [], expanded = false) {
  const list = Array.isArray(columnLeads) ? columnLeads : [];
  if (expanded || list.length <= MAX_KANBAN_COLUMN_CARDS) return list;
  return list.slice(0, MAX_KANBAN_COLUMN_CARDS);
}

export function hiddenKanbanColumnCount(columnLeads = [], expanded = false) {
  const list = Array.isArray(columnLeads) ? columnLeads : [];
  if (expanded || list.length <= MAX_KANBAN_COLUMN_CARDS) return 0;
  return list.length - MAX_KANBAN_COLUMN_CARDS;
}
