"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ContribLensLogo from "@/components/ContribLensLogo";
import { ArrowLeft, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { useFormValidation, LoginInputSchema, FormFieldError } from "@/lib/validation";
import { getAuthRedirectFromParams } from "@/lib/auth-redirect";
import { useApp } from "@/components/AppContext";

type AuthState = "idle" | "focused" | "invalid" | "submitting" | "success" | "server-error";

export default function LoginPage() {
  const router = useRouter();
  const { setUser } = useApp();
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);

  const {
    values: formValues,
    errors: formErrors,
    setFieldValue,
    handleBlur: handleFormBlur,
    validateAll,
    applyServerErrors,
  } = useFormValidation({
    schema: LoginInputSchema,
    initialValues: {
      email: "",
      password: "",
    },
    idPrefix: "login",
  });

  const getNextRedirect = useCallback(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return getAuthRedirectFromParams(params, "/app/scan");
    }
    return "/app/scan";
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validation = validateAll();
    if (!validation.isValid) {
      setAuthState("invalid");
      return;
    }

    setAuthState("submitting");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: formValues.email, password: formValues.password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setAuthState("invalid");
        const mapped = applyServerErrors(data);
        if (!mapped) {
          setError(data.error || "Invalid email or password. Please verify your credentials.");
        }
        return;
      }

      setAuthState("success");
      const destination = getNextRedirect();

      // Verify session cookie receipt via /api/auth/me before redirecting
      let authedUser = data.user || null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const verifyRes = await fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store",
          });
          if (verifyRes.ok) {
            const verifyData = await verifyRes.json();
            if (verifyData.user) {
              authedUser = verifyData.user;
              break;
            }
          }
        } catch {
          // Retry
        }
        await new Promise((r) => setTimeout(r, 80));
      }

      if (authedUser && setUser) {
        setUser(authedUser);
      }

      router.replace(destination);
      router.refresh();
    } catch {
      setAuthState("server-error");
      const refId = "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setError(`Unable to connect to authentication service (Ref: ${refId}). Please check your connection and retry.`);
    }
  };

  const isSubmitting = authState === "submitting";

  return (
    <div className="min-h-screen bg-transparent text-textPrimary flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Orange ambient top glow (capped blur <= 40px for mobile GPU budget) */}


      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-xs text-textMuted hover:text-sustainableLinen transition-colors mb-4 press-spring"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>
          <div className="flex justify-center">
            <ContribLensLogo size={36} />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-sustainableLinen tracking-tight">
            Welcome back to ContribLens
          </h1>
          <p className="text-xs text-textMuted">
            Sign in to access your saved repositories and contribution PR plans
          </p>
        </div>

        {/* Centered Floating Glass Panel */}
        <div className="glass-panel p-6 sm:p-8 space-y-6 border border-platinumSilver/25 rounded-2xl shadow-2xl relative">
          {/* Inline Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rosewood/20 border border-rosewood/40 text-xs text-sustainableLinen flex flex-col gap-2.5 animate-in fade-in duration-200"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
                <span className="leading-relaxed">{error}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {authState === "success" && (
            <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-xs text-sustainableLinen flex items-center gap-2.5 animate-in fade-in duration-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Authentication successful. Redirecting...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="login-email" className="text-xs font-medium text-sustainableLinen">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formValues.email}
                  onFocus={() => setAuthState("focused")}
                  onChange={(e) => setFieldValue("email", e.target.value)}
                  onBlur={() => handleFormBlur("email")}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? "login-email-error" : undefined}
                  placeholder="contributor@example.com"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    formErrors.email
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="login-email-error" error={formErrors.email} />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="login-password" className="font-medium text-sustainableLinen">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-electricTangerine hover:underline text-[11px] press-spring"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  value={formValues.password}
                  onFocus={() => setAuthState("focused")}
                  onChange={(e) => setFieldValue("password", e.target.value)}
                  onBlur={() => handleFormBlur("password")}
                  aria-invalid={Boolean(formErrors.password)}
                  aria-describedby={formErrors.password ? "login-password-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    formErrors.password
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="login-password-error" error={formErrors.password} />
            </div>

            {/* Primary Submit (Tangerine button) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-electricTangerine text-black font-bold text-xs sm:text-sm hover:bg-electricTangerine-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-glow-tangerine press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
            >
              <span>{authState === "submitting" ? "Signing in..." : "Sign in"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-textMuted border-t border-platinumSilver/15">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="text-lemonChiffon hover:underline font-semibold press-spring ml-1"
            >
              Sign up free →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
