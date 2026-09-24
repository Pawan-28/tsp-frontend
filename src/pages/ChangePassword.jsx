import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Lock } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";
import TSPublicationDoodleLogo from "../components/TSPublicationDoodleLogo.jsx";

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
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

    setBusy(true);
    try {
      const result = await changePassword(currentPassword, newPassword);
      const role = result?.user?.role || user?.role;
      toast.success("Password updated successfully");
      window.location.assign(role === "employee" ? "/employee" : "/");
      return;
    } catch (err) {
      toast.error(err?.message || "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-rose-50 via-white to-pink-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-4">
            <TSPublicationDoodleLogo
              size={60}
              shape="rounded"
              className="shadow-[0_8px_24px_rgba(0,0,0,0.3)]"
            />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Set a new password</h1>
          <p className="text-sm text-slate-500 mt-1">
            {user?.mustChangePassword
              ? "You must change your temporary password before continuing."
              : "Update your account password."}
          </p>
          {user?.mustChangePassword && (
            <p className="text-xs text-slate-500 mt-2">
              Use the temporary password that was shared with you as the current password.
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white border border-rose-100 rounded-2xl shadow-xl shadow-rose-100/50 p-6 sm:p-8 space-y-4"
        >
          <Field
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={setCurrentPassword}
            autoComplete="current-password"
          />
          <Field
            label="New password"
            type="password"
            value={newPassword}
            onChange={setNewPassword}
            autoComplete="new-password"
          />
          <Field
            label="Confirm new password"
            type="password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white text-sm font-bold"
          >
            {busy ? "Saving…" : "Update password"}
          </button>

          <button
            type="button"
            onClick={() => { logout(); navigate("/login", { replace: true }); }}
            className="w-full py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, type, value, onChange, autoComplete }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide text-rose-700 mb-2">
        {label}
      </label>
      <div className="relative">
        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300"
        />
      </div>
    </div>
  );
}
