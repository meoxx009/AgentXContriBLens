"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppContext";
import ContribLensLogo from "@/components/ContribLensLogo";
import { calculatePasswordStrength } from "@/lib/password";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { formatOAuthError } from "@/lib/oauth-error";
import { getSafeAuthRedirect } from "@/lib/auth-redirect";
import { useFormValidation, LoginInputSchema, SignupInputSchema, FormFieldError } from "@/lib/validation";
import {
  X,
  Lock,
  Mail,
  ArrowRight,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { AuthModalSkeleton } from "@/components/ui/Skeleton";

export default function AuthModal() {
  const router = useRouter();
  const {
    isAuthModalOpen,
    authModalOptions,
    closeAuthModal,
    refreshUser,
    setUser,
  } = useApp();

  const [mode, setMode] = useState<"login" | "signup">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loginValidation = useFormValidation({
    schema: LoginInputSchema,
    initialValues: { email: "", password: "" },
    idPrefix: "modal-login",
  });

  const signupValidation = useFormValidation({
    schema: SignupInputSchema,
    initialValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
      acceptedTerms: false,
    },
    idPrefix: "modal-signup",
  });

  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Sync mode with options when modal opens
  useEffect(() => {
    if (isAuthModalOpen) {
      setMode(authModalOptions?.initialMode || "login");
      setError(null);
      setSuccess(null);
      setShowPassword(false);
      loginValidation.reset();
      signupValidation.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthModalOpen, authModalOptions]);

  const handleDismiss = useCallback(() => {
    closeAuthModal();
    if (authModalOptions?.onDismiss) {
      authModalOptions.onDismiss();
    }
  }, [closeAuthModal, authModalOptions]);

  // Focus trap & Escape key listener
  useEffect(() => {
    if (!isAuthModalOpen) return;

    if (typeof document !== "undefined") {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    }

    const timer = setTimeout(() => {
      // Focus the first interactive element (close button or email input)
      if (dialogRef.current) {
        const firstInput = dialogRef.current.querySelector<HTMLInputElement>("input#modal-login-email, input#modal-signup-email");
        if (firstInput) {
          firstInput.focus();
        } else if (closeButtonRef.current) {
          closeButtonRef.current.focus();
        }
      }
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        handleDismiss();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === "function") {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isAuthModalOpen, handleDismiss]);

  if (!isAuthModalOpen) return null;

  const strength = calculatePasswordStrength(signupValidation.values.password);

  const handleSuccessfulAuth = async (userData?: any) => {
    setSuccess("Authentication successful. Resuming...");
    if (userData) {
      setUser(userData);
    }
    await refreshUser().catch((err) => {
      console.debug('Post-auth refreshUser suppressed:', err);
    });
    setTimeout(() => {
      closeAuthModal();
      if (authModalOptions?.onSuccess) {
        authModalOptions.onSuccess();
      }
    }, 350);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = loginValidation.validateAll();
    if (!validation.isValid) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: loginValidation.values.email.trim(),
          password: loginValidation.values.password,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const mapped = loginValidation.applyServerErrors(data);
        if (!mapped) {
          setError(data.error || "Invalid email or password. Please verify your credentials.");
        }
        setSubmitting(false);
        return;
      }

      await handleSuccessfulAuth(data.user);
    } catch {
      const refId = "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setError(`Unable to connect to authentication service (Ref: ${refId}). Please check your connection and retry.`);
      setSubmitting(false);
    }
  };

  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = signupValidation.validateAll();
    if (!validation.isValid) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          email: signupValidation.values.email.trim(),
          password: signupValidation.values.password,
          passwordConfirmation: signupValidation.values.passwordConfirmation,
          acceptedTerms: signupValidation.values.acceptedTerms,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        const mapped = signupValidation.applyServerErrors(data);
        if (!mapped) {
          setError(data.error || "Unable to create account. Please verify your details.");
        }
        setSubmitting(false);
        return;
      }

      await handleSuccessfulAuth(data.user);
    } catch {
      const refId = "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setError(`Unable to connect to authentication service (Ref: ${refId}). Please check your connection and retry.`);
      setSubmitting(false);
    }
  };

  const handleGitHubOAuth = async () => {
    setOauthLoading(true);
    setError(null);
    try {
      const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app/scan";
      const destination = getSafeAuthRedirect(
        currentPath.startsWith("/login") || currentPath.startsWith("/signup") || currentPath === "/"
          ? "/app/scan"
          : currentPath,
        "/app/scan"
      );
      const supabase = getSupabaseBrowserClient();

      if (supabase && isSupabaseConfigured()) {
        const { error: sbError } = await supabase.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination)}`,
          },
        });
        if (sbError) {
          throw sbError;
        }
        return;
      }

      // Fallback for local zero-config / simulated environment
      const res = await fetch("/api/auth/oauth/github", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: "mock_code" }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        await handleSuccessfulAuth(data.user);
      } else {
        setError("GitHub authentication failed. Please retry.");
        setOauthLoading(false);
      }
    } catch (err: any) {
      const refId = "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setError(formatOAuthError(err, refId));
      setOauthLoading(false);
    }
  };

  const isBusy = submitting || oauthLoading;
  const title =
    authModalOptions?.title ||
    (mode === "login" ? "Welcome to ContribLens" : "Create your Account");
  const subtitle =
    authModalOptions?.subtitle ||
    (mode === "login"
      ? "Sign in to scan repositories, audit dependencies, and generate PR plans."
      : "Join ContribLens to save verified scan histories and track PR plans.");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      aria-describedby="auth-modal-description"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        ref={dialogRef}
        className="relative w-full h-full sm:h-auto min-h-screen sm:min-h-0 sm:max-h-[92vh] rounded-none sm:rounded-2xl glass-panel p-5 sm:p-7 border-0 sm:border border-platinumSilver/25 shadow-2xl space-y-5 text-textPrimary overflow-y-auto no-scrollbar animate-in zoom-in-95 duration-200 flex flex-col justify-start max-w-none sm:max-w-md"
      >
        {/* Subtle orange ambient glow in top-right */}
        <div
          className="absolute -top-16 -right-16 w-44 h-44 bg-electricTangerine/15 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Header & Accessible Close Button */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center gap-2.5">
            <ContribLensLogo size={32} />
            <div>
              <span className="font-extrabold tracking-tight text-base text-sustainableLinen leading-none">
                Contrib<span className="text-electricTangerine">Lens</span>
              </span>
              <p className="text-[10px] font-mono text-lemonChiffon/80 uppercase tracking-wider">
                {mode === "login" ? "Sign In" : "Sign Up"}
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={handleDismiss}
            aria-label="Close dialog"
            className="min-w-[44px] min-h-[44px] -mr-2 -mt-2 p-2 rounded-full text-textMuted hover:text-sustainableLinen hover:bg-white/10 transition-colors flex items-center justify-center press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Title and Description */}
        <div className="space-y-1 relative z-10">
          <h2 id="auth-modal-title" className="text-lg sm:text-xl font-heading font-bold text-sustainableLinen tracking-tight">
            {title}
          </h2>
          <p id="auth-modal-description" className="text-xs text-textMuted leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Tab Switcher: Sign In vs Create Account */}
        <div className="relative z-10 grid grid-cols-2 p-1 rounded-xl bg-black/60 border border-platinumSilver/15" role="tablist" aria-label="Authentication modes">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => {
              setMode("login");
              setError(null);
            }}
            className={`min-h-[44px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all press-spring touch-manipulation ${
              mode === "login"
                ? "bg-white/15 text-sustainableLinen shadow-sm"
                : "text-textMuted hover:text-sustainableLinen"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => {
              setMode("signup");
              setError(null);
            }}
            className={`min-h-[44px] py-2 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all press-spring touch-manipulation ${
              mode === "signup"
                ? "bg-white/15 text-sustainableLinen shadow-sm"
                : "text-textMuted hover:text-sustainableLinen"
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Inline Alerts */}
        {error && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rosewood/20 border border-rosewood/40 text-xs text-sustainableLinen flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AlertCircle className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs text-sustainableLinen flex items-center gap-2.5 animate-in fade-in duration-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {oauthLoading ? (
          <AuthModalSkeleton label="GitHub connection" />
        ) : (
          <>
            {/* GitHub OAuth Button */}
            <button
              type="button"
              onClick={handleGitHubOAuth}
              disabled={isBusy}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-platinumSilver/25 hover:border-platinumSilver/40 text-sustainableLinen text-xs sm:text-sm font-semibold flex items-center justify-center gap-2.5 transition-all press-spring disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon/60"
            >
              <svg className="w-4 h-4 fill-current text-sustainableLinen shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              <span>{oauthLoading ? "Connecting to GitHub..." : "Continue with GitHub"}</span>
            </button>

            <div className="relative flex items-center justify-center">
              <div className="border-t border-platinumSilver/15 w-full" />
              <span className="bg-[#0b0c0f] px-3 text-[10px] font-mono uppercase text-textMuted absolute rounded-full">
                or continue with email
              </span>
            </div>

            {/* Email Forms */}
        {mode === "login" ? (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="modal-login-email" className="text-xs font-medium text-sustainableLinen">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="modal-login-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  autoComplete="email"
                  value={loginValidation.values.email}
                  onChange={(e) => loginValidation.setFieldValue("email", e.target.value)}
                  onBlur={() => loginValidation.handleBlur("email")}
                  aria-invalid={Boolean(loginValidation.errors.email)}
                  aria-describedby={loginValidation.errors.email ? "modal-login-email-error" : undefined}
                  placeholder="contributor@example.com"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    loginValidation.errors.email
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="modal-login-email-error" error={loginValidation.errors.email} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="modal-login-password" className="font-medium text-sustainableLinen">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  onClick={handleDismiss}
                  className="text-electricTangerine hover:underline text-[11px] press-spring"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="modal-login-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={loginValidation.values.password}
                  onChange={(e) => loginValidation.setFieldValue("password", e.target.value)}
                  onBlur={() => loginValidation.handleBlur("password")}
                  aria-invalid={Boolean(loginValidation.errors.password)}
                  aria-describedby={loginValidation.errors.password ? "modal-login-password-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-12 py-2.5 text-base sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    loginValidation.errors.password
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-textMuted hover:text-sustainableLinen transition-colors touch-manipulation"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FormFieldError id="modal-login-password-error" error={loginValidation.errors.password} />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-electricTangerine text-black font-bold text-xs sm:text-sm hover:bg-electricTangerine-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-glow-tangerine press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
            >
              <span>{submitting ? "Signing in..." : "Sign in"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignupSubmit} className="space-y-3.5">
            <div className="space-y-1.5">
              <label htmlFor="modal-signup-email" className="text-xs font-medium text-sustainableLinen">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="modal-signup-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  autoComplete="email"
                  value={signupValidation.values.email}
                  onChange={(e) => signupValidation.setFieldValue("email", e.target.value)}
                  onBlur={() => signupValidation.handleBlur("email")}
                  aria-invalid={Boolean(signupValidation.errors.email)}
                  aria-describedby={signupValidation.errors.email ? "modal-signup-email-error" : undefined}
                  placeholder="contributor@example.com"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    signupValidation.errors.email
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="modal-signup-email-error" error={signupValidation.errors.email} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="modal-signup-password" className="text-xs font-medium text-sustainableLinen">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="modal-signup-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={signupValidation.values.password}
                  onChange={(e) => signupValidation.setFieldValue("password", e.target.value)}
                  onBlur={() => signupValidation.handleBlur("password")}
                  aria-invalid={Boolean(signupValidation.errors.password)}
                  aria-describedby={signupValidation.errors.password ? "modal-signup-password-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-12 py-2.5 text-base sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    signupValidation.errors.password
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-1 top-1/2 -translate-y-1/2 min-w-[44px] min-h-[44px] flex items-center justify-center text-textMuted hover:text-sustainableLinen transition-colors touch-manipulation"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FormFieldError id="modal-signup-password-error" error={signupValidation.errors.password} />

              {/* Password strength meter */}
              {signupValidation.values.password && (
                <div className="pt-1 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-textMuted">Password Strength:</span>
                    <span
                      className={
                        strength.score >= 3
                          ? "text-emerald-400 font-bold"
                          : strength.score === 2
                          ? "text-lemonChiffon font-semibold"
                          : "text-red-300 font-medium"
                      }
                    >
                      {strength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 h-1">
                    {[0, 1, 2, 3].map((idx) => (
                      <div
                        key={idx}
                        className={`h-full rounded-full transition-colors ${
                          idx < strength.score
                            ? strength.score >= 3
                              ? "bg-emerald-400"
                              : strength.score === 2
                              ? "bg-lemonChiffon"
                              : "bg-red-400"
                            : "bg-white/10"
                        }`}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="modal-signup-passwordConfirmation" className="text-xs font-medium text-sustainableLinen">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="modal-signup-passwordConfirmation"
                  name="passwordConfirmation"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="new-password"
                  value={signupValidation.values.passwordConfirmation}
                  onChange={(e) => signupValidation.setFieldValue("passwordConfirmation", e.target.value)}
                  onBlur={() => signupValidation.handleBlur("passwordConfirmation")}
                  aria-invalid={Boolean(signupValidation.errors.passwordConfirmation)}
                  aria-describedby={signupValidation.errors.passwordConfirmation ? "modal-signup-passwordConfirmation-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-base sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    signupValidation.errors.passwordConfirmation
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="modal-signup-passwordConfirmation-error" error={signupValidation.errors.passwordConfirmation} />
            </div>

            {/* Terms Consent */}
            <div className="space-y-1">
              <label htmlFor="modal-signup-acceptedTerms" className="flex items-start gap-2.5 pt-1 cursor-pointer min-h-[44px]">
                <input
                  id="modal-signup-acceptedTerms"
                  name="acceptedTerms"
                  type="checkbox"
                  checked={signupValidation.values.acceptedTerms}
                  onChange={(e) => signupValidation.setFieldValue("acceptedTerms", e.target.checked)}
                  onBlur={() => signupValidation.handleBlur("acceptedTerms")}
                  aria-invalid={Boolean(signupValidation.errors.acceptedTerms)}
                  aria-describedby={signupValidation.errors.acceptedTerms ? "modal-signup-acceptedTerms-error" : undefined}
                  className="w-4 h-4 mt-0.5 rounded border-platinumSilver/30 bg-black/60 text-electricTangerine focus:ring-0 focus:outline-none cursor-pointer"
                />
                <span className="text-[11px] text-textMuted leading-relaxed">
                  I agree to the{" "}
                  <Link href="/privacy" onClick={handleDismiss} className="text-lemonChiffon hover:underline font-medium">
                    Privacy Notice
                  </Link>{" "}
                  and the responsible open source disclosure policy.
                </span>
              </label>
              <FormFieldError id="modal-signup-acceptedTerms-error" error={signupValidation.errors.acceptedTerms} />
            </div>

            <button
              type="submit"
              disabled={isBusy}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl bg-electricTangerine text-black font-bold text-xs sm:text-sm hover:bg-electricTangerine-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-glow-tangerine press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
            >
              <span>{submitting ? "Creating account..." : "Create free account"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
          </>
        )}

        {/* Footer switcher */}
        <div className="pt-2 text-center text-xs text-textMuted border-t border-platinumSilver/15">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("signup");
                  setError(null);
                }}
                className="text-lemonChiffon hover:underline font-semibold ml-1 press-spring"
              >
                Sign up free →
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setError(null);
                }}
                className="text-lemonChiffon hover:underline font-semibold ml-1 press-spring"
              >
                Log in →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
