import { lazy, Suspense, Component } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { EMP_TOAST_OPTIONS } from "./employee/utils/empToast.jsx";
import AppLayout from "./layouts/AppLayout.jsx";
import EmployeeLayout from "./employee/layouts/EmployeeLayout.jsx";
import PageLoader from "./components/PageLoader.jsx";
import RequireAuth from "./components/RequireAuth.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";

const Login = lazy(() => import("./pages/Login.jsx"));
const ChangePassword = lazy(() => import("./pages/ChangePassword.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const SOP = lazy(() => import("./pages/SOP.jsx"));
const Sales = lazy(() => import("./pages/Sales.jsx"));
const Team = lazy(() => import("./pages/Team.jsx"));
const Reports = lazy(() => import("./pages/Reports.jsx"));
const Incentives = lazy(() => import("./pages/Incentives.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const Admin = lazy(() => import("./pages/Admin.jsx"));
const Leads = lazy(() => import("./pages/Leads.jsx"));
const Forms = lazy(() => import("./pages/Sources.jsx"));
const Services = lazy(() => import("./pages/Services.jsx"));
const Pipeline = lazy(() => import("./pages/Pipeline.jsx"));

const EmployeeDashboard = lazy(() => import("./employee/pages/EmployeeDashboard.jsx"));
const EmployeeTasks = lazy(() => import("./employee/pages/EmployeeTasks.jsx"));
const EmployeeFollowUps = lazy(() => import("./employee/pages/EmployeeFollowUps.jsx"));
const EmployeeCalls = lazy(() => import("./employee/pages/EmployeeCalls.jsx"));
const EmployeeCallDetail = lazy(() => import("./employee/pages/EmployeeCallDetail.jsx"));
const EmployeeLeads = lazy(() => import("./employee/pages/EmployeeLeads.jsx"));
const EmployeeSalesProcess = lazy(() => import("./employee/pages/EmployeeSalesProcess.jsx"));
const EmployeeSopDetail = lazy(() => import("./employee/pages/EmployeeSopDetail.jsx"));
const EmployeeCallAssistant = lazy(() => import("./employee/pages/EmployeeCallAssistant.jsx"));
const EmployeeAssets = lazy(() => import("./employee/pages/EmployeeAssets.jsx"));
const EmployeeMeetings = lazy(() => import("./employee/pages/EmployeeMeetings.jsx"));
const EmployeeWhatsAppScripts = lazy(() => import("./employee/pages/EmployeeWhatsAppScripts.jsx"));
const EmployeeProfile = lazy(() => import("./employee/pages/EmployeeProfile.jsx"));
const EmployeePipeline = lazy(() => import("./employee/pages/EmployeePipeline.jsx"));

class CallAssistantErrorBoundary extends Component {
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
          <h1 className="text-lg font-bold text-slate-800">Call Assistant couldn&apos;t load</h1>
          <p className="text-sm text-slate-500 mt-2">
            The call workspace hit an error. Refresh the page or return to your pipeline and try again.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold"
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Toaster position="top-right" gutter={12} containerStyle={{ top: 16, right: 16 }} toastOptions={EMP_TOAST_OPTIONS} />
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route element={<RequireAuth />}>
              <Route path="/change-password" element={<ChangePassword />} />
            </Route>

            <Route element={<RequireAuth roles={["admin"]} />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/sop" element={<SOP />} />
                <Route path="/sales" element={<Sales />} />
                <Route path="/team" element={<Team />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/incentives" element={<Incentives />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="/leads" element={<Leads />} />
                <Route path="/pipeline" element={<Pipeline />} />
                <Route path="/sources/*" element={<Forms />} />
                <Route path="/forms/*" element={<Navigate to="/sources" replace />} />
                <Route path="/services/*" element={<Services />} />
              </Route>
            </Route>

            <Route element={<RequireAuth roles={["employee"]} />}>
              <Route path="/employee" element={<EmployeeLayout />}>
                <Route index element={<EmployeeDashboard />} />
                <Route path="tasks" element={<EmployeeTasks />} />
                <Route path="follow-ups" element={<EmployeeFollowUps />} />
                <Route path="whatsapp-scripts" element={<EmployeeWhatsAppScripts />} />
                <Route path="calls" element={<EmployeeCalls />} />
                <Route path="call-detail" element={<EmployeeCallDetail />} />
                <Route path="leads" element={<EmployeeLeads />} />
                <Route path="pipeline" element={<EmployeePipeline />} />
                <Route path="sales-process" element={<EmployeeSalesProcess />} />
                <Route path="sales-process/:sopId" element={<EmployeeSopDetail />} />
                <Route path="call-assistant" element={<CallAssistantErrorBoundary><EmployeeCallAssistant /></CallAssistantErrorBoundary>} />
                <Route path="assets" element={<EmployeeAssets />} />
                <Route path="meetings" element={<EmployeeMeetings />} />
                <Route path="profile" element={<EmployeeProfile />} />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}
