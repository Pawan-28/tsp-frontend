import { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Key, Lock, Eye, EyeOff, Copy, Check, Sparkles, X, User, Mail, ShieldAlert, CheckCircle2 } from "lucide-react";
import toast from "react-hot-toast";
import { apiPost, invalidateCache } from "../../lib/api.js";
import { getAdminCrmHeaders } from "../../lib/crmContext.js";

function generateEasyStrongPassword() {
  const prefixes = ["TsPub", "Sales", "Team", "Growth", "Client"];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const num = Math.floor(1000 + Math.random() * 9000);
  const specials = ["@", "#", "!", "$"];
  const special = specials[Math.floor(Math.random() * specials.length)];
  return `${prefix}${special}${num}`;
}

export default function ResetCredentialsModal({ isOpen, onClose, employee }) {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen && employee) {
      const defaultId = employee.emp_id || employee.login_id || (employee.id ? `EMP-${String(employee.id).padStart(4, "0")}` : "");
      setLoginId(defaultId);
      setPassword("");
      setShowPassword(false);
      setMustChangePassword(false);
      setResult(null);
      setCopied(false);
    }
  }, [isOpen, employee]);

  if (!isOpen || !employee || typeof document === "undefined") return null;

  const handleGeneratePassword = () => {
    const generated = generateEasyStrongPassword();
    setPassword(generated);
    setShowPassword(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!password.trim()) {
      toast.error("Please enter or generate a new password");
      return;
    }
    if (password.trim().length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }

    setLoading(true);
    try {
      const res = await apiPost(
        `/api/team/employees/${employee.id}/reset-password`,
        {
          loginId: loginId.trim() || undefined,
          password: password.trim(),
          mustChangePassword,
        },
        { headers: getAdminCrmHeaders() }
      );

      if (res.success && res.credentials) {
        setResult(res.credentials);
        invalidateCache("/api/team/employees");
        toast.success(`Password updated for ${employee.name}! Old password discarded.`);
      } else {
        toast.error(res.message || "Failed to update password");
      }
    } catch (err) {
      console.error("Failed to reset credentials:", err);
      toast.error(err?.message || "Failed to update employee credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleCopyCredentials = async () => {
    if (!result) return;
    const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/login` : "http://localhost:3000/login";
    const text = `TS Publications CRM Login Credentials\n👤 Employee: ${employee.name}\n🆔 Login ID: ${result.loginId}\n🔑 Password: ${result.password}\n📧 Email: ${result.email || employee.email || "—"}\n🌐 Login Portal: ${portalUrl}`;
    
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("Credentials copied to clipboard!");
      setTimeout(() => setCopied(false), 3000);
    } catch {
      toast.error("Could not copy automatically. Please copy manually.");
    }
  };

  return ReactDOM.createPortal(
    <AnimatePresence>
      <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/60 backdrop-blur-xs"
        />

        {/* Modal Window */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-md rounded-2xl border border-rose-200/80 bg-white p-6 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Decorative Header Accent */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-red-600 via-rose-500 to-pink-500" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full grid place-items-center text-slate-400 hover:text-slate-600 hover:bg-rose-50 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          {!result ? (
            /* ── Reset Form ── */
            <form onSubmit={handleSubmit} className="space-y-4 pt-1">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-600 grid place-items-center shrink-0 border border-rose-100">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Generate New ID / Password
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Update login credentials for <span className="font-bold text-slate-800">{employee.name}</span>. The old password will be permanently discarded.
                  </p>
                </div>
              </div>

              {/* Employee Info Banner */}
              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-3 space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <User className="w-3.5 h-3.5" /> Employee:
                  </span>
                  <span className="font-bold text-slate-800">{employee.name}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <Mail className="w-3.5 h-3.5" /> Linked Email:
                  </span>
                  <span className="font-semibold text-slate-700">{employee.email || "No email"}</span>
                </div>
              </div>

              {/* Login ID Input */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>Username / Login ID</span>
                  <span className="text-[10px] font-normal text-slate-400">Keeps existing account</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={loginId}
                    onChange={(e) => setLoginId(e.target.value)}
                    placeholder="e.g. EMP-0010 or phone/email"
                    className="w-full h-10 px-3.5 rounded-xl border border-rose-100 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Employee uses this Login ID or their email ({employee.email || "email"}) to log in.
                </p>
              </div>

              {/* New Password Input */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-rose-500" />
                    <span>New Password</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="text-[11px] font-bold text-rose-600 hover:text-rose-700 inline-flex items-center gap-1 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Generate Password
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password (min 4 chars)"
                    required
                    className="w-full h-10 pl-3.5 pr-10 rounded-xl border border-rose-100 bg-white text-xs font-bold text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Invalidation Notice */}
              <div className="flex items-start gap-2 rounded-xl bg-amber-50/80 border border-amber-200/80 p-2.5 text-[11px] text-amber-800">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Saving will immediately replace the old password. The employee can log into their existing profile with this new password.
                </span>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-rose-50">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !password.trim()}
                  className="px-4 py-2 rounded-xl gradient-primary text-white text-xs font-bold shadow-md shadow-rose-500/20 hover:opacity-95 transition disabled:opacity-50 cursor-pointer inline-flex items-center gap-1.5"
                >
                  {loading ? (
                    <span>Updating…</span>
                  ) : (
                    <>
                      <Key className="w-3.5 h-3.5" />
                      <span>Update & Discard Old Pass</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* ── Success Card ── */
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center shrink-0 border border-emerald-100">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">
                    Credentials Updated!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    New credentials are live for <span className="font-bold text-slate-800">{employee.name}</span>.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Username / Login ID:</span>
                  <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-emerald-200">
                    {result.loginId}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">New Password:</span>
                  <span className="font-extrabold text-slate-900 bg-white px-2 py-0.5 rounded-md border border-emerald-200 font-mono">
                    {result.password}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-500">Email:</span>
                  <span className="font-semibold text-slate-700">
                    {result.email || employee.email || "—"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="w-full py-2.5 rounded-xl gradient-primary text-white text-xs font-bold shadow-md shadow-rose-500/20 hover:opacity-95 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? "Copied to Clipboard!" : "Copy Login Details"}</span>
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </AnimatePresence>,
    document.body
  );
}
