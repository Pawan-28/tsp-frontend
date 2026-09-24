import { useState, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Sidebar from "../components/Sidebar.jsx";
import Topbar from "../components/Topbar.jsx";
import MobileNav from "../components/MobileNav.jsx";
import { Plus, FileText, Users, Calculator } from "lucide-react";
import { AdminProvider } from "../context/AdminContext.jsx";
import { DateRangeProvider } from "../context/DateRangeContext.jsx";
import { apiGet } from "../lib/api.js";
import { queryKeys } from "../lib/queryKeys.js";

export default function AppLayout() {
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    let cancelled = false;

    async function prefetchAdminQueries() {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.employees,
        queryFn: () => apiGet("/api/team/employees"),
      });
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 450));
      await queryClient.prefetchQuery({
        queryKey: queryKeys.activities,
        queryFn: () => apiGet("/api/activity"),
      });
      if (cancelled) return;
      await new Promise((r) => setTimeout(r, 450));
      await queryClient.prefetchQuery({
        queryKey: queryKeys.notifications,
        queryFn: () => apiGet("/api/activity/notifications"),
      });
    }

    prefetchAdminQueries();
    return () => { cancelled = true; };
  }, [queryClient]);

  const quickActions = [
    { label: "Add Lead",            icon: Plus,       to: "/sales",     search: "?action=addLead" },
    { label: "Add SOP",             icon: FileText,   to: "/sop",       search: "?action=addSOP"  },
    { label: "Add New Team Member", icon: Users,      to: "/team",      search: "?action=addMember" },
    { label: "Calculate Incentive", icon: Calculator, to: "/incentives"                            },
  ];

  const handleFabAction = (action) => {
    setFabOpen(false);
    navigate(`${action.to}${action.search ?? ""}`);
  };

  return (
    <AdminProvider>
    <DateRangeProvider>
    <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-clip">
      {/* Dynamic sidebar — passes collapse state */}
      <Sidebar
        open={open}
        onClose={() => setOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
      />

      {/* Main content — smoothly shifts as sidebar animates */}
      <div className="flex-1 min-w-0 flex flex-col max-w-full overflow-x-clip">
        <Topbar onMenu={() => setOpen(true)} />

        <main className="flex-1 bg-white text-slate-900 p-3 sm:p-4 md:p-6 lg:p-8 xl:px-10 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-8 page-shell overflow-x-clip relative">
          <Outlet />
        </main>

        <MobileNav />

        {/* FAB (mobile quick-actions) */}
        <div className="relative">
          <button
            onClick={() => setFabOpen(!fabOpen)}
            className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-3 sm:right-4 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full
                       gradient-primary text-primary-foreground shadow-glow
                       grid place-items-center hover:opacity-90 transition"
          >
            <Plus className="w-6 h-6" />
          </button>

          {fabOpen && (
            <div
              className="lg:hidden fixed bottom-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:bottom-32 right-3 sm:right-4 z-40 w-52 sm:w-56
                         glass-strong rounded-xl border border-border
                         shadow-elegant p-1 space-y-0.5 animate-fade-in"
            >
              {quickActions.map((action) => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.label}
                    onClick={() => handleFabAction(action)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg
                               text-xs text-foreground hover:bg-secondary/60 transition"
                  >
                    <Icon className="w-4 h-4 text-primary shrink-0" />
                    <span className="font-medium">{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
    </DateRangeProvider>
    </AdminProvider>
  );
}
