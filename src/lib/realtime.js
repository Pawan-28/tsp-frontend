/** Live sync — fires callbacks when backend emits lead/dashboard events.
 *  Uses a soft dynamic import so the build succeeds even without socket.io-client. */
import { getStoredAuthUser, getStoredEmployee } from "./crmContext.js";

let lastLocalChangeAt = 0;
const LOCAL_CHANGE_GUARD_MS = 2500;

/** Call right after applying a local optimistic lead change — suppresses the
 *  next server-echoed refetch so it can't race the in-flight PATCH and revert it. */
export function markLocalLeadChange() {
  lastLocalChangeAt = Date.now();
}

// No-op stubs — realtime pushes are disabled for now.
// Socket.io can be wired back in when needed.
export function onLeadChanged(_handler) {
  return () => {};
}

export function onDashboardRefresh(_handler) {
  return () => {};
}
