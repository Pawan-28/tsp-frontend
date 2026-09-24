import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost, apiPut, invalidateCache } from "../lib/api.js";
import {
  clearAuthStorage,
  clearEmployeeStorage,
  getAuthToken,
  getStoredAuthUser,
  normalizeAuthUser,
  storeAuthToken,
  storeAuthUser,
  storeEmployee,
} from "../lib/crmContext.js";

const AuthContext = createContext(null);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isLoginRateLimited(err) {
  const msg = String(err?.message || "").toLowerCase();
  return err?.status === 429 || msg.includes("429") || msg.includes("too many");
}

async function postLoginWithBackoff(loginId, password) {
  const isLocal = typeof window !== "undefined"
    && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  // Spread burst logins from the same office network (shared public IP).
  if (!isLocal) {
    await sleep(Math.floor(Math.random() * 1500));
  }

  const maxAttempts = isLocal ? 2 : 6;
  let lastErr;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await apiPost("/api/auth/login", { loginId, password }, {
        skipCache: true,
        skipAuth429Retry: true,
        timeoutMs: 25000,
      });
    } catch (err) {
      lastErr = err;
      if (!isLoginRateLimited(err) || attempt >= maxAttempts - 1) throw err;
      await sleep(900 + Math.floor(Math.random() * 1100) + attempt * 1200);
    }
  }

  throw lastErr;
}

function syncEmployeeProfileFromAuth(user) {
  if (user?.role === "employee" && user.employeeId) {
    storeEmployee({
      id: user.employeeId,
      name: user.name || "Employee",
      email: user.email || "",
      role: user.employeeRole || "Sales Executive",
      department: user.department || "Sales",
    });
    return;
  }
  clearEmployeeStorage();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredAuthUser());
  const [loading, setLoading] = useState(true);

  const bootstrap = useCallback(async () => {
    const token = getAuthToken();
    const storedUser = getStoredAuthUser();
    const onLoginPage = typeof window !== "undefined" && window.location.pathname === "/login";

    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    if (storedUser) {
      setUser(storedUser);
      syncEmployeeProfileFromAuth(storedUser);
    }

    // On the login screen, skip /me until after sign-in to avoid extra API calls.
    if (onLoginPage) {
      setLoading(false);
      return;
    }

    try {
      const data = await apiGet("/api/auth/me", { skipCache: true, cacheTtl: 0, timeoutMs: 12000 });
      if (data?.user) {
        const nextUser = normalizeAuthUser(data.user);
        if (
          storedUser?.role === "employee"
          && storedUser.employeeId != null
          && nextUser.employeeId != null
          && Number(storedUser.employeeId) !== Number(nextUser.employeeId)
        ) {
          clearEmployeeStorage();
          invalidateCache("/api/v1/employee");
        }
        setUser(nextUser);
        storeAuthUser(nextUser);
        syncEmployeeProfileFromAuth(nextUser);
      }
    } catch {
      // Keep the stored session — /me can fail briefly during deploy or cold start.
      startTransition(() => {
        if (storedUser) {
          setUser(storedUser);
        } else {
          clearAuthStorage();
          setUser(null);
        }
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = useCallback(async (loginId, password) => {
    clearEmployeeStorage();
    const data = await postLoginWithBackoff(loginId, password);
    if (!data?.token || !data?.user) {
      throw new Error(data?.message || "Login failed");
    }
    const nextUser = normalizeAuthUser(data.user);
    storeAuthToken(data.token);
    storeAuthUser(nextUser);
    syncEmployeeProfileFromAuth(nextUser);
    setUser(nextUser);
    setLoading(false);
    invalidateCache();
    return nextUser;
  }, []);

  const logout = useCallback(() => {
    clearAuthStorage();
    clearEmployeeStorage();
    setUser(null);
    invalidateCache();
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await apiPost("/api/auth/change-password", { currentPassword, newPassword });
    if (!data?.success) {
      throw new Error(data?.message || "Could not update password");
    }
    if (data?.user) {
      const nextUser = normalizeAuthUser(data.user);
      setUser(nextUser);
      storeAuthUser(nextUser);
      syncEmployeeProfileFromAuth(nextUser);
    }
    return data;
  }, []);

  // Profile photo lives on the auth identity (users table) — same field for admin
  // and employee, returned by /login and /me, so it follows the account to any device.
  const updateAvatar = useCallback(async (avatarUrl) => {
    const data = await apiPut("/api/auth/me/avatar", { avatarUrl });
    if (!data?.success) {
      throw new Error(data?.message || "Could not save photo");
    }
    if (data?.user) {
      const nextUser = normalizeAuthUser(data.user);
      setUser(nextUser);
      storeAuthUser(nextUser);
      syncEmployeeProfileFromAuth(nextUser);
    }
    return data;
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout, changePassword, refreshUser: bootstrap, updateAvatar }),
    [user, loading, login, logout, changePassword, bootstrap, updateAvatar],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
