import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  hashPassword,
  verifyPassword,
  validateEmail,
  signSessionToken,
  verifySessionToken,
  AUTH_COOKIE_NAME,
} from "@/lib/auth";
import { POST as logoutHandler } from "@/app/api/auth/logout/route";
import {
  formatOAuthError,
  isProviderDisabledError,
  GITHUB_PROVIDER_DISABLED_MESSAGE,
} from "@/lib/oauth-error";
import { calculatePasswordStrength } from "@/lib/password";
import { db } from "@/lib/db";
import { POST as loginHandler } from "@/app/api/auth/login/route";
import {
  getSafeAuthRedirect,
  getAuthRedirectFromParams,
  DEFAULT_AUTH_DESTINATION,
} from "@/lib/auth-redirect";

describe("Prompt P5 — Authentication & Glass Auth Screens", () => {
  const loginPagePath = path.join(process.cwd(), "src", "app", "login", "page.tsx");
  const signupPagePath = path.join(process.cwd(), "src", "app", "signup", "page.tsx");
  const forgotPagePath = path.join(process.cwd(), "src", "app", "forgot-password", "page.tsx");

  const loginContent = fs.readFileSync(loginPagePath, "utf-8");
  const signupContent = fs.readFileSync(signupPagePath, "utf-8");
  const forgotContent = fs.readFileSync(forgotPagePath, "utf-8");

  describe("Cryptographic Contracts & Token Persistence", () => {
    it("validates emails correctly", () => {
      expect(validateEmail("contributor@example.com")).toBe(true);
      expect(validateEmail("invalid-email")).toBe(false);
      expect(validateEmail("")).toBe(false);
    });

    it("hashes and verifies passwords securely", async () => {
      const raw = "SuperSecret123!";
      const hash = await hashPassword(raw);
      expect(hash).not.toBe(raw);
      expect(hash.startsWith("$2")).toBe(true);

      const isMatch = await verifyPassword(raw, hash);
      expect(isMatch).toBe(true);

      const isWrong = await verifyPassword("WrongPassword123!", hash);
      expect(isWrong).toBe(false);
    });

    it("signs and verifies JWT session tokens", () => {
      const payload = {
        userId: "user-1234",
        email: "test@example.com",
        name: "Tester",
      };
      const token = signSessionToken(payload);
      expect(token).toBeTruthy();

      const decoded = verifySessionToken(token);
      expect(decoded).toBeTruthy();
      expect(decoded?.userId).toBe(payload.userId);
      expect(decoded?.email).toBe(payload.email);
    });

    it("calculates password strength accurately", () => {
      const veryWeak = calculatePasswordStrength("");
      expect(veryWeak.score).toBe(0);
      expect(veryWeak.label).toBe("Very Weak");

      const weak = calculatePasswordStrength("123");
      expect(weak.score).toBe(1);
      expect(weak.label).toBe("Weak");

      const strong = calculatePasswordStrength("ContribLens2026!Secure");
      expect(strong.score).toBe(4);
      expect(strong.label).toBe("Very Strong");
    });

    it("stores and queries users in local db fallback", () => {
      const testUser = {
        id: "u-test-999",
        email: "unique_test_user@example.com",
        name: "Unique Tester",
        createdAt: new Date().toISOString(),
      };
      db.createUser(testUser);

      const fetched = db.getUserByEmail("unique_test_user@example.com");
      expect(fetched).toBeDefined();
      expect(fetched?.name).toBe("Unique Tester");
    });
  });

  describe("Safe Error Guarantees & Next Redirect Sanitation", () => {
    it("never reveals account existence on invalid credentials", async () => {
      const req = new Request("http://localhost:3000/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nonexistent_account@example.com", password: "SomePassword123!" }),
      });
      const res = await loginHandler(req);
      expect(res.status).toBe(401);

      const data = await res.json();
      expect(data.ok).toBe(false);
      expect(data.error).toBe("Invalid email or password.");
      expect(data.error).not.toContain("not found");
      expect(data.error).not.toContain("does not exist");
    });

    it("sanitizes post-auth redirects, prevents open redirects, and defaults to /app/scan", () => {
      expect(DEFAULT_AUTH_DESTINATION).toBe("/app/scan");

      // Valid internal paths preserved
      expect(getSafeAuthRedirect("/app/findings")).toBe("/app/findings");
      expect(getSafeAuthRedirect("/app/contributions")).toBe("/app/contributions");
      expect(getSafeAuthRedirect("/app/scan?scope=deep")).toBe("/app/scan?scope=deep");

      // External, protocol-relative, and dangerous schemes fall back to /app/scan
      expect(getSafeAuthRedirect("https://malicious.com")).toBe("/app/scan");
      expect(getSafeAuthRedirect("//malicious.com")).toBe("/app/scan");
      expect(getSafeAuthRedirect("javascript:alert(1)")).toBe("/app/scan");
      expect(getSafeAuthRedirect("data:text/html,bad")).toBe("/app/scan");
      expect(getSafeAuthRedirect("/\\malicious.com")).toBe("/app/scan");
      expect(getSafeAuthRedirect(null)).toBe("/app/scan");
      expect(getSafeAuthRedirect(undefined)).toBe("/app/scan");
      expect(getSafeAuthRedirect("")).toBe("/app/scan");

      // Bare /app normalizes to /app/scan
      expect(getSafeAuthRedirect("/app")).toBe("/app/scan");
      expect(getSafeAuthRedirect("/app/")).toBe("/app/scan");

      // Multiple query parameter fallback support (next, returnTo, callbackUrl)
      expect(getAuthRedirectFromParams(new URLSearchParams("next=/app/findings"))).toBe("/app/findings");
      expect(getAuthRedirectFromParams(new URLSearchParams("returnTo=/app/issue-drafts"))).toBe("/app/issue-drafts");
      expect(getAuthRedirectFromParams(new URLSearchParams("callbackUrl=/app/contributions"))).toBe("/app/contributions");
      expect(getAuthRedirectFromParams(new URLSearchParams("returnTo=https://evil.com"))).toBe("/app/scan");
      expect(getAuthRedirectFromParams(new URLSearchParams(""))).toBe("/app/scan");
    });
  });

  describe("Glass Auth Screens Polish & Mobile Standards", () => {
    it("login page renders .glass-panel, tangerine submit, and min 44px tap targets", () => {
      expect(loginContent).toContain("glass-panel");
      expect(loginContent).toContain("bg-electricTangerine");
      expect(loginContent).toContain("min-h-[44px]");
      expect(loginContent).toContain("press-spring");
      expect(loginContent).toContain("Continue with GitHub");
      expect(loginContent).toContain("role=\"alert\"");
    });

    it("signup page features password strength meter, confirmation match, and terms consent", () => {
      expect(signupContent).toContain("glass-panel");
      expect(signupContent).toContain("bg-electricTangerine");
      expect(signupContent).toContain("calculatePasswordStrength");
      expect(signupContent).toContain("Password Strength:");
      expect(signupContent).toContain("signup-confirm-password");
      expect(signupContent).toContain("Passwords do not match");
      expect(signupContent).toContain("acceptedTerms");
      expect(signupContent).toContain("min-h-[44px]");
      // Phone field stays hidden in v2
      expect(signupContent).not.toContain("phone_e164");
    });

    it("forgot-password page renders safe dispatched state with .glass-panel", () => {
      expect(forgotContent).toContain("glass-panel");
      expect(forgotContent).toContain("Reset Link Dispatched");
      expect(forgotContent).toContain("If an account exists for");
      expect(forgotContent).toContain("min-h-[44px]");
    });
  });

  describe("GitHub OAuth Provider Hardening & Friendly Error Mapping", () => {
    it("maps mocked signInWithOAuth rejection with 'provider is not enabled' to actionable dashboard instructions without exposing raw JSON", () => {
      // 1. Raw JSON error returned by Supabase when provider is disabled
      const mockSupabaseError = {
        code: 400,
        error_code: "validation_failed",
        msg: "Unsupported provider: provider is not enabled",
      };

      expect(isProviderDisabledError(mockSupabaseError)).toBe(true);

      const formatted = formatOAuthError(mockSupabaseError);
      expect(formatted).toBe(GITHUB_PROVIDER_DISABLED_MESSAGE);
      expect(formatted).toContain("Authentication → Providers → GitHub");
      // Invariant: NEVER exposes raw JSON or error codes to end user
      expect(formatted).not.toContain("validation_failed");
      expect(formatted).not.toContain("400");
      expect(formatted).not.toContain('{"code":');
    });

    it("handles Error objects and serialized strings containing 'provider is not enabled'", () => {
      const errorObj = new Error("Unsupported provider: provider is not enabled");
      expect(isProviderDisabledError(errorObj)).toBe(true);
      expect(formatOAuthError(errorObj)).toBe(GITHUB_PROVIDER_DISABLED_MESSAGE);

      const errorStr = '{"code":400,"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}';
      expect(isProviderDisabledError(errorStr)).toBe(true);
      expect(formatOAuthError(errorStr)).toBe(GITHUB_PROVIDER_DISABLED_MESSAGE);
    });

    it("leaves unrelated errors untouched and passes standard fallback", () => {
      const networkError = new Error("Network connection lost");
      expect(isProviderDisabledError(networkError)).toBe(false);
      expect(formatOAuthError(networkError)).toBe("Network connection lost");

      const nullError = null;
      expect(isProviderDisabledError(nullError)).toBe(false);
      const fallback = formatOAuthError(nullError, "TEST-REF");
      expect(fallback).toBe("Unable to complete GitHub sign-in (Ref: TEST-REF). Please retry.");
    });

    it("verifies login, signup, and callback screens implement friendly OAuth error mapping", () => {
      expect(loginContent).toContain("formatOAuthError");
      expect(signupContent).toContain("formatOAuthError");

      const callbackPath = path.join(process.cwd(), "src", "app", "auth", "callback", "page.tsx");
      const callbackContent = fs.readFileSync(callbackPath, "utf-8");
      expect(callbackContent).toContain("formatOAuthError");
      expect(callbackContent).toContain("exchangeCodeForSession");
      expect(callbackContent).toContain("destination");
    });
  });

  describe("Profile Settings Logout & Session Destruction", () => {
    it("POST /api/auth/logout clears the session cookie and returns ok", async () => {
      const response = await logoutHandler();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.ok).toBe(true);

      const cookie = response.cookies.get(AUTH_COOKIE_NAME);
      expect(cookie).toBeDefined();
      expect(cookie?.value).toBe("");
      expect(cookie?.maxAge).toBe(0);
      expect(cookie?.httpOnly).toBe(true);
      expect(cookie?.path).toBe("/");
    });

    it("ProfileView renders visible Logout section at the bottom, routes to landing page, and prevents post-logout execution", () => {
      const profilePath = path.join(process.cwd(), "src", "components", "views", "ProfileView.tsx");
      const profileContent = fs.readFileSync(profilePath, "utf-8");

      // Clearly visible Logout section at bottom of Profile Settings
      expect(profileContent).toContain("Session Management / Logout Section at Bottom of Profile Settings");
      expect(profileContent).toContain("aria-label=\"Log out of ContribLens\"");
      expect(profileContent).toContain("min-h-[44px]");
      expect(profileContent).toContain("focus:ring-rosewood/60");

      // Reuses existing logout endpoint
      expect(profileContent).toContain("fetch('/api/auth/logout', { method: 'POST' })");

      // Redirects to public landing page ('/')
      expect(profileContent).toContain("router.push('/')");

      // Guards against in-flight requests and warns on unsaved bio changes
      expect(profileContent).toContain("isLoggingOutRef");
      expect(profileContent).toContain("bioAutosave.hasUnsavedChanges");
      expect(profileContent).toContain("showLogoutWithUnsavedConfirm");
    });
  });
});
