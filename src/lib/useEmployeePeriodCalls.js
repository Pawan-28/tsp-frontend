import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getCrmHeaders } from "./crmContext.js";
import { callFromApi } from "../data/employeeMock.js";
import { unwrapApiList } from "./leadSync.js";

/**
 * Period-scoped calls from DB (fast read). Skips blocking Callyzer sync on load.
 */
export function useEmployeePeriodCalls(employeeId, period = "month", leads = [], enabled = true) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  const load = useCallback(async () => {
    if (!enabled || !employeeId) {
      setCalls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet(
        `/api/v1/employee/${employeeId}/calls?period=${period}&sync=0&limit=5000`,
        { headers: getCrmHeaders("employee"), cacheTtl: 60_000 },
      );
      const items = unwrapApiList(res) || [];
      setCalls(items.map((c) => callFromApi(c, leadsRef.current)));
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [employeeId, period, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { calls, loading, refresh: load };
}
