import { useState, useEffect, useRef, startTransition } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  Search, Bell, Menu, Plus, ChevronDown, X,
  CheckSquare, MessageSquare, Phone, Calendar, User, LogOut, Shield,
} from "lucide-react";
import EmployeeDoodleAvatar from "./EmployeeDoodleAvatar.jsx";
import PrivateContactsModal from "./PrivateContactsModal.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";

const QUICK_ACTIONS = [
  { label: "Add Lead",            icon: Plus,          to: "/employee/leads",        search: "?action=add" },
  { label: "Add Task",            icon: CheckSquare,   to: "/employee/tasks",        search: "?action=add" },
  { label: "Schedule Follow-up",  icon: MessageSquare, to: "/employee/follow-ups", search: "?action=add" },
  { label: "Log Call",            icon: Phone,         to: "/employee/calls" },
  { label: "Book Meeting",        icon: Calendar,      to: "/employee/meetings",   search: "?action=add" },
  { label: "Private Contacts",    icon: Shield,        isPrivateModal: true },
];

const PAGE_META = {
  "/employee": { title: "Dashboard", sub: "Overview · Pipeline · Agenda" },
  "/employee/tasks": { title: "My Tasks", sub: "Today · Upcoming · Previous" },
  "/employee/follow-ups": { title: "Follow-Up", sub: "Overdue · Due Today · Upcoming" },
  "/employee/whatsapp-scripts": { title: "WhatsApp Scripts", sub: "Create · Edit · Share on follow-ups" },
  "/employee/calls": { title: "Call Reporting", sub: "Analytics · Team Performance · Lead Activity" },
  "/employee/leads": { title: "Pipeline", sub: "Real-time overview of your sales pipeline" },
  "/employee/pipeline": { title: "Pipeline", sub: "Real-time overview of your sales pipeline" },
  "/employee/sales-process": { title: "Sales Process", sub: "SOP · Cross-Selling · Scripts · Checklist" },
  "/employee/assets": { title: "Assets", sub: "Brochures · Templates · Training" },
  "/employee/meetings": { title: "Meetings", sub: "Book and track meetings" },
  "/employee/profile": { title: "Profile", sub: "Your account and preferences" },
};

const CANONICAL_SERVICES = [
  "All Services",
  "AI Automation Suite",
  "CRM Setup & Onboarding",
  "Lead Gen Engine",
  "Custom Software Dev",
  "Strategic Consulting",
];

const CALL_PERIODS = [
  { id: "today", label: "Today" },
  { id: "week", label: "This Week" },
  { id: "month", label: "This Month" },
];

export default function EmployeeTopbar({ onMenu }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { employee, selectedService, setSelectedService, servicesList } = useEmployee();
  const { logout, user } = useAuth();
  const meta = pathname.startsWith("/employee/sales-process/") && pathname !== "/employee/sales-process"
    ? { title: "SOP Detail", sub: "Full playbook · Scripts · Checklist" }
    : PAGE_META[pathname] || { title: "Employee Panel", sub: "" };
  const [notifOpen, setNotifOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [privateModalOpen, setPrivateModalOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const quickRef = useRef(null);
  const userRef = useRef(null);
  const isCallsPage = pathname === "/employee/calls";
  const isDashboardPage = pathname === "/employee";
  const isPipelinePage = pathname === "/employee/leads" || pathname === "/employee/pipeline" || pathname === "/employee/sales-process";
  const showPeriodFilter = isCallsPage || isPipelinePage || isDashboardPage;
  const defaultPeriod = isCallsPage || isDashboardPage ? "today" : "month";
  const currentPeriod = String(searchParams.get("period") || defaultPeriod).toLowerCase();

  const setPeriod = (nextPeriod) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("period", String(nextPeriod).toLowerCase());
    startTransition(() => {
      setSearchParams(newParams, { replace: true });
    });
  };

  const handleQuickAction = (action) => {
    setQuickOpen(false);
    if (action.isPrivateModal) {
      setPrivateModalOpen(true);
      return;
    }
    navigate(`${action.to}${action.search ?? ""}`);
  };

  useEffect(() => {
    const onClick = (e) => {
      if (quickRef.current && !quickRef.current.contains(e.target)) {
        setQuickOpen(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleUserMenu = (item) => {
    setUserMenuOpen(false);
    if (item === "Private Contacts") setPrivateModalOpen(true);
    else if (item === "My Profile") navigate("/employee/profile");
    else if (item === "Sign out") {
      logout();
      navigate("/login", { replace: true });
    }
  };

  const userMenuItems = ["My Profile", "Private Contacts", "Sign out"];

  return (
    <>
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E7EB] shadow-sm overflow-x-clip">
        <div className="flex items-center gap-2 px-3 sm:px-4 lg:px-8 py-2 min-h-[52px] md:min-h-20 min-w-0">
          <button
            type="button"
            onClick={onMenu}
            className="w-9 h-9 -ml-1 rounded-xl hover:bg-[#FFF5F8] text-[#DC143C] lg:hidden transition-all duration-200 shrink-0 grid place-items-center"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Mobile search */}
          <div className="relative flex-1 min-w-0 md:hidden">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#DC143C] pointer-events-none" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search leads, tasks…"
              aria-label="Search"
              className="w-full h-9 pl-9 pr-8 py-1.5 rounded-xl bg-[#F5F7FA] border border-[#E5E7EB]
                text-[#111827] text-sm placeholder:text-[#9CA3AF]
                focus:outline-none focus:ring-2 focus:ring-[#DC143C]/20 focus:border-[#DC143C]/30 transition"
            />
            {searchQ && (
              <button
                type="button"
                onClick={() => setSearchQ("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-[#9CA3AF] hover:text-[#DC143C] hover:bg-[#FFF5F8]"
                aria-label="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Desktop title */}
          <div className="hidden md:block shrink-0 min-w-0">
            <h1 className="text-lg font-display font-semibold tracking-tight leading-tight text-[#111827]">{meta.title}</h1>
            <p className="text-[10px] text-[#6B7280] leading-tight">{meta.sub}</p>
          </div>

          <div className="relative hidden md:block flex-1 max-w-md mx-2 lg:mx-4 min-w-0">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[#DC143C]" />
            <input
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search leads, tasks, meetings…"
              className="w-full min-h-[44px] pl-11 pr-4 py-2.5 rounded-xl bg-[#F5F7FA] border border-[#E5E7EB] text-[#111827] text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/40 transition"
            />
          </div>

          {/* Web Period Filter — in top navbar for desktop/tablet */}
          {showPeriodFilter && (
            <div className="hidden md:inline-flex items-center mx-2 shrink-0">
              <div className={SEGMENT_WRAP}>
                {CALL_PERIODS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriod(id)}
                    className={`${SEGMENT_BTN} ${
                      currentPeriod === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="hidden md:block flex-grow min-w-0" />

          <div className="flex items-center gap-1 sm:gap-1.5 justify-end shrink-0">
            {(isPipelinePage) && (
              <div className="relative hidden md:inline-flex w-auto shrink-0 mr-1">
                <select
                  value={selectedService}
                  onChange={(e) => setSelectedService(e.target.value)}
                  className="bg-white border border-[#FFD6E5] hover:border-[#fda4af] text-xs md:text-sm font-semibold text-[#111827] px-3 py-2 rounded-xl outline-none transition cursor-pointer appearance-none pr-8 w-36 sm:w-44 truncate"
                  style={{
                    background: "url(\"data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23DC143C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E\") no-repeat right 8px center/14px"
                  }}
                >
                  {(servicesList?.length ? servicesList : CANONICAL_SERVICES).map((s) => (
                    <option key={s} value={s}>{s.length > 28 ? s.slice(0, 26) + "..." : s}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Quick Actions — tablet+ (mobile uses FAB) */}
            <div ref={quickRef} className="relative hidden md:inline-flex w-auto mr-1">
              <button
                type="button"
                onClick={() => setQuickOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 bg-primary text-primary-foreground px-3 py-2 rounded-xl text-xs md:text-sm font-medium hover:bg-primary/90 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Quick Actions</span>
                <ChevronDown className="w-3 h-3" />
              </button>
              {quickOpen && (
                <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl border border-[#FFD6E5] shadow-[0_12px_40px_rgba(220,20,60,0.12)] z-50">
                  <div className="p-1 space-y-0.5">
                    {QUICK_ACTIONS.map((action) => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => handleQuickAction(action)}
                          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs md:text-sm text-[#111827] hover:bg-[#FFF0F5] transition"
                        >
                          <Icon className="w-4 h-4 text-[#DC143C] shrink-0" />
                          <span className="text-left font-semibold">{action.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl border border-[#E5E7EB] bg-white grid place-items-center text-slate-500 hover:border-rose-200 hover:text-rose-600 transition shrink-0"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 text-[#DC143C]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-600 border-2 border-white" />
            </button>

            <div ref={userRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="relative flex items-center justify-center gap-1.5 sm:gap-2 w-9 h-9 sm:w-auto sm:h-auto p-0 sm:pl-1 sm:pr-3 sm:py-1 rounded-full sm:rounded-xl
                  border border-[#E5E7EB] bg-white hover:bg-[#FFE4EC] transition"
              >
                <EmployeeDoodleAvatar size={28} shape="circle" className="shrink-0" photoUrl={user?.avatarUrl || employee?.avatarUrl} />
                <div className="hidden lg:block text-left leading-tight min-w-0">
                  <div className="text-xs font-semibold text-[#DC143C] truncate max-w-[100px]">{employee.name?.split(" ")[0]}</div>
                  <div className="text-[10px] text-[#6B7280] truncate">{employee.role}</div>
                </div>
                <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-muted-foreground shrink-0" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-2 popover-responsive bg-white rounded-2xl
                  border border-[#FFD6E5] shadow-[0_12px_40px_rgba(220,20,60,0.12)] p-2 z-50">
                  {userMenuItems.map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleUserMenu(i)}
                      className="w-full text-left px-3 py-2 text-sm rounded-xl transition cursor-pointer flex items-center gap-2 text-[#111827] hover:bg-[#FFF5F8] hover:text-[#DC143C]"
                    >
                      {i === "My Profile" && <User className="w-4 h-4 shrink-0" />}
                      {i === "Sign out" && <LogOut className="w-4 h-4 shrink-0" />}
                      {i}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {showPeriodFilter && (
          <div className="md:hidden px-2.5 pb-2 pt-1 border-t border-[#F3F4F6] bg-[#FAFAFA]/80">
            <div className="flex items-center gap-2 min-w-0">
              <div className={`${SEGMENT_WRAP} flex-1 min-w-0`}>
                {CALL_PERIODS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPeriod(id)}
                    className={`flex-1 ${SEGMENT_BTN} ${
                      currentPeriod === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {isPipelinePage && (
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
              )}
            </div>
          </div>
        )}

        {!showPeriodFilter && (
          <div className="md:hidden px-3 py-2 border-t border-[#F3F4F6] bg-white/90">
            <h1 className="text-sm font-semibold text-[#111827] truncate">{meta.title}</h1>
            {meta.sub && <p className="text-[10px] text-slate-500 truncate mt-0.5">{meta.sub}</p>}
          </div>
        )}
      </header>

      {notifOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
          <div className="fixed top-[3.25rem] right-3 sm:right-6 z-50 w-[min(100vw-1.5rem,320px)] rounded-2xl border border-[#FFD6E5] bg-white shadow-[0_12px_40px_rgba(220,20,60,0.12)] p-4 animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-display font-bold text-slate-900">Notifications</span>
            </div>
            <p className="text-xs text-slate-400 py-4 text-center">No new notifications</p>
          </div>
        </>
      )}

      <PrivateContactsModal
        isOpen={privateModalOpen}
        onClose={() => setPrivateModalOpen(false)}
        employeeId={employee?.id}
        employeeName={employee?.name}
      />
    </>
  );
}

export function usePageMeta(pathname) {
  return PAGE_META[pathname] || { title: "Employee Panel", sub: "" };
}
