import { useRef, useState } from "react";
import { Lock, User, Eye, EyeOff, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext.jsx";
import TSPublicationDoodleLogo from "../components/TSPublicationDoodleLogo.jsx";

const LOGIN_TOAST_ID = "login-feedback";

function resolvePostLoginPath(authUser) {
  if (Boolean(authUser?.mustChangePassword)) return "/change-password";
  if (authUser?.role === "employee") return "/employee";
  return "/";
}

function AuthShell({ children, title, subtitle }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,rgba(244,63,94,0.35),transparent)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35] bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px]"
        aria-hidden
      />
      <div className="pointer-events-none absolute -left-24 top-1/4 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-amber-400/10 blur-3xl" aria-hidden />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-10 sm:px-6">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 text-center">
            {/* Logo mark */}
            <div className="mx-auto mb-6 inline-flex items-center justify-center">
              <TSPublicationDoodleLogo
                size={80}
                shape="rounded"
                className="shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_0_1px_rgba(255,255,255,0.06)] hover:shadow-[0_12px_40px_rgba(244,63,94,0.25),0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-300"
              />
            </div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ id, label, icon: Icon, type, value, onChange, placeholder, autoComplete, trailing }) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">
        {label}
      </label>
      <div className="relative group">
        <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500 transition-colors group-focus-within:text-rose-400" />
        <input
          id={id}
          type={type}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          className="w-full rounded-xl border border-white/10 bg-white/[0.06] py-3 pl-10 pr-11 text-sm text-white placeholder:text-slate-500 shadow-inner shadow-black/10 outline-none transition-all focus:border-rose-400/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-rose-500/25"
        />
        {trailing}
      </div>
    </div>
  );
}

export default function Login() {
  const { login, loading: authLoading } = useAuth();
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const submittingRef = useRef(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (busy || submittingRef.current) return;

    if (!loginId.trim() || !password) {
      toast.error("Enter your login ID and password", { id: LOGIN_TOAST_ID });
      return;
    }

    submittingRef.current = true;
    setBusy(true);
    try {
      const authUser = await login(loginId.trim(), password);
      const nextPath = resolvePostLoginPath(authUser);
      toast.success(`Welcome back, ${authUser.name || authUser.loginId}!`, { id: LOGIN_TOAST_ID });
      window.location.replace(nextPath);
    } catch (err) {
      const msg = err?.message || "Invalid login ID or password";
      if (err?.status === 429 || msg.toLowerCase().includes("too many")) {
        toast.error("Login server is busy. Please wait 5 seconds and try again.", { id: LOGIN_TOAST_ID });
      } else if (msg.toLowerCase().includes("timed out") || msg.toLowerCase().includes("database unavailable")) {
        toast.error(
          msg.toLowerCase().includes("database")
            ? "Database unreachable — check backend .env or set VITE_API_URL to your Hostinger backend in frontend/.env.local"
            : "Login timed out — ensure backend is running on port 5000",
          { id: LOGIN_TOAST_ID },
        );
      } else {
        toast.error(msg, { id: LOGIN_TOAST_ID });
      }
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  };

  if (authLoading) {
    return (
      <AuthShell title="TS Publication CRM" subtitle="Preparing your workspace…">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-8 py-12 backdrop-blur-md">
          <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
          <p className="text-sm text-slate-400">Loading session</p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="TS Publication CRM" subtitle="Sign in with your login ID or work email">
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)] backdrop-blur-xl sm:p-8"
      >
        <Field
          id="loginId"
          label="Login ID or email"
          icon={User}
          type="text"
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          placeholder="Your login ID or email"
        />

        <Field
          id="password"
          label="Password"
          icon={Lock}
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-500 transition hover:bg-white/10 hover:text-slate-300"
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />

        <button
          type="submit"
          disabled={busy}
          className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 py-3.5 text-sm font-semibold text-white shadow-lg shadow-rose-900/40 transition hover:from-rose-500 hover:to-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-[11px] text-slate-600">
        Secure access for admin and sales team members
      </p>
    </AuthShell>
  );
}
