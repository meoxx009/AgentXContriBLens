"use client";

import React, { useState } from "react";
import Link from "next/link";
import ContribLensLogo from "@/components/ContribLensLogo";
import { ArrowLeft, Mail, ArrowRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useFormValidation, ForgotPasswordInputSchema, FormFieldError } from "@/lib/validation";

type AuthState = "idle" | "focused" | "invalid" | "submitting" | "success" | "server-error";

export default function ForgotPasswordPage() {
  const [authState, setAuthState] = useState<AuthState>("idle");
  const [error, setError] = useState<string | null>(null);

  const validation = useFormValidation({
    schema: ForgotPasswordInputSchema,
    initialValues: { email: "" },
    idPrefix: "reset",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const validationResult = validation.validateAll();
    if (!validationResult.isValid) {
      setAuthState("invalid");
      return;
    }

    setAuthState("submitting");

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: validation.values.email.trim() }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setAuthState("invalid");
        const mapped = validation.applyServerErrors(data, ["email"]);
        if (!mapped) {
          setError(data.error || "Failed to process password reset request.");
        }
        return;
      }

      setAuthState("success");
    } catch {
      setAuthState("server-error");
      const refId = "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
      setError(`Unable to connect to password reset service (Ref: ${refId}). Please check your connection and retry.`);
    }
  };

  const isSubmitting = authState === "submitting";

  return (
    <div className="min-h-screen bg-transparent text-textPrimary flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Orange ambient top glow (capped blur <= 40px for mobile GPU budget) */}


      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10 space-y-6">
        <div className="text-center space-y-2">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 text-xs text-textMuted hover:text-sustainableLinen transition-colors mb-4 press-spring"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Login
          </Link>
          <div className="flex justify-center">
            <ContribLensLogo size={36} />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-sustainableLinen tracking-tight">
            Reset your password
          </h1>
          <p className="text-xs text-textMuted">
            Enter your email address and we&apos;ll send you instructions to reset your password
          </p>
        </div>

        {/* Centered Floating Glass Panel */}
        <div className="glass-panel p-6 sm:p-8 space-y-6 border border-platinumSilver/25 rounded-2xl shadow-2xl relative">
          {/* Inline Error Alert */}
          {error && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rosewood/20 border border-rosewood/40 text-xs text-sustainableLinen flex items-start gap-2.5 animate-in fade-in duration-200"
            >
              <AlertCircle className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {authState === "success" ? (
            <div className="text-center space-y-4 py-4 animate-in fade-in duration-200">
              <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto shadow-md">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-sustainableLinen">
                Reset Link Dispatched
              </h2>
              <p className="text-xs text-textMuted leading-relaxed max-w-xs mx-auto">
                If an account exists for <strong className="text-lemonChiffon">{validation.values.email}</strong>, you will receive password reset instructions shortly.
              </p>
              <div className="pt-3">
                <Link
                  href="/login"
                  className="px-6 py-2.5 min-h-[44px] rounded-full bg-lemonChiffon text-black font-bold text-xs inline-flex items-center justify-center gap-2 shadow-sm hover:bg-lemonChiffon-hover transition-colors press-spring"
                >
                  Return to sign in
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="reset-email" className="text-xs font-medium text-sustainableLinen">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="reset-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    value={validation.values.email}
                    onFocus={() => setAuthState("focused")}
                    onChange={(e) => validation.setFieldValue("email", e.target.value)}
                    onBlur={() => validation.handleBlur("email")}
                    aria-invalid={Boolean(validation.errors.email)}
                    aria-describedby={validation.errors.email ? "reset-email-error" : undefined}
                    placeholder="contributor@example.com"
                    className={`w-full min-h-[44px] bg-black/60 border rounded-xl pl-10 pr-4 py-2.5 text-xs sm:text-sm text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors ${
                      validation.errors.email
                        ? "border-rosewood/80 focus:border-red-400"
                        : "border-borderDark focus:border-lemonChiffon/60"
                    }`}
                  />
                </div>
                <FormFieldError id="reset-email-error" error={validation.errors.email} />
              </div>

              {/* Primary Submit (Tangerine button) */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[44px] py-3 px-4 rounded-xl bg-electricTangerine text-black font-bold text-xs sm:text-sm hover:bg-electricTangerine-hover transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-glow-tangerine press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
              >
                <span>{authState === "submitting" ? "Sending reset link..." : "Send reset instructions"}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          <div className="pt-2 text-center text-xs text-textMuted border-t border-platinumSilver/15">
            Remember your password?{" "}
            <Link
              href="/login"
              className="text-lemonChiffon hover:underline font-semibold press-spring ml-1"
            >
              Sign in →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
