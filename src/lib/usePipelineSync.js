import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders, getCrmHeaders } from "./crmContext.js";
import { mapCallsFromApiLite } from "./callFromApiLite.js";
import { apiLeadToPipeline } from "./leadSync.js";
import { getAssignmentState, getLeadEmployeeName } from "./leadAssignment.js";
import { filterCallsForPeriod } from "./periodFilter.js";
import { countPipelineCallMetrics } from "./leadKanban.js";

const masterCache = new Map();
const SYNC_COOLDOWN_MS = 180_000;
const lastFullSyncAt = new Map();
const backgroundSyncStarted = new Set();
const MASTER_PERIOD = "month";

const emptyBoard = () => ({
  stats: null,
  calls: [],
  callsRaw: [],
  leads: [],
  meetings: [],
  syncedAt: null,
});

function scopeKey(scope, employeeId) {
  return scope === "employee" ? `emp:${employeeId}` : "admin";
}

function mapAdminLead(lead) {
  if (!lead) return null;
  const mapped = apiLeadToPipeline(lead);
  if (!mapped) return null;
  const assignmentState = getAssignmentState();
  const employeeName = getLeadEmployeeName(lead, assignmentState);
  const resolvedOwner = employeeName || mapped.owner || mapped.assignee || mapped.employeeName || (typeof lead.assignedTo === "object" ? lead.assignedTo?.name : "") || "—";
  return { ...mapped, owner: resolvedOwner, assignee: resolvedOwner, employeeName: resolvedOwner };
}

function mapTenantMeeting(row) {
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.leadId ?? row.lead_id,
    lead: row.leadName ?? row.lead_name ?? row.title,
    company: row.companyName ?? row.company_name,
    status: row.status,
    scheduledAt: row.scheduledAt ?? row.scheduled_at,
    date: row.scheduledAt ?? row.scheduled_at,
    outcome: row.outcome,
  };
}

function statsFromCalls(calls = []) {
  const m = countPipelineCallMetrics(calls);
  return {
    totalCalls: m.totalCalls,
    conversations5MinPlus: m.conversations,
    notPickupByClient: m.notPickupByClient,
    missedCalls: m.missed,
    connectedCalls: m.connected,
  };
}

function normalizeMasterPayload(raw, { mapLeads = true, attachLeads = [] } = {}) {
  const data = raw?.data ?? raw ?? {};
  const apiLeads = mapLeads
    ? (data.leads || []).map(mapAdminLead).filter(Boolean)
    : (data.leads || []);
  const leadsForMapping = attachLeads.length ? attachLeads : apiLeads;
  const callsRaw = data.calls || [];
  const calls = mapCallsFromApiLite(callsRaw, leadsForMapping);
  const meetings = (data.meetings || []).map(mapTenantMeeting).filter(Boolean);
  return {
    stats: data.stats ?? statsFromCalls(calls),
    calls,
    callsRaw,
    leads: apiLeads,
    meetings,
    syncedAt: raw?.syncedAt || data.syncedAt || null,
  };
}

function boardSignature(board) {
  const c = board?.calls || [];
  const leads = board?.leads || [];
  const leadParts = [];
  for (let i = 0; i < leads.length; i++) {
    const l = leads[i];
    if (l && l.id) {
      leadParts.push(`${l.id}:${l.pipelineStage || l.stage || ""}:${l.stageOverride ? 1 : 0}`);
    }
  }
  return `${c.length}:${c[0]?.id ?? ""}:${c[c.length - 1]?.id ?? ""}:${board?.syncedAt ?? ""}:${leadParts.join(";")}`;
}

function sliceBoardForPeriod(master, period) {
  if (!master) return emptyBoard();
  const p = String(period || "month").toLowerCase();
  if (p === "month" || p === "all") {
    return {
      ...master,
      stats: master.stats ?? statsFromCalls(master.calls),
    };
  }
  const calls = filterCallsForPeriod(master.calls, p);
  return {
    ...master,
    calls,
    stats: statsFromCalls(calls),
  };
}

/**
 * Pipeline data: one DB read (month), instant Today/Week/Month via client filter.
 * Callyzer sync runs once in background — never blocks period toggles.
 */
export function usePipelineSync({
  scope = "admin",
  employeeId = null,
  period = "month",
  enabled = true,
  mapLeads = true,
  attachLeads = [],
}) {
  const sk = scopeKey(scope, employeeId);
  const cached = masterCache.get(sk);
  const attachRef = useRef(attachLeads);
  attachRef.current = attachLeads;

  const [master, setMaster] = useState(() => cached?.board ?? emptyBoard());
  const [loading, setLoading] = useState(!cached);
  const [syncing, setSyncing] = useState(false);
  const reqIdRef = useRef(0);

  const loadMaster = useCallback(async ({ sync = false, silent = false, skipCache = sync } = {}) => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (scope === "employee" && !employeeId) {
      setLoading(false);
      return;
    }

    const hit = masterCache.get(sk);
    if (!silent && !hit) setLoading(true);
    if (sync) setSyncing(true);

    const reqId = ++reqIdRef.current;
    const syncFlag = sync ? 1 : 0;
    try {
      const path = scope === "employee"
        ? `/api/v1/employee/${employeeId}/pipeline/board?period=${MASTER_PERIOD}&limit=5000&sync=${syncFlag}`
        : `/api/v1/pipeline/board?period=${MASTER_PERIOD}&limit=5000&sync=${syncFlag}`;
      const headers = scope === "employee"
        ? getCrmHeaders("employee")
        : getAdminCrmHeaders();

      const res = await apiGet(path, {
        headers,
        skipCache,
        cacheTtl: skipCache ? 0 : 60_000,
      });
      if (reqId !== reqIdRef.current) return;

      const normalized = normalizeMasterPayload(res, {
        mapLeads,
        attachLeads: attachRef.current,
      });
      const prevBoard = masterCache.get(sk)?.board;
      const unchanged = silent && boardSignature(prevBoard) === boardSignature(normalized);
      if (!unchanged) {
        masterCache.set(sk, { board: normalized, ts: Date.now() });
        setMaster(normalized);
      }
      if (sync) lastFullSyncAt.set(sk, Date.now());
    } catch {
      if (reqId !== reqIdRef.current) return;
      if (!hit) setMaster(emptyBoard());
    } finally {
      if (reqId === reqIdRef.current) {
        setLoading(false);
        if (sync) setSyncing(false);
      }
    }
  }, [enabled, scope, employeeId, sk, mapLeads]);

  // Load month from DB once per scope; background Callyzer sync never blocks toggles.
  useEffect(() => {
    if (!enabled) return undefined;
    if (scope === "employee" && !employeeId) return undefined;

    const hit = masterCache.get(sk);
    if (hit) {
      setMaster(hit.board);
      setLoading(false);
    }

    loadMaster({ silent: Boolean(hit), sync: false });

    if (!backgroundSyncStarted.has(sk)) {
      backgroundSyncStarted.add(sk);
      const age = Date.now() - (lastFullSyncAt.get(sk) || 0);
      const delay = age >= SYNC_COOLDOWN_MS ? 5000 : 3000;
      const timer = window.setTimeout(() => {
        if (document.hidden) return;
        loadMaster({ silent: true, sync: true });
      }, delay);
      return () => window.clearTimeout(timer);
    }

    const age = Date.now() - (lastFullSyncAt.get(sk) || 0);
    if (age >= SYNC_COOLDOWN_MS) {
      const timer = window.setTimeout(() => {
        if (document.hidden) return;
        loadMaster({ silent: true, sync: true });
      }, 5000);
      return () => window.clearTimeout(timer);
    }

    return undefined;
  }, [enabled, scope, employeeId, sk, loadMaster]);

  const board = useMemo(
    () => sliceBoardForPeriod(master, period),
    [master, period],
  );

  const remapCallsForLeads = useCallback((leads) => {
    setMaster((prev) => {
      const remapped = {
        ...prev,
        calls: mapCallsFromApiLite(prev.callsRaw || [], leads),
      };
      remapped.stats = statsFromCalls(remapped.calls);
      masterCache.set(sk, { board: remapped, ts: Date.now() });
      return remapped;
    });
  }, [sk]);

  return {
    ...board,
    loading,
    refreshing: syncing,
    syncing,
    refresh: () => loadMaster({ silent: true, sync: true }),
    // Fresh leads without the heavyweight Callyzer resync — for realtime nudges.
    refreshLeadsOnly: () => loadMaster({ silent: true, sync: false, skipCache: true }),
    remapCallsForLeads,
  };
}

export function invalidatePipelineBoardCache(scope = null) {
  if (!scope) {
    masterCache.clear();
    lastFullSyncAt.clear();
    backgroundSyncStarted.clear();
    return;
  }
  masterCache.delete(scope);
  lastFullSyncAt.delete(scope);
  backgroundSyncStarted.delete(scope);
}
