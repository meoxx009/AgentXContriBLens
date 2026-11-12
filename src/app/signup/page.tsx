"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ContribLensLogo from "@/components/ContribLensLogo";
import { calculatePasswordStrength } from "@/lib/password";
import { ArrowLeft, Lock, Mail, ArrowRight, AlertCircle, CheckCircle2 } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-browser";
import { useFormValidation, SignupInputSchema, FormFieldError } from "@/lib/validation";
import { getAuthRedirectFromParams } from "@/lib/auth-redirect";

type AuthState = "idle" | "focused" | "invalid" | "submitting" | "success" | "server-error";

export default function SignupPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Authoritative validation via SignupInputSchema: enforces minimum 8 chars, "Passwords do not match" check, and acceptedTerms
  const {
    values: formValues,
    errors: formErrors,
    setFieldValue,
    handleBlur: handleFormBlur,
    validateAll,
    applyServerErrors,
  } = useFormValidation({
    schema: SignupInputSchema,
    initialValues: {
      email: "",
      password: "",
      passwordConfirmation: "",
      acceptedTerms: false,
    },
    idPrefix: "signup",
  });

  const strength = calculatePasswordStrength(formValues.password);

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
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formValues.email,
          password: formValues.password,
          passwordConfirmation: formValues.passwordConfirmation,
          acceptedTerms: formValues.acceptedTerms,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setAuthState("invalid");
        const mapped = applyServerErrors(data);
        if (!mapped) {
          setError(data.error || "Unable to create account. Please verify your details.");
        }
        return;
      }

      setAuthState("success");
      const destination = getNextRedirect();

      // Verify session before navigating — call GET /api/auth/me once; only navigate when me returns ok
      let authedUser = data.user || null;
      let verifyOk = false;
      try {
        const verifyRes = await fetch("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
        });
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData.user) authedUser = verifyData.user;
          verifyOk = true;
        }
      } catch (err) {
        console.debug("Initial /api/auth/me check failed:", err);
      }

      if (!verifyOk) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          const retryRes = await fetch("/api/auth/me", {
            credentials: "include",
            cache: "no-store",
          });
          if (retryRes.ok) {
            const retryData = await retryRes.json();
            if (retryData.user) authedUser = retryData.user;
          }
        } catch (err) {
          console.debug("Retry /api/auth/me check failed:", err);
        }
      }

      if (typeof window !== "undefined") {
        window.location.replace(destination);
      } else {
        router.replace(destination);
        router.refresh();
      }
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
            Create your ContribLens account
          </h1>
          <p className="text-xs text-textMuted">
            Save verified scan histories and track your pull request learning progress
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
              <span>Account created successfully. Redirecting...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="signup-email" className="text-xs font-medium text-sustainableLinen">
                Email address
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={formValues.email}
                  onFocus={() => setAuthState("focused")}
                  onChange={(e) => setFieldValue("email", e.target.value)}
                  onBlur={() => handleFormBlur("email")}
                  aria-invalid={Boolean(formErrors.email)}
                  aria-describedby={formErrors.email ? "signup-email-error" : undefined}
                  placeholder="contributor@example.com"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    formErrors.email
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="signup-email-error" error={formErrors.email} />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-password" className="text-xs font-medium text-sustainableLinen">
                Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signup-password"
                  name="password"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={formValues.password}
                  onFocus={() => setAuthState("focused")}
                  onChange={(e) => setFieldValue("password", e.target.value)}
                  onBlur={() => handleFormBlur("password")}
                  aria-invalid={Boolean(formErrors.password)}
                  aria-describedby={formErrors.password ? "signup-password-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    formErrors.password
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="signup-password-error" error={formErrors.password} />

              {/* Password strength meter */}
              {formValues.password && (
                <div className="pt-1.5 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="text-textMuted">Password Strength:</span>
                    <span
                      className={
                        strength.score >= 3
                          ? "text-emerald-400 font-bold"
                          : strength.score === 2
                          ? "text-lemonChiffon font-bold"
                          : "text-red-300 font-bold"
                      }
                    >
                      {strength.label}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5 h-1.5">
                    {[1, 2, 3, 4].map((step) => (
                      <div
                        key={step}
                        className={`rounded-full transition-colors ${
                          strength.score >= step
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
                  <p className="text-[10px] text-textMuted font-mono">
                    Minimum 8 characters with numbers and symbols
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="signup-confirm-password" className="text-xs font-medium text-sustainableLinen">
                Confirm password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="signup-confirm-password"
                  name="passwordConfirmation"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={formValues.passwordConfirmation}
                  onFocus={() => setAuthState("focused")}
                  onChange={(e) => setFieldValue("passwordConfirmation", e.target.value)}
                  onBlur={() => handleFormBlur("passwordConfirmation")}
                  aria-invalid={Boolean(formErrors.passwordConfirmation)}
                  aria-describedby={formErrors.passwordConfirmation ? "signup-confirm-password-error" : undefined}
                  placeholder="••••••••••••"
                  className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                    formErrors.passwordConfirmation
                      ? "border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400"
                      : "border-borderDark focus:border-lemonChiffon/60"
                  }`}
                />
              </div>
              <FormFieldError id="signup-confirm-password-error" error={formErrors.passwordConfirmation} />
            </div>

            {/* Terms Consent Checkbox (44px min tap area) */}
            <div className="space-y-1">
              <label htmlFor="signup-acceptedTerms" className="flex items-start gap-3 pt-1 cursor-pointer min-h-[44px]">
                <input
                  id="signup-acceptedTerms"
                  name="acceptedTerms"
                  type="checkbox"
                  checked={formValues.acceptedTerms}
                  onChange={(e) => setFieldValue("acceptedTerms", e.target.checked)}
                  onBlur={() => handleFormBlur("acceptedTerms")}
                  aria-invalid={Boolean(formErrors.acceptedTerms)}
                  aria-describedby={formErrors.acceptedTerms ? "signup-acceptedTerms-error" : undefined}
                  className="w-4 h-4 mt-0.5 rounded border-platinumSilver/30 bg-black/60 text-electricTangerine focus:ring-0 focus:outline-none cursor-pointer"
                />
                <span className="text-xs text-textMuted leading-relaxed">
                  I agree to the{" "}
                  <Link href="/privacy" className="text-lemonChiffon hover:underline font-medium">
                    Privacy Notice
                  </Link>{" "}
                  and the responsible open source disclosure policy.
                </span>
              </label>
              <FormFieldError id="signup-acceptedTerms-error" error={formErrors.acceptedTerms} />
            </div>

            {/* Primary Submit (Tangerine button) */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-electricTangerine text-black font-bold text-xs sm:text-sm hover:bg-electricTangerine-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-glow-tangerine press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
            >
              <span>{authState === "submitting" ? "Creating account..." : "Create free account"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <div className="pt-2 text-center text-xs text-textMuted border-t border-platinumSilver/15">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-lemonChiffon hover:underline font-semibold press-spring ml-1"
            >
              Log in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
