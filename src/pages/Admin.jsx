import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Shield,
  BadgeCheck,
  Users,
  Activity,
  Globe,
  Laptop,
  ExternalLink,
  Lock,
  LogOut,
} from "lucide-react";
import toast from "react-hot-toast";
import { Badge } from "../components/Primitives.jsx";
import AdminProfileHeader, { DashboardScrollbarStyles } from "../components/AdminProfileHeader.jsx";
import {
  SettingsSidebar,
  SettingsMobileTabs,
  SettingsPanel,
  PanelSection,
  PanelFooter,
  inputClass,
  labelClass,
} from "../components/SettingsLayout.jsx";
import { useAdmin } from "../context/AdminContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import { apiGet } from "../lib/api.js";
import {
  currentBrowserSession,
  formatDateTime,
  mapActivityLogRow,
  mapAuditLogRow,
} from "../lib/adminProfile.js";

const tabs = [
  { id: "profile", label: "Profile", icon: BadgeCheck },
  { id: "security", label: "Sign-in & Security", icon: Shield },
  { id: "access", label: "Access & Permissions", icon: Users },
  { id: "activity", label: "Recent Activity", icon: Activity },
];

export default function Admin() {
  const { admin, updateAdmin } = useAdmin();
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("profile");
  const [profileDirty, setProfileDirty] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [activityRows, setActivityRows] = useState([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [teamCount, setTeamCount] = useState(0);
  const [draft, setDraft] = useState({
    fullName: admin.fullName,
    email: admin.email,
    phone: admin.phone,
    city: admin.city,
    department: admin.department,
    timezone: admin.timezone,
  });

  useEffect(() => {
    setDraft({
      fullName: admin.fullName,
      email: admin.email || user?.email || "",
      phone: admin.phone,
      city: admin.city,
      department: admin.department,
      timezone: admin.timezone,
    });
  }, [admin.fullName, admin.email, admin.phone, admin.city, admin.department, admin.timezone, user?.email]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveData() {
      setActivityLoading(true);
      try {
        const [activityRes, auditRes, teamRes] = await Promise.all([
          apiGet("/api/activity", { skipCache: true, cacheTtl: 0 }).catch(() => null),
          apiGet("/api/v1/audit?limit=20", { skipCache: true, cacheTtl: 0 }).catch(() => null),
          apiGet("/api/team/employees", { skipCache: true, cacheTtl: 0 }).catch(() => null),
        ]);

        if (cancelled) return;

        const activityList = activityRes?.success && Array.isArray(activityRes.activities)
          ? activityRes.activities.map(mapActivityLogRow)
          : [];
        const auditList = auditRes?.success && Array.isArray(auditRes.data)
          ? auditRes.data.map(mapAuditLogRow)
          : [];

        const merged = [...activityList, ...auditList]
          .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
          .slice(0, 20);
        setActivityRows(merged);

        if (teamRes?.success && Array.isArray(teamRes.employees)) {
          setTeamCount(teamRes.employees.length);
        }
      } finally {
        if (!cancelled) setActivityLoading(false);
      }
    }

    loadLiveData();
    return () => { cancelled = true; };
  }, []);

  const updateDraft = (key, value) => {
    setDraft((p) => ({ ...p, [key]: value }));
    setProfileDirty(true);
  };

  const resetDraft = () => {
    setDraft({
      fullName: admin.fullName,
      email: admin.email,
      phone: admin.phone,
      city: admin.city,
      department: admin.department,
      timezone: admin.timezone,
    });
    setProfileDirty(false);
  };

  const handleSaveProfile = () => {
    updateAdmin({
      ...draft,
      initials: draft.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    });
    setProfileDirty(false);
    toast.success("Admin profile updated");
  };

  const handleChangePassword = async (event) => {
    event.preventDefault();

    if (!currentPassword) {
      toast.error("Enter your current password");
      return;
    }
    if (newPassword.length < 6) {
      toast.error("New password must be at least 6 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    if (newPassword === currentPassword) {
      toast.error("New password must be different from your current password");
      return;
    }

    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password updated successfully");
    } catch (err) {
      toast.error(err?.message || "Could not update password");
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const sessions = [currentBrowserSession(user?.lastLoginAt || admin.lastLogin)];

  const profileFields = [
    { key: "fullName", label: "Full Name" },
    { key: "email", label: "Work Email", readOnly: true },
    { key: "phone", label: "Phone Number" },
    { key: "city", label: "City" },
    { key: "department", label: "Department" },
    { key: "timezone", label: "Timezone" },
  ];

  return (
    <div className="space-y-4 sm:space-y-6 page-shell min-w-0">
      <DashboardScrollbarStyles />
      <AdminProfileHeader />

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 sm:gap-6 min-w-0">
        <SettingsMobileTabs
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <SettingsSidebar
          title="Admin Control"
          subtitle="Manage account, access & security"
          tabs={tabs}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />

        <SettingsPanel
          footer={
            activeTab === "profile" ? (
              <PanelFooter
                left={
                  <Badge tone={profileDirty ? "warning" : "muted"}>
                    {profileDirty ? "Unsaved profile changes" : "Profile synchronized"}
                  </Badge>
                }
                actions={
                  <>
                    <button
                      type="button"
                      onClick={resetDraft}
                      className="flex-1 sm:flex-initial px-4 py-2 border border-rose-200 hover:border-rose-400 text-[#be123c] rounded-xl text-xs font-bold transition-all shadow-sm bg-white"
                    >
                      Reset
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      className="flex-1 sm:flex-initial px-4 py-2 bg-[#be123c] hover:bg-[#a20f32] text-white rounded-xl text-xs font-bold transition-all shadow-md active:translate-y-px"
                    >
                      Save Profile
                    </button>
                  </>
                }
              />
            ) : null
          }
        >
          {activeTab === "profile" && (
            <PanelSection
              title="Admin Profile"
              subtitle="Your identity across the TS Publication workspace"
            >
              <div className="p-4 border border-rose-100/50 rounded-2xl bg-white space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-[#be123c] uppercase">Personal details</span>
                  <Badge tone="primary">{admin.role}</Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>Login ID</label>
                    <input
                      value={user?.loginId || admin.loginId || "—"}
                      readOnly
                      className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
                    />
                  </div>
                  {profileFields.map(({ key, label, readOnly }) => (
                    <div key={key}>
                      <label className={labelClass}>{label}</label>
                      <input
                        value={draft[key]}
                        onChange={(e) => !readOnly && updateDraft(key, e.target.value)}
                        readOnly={readOnly}
                        className={readOnly ? `${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed` : inputClass}
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
                      Signed in as {user?.loginId || user?.email || admin.email}
                      {user?.lastLoginAt ? ` · Last login ${formatDateTime(user.lastLoginAt)}` : ""}
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

          {activeTab === "security" && (
            <PanelSection
              title="Sign-in & Security"
              subtitle="Update your admin password and manage sign-in"
            >
              <form onSubmit={handleChangePassword} className="p-4 border border-rose-100/50 rounded-2xl bg-white space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                  <span className="text-xs font-black text-[#be123c] uppercase">Change password</span>
                  <Badge tone="muted">{user?.loginId || "Admin"}</Badge>
                </div>
                <p className="text-[11px] text-slate-500">
                  Use your current password, then choose a new one with at least 6 characters.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <PasswordField
                    label="Current password"
                    value={currentPassword}
                    onChange={setCurrentPassword}
                    autoComplete="current-password"
                  />
                  <div className="hidden md:block" />
                  <PasswordField
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                  />
                  <PasswordField
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={passwordBusy}
                    className="px-4 py-2 bg-[#be123c] hover:bg-[#a20f32] disabled:opacity-60 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                  >
                    {passwordBusy ? "Updating…" : "Update password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="px-4 py-2 border border-rose-200 text-[#be123c] rounded-xl text-xs font-bold bg-white hover:bg-rose-50"
                  >
                    Clear
                  </button>
                </div>
              </form>

              <div className="space-y-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Current session</p>
                {sessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl border border-rose-100/50 bg-white"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0">
                        <Laptop className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">{session.device}</p>
                        <p className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Globe className="w-3 h-3" />
                          {session.location} · {session.lastActive}
                        </p>
                      </div>
                    </div>
                    {session.current && <Badge tone="success">Current</Badge>}
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {activeTab === "access" && (
            <PanelSection
              title="Access & Permissions"
              subtitle="What this admin account can do in the CRM"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 border border-rose-100/50 rounded-2xl bg-slate-50/50">
                  <p className={labelClass}>Role</p>
                  <p className="text-lg font-black text-slate-900">{admin.role}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Highest workspace privilege tier</p>
                </div>
                <div className="p-4 border border-rose-100/50 rounded-2xl bg-white">
                  <p className={labelClass}>Team members</p>
                  <p className="text-lg font-black text-slate-900">{teamCount}</p>
                  <p className="text-[11px] text-slate-500 mt-1">Active employees in database</p>
                </div>
              </div>
              <div>
                <p className={labelClass}>Granted permissions</p>
                <div className="flex flex-wrap gap-2 mt-2">
                  {admin.permissions.map((perm) => (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold
                                 bg-rose-50 text-rose-800 border border-rose-100"
                    >
                      <BadgeCheck className="w-3 h-3 text-rose-600" />
                      {perm}
                    </span>
                  ))}
                </div>
              </div>
            </PanelSection>
          )}

          {activeTab === "activity" && (
            <PanelSection
              title="Recent Admin Activity"
              subtitle="Latest changes made under this account"
            >
              <div className="space-y-2">
                {activityLoading ? (
                  <p className="text-xs text-slate-400 py-6 text-center">Loading activity…</p>
                ) : activityRows.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">No activity logged yet</p>
                ) : (
                  activityRows.map((entry) => (
                    <div
                      key={entry.id ?? entry.action}
                      className="flex items-start justify-between gap-4 p-3 rounded-xl border border-rose-100/50 bg-white hover:bg-rose-50/30 transition"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0">
                          <Activity className="w-4 h-4" />
                        </div>
                        <p className="text-xs font-bold text-slate-800">{entry.action}</p>
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">{entry.time}</span>
                    </div>
                  ))
                )}
              </div>
              <Link
                to="/settings"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#be123c] hover:text-[#a20f32] mt-2"
              >
                View full audit trail in Settings
                <ExternalLink className="w-3 h-3" />
              </Link>
            </PanelSection>
          )}
        </SettingsPanel>
      </div>
    </div>
  );
}

function PasswordField({ label, value, onChange, autoComplete }) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="password"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`${inputClass} pl-10`}
        />
      </div>
    </div>
  );
}
