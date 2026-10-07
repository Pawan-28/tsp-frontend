import { useState, useEffect, useRef, useCallback, startTransition } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Search, Bell, History, Plus, ChevronDown,
  FileText, Users,
  User, Briefcase, X, CheckCheck, Menu, Settings, LogOut,
} from "lucide-react";
import { useAdmin } from "../context/AdminContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet, apiPost } from "../lib/api.js";
import { queryKeys } from "../lib/queryKeys.js";
import DateRangeFilter from "./DateRangeFilter.jsx";
import PipelineDateFilter from "./PipelineDateFilter.jsx";
import Avatar from "./Avatar.jsx";
import { useDismissable } from "../hooks/useDismissable.js";
import { useActiveHeaderPopover, closeHeaderPopovers } from "../hooks/useHeaderPopover.js";
import { formatActivityDate } from "../lib/formatActivityDate.js";
import { ADMIN_QUICK_ACTIONS } from "../lib/adminNav.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../lib/segmentPills.js";

const titles = {
  "/":           { title: "Dashboard",             sub: "Overview of your CRM activity",            cta: "Quick Action" },
  "/sop":        { title: "SOP Management",        sub: "Standardize operations across teams",       cta: "Add SOP"      },
  "/sales":      { title: "Sales Funnel",          sub: "Track every deal across your pipeline",     cta: "Add Deal"     },
  "/team":       { title: "Team Management",       sub: "Visibility into your people and performance", cta: "Add Member" },
  "/incentives": { title: "Incentive Calculations",sub: "Payouts, slabs and team performance",       cta: "Calculate"    },
  "/settings":   { title: "Settings",              sub: "Workspace preferences",                     cta: "Save"         },
  "/admin":      { title: "Admin Profile",         sub: "Your account, access & sign-in",            cta: "Save"         },
  "/leads":      { title: "Leads",                 sub: "Manage and track incoming leads",             cta: "Add Lead"     },
  "/pipeline":   { title: "Pipeline",              sub: "Real-time overview of your sales pipeline",   cta: "Add Lead"     },
  "/sources":    { title: "Source",                sub: "Leads grouped by channel — Meta, Google, Website & more", cta: null },
  "/forms":      { title: "Source",                sub: "Leads grouped by channel — Meta, Google, Website & more", cta: null },
  "/services":   { title: "Services Catalog",      sub: "Productized offerings & revenue lines",         cta: "Add Service"  },
  "/reports":    { title: "Reports",               sub: "Analytics and performance exports",           cta: "Export"       },
};

const CANONICAL_SERVICES = [
  "All Services",
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

function resolvePageMeta(pathname) {
  if (/^\/services\/[^/]+\/edit$/.test(pathname)) {
    return { title: "Edit Service", sub: "Update catalog details, pricing, and features" };
  }
  const serviceDetailMatch = pathname.match(/^\/services\/([^/]+)$/);
  if (serviceDetailMatch) {
    return {
      title: "Service Detail",
      sub: "Performance, tiers, and delivery",
    };
  }
  if (pathname.startsWith("/sources/") || pathname.startsWith("/forms/")) {
    return { title: "Source Leads", sub: "Leads from this marketing channel", cta: null };
  }
  const base = titles[pathname] ?? titles["/"];
  if (pathname === "/sources" || pathname === "/forms") {
    return base;
  }
  if (pathname === "/services") {
    return { ...base, ctaTo: "/services?action=addService" };
  }
  if (pathname === "/pipeline") {
    return { ...base, ctaTo: null };
  }
  if (pathname === "/sop") {
    return { ...base, ctaTo: "/sop?action=addSOP" };
  }
  return base;
}

const HIDE_DATE_RANGE_ROUTES = ["/incentives", "/settings", "/admin"];

function hideDateRange(pathname) {
  return HIDE_DATE_RANGE_ROUTES.includes(pathname)
    || pathname.startsWith("/sources")
    || pathname.startsWith("/forms")
    || pathname.startsWith("/services")
    || pathname.startsWith("/sop")
    || pathname === "/pipeline"
    || pathname === "/leads";
}

const quickActions = ADMIN_QUICK_ACTIONS;

const NOTIF_SEEN_KEY = "crm_notif_last_seen";

function readNotifSeen() {
  try {
    return Number(localStorage.getItem(NOTIF_SEEN_KEY)) || 0;
  } catch {
    return 0;
  }
}

function isMacPlatform() {
  if (typeof navigator === "undefined") return false;
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || "";
  return /mac|iphone|ipad|ipod/i.test(p);
}

function ts(value) {
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? 0 : t;
}

const TYPE_ICON = {
  employee: { Icon: Users,     bg: "#fff0f6", color: "#e11d48" },
  lead:     { Icon: Briefcase, bg: "#eff6ff", color: "#2563eb" },
  sop:      { Icon: FileText,  bg: "#faf5ff", color: "#9333ea" },
};

export default function Topbar({ onMenu }) {
  const { pathname } = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const isPipelinePage = pathname === "/pipeline";
  const isLeadsPage = pathname === "/leads" || pathname === "/pipeline" || pathname === "/sop";
  const isDenseToolbar = isLeadsPage;
  const showDateRange = !hideDateRange(pathname);
  const navigate     = useNavigate();
  const { admin, selectedService, setSelectedService, servicesList, selectedEmployee, setSelectedEmployee, employeesList } = useAdmin();
  const { logout, user }   = useAuth();
  const meta         = resolvePageMeta(pathname);
  const pipelinePeriod = String(searchParams.get("period") || "month").toLowerCase();

  const setPipelinePeriod = (nextPeriod) => {
    closeHeaderPopovers();
    const params = new URLSearchParams(searchParams);
    params.set("period", String(nextPeriod).toLowerCase());
    if (String(nextPeriod).toLowerCase() !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    startTransition(() => {
      setSearchParams(params, { replace: true });
    });
  };

  const setPipelineCustomRange = (from, to) => {
    const params = new URLSearchParams(searchParams);
    params.set("period", "custom");
    params.set("from", from);
    params.set("to", to);
    startTransition(() => {
      setSearchParams(params, { replace: true });
    });
  };

  // Global "one header popover at a time" slot (activity | notif | quick | user | custom date range).
  const [openMenu, setOpenMenu] = useActiveHeaderPopover();
  const [searchQ,        setSearchQ]        = useState("");
  const [searchResults,  setSearchResults]  = useState([]);
  const [searching,      setSearching]      = useState(false);

  const searchRef  = useRef(null);
  const mobileSearchRef = useRef(null);
  const desktopInputRef = useRef(null);
  const mobileInputRef = useRef(null);
  const quickRef = useRef(null);
  const userRef = useRef(null);
  const [isMac] = useState(isMacPlatform);
  const closeMenus = useCallback(() => setOpenMenu(null), [setOpenMenu]);
  const debounceRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: activityData } = useQuery({
    queryKey: queryKeys.activities,
    queryFn: () => apiGet("/api/activity"),
    staleTime: 2 * 60 * 1000,
  });

  const { data: notifData, refetch: refetchNotifications } = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: () => apiGet("/api/activity/notifications"),
    staleTime: 2 * 60 * 1000,
  });

  const activities = activityData?.success ? activityData.activities : [];
  const notifications = notifData?.success ? notifData.notifications : [];
  const unreadCount = notifData?.success ? notifData.unreadCount : 0;

  // Unread dot: anything newer than the "last seen" timestamp (cleared when the panel opens).
  const [notifLastSeen, setNotifLastSeen] = useState(readNotifSeen);
  const [notifBaseline, setNotifBaseline] = useState(null);
  const newNotifCount = notifications.filter((n) => ts(n.created_at) > notifLastSeen).length;
  const hasUnreadDot = unreadCount > 0 || newNotifCount > 0;

  const openNotifPanel = () => {
    setNotifBaseline(notifLastSeen);
    const now = Date.now();
    try { localStorage.setItem(NOTIF_SEEN_KEY, String(now)); } catch { /* ignore */ }
    setNotifLastSeen(now);
    refreshNotifications();
  };

  // ── search with debounce ────────────────────────────────
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      let localSops = [];
      try {
        const raw = localStorage.getItem("admin_dashboard_sops");
        if (raw) {
          const list = JSON.parse(raw);
          const qLow = searchQ.toLowerCase();
          localSops = list
            .filter((s) => s.title?.toLowerCase().includes(qLow) || s.description?.toLowerCase().includes(qLow))
            .map((s) => ({
              id: s.id,
              name: s.title,
              sub: s.description || "",
              status: s.status || "",
              type: "sop",
            }));
        }
      } catch (e) {
        console.error("Local search parse error:", e);
      }

      try {
        const data = await apiGet(
          `/api/activity/search?q=${encodeURIComponent(searchQ)}`,
          { cacheTtl: 30 * 1000 },
        );
        if (data.success) {
          const combined = [...(data.results || [])];
          localSops.forEach((ls) => {
            if (!combined.some((c) => c.type === "sop" && String(c.id) === String(ls.id))) {
              combined.push(ls);
            }
          });
          setSearchResults(combined);
        } else {
          setSearchResults(localSops);
        }
      } catch (_) {
        setSearchResults(localSops);
      }
      finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [searchQ]);

  // ── mark all notifications read ─────────────────────────
  const markAllRead = async () => {
    try {
      await apiPost("/api/activity/notifications/read", {});
      queryClient.setQueryData(queryKeys.notifications, (old) =>
        old ? { ...old, unreadCount: 0, notifications: (old.notifications || []).map((x) => ({ ...x, is_read: true })) } : old,
      );
    } catch (_) {}
  };

  const refreshActivity = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.activities });
  };

  const refreshNotifications = () => {
    refetchNotifications();
  };

  const handleAction = (action) => {
    setOpenMenu(null);
    navigate(`${action.to}${action.search ?? ""}`);
  };

  const handleUserMenu = (item) => {
    setOpenMenu(null);
    if (item === "Admin Profile") navigate("/admin");
    else if (item === "Workspace Settings") navigate("/settings");
    else if (item === "Sign out") {
      logout();
      navigate("/login", { replace: true });
    }
  };

  const userMenuItems = ["Admin Profile", "Workspace Settings", "Sign out"];

  // close search on outside click
  useEffect(() => {
    const handler = (e) => {
      const inDesktop = searchRef.current?.contains(e.target);
      const inMobile = mobileSearchRef.current?.contains(e.target);
      if (inDesktop || inMobile) return;
      setSearchQ("");
      setSearchResults([]);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Navigating to another page closes every header popover.
  useEffect(() => {
    closeHeaderPopovers();
  }, [pathname]);

  // Ctrl+K / Cmd+K focuses the search box that is actually visible (desktop vs mobile).
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && String(e.key).toLowerCase() === "k") {
        e.preventDefault();
        const candidates = [desktopInputRef.current, mobileInputRef.current];
        const target = candidates.find((el) => el && el.offsetParent !== null) || candidates.find(Boolean);
        if (target) {
          closeHeaderPopovers();
          target.focus();
          target.select?.();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Dismiss handling for the header menus (outside click + Esc). Notification / activity panels
  // do their own via <Popover>.
  useDismissable({ open: openMenu === "quick", onDismiss: closeMenus, refs: [quickRef] });
  useDismissable({ open: openMenu === "user", onDismiss: closeMenus, refs: [userRef] });

  const clearSearch = () => { setSearchQ(""); setSearchResults([]); };
  const onSearchKeyDown = (e) => {
    if (e.key === "Escape") {
      clearSearch();
      e.currentTarget.blur();
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] shadow-sm">
      <div
        className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 lg:px-6 xl:px-8 py-2 min-w-0 min-h-[52px] md:h-16"
      >

        <button
          onClick={onMenu}
          className="w-9 h-9 -ml-1 rounded-xl hover:bg-[#FFF5F8] text-[#DC143C] lg:hidden transition-all duration-200 shrink-0 grid place-items-center"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Mobile: search in header row */}
        <div className="relative flex-1 min-w-0 md:hidden" ref={mobileSearchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#DC143C] pointer-events-none" />
          <input
            ref={mobileInputRef}
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setOpenMenu(null); }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search deals, people, SOPs…"
            aria-label="Search"
            className="w-full h-10 pl-9 pr-9 py-2 rounded-xl bg-[#F5F7FA] border border-[#E5E7EB]
              text-[#111827] text-sm placeholder:text-[#9CA3AF]
              focus:outline-none focus:ring-2 focus:ring-[#DC143C]/20 focus:border-[#DC143C]/30 transition"
          />
          {searchQ && (
            <button
              type="button"
              onClick={() => { setSearchQ(""); setSearchResults([]); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-[#9CA3AF] hover:text-[#DC143C] hover:bg-[#FFF5F8]"
              aria-label="Clear search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          {(searchQ.length >= 2) && (
            <SearchDropdown
              searching={searching}
              searchQ={searchQ}
              searchResults={searchResults}
              navigate={navigate}
              setSearchQ={setSearchQ}
              setSearchResults={setSearchResults}
            />
          )}
        </div>

        {/* Desktop: page title */}
        <div className="hidden md:flex flex-col justify-center shrink-0 min-w-0 max-w-[132px] lg:max-w-[180px] xl:max-w-[240px]">
          <h1 className="font-display font-semibold tracking-tight leading-tight text-[#111827] truncate text-base lg:text-lg" title={meta.title}>
            {meta.title}
          </h1>
          <p className="hidden xl:block text-[10px] text-[#6B7280] leading-tight truncate" title={meta.sub}>
            {meta.sub}
          </p>
        </div>

        {/* Desktop / tablet search */}
        <div
          className="relative hidden md:block shrink min-w-[120px] w-[180px] lg:w-[240px] xl:w-[320px] mx-1 lg:mx-2"
          ref={searchRef}
        >
          <Search className="absolute left-3 lg:left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#DC143C]" />
          <input
            ref={desktopInputRef}
            value={searchQ}
            onChange={(e) => { setSearchQ(e.target.value); setOpenMenu(null); }}
            onKeyDown={onSearchKeyDown}
            placeholder="Search deals, people, SOPs…"
            aria-label="Search"
            aria-keyshortcuts={isMac ? "Meta+K" : "Control+K"}
            className="w-full h-10 py-2 pl-9 lg:pl-11 pr-3 lg:pr-16 rounded-xl bg-[#F5F7FA] border border-[#E5E7EB]
              text-[#111827] text-sm placeholder:text-muted-foreground
              focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition"
          />
          <kbd className="hidden lg:flex absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#DC143C] px-2 py-0.5 rounded-md pointer-events-none">
            {isMac ? "\u2318K" : "Ctrl K"}
          </kbd>
          {(searchQ.length >= 2) && (
            <SearchDropdown
              searching={searching}
              searchQ={searchQ}
              searchResults={searchResults}
              navigate={navigate}
              setSearchQ={setSearchQ}
              setSearchResults={setSearchResults}
            />
          )}
        </div>

        {showDateRange && (
          <div className="hidden md:flex shrink-0">
            <DateRangeFilter />
          </div>
        )}

        <div className="hidden md:block flex-grow min-w-0" />

        {/* Right actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 justify-end shrink-0 min-w-0">

          {isPipelinePage && (
            <div className="hidden md:inline-flex items-center shrink-0">
              <PipelineDateFilter
                currentPeriod={pipelinePeriod}
                fromDate={searchParams.get("from") || ""}
                toDate={searchParams.get("to") || ""}
                onSelect={setPipelinePeriod}
                onApplyCustom={setPipelineCustomRange}
              />
            </div>
          )}



          {meta.ctaTo && (
            <button
              type="button"
              onClick={() => navigate(meta.ctaTo)}
              className="hidden sm:inline-flex items-center gap-1 bg-rose-700 hover:bg-rose-800 text-white
                h-9 md:h-10 px-3 md:px-4 rounded-full text-[11px] md:text-xs font-bold shadow-md transition shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden lg:inline">{meta.cta}</span>
              <span className="lg:hidden">Add</span>
            </button>
          )}

          {/* Quick Actions — tablet+ (phones: FAB + hamburger drawer) */}
          <div ref={quickRef} className="relative hidden md:inline-flex w-auto shrink-0">
            <button
              type="button"
              aria-expanded={openMenu === "quick"}
              onClick={() => setOpenMenu(openMenu === "quick" ? null : "quick")}
              className="inline-flex items-center gap-1 bg-primary text-primary-foreground
                h-9 md:h-10 px-2.5 md:px-3 rounded-xl text-[11px] md:text-xs font-medium hover:bg-primary/90 transition shrink-0"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="hidden xl:inline">Quick Actions</span>
              <span className="hidden lg:inline xl:hidden">Actions</span>
              <ChevronDown className="w-3 h-3 shrink-0" />
            </button>
            {openMenu === "quick" && (
              <div className="absolute right-0 top-full mt-2 popover-responsive bg-white rounded-2xl
                border border-[#FFD6E5] shadow-[0_12px_40px_rgba(220,20,60,0.12)] z-50">
                <div className="p-1 space-y-0.5">
                  {quickActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <button key={action.label} type="button" onClick={() => handleAction(action)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                          text-xs md:text-sm text-[#111827] hover:bg-[#FFF0F5] transition">
                        <Icon className="w-4 h-4 text-[#DC143C] shrink-0" />
                        <span className="text-left font-semibold text-[#111827]">{action.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Activity / History */}
          <Popover
            open={openMenu === "activity"}
            onOpen={() => { setOpenMenu("activity"); refreshActivity(); }}
            onClose={closeMenus}
            label="Recent activity"
            icon={<History className="w-[18px] h-[18px] text-[#DC143C]" />}
          >
            <div className="w-full sm:w-80 p-4 max-w-[calc(100vw-1.5rem)]">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-[#DC143C]">Recent Activity</p>
                {activities.length > 0 && (
                  <span
                    className="text-[10px] text-[#9f1239] bg-[#fff0f6] px-2 py-0.5 rounded-full border border-[#fecdd3]"
                    title="Most recent events"
                  >
                    Latest {activities.length}
                  </span>
                )}
              </div>
              <div className="space-y-1 max-h-72 overflow-y-auto">
                {activities.length === 0 ? (
                  <p className="text-xs text-center text-[#be123c] py-4">No activity yet</p>
                ) : activities.map((a) => (
                  <div key={a.id}
                    className="flex items-start gap-3 text-xs p-2 rounded-xl hover:bg-[#FFF5F8] transition">
                    <div style={{
                      width: 7, height: 7, borderRadius: "50%",
                      background: a.entity === "lead" ? "#2563eb" : "#e11d48",
                      marginTop: 5, flexShrink: 0,
                    }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[#111827] font-medium leading-tight truncate">{a.action}</p>
                      <p className="text-[#9CA3AF] mt-0.5 text-[10px]">
                        {a.user_name} · {formatActivityDate(a.created_at)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Popover>

          {/* Notifications */}
          <Popover
            open={openMenu === "notif"}
            onOpen={() => { setOpenMenu("notif"); openNotifPanel(); }}
            onClose={() => { setNotifBaseline(null); closeMenus(); }}
            label="Notifications"
            icon={<Bell className="w-[18px] h-[18px] text-[#DC143C]" />}
            badge={unreadCount > 0}
            badgeCount={unreadCount}
            dot={unreadCount === 0 && newNotifCount > 0}
          >
            <div className="w-full sm:w-80 max-w-[calc(100vw-1.5rem)]">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <p className="text-sm font-semibold text-[#DC143C]">Notifications</p>
                {unreadCount > 0 && (
                  <button onClick={markAllRead}
                    className="flex items-center gap-1 text-[10px] text-[#be123c] hover:text-[#e11d48] transition">
                    <CheckCheck style={{ width: 12, height: 12 }} />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto px-2 pb-2">
                {notifications.length === 0 ? (
                  <p className="text-xs text-center text-[#be123c] py-6">No notifications</p>
                ) : notifications.map((n) => {
                  const isNew = !n.is_read || ts(n.created_at) > (notifBaseline ?? notifLastSeen);
                  return (
                    <div key={n.id}
                      className="p-3 rounded-xl hover:bg-[#FFF5F8] transition cursor-pointer"
                      style={{ opacity: isNew ? 1 : 0.6 }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-semibold text-[#111827]">{n.title}</p>
                        {isNew && (
                          <span className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0" aria-label="Unread" />
                        )}
                      </div>
                      {n.body && <p className="text-[11px] text-[#6B7280] mt-1 leading-snug">{n.body}</p>}
                      <p className="text-[10px] text-[#9CA3AF] mt-1">{formatActivityDate(n.created_at)}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </Popover>

          {/* User */}
          <div ref={userRef} className="relative shrink-0">
            <button
              type="button"
              aria-expanded={openMenu === "user"}
              onClick={() => setOpenMenu(openMenu === "user" ? null : "user")}
              className="relative flex items-center justify-center gap-1.5 sm:gap-2 w-9 h-9 sm:w-auto sm:h-auto p-0 sm:pl-1 sm:pr-3 sm:py-1 rounded-full sm:rounded-xl shrink-0
                border border-[#E5E7EB] bg-white hover:bg-[#FFE4EC] transition"
            >
              <Avatar size={28} shape="circle" className="shrink-0" src={user?.avatarUrl || admin.avatarUrl} name={admin.fullName || user?.name} />
              <div className={`${isLeadsPage ? "hidden 2xl:block" : "hidden lg:block"} text-left leading-tight min-w-0`}>
                <div className="text-xs font-semibold text-[#DC143C] truncate max-w-[120px]">{admin.fullName}</div>
                <div className="text-[10px] text-[#6B7280] truncate max-w-[120px]">{admin.role}</div>
              </div>
              <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </button>
            {openMenu === "user" && (
              <div className="absolute right-0 top-full mt-2 popover-responsive bg-white rounded-2xl
                border border-[#FFD6E5] shadow-[0_12px_40px_rgba(220,20,60,0.12)] p-2 z-50">
                {userMenuItems.map((i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => handleUserMenu(i)}
                    className="w-full text-left px-3 py-2 text-sm rounded-xl transition cursor-pointer flex items-center gap-2 text-[#111827] hover:bg-[#FFF5F8] hover:text-[#DC143C]"
                  >
                    {i === "Admin Profile" && <User className="w-4 h-4 shrink-0" />}
                    {i === "Workspace Settings" && <Settings className="w-4 h-4 shrink-0" />}
                    {i === "Sign out" && <LogOut className="w-4 h-4 shrink-0" />}
                    {i}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isDenseToolbar && !isPipelinePage && (
        <div className="md:hidden px-3 py-2 border-t border-[#F3F4F6] bg-white/90">
          <h1 className="text-sm font-semibold text-[#111827] truncate">{meta.title}</h1>
          {meta.sub && <p className="text-[10px] text-slate-500 truncate mt-0.5">{meta.sub}</p>}
        </div>
      )}

      {isPipelinePage && (
        <div className="md:hidden px-3 pb-2 pt-0 border-t border-[#F3F4F6] bg-[#FAFAFA]/80">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <PipelineDateFilter
                compact
                currentPeriod={pipelinePeriod}
                fromDate={searchParams.get("from") || ""}
                toDate={searchParams.get("to") || ""}
                onSelect={setPipelinePeriod}
                onApplyCustom={setPipelineCustomRange}
              />
            </div>
            <select
              value={selectedService}
              onChange={(e) => setSelectedService(e.target.value)}
              className="bg-white border border-[#FFD6E5] text-[11px] font-semibold text-[#111827] h-9 px-2.5 rounded-xl outline-none appearance-none pr-7 w-[7.25rem] shrink-0 truncate"
              style={{
                background: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23DC143C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 8px center/14px"
              }}
            >
              {(servicesList?.length ? servicesList : CANONICAL_SERVICES).map((s) => (
                <option key={s} value={s}>{s.length > 28 ? s.slice(0, 26) + "..." : s}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {isLeadsPage && !isPipelinePage && (
        <div className="md:hidden px-3 pb-2 pt-1 border-t border-[#F3F4F6] bg-[#FAFAFA]/80">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="w-full bg-white border border-[#FFD6E5] text-[11px] font-semibold text-[#111827] h-9 px-2.5 rounded-xl outline-none appearance-none pr-8 truncate"
            style={{
              background: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23DC143C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 8px center/14px"
            }}
          >
            {CANONICAL_SERVICES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      )}

      {showDateRange && (
        <div className="md:hidden px-2.5 pb-1 pt-0.5 border-t border-[#F3F4F6] bg-[#FAFAFA]/80">
          <DateRangeFilter compact className="w-full" />
        </div>
      )}
    </header>
  );
}

function SearchDropdown({ searching, searchQ, searchResults, navigate, setSearchQ, setSearchResults }) {
  return (
    <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-2xl border border-[#FFD6E5]
      shadow-[0_12px_40px_rgba(220,20,60,0.12)] z-50 overflow-hidden max-h-[60vh] overflow-y-auto">
      {searching ? (
        <div className="p-4 text-center text-xs text-[#be123c]">Searching…</div>
      ) : searchResults.length === 0 ? (
        <div className="p-4 text-center text-xs text-[#9f1239]">No results for "{searchQ}"</div>
      ) : (
        <div className="p-1">
          {searchResults.map((r) => {
            const cfg = TYPE_ICON[r.type] || TYPE_ICON.employee;
            const Icon = cfg.Icon;
            return (
              <button
                key={`${r.type}-${r.id}`}
                onClick={() => {
                  if (r.type === "employee") navigate("/team");
                  else if (r.type === "sop") navigate(`/sop?openSop=${r.id}`);
                  else navigate("/sales");
                  setSearchQ("");
                  setSearchResults([]);
                }}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-xl
                  hover:bg-[#FFF0F5] transition text-left touch-target"
              >
                <div style={{
                  width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                  background: cfg.bg, display: "flex",
                  alignItems: "center", justifyContent: "center",
                }}>
                  <Icon style={{ width: 14, height: 14, color: cfg.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-[#111827] truncate">{r.name}</p>
                  <p className="text-[10px] text-[#6B7280] truncate">{r.sub || r.email || r.role}</p>
                </div>
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "2px 7px",
                  borderRadius: 20, background: cfg.bg, color: cfg.color,
                  textTransform: "capitalize", flexShrink: 0,
                }}>
                  {r.type}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Popover({ open, onOpen, onClose, label, icon, badge, badgeCount, dot, children }) {
  const wrapRef = useRef(null);
  // Outside click / Esc closes it (trigger lives inside wrapRef so its own click toggles).
  useDismissable({ open, onDismiss: onClose, refs: [wrapRef] });
  return (
    <div ref={wrapRef} className="relative shrink-0">
      <button
        type="button"
        onClick={open ? onClose : onOpen}
        aria-expanded={open}
        aria-label={label}
        className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#E5E7EB] bg-white hover:bg-[#F8F9FC] transition grid place-items-center shrink-0"
      >
        {icon}
        {badge && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full
            bg-primary text-white text-[9px] font-bold flex items-center justify-center px-1">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
        {!badge && dot && (
          <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-primary border-2 border-white" aria-label="New notifications" />
        )}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-[3.25rem] sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80 bg-white rounded-2xl
          border border-[#FFD6E5] shadow-[0_12px_40px_rgba(220,20,60,0.12)] z-50">
          {children}
        </div>
      )}
    </div>
  );
}
