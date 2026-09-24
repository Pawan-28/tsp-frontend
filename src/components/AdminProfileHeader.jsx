import { Link, useLocation } from "react-router-dom";
import { Settings } from "lucide-react";
import { useAdmin } from "../context/AdminContext.jsx";
import { useAuth } from "../context/AuthContext.jsx";
import AdminDoodleAvatar from "./AdminDoodleAvatar.jsx";
import AvatarUploadButton from "./AvatarUploadButton.jsx";
import { getAdminCrmHeaders } from "../lib/crmContext.js";
import { formatDateTime as formatProfileDateTime } from "../lib/adminProfile.js";

function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function DashboardScrollbarStyles() {
  return (
    <style>{`
      * { scrollbar-width: thin; scrollbar-color: #be123c transparent; }
      *::-webkit-scrollbar { width: 6px; height: 6px; }
      *::-webkit-scrollbar-track { background: transparent; }
      *::-webkit-scrollbar-thumb { background-color: #be123c; border-radius: 999px; }
      .no-sb::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

export default function AdminProfileHeader() {
  const { admin, updateAdmin } = useAdmin();
  const { user, updateAvatar } = useAuth();
  const { pathname } = useLocation();
  const onSettingsPage = pathname === "/settings";
  const photoUrl = user?.avatarUrl || admin.avatarUrl;

  const handlePhotoUploaded = async (url) => {
    await updateAvatar(url);
    updateAdmin({ avatarUrl: url });
  };

  const displayName = admin.fullName || user?.name || "Admin";
  const displayEmail = user?.email || admin.email;
  const lastLogin = user?.lastLoginAt || admin.lastLogin;
  const joinedAt = user?.createdAt || admin.joinedAt;

  const actionLink = !onSettingsPage ? (
    <Link
      to="/settings"
      className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-3 py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold
                 border border-rose-200 text-[#be123c] bg-white hover:bg-rose-50 transition-all shadow-sm"
    >
      <Settings className="w-3.5 h-3.5" />
      Workspace Settings
    </Link>
  ) : (
    <Link
      to="/admin"
      className="flex items-center justify-center gap-1.5 w-full sm:w-auto px-3 py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold
                 border border-rose-200 text-[#be123c] bg-white hover:bg-rose-50 transition-all shadow-sm"
    >
      Admin Profile
    </Link>
  );

  return (
    <div className="rounded-xl sm:rounded-2xl overflow-hidden border border-rose-100 shadow-sm bg-white">
      <div
        className="h-11 sm:h-16 w-full relative"
        style={{ background: "linear-gradient(135deg, #be123c 0%, #e11d48 45%, #f43f5e 100%)" }}
      >
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")",
          }}
        />
        <div className="absolute top-1.5 right-10 sm:top-2 sm:right-16 w-16 h-16 sm:w-24 sm:h-24 rounded-full bg-white/10 blur-2xl" />
      </div>

      <div className="px-4 pb-4 sm:px-6 sm:pb-5 relative">
        {/* Avatar */}
        <div className="absolute -top-7 left-4 sm:-top-9 sm:left-6">
          <div className="rounded-full border-[3px] sm:border-4 border-white shadow-md">
            <AdminDoodleAvatar size={56} shape="circle" className="sm:hidden" photoUrl={photoUrl} />
            <AdminDoodleAvatar size={68} shape="circle" className="hidden sm:block" photoUrl={photoUrl} />
          </div>
          <AvatarUploadButton
            onUploaded={handlePhotoUploaded}
            headers={getAdminCrmHeaders()}
            className="w-5 h-5 sm:w-6 sm:h-6 -bottom-0.5 -right-0.5"
          />
          <span className="absolute top-0.5 right-0.5 sm:top-1 sm:right-1 w-3 h-3 sm:w-3.5 sm:h-3.5 rounded-full bg-emerald-400 border-2 border-white shadow-sm" />
        </div>

        {/* Mobile: compact stacked layout */}
        <div className="pt-9 sm:pt-12 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight leading-tight">
                {displayName}
              </h2>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] sm:text-[10px] font-extrabold bg-[#be123c] text-white uppercase tracking-wider shadow-sm shrink-0">
                {admin.role}
              </span>
              {user?.loginId && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-extrabold bg-slate-100 text-slate-600 uppercase tracking-wider shrink-0">
                  {user.loginId}
                </span>
              )}
            </div>

            <div className="mt-1.5 space-y-0.5 text-[10px] sm:text-xs text-slate-500 font-medium">
              <p className="truncate">
                {displayEmail || admin.department}
                <span className="text-slate-300 mx-1">·</span>
                TS Publication CRM
              </p>
              {joinedAt && <p>Joined {formatDate(joinedAt)}</p>}
              <p className="flex items-center gap-1.5 text-emerald-600">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                <span className="truncate">
                  Last sign-in {lastLogin ? formatProfileDateTime(lastLogin) : "—"}
                </span>
              </p>
            </div>
          </div>

          <div className="w-full sm:w-auto sm:shrink-0">{actionLink}</div>
        </div>
      </div>
    </div>
  );
}
