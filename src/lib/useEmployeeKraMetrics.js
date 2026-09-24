import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";
import { computeLeadKraForPeriod } from "./kraPeriod.js";

/**
 * Shared KRA metrics for Team + Incentives — same sources as employee panel.
 * Supports period: day | week | month (optional month YYYY-MM for month view).
 */
export function useEmployeeKraMetrics(employeeId, options = {}) {
  const {
    enabled = true,
    period = "month",
    month = null,
  } = typeof options === "string" || options == null
    ? { enabled: true, period: "month", month: options || null }
    : options;

  const [metrics, setMetrics] = useState({
    calls5Min: 0,
    totalCalls: 0,
    pickupRate: 0,
    avgDurationSec: 0,
    qualified: 0,
    booked: 0,
    showedUp: 0,
    meetings: 0,
    converted: 0,
    totalLeads: 0,
    cash: 0,
    periodLabel: "",
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled || !employeeId) return;
    if (!silent) setLoading(true);

    try {
      const params = new URLSearchParams({ employee_id: String(employeeId) });

      let callyzerQuery = "";
      if (period === "day") callyzerQuery = "period=today";
      else if (period === "week") callyzerQuery = "period=week";
      else if (month) callyzerQuery = `month=${month}`;
      else callyzerQuery = "period=month";

      let cashQuery = "";
      if (period === "day") cashQuery = "period=today";
      else if (period === "week") cashQuery = "period=week";
      else if (month) cashQuery = `month=${month}`;
      else cashQuery = "period=month";

      const [leadsRes, callyzerRes, cashRes] = await Promise.all([
        apiGet(`/api/team/employees/leads?${params.toString()}`, {
          skipCache: true,
          cacheTtl: 0,
        }).catch(() => null),
        apiGet(
          `/api/team/employees/${employeeId}/callyzer-stats?${callyzerQuery}`,
          { skipCache: true, cacheTtl: 0 },
        ).catch(() => null),
        apiGet(`/api/incentives/employee/${employeeId}/cash-summary?${cashQuery}`, {
          skipCache: true,
          cacheTtl: 0,
        }).catch(() => null),
      ]);

      const leads = Array.isArray(leadsRes?.leads) ? leadsRes.leads : [];
      const leadKra = computeLeadKraForPeriod(leads, period, { month });
      const cStats = callyzerRes?.stats || {};

      setMetrics({
        calls5Min: cStats.conversations5MinPlus ?? cStats.conversations5minPlus ?? 0,
        totalCalls: cStats.totalCalls ?? 0,
        pickupRate: cStats.pickupRate ?? 0,
        avgDurationSec: cStats.avgDurationSec ?? 0,
        qualified: leadKra.qualified,
        booked: leadKra.meetings,
        showedUp: 0,
        meetings: leadKra.meetings,
        converted: leads.filter((l) => String(l.status || "").toLowerCase() === "converted").length,
        totalLeads: leads.length,
        cash: cashRes?.cashCollected ?? 0,
        periodLabel: callyzerRes?.label || cashRes?.label || "",
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId, period, month, enabled]);

  useEffect(() => {
    load({ silent: false });
  }, [load]);

  return { metrics, loading, refresh: () => load({ silent: true }) };
}
