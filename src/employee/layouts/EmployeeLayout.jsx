import { useState, Component } from "react";
import { Outlet, useOutletContext, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Plus, Phone, Calendar, CheckSquare, MessageSquare } from "lucide-react";
import { EmployeeProvider } from "../../context/EmployeeContext.jsx";
import EmployeeSidebar from "../components/EmployeeSidebar.jsx";
import EmployeeTopbar from "../components/EmployeeTopbar.jsx";
import EmployeeMobileNav from "../components/EmployeeMobileNav.jsx";
class EmployeeRouteErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="page-shell min-w-0 p-6 text-center max-w-md mx-auto">
          <h1 className="text-lg font-bold text-slate-800">This page couldn&apos;t load</h1>
          <p className="text-sm text-slate-500 mt-2">
            Something went wrong loading this workspace. Try refreshing or return to your dashboard.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
            >
              Refresh page
            </button>
            <button
              type="button"
              onClick={() => { window.location.href = "/employee"; }}
              className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700"
            >
              Go to dashboard
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function EmployeeLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const navigate = useNavigate();

  const quickActions = [
    { label: "Add Lead", to: "/employee/leads?action=add", icon: Plus },
    { label: "Add Task", to: "/employee/tasks?action=add", icon: CheckSquare },
    { label: "Schedule Follow-up", to: "/employee/follow-ups?action=add", icon: MessageSquare },
    { label: "Log Call", to: "/employee/calls", icon: Phone },
    { label: "Book Meeting", to: "/employee/meetings?action=add", icon: Calendar },
  ];

  return (
    <EmployeeProvider>
      <div className="flex min-h-screen w-full max-w-[100vw] overflow-x-clip">
        <EmployeeSidebar
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />

        <div className="flex-1 min-w-0 flex flex-col max-w-full overflow-x-clip">
          <EmployeeTopbar onMenu={() => setSidebarOpen(true)} />

          <main className="flex-1 bg-white text-slate-900 p-3 sm:p-4 md:p-6 lg:p-8 xl:px-10 pb-[calc(5.75rem+env(safe-area-inset-bottom,0px))] lg:pb-8 page-shell overflow-x-clip relative">
            <EmployeeRouteErrorBoundary>
              <Outlet context={{ toast: (msg, type = "success") => (type === "error" ? toast.error(msg) : toast.success(msg)) }} />
            </EmployeeRouteErrorBoundary>
          </main>

          <EmployeeMobileNav />

          <div className="relative">
            <button
              type="button"
              onClick={() => setFabOpen(!fabOpen)}
              className="lg:hidden fixed bottom-[calc(5rem+env(safe-area-inset-bottom,0px))] right-3 sm:right-4 z-40 w-12 h-12 sm:w-14 sm:h-14 rounded-full gradient-primary text-primary-foreground shadow-glow grid place-items-center hover:opacity-90 transition"
              aria-label="Quick actions"
            >
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
            {fabOpen && (
              <div className="lg:hidden fixed bottom-[calc(8rem+env(safe-area-inset-bottom,0px))] sm:bottom-32 right-3 sm:right-4 z-40 w-52 sm:w-56 glass-strong rounded-xl border border-border shadow-elegant p-1 space-y-0.5 animate-fade-in">
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <button
                      key={action.label}
                      type="button"
                      onClick={() => { setFabOpen(false); navigate(action.to); }}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs text-foreground hover:bg-secondary/60 transition"
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
    </EmployeeProvider>
  );
}

export function useEmpToast() {
  const ctx = useOutletContext();
  return ctx?.toast || ((msg) => toast.success(msg));
}
