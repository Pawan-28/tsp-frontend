import { useCallback, useEffect, useState } from "react";
import { apiGet } from "./api.js";

export const COMPETENCY_DIMENSIONS = [
  "Product Value Alignment",
  "Call Control",
  "Listening Skills",
  "KYC Questioning",
  "Objection Handling",
];

const EMPTY_COMPETENCY = Object.fromEntries(COMPETENCY_DIMENSIONS.map((d) => [d, 0]));

/** Average AI-scored call competency for the incentive radar chart — same data
 *  source for admin's Incentives page and the employee's own Performance tab. */
export function useEmployeeCompetencyScores(employeeId, { enabled = true, period = "month", month = null } = {}) {
  const [competency, setCompetency] = useState(EMPTY_COMPETENCY);
  const [callsScored, setCallsScored] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!enabled || !employeeId) return;
    if (!silent) setLoading(true);
    try {
      const query = month ? `month=${month}` : `period=${period}`;
      const res = await apiGet(`/api/team/employees/${employeeId}/competency-scores?${query}`, {
        skipCache: true,
        cacheTtl: 0,
      });
      setCompetency(res?.competency || EMPTY_COMPETENCY);
      setCallsScored(res?.callsScored || 0);
    } catch {
      setCompetency(EMPTY_COMPETENCY);
      setCallsScored(0);
    } finally {
      if (!silent) setLoading(false);
    }
  }, [employeeId, period, month, enabled]);

  useEffect(() => {
    load({ silent: false });
  }, [load]);

  return { competency, callsScored, loading, refresh: () => load({ silent: true }) };
}
