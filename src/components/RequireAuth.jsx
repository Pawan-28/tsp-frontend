import { useEffect, useRef } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import { getAuthToken, getStoredAuthUser, normalizeAuthUser } from "../lib/crmContext.js";
import PageLoader from "./PageLoader.jsx";

export default function RequireAuth({ roles }) {
  const { user: ctxUser, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const storedUser = getAuthToken() ? getStoredAuthUser() : null;
  const user = normalizeAuthUser(ctxUser || storedUser);

  // Track what we redirected to, to avoid double-redirecting in StrictMode
  const redirectedRef = useRef(null);

  // Redirect to login — use useEffect to avoid setState-during-render warning
  useEffect(() => {
    if (loading && !storedUser) return; // still bootstrapping
    if (!user) {
      const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
      const target = `/login?redirect=${redirect}`;
      if (redirectedRef.current !== target) {
        redirectedRef.current = target;
        navigate(target, { replace: true });
      }
      return;
    }
    if (user.mustChangePassword && location.pathname !== "/change-password") {
      navigate("/change-password", { replace: true });
      return;
    }
    if (roles?.length && !roles.includes(user.role)) {
      // Landing on "/" is the normal post-login hop for employees; any OTHER role-restricted URL
      // (e.g. an employee opening /settings) gets an explanation instead of a silent redirect.
      if (location.pathname !== "/") {
        toast.error("You don't have access to that page", { id: "route-no-access" });
      }
      navigate(user.role === "admin" ? "/" : "/employee", { replace: true });
    }
  }, [loading, storedUser, user, location.pathname, location.search, navigate, roles]);

  // Show loader while bootstrapping with no cached user
  if (loading && !storedUser) return <PageLoader />;

  // Show loader while user is null (redirect is in-flight via useEffect above)
  if (!user) return <PageLoader />;

  // Block rendering if password change is required
  if (user.mustChangePassword && location.pathname !== "/change-password") return <PageLoader />;

  // Block rendering if role doesn't match
  if (roles?.length && !roles.includes(user.role)) return <PageLoader />;

  return <Outlet />;
}
