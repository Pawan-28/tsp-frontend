import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet } from "./api.js";
import { getAdminCrmHeaders } from "./crmContext.js";
import { callFromApi } from "../data/employeeMock.js";
import { unwrapApiList } from "./leadSync.js";

/** Tenant-wide period calls for admin pipeline (DB read, no blocking sync). */
export function useTenantPeriodCalls(period = "month", leads = [], enabled = true) {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(false);
  const leadsRef = useRef(leads);
  leadsRef.current = leads;

  const load = useCallback(async () => {
    if (!enabled) {
      setCalls([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiGet(
        `/api/v1/calls?period=${period}&limit=10000`,
        { headers: getAdminCrmHeaders(), cacheTtl: 60_000 },
      );
      const items = unwrapApiList(res) || [];
      setCalls(items.map((c) => callFromApi(c, leadsRef.current)));
    } catch {
      setCalls([]);
    } finally {
      setLoading(false);
    }
  }, [period, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { calls, loading, refresh: load };
}
