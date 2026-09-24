import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  BadgeCheck,
  Briefcase,
  LogOut,
  Lock,
  Phone,
  Settings,
  Target,
  TrendingUp,
  Users,
  Video,
} from "lucide-react";
import {
  Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
} from "recharts";
import { Badge, StatCard } from "../../components/Primitives.jsx";
import {
  SettingsSidebar,
  SettingsMobileTabs,
  SettingsPanel,
  PanelSection,
  PanelFooter,
  inputClass,
  labelClass,
} from "../../components/SettingsLayout.jsx";
import { useAuth } from "../../context/AuthContext.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { filterCallsForPeriod } from "../../data/employeeMock.js";
import { CALL_CONVERSATION_LABEL, countConversationCalls } from "../../lib/callMetrics.js";
import { apiDelete, apiGet } from "../../lib/api.js";
import { getCrmHeaders } from "../../lib/crmContext.js";
import { useCallyzerStats } from "../../lib/useCallyzerStats.js";
import { useEmployeeCompetencyScores } from "../../lib/useEmployeeCompetencyScores.js";
import EmployeeProfileHeader, { DashboardScrollbarStyles } from "../components/EmployeeProfileHeader.jsx";

const tabs = [
  { id: "profile", label: "Profile", icon: BadgeCheck },
  { id: "performance", label: "Performance", icon: TrendingUp },
  { id: "preferences", label: "Preferences", icon: Settings },
];

function formatJoinDate(raw) {
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function EmployeeProfile() {
  const { employee, leads, calls, followUps, loading } = useEmployee();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get("tab") || "profile");
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [displayName, setDisplayName] = useState(employee?.name || "");
  const [reminderHrs, setReminderHrs] = useState(24);
  const [meetingPlatform, setMeetingPlatform] = useState("google_meet");
  const [googleStatus, setGoogleStatus] = useState({
    configured: false,
    connected: false,
    googleEmail: null,
  });
  const [googleBusy, setGoogleBusy] = useState(false);

  const refreshGoogleStatus = async () => {
    try {
      const res = await apiGet("/api/v1/employee/google/status", {
        headers: getCrmHeaders(),
        skipCache: true,
        cacheTtl: 0,
      });
      setGoogleStatus({
        configured: res?.configured !== false,
        connected: Boolean(res?.connected),
        googleEmail: res?.googleEmail || null,
      });
    } catch {
      setGoogleStatus({ configured: false, connected: false, googleEmail: null });
    }
  };

  useEffect(() => {
    refreshGoogleStatus();
  }, [employee?.id]);

  useEffect(() => {
    const result = searchParams.get("google");
    if (result === "connected") {
      toast.success("Google account connected");
      refreshGoogleStatus();
      setSearchParams({}, { replace: true });
    } else if (result === "error") {
      toast.error(searchParams.get("reason") || "Google connection failed");
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleConnectGoogle = async () => {
    setGoogleBusy(true);
    try {
      const res = await apiGet("/api/v1/employee/google/connect-url", {
        headers: getCrmHeaders(),
        skipCache: true,
        cacheTtl: 0,
      });
      if (res?.url) {
        window.location.href = res.url;
        return;
      }
      toast.error(res?.message || "Could not start Google sign-in");
    } catch (err) {
      toast.error(err.message || "Could not start Google sign-in");
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setGoogleBusy(true);
    try {
      await apiDelete("/api/v1/employee/google/disconnect", { headers: getCrmHeaders() });
      setGoogleStatus((prev) => ({ ...prev, connected: false, googleEmail: null }));
      toast.success("Google account disconnected");
    } catch (err) {
      toast.error(err.message || "Could not disconnect Google");
    } finally {
      setGoogleBusy(false);
    }
  };

  useEffect(() => {
    if (employee?.name) setDisplayName(employee.name);
  }, [employee?.name]);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "preferences" || tab === "profile" || tab === "performance") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const { stats: callyzerStats } = useCallyzerStats(employee?.id, "This Month", Boolean(employee?.id));
  const { competency, callsScored: competencyCallsScored } = useEmployeeCompetencyScores(employee?.id, {
    enabled: Boolean(employee?.id),
    period: "month",
  });
  const radarData = useMemo(() => Object.entries(competency).map(([skill, score]) => ({ skill, score })), [competency]);

  const stats = useMemo(() => {
    const openFollowUps = followUps.filter((f) => !f.done).length;
    const callsConversations =
      callyzerStats?.conversations5MinPlus ??
      countConversationCalls(calls, { periodFilter: (list) => filterCallsForPeriod(list, "month") });
    const converted = leads.filter((l) => l.status === "converted").length;
    const convRate = leads.length ? Math.round((converted / leads.length) * 100) : 0;
    const pickup = employee?.pickupRate ?? callyzerStats?.pickupRate ?? 0;
    const qualification = employee?.qualificationRate ?? 0;

    return { openFollowUps, callsConversations, converted, convRate, pickup, qualification };
  }, [calls, followUps, leads, employee, callyzerStats]);

  const perfRows = useMemo(() => [
    { label: "Pickup rate", value: `${stats.pickup}%` },
    { label: "Qualification", value: `${stats.qualification}%` },
    { label: "Conversion", value: `${stats.convRate}%` },
    { label: "Call conversations", value: `${stats.callsConversations}/${employee?.callsTarget || 60} (${CALL_CONVERSATION_LABEL})` },
  ], [stats, employee?.callsTarget]);

  const handleSave = () => {
    setPrefsDirty(false);
    toast.success("Profile preferences saved");
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (loading && !employee?.name) {
    return (
      <div className="page-shell min-w-0 animate-pulse space-y-4">
        <div className="h-36 rounded-2xl bg-rose-50" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-20 rounded-2xl bg-slate-50" />)}
        </div>
      </div>
    );
  }

  const profileFields = [
    { key: "email", label: "Work Email", value: employee?.email, readOnly: true },
    { key: "phone", label: "Phone Number", value: employee?.phone || "Not set", readOnly: true },
    { key: "joiningDate", label: "Joining Date", value: formatJoinDate(employee?.joiningDate), readOnly: true },
    { key: "department", label: "Department", value: employee?.department, readOnly: true },
    { key: "territory", label: "Territory", value: employee?.city || employee?.territory || "—", readOnly: true },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 page-shell min-w-0">
      <DashboardScrollbarStyles />
      <EmployeeProfileHeader />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Active Leads"
          value={String(leads.length)}
          change={`${leads.length ? "In pipeline" : "No leads yet"}`}
          sub=""
          icon={Users}
          tone="info"
          compact
        />
        <StatCard
          label={`Conversations (${CALL_CONVERSATION_LABEL})`}
          value={String(stats.callsConversations)}
          change={`Target ${employee?.callsTarget || 60} this month`}
          sub=""
          icon={Phone}
          tone="purple"
          compact
        />
        <StatCard
          label="Follow-ups"
          value={String(stats.openFollowUps)}
          change={stats.openFollowUps ? "Open items" : "All clear"}
          sub=""
          icon={Target}
          tone="warning"
          compact
        />
        <StatCard
          label="Converted"
          value={String(stats.converted)}
          change={`${stats.convRate}% win rate`}
          sub=""
          icon={TrendingUp}
          tone="success"
          compact
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 sm:gap-6 min-w-0">
        <SettingsMobileTabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

        <SettingsSidebar
          title="Employee Account"
          subtitle="Profile, performance & workspace"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <SettingsPanel
          footer={
            activeTab === "preferences" ? (
              <PanelFooter
                left={
                  <Badge tone={prefsDirty ? "warning" : "muted"}>
                    {prefsDirty ? "Unsaved preference changes" : "Preferences synchronized"}
                  </Badge>
                }
                actions={
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDisplayName(employee?.name || "");
                        setReminderHrs(24);
                        setMeetingPlatform("google_meet");
                        setPrefsDirty(false);
                      }}
                      className="flex-1 sm:flex-initial px-4 py-2 border border-rose-200 hover:border-rose-400 text-[#be123c] rounded-xl text-xs font-bold transition-all shadow-sm bg-white"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-[#be123c] hover:bg-[#a20f32] text-white rounded-xl text-xs font-bold transition-all shadow-md active:translate-y-px"
                    >
                      Save Preferences
                    </button>
                  </>
                }
              />
            ) : null
          }
        >
          {activeTab === "profile" && (
            <PanelSection
              title="Contact & Profile"
              subtitle="Details synced from your team account"
            >
              <div className="p-4 border border-rose-100/50 rounded-2xl bg-white space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-[#be123c] uppercase">Personal details</span>
                  <Badge tone="primary">{employee?.role || "Sales"}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Employee ID</label>
                    <input
                      value={employee?.id ? `#${employee.id}` : "—"}
                      readOnly
                      className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Display Name</label>
                    <input
                      value={employee?.name || "—"}
                      readOnly
                      className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
                    />
                  </div>
                  {profileFields.map(({ key, label, value }) => (
                    <div key={key}>
                      <label className={labelClass}>{label}</label>
                      <input
                        value={value || "—"}
                        readOnly
                        className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase">Account session</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Signed in as {employee?.email || employee?.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-rose-200 text-[#be123c] rounded-xl text-xs font-bold bg-white hover:bg-rose-50 shrink-0"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </PanelSection>
          )}

          {activeTab === "performance" && (
            <PanelSection
              title="Performance Snapshot"
              subtitle="How you're tracking this period"
            >
              <div className="p-4 border border-rose-100/50 rounded-2xl bg-white">
                <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100">
                  <Briefcase className="w-4 h-4 text-[#be123c]" />
                  <span className="text-xs font-black text-[#be123c] uppercase">Key metrics</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {perfRows.map((row) => (
                    <div
                      key={row.label}
                      className="rounded-xl border border-rose-100 bg-gradient-to-br from-white via-[#fffbfb] to-[#fff0f2] p-3 text-center"
                    >
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">{row.label}</p>
                      <p className="text-base sm:text-lg font-black text-slate-900 mt-1 tabular-nums">{row.value}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 border border-rose-100/50 rounded-2xl bg-white mt-4">
                <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-[#be123c]" />
                    <span className="text-xs font-black text-[#be123c] uppercase">Call quality (AI-scored)</span>
                  </div>
                  <Badge tone={competencyCallsScored ? "muted" : "warning"}>
                    {competencyCallsScored ? `${competencyCallsScored} calls scored` : "No scored calls yet"}
                  </Badge>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-1.5">
                  <ResponsiveContainer width="100%" height={220}>
                    <RadarChart cx="50%" cy="52%" outerRadius="70%" data={radarData}>
                      <PolarGrid stroke="#cbd5e1" />
                      <PolarAngleAxis dataKey="skill" tick={{ fontSize: 9, fill: "#64748b" }} />
                      <Radar name="Score" dataKey="score" stroke="#be123c" fill="#be123c" fillOpacity={0.22} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ borderRadius: 10, border: "1px solid #fecdd3", fontSize: 11 }}
                        formatter={(v) => [`${v}%`, "Score"]}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[10px] text-slate-400 mt-2">
                  Scored automatically from your recorded calls against the SOP for each lead's service. Averaged over this month.
                </p>
              </div>
            </PanelSection>
          )}

          {activeTab === "preferences" && (
            <PanelSection
              title="Workspace Preferences"
              subtitle="Customize how your employee panel behaves"
            >
              <div className="p-4 border border-rose-100/50 rounded-2xl bg-white space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-[#be123c] uppercase">Display & notifications</span>
                  <Badge tone="muted">Local only</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Display name</label>
                    <input
                      value={displayName}
                      onChange={(e) => {
                        setDisplayName(e.target.value);
                        setPrefsDirty(true);
                      }}
                      className={inputClass}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Reminder lead time (hours)</label>
                    <input
                      type="number"
                      min={1}
                      max={72}
                      value={reminderHrs}
                      onChange={(e) => {
                        setReminderHrs(Number(e.target.value) || 24);
                        setPrefsDirty(true);
                      }}
                      className={inputClass}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className={labelClass}>Default meeting platform</label>
                    <select
                      value={meetingPlatform}
                      onChange={(e) => {
                        setMeetingPlatform(e.target.value);
                        setPrefsDirty(true);
                      }}
                      className={inputClass}
                    >
                      <option value="google_meet">Google Meet</option>
                      <option value="zoom">Zoom</option>
                      <option value="teams">Microsoft Teams</option>
                    </select>
                    <p className="text-[10px] text-slate-400 mt-1.5 flex items-center gap-1">
                      <Video className="w-3 h-3" />
                      Used when booking meetings from Follow-ups or Leads
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800 uppercase">Connect with Google</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Link your Google account to auto-generate Meet links from your calendar when booking meetings.
                    </p>
                    {googleStatus.connected && googleStatus.googleEmail && (
                      <p className="text-[11px] text-emerald-700 mt-2 font-medium truncate">
                        Connected as {googleStatus.googleEmail}
                      </p>
                    )}
                    {!googleStatus.configured && (
                      <p className="text-[11px] text-amber-700 mt-2">
                        Google integration is not configured on the server yet.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    {googleStatus.connected ? (
                      <>
                        <Badge tone="success">Connected</Badge>
                        <button
                          type="button"
                          onClick={handleDisconnectGoogle}
                          disabled={googleBusy}
                          className="inline-flex items-center justify-center px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 disabled:opacity-60"
                        >
                          Disconnect
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={handleConnectGoogle}
                        disabled={googleBusy || !googleStatus.configured}
                        className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#be123c] hover:bg-[#a20f32] disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                      >
                        {googleBusy ? "Opening Google…" : "Connect with Google"}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 border border-slate-200 rounded-2xl bg-slate-50/50">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase">Security</p>
                    <p className="text-[11px] text-slate-500 mt-1">Update your sign-in password</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate("/change-password")}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 border border-rose-200 text-[#be123c] rounded-xl text-xs font-bold bg-white hover:bg-rose-50 shrink-0"
                  >
                    <Lock className="w-4 h-4" />
                    Change password
                  </button>
                </div>
              </div>
            </PanelSection>
          )}
        </SettingsPanel>
      </div>
    </div>
  );
}
