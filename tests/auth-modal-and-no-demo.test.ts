import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Auth Modal & Zero Demo Content Verification", () => {
  const loginPath = path.join(process.cwd(), "src", "app", "login", "page.tsx");
  const signupPath = path.join(process.cwd(), "src", "app", "signup", "page.tsx");
  const scanViewPath = path.join(process.cwd(), "src", "components", "views", "ScanView.tsx");
  const authModalPath = path.join(process.cwd(), "src", "components", "auth", "AuthModal.tsx");
  const appContextPath = path.join(process.cwd(), "src", "components", "AppContext.tsx");
  const navbarPath = path.join(process.cwd(), "src", "components", "Navbar.tsx");
  const landingPagePath = path.join(process.cwd(), "src", "app", "page.tsx");

  const loginContent = fs.readFileSync(loginPath, "utf-8");
  const signupContent = fs.readFileSync(signupPath, "utf-8");
  const scanViewContent = fs.readFileSync(scanViewPath, "utf-8");
  const authModalContent = fs.readFileSync(authModalPath, "utf-8");
  const appContextContent = fs.readFileSync(appContextPath, "utf-8");
  const navbarContent = fs.readFileSync(navbarPath, "utf-8");
  const landingPageContent = fs.readFileSync(landingPagePath, "utf-8");

  describe("1. Complete Elimination of Demo Content", () => {
    it("has zero occurrences of 'demo' across login page", () => {
      expect(loginContent.toLowerCase()).not.toContain("demo");
      expect(loginContent).not.toContain("Continue in Local Demo Mode");
      expect(loginContent).not.toContain("Quick Demo Mode");
      expect(loginContent).not.toContain("Judge & Demo");
    });

    it("has zero occurrences of 'demo' across signup page", () => {
      expect(signupContent.toLowerCase()).not.toContain("demo");
      expect(signupContent).not.toContain("Continue in Local Demo Mode");
    });

    it("has zero occurrences of 'demo' in ScanView component", () => {
      expect(scanViewContent.toLowerCase()).not.toContain("demo");
      expect(scanViewContent).not.toContain("Continue with Demo Session & Retry");
    });
  });

  describe("2. Clean, Premium Login and Signup Screens", () => {
    it("login page renders real authentication mechanisms cleanly", () => {
      expect(loginContent).toContain("Welcome back to ContribLens");
      expect(loginContent).not.toContain("Continue with GitHub");
      expect(loginContent).not.toContain("or continue with email");
      expect(loginContent).toContain("login-email");
      expect(loginContent).toContain("login-password");
      expect(loginContent).toContain("/forgot-password");
      expect(loginContent).toContain("Sign in");
      expect(loginContent).toContain("/signup");
    });

    it("signup page renders real registration mechanisms cleanly", () => {
      expect(signupContent).toContain("Create your ContribLens account");
      expect(signupContent).not.toContain("Continue with GitHub");
      expect(signupContent).not.toContain("or sign up with email");
      expect(signupContent).toContain("signup-email");
      expect(signupContent).toContain("signup-password");
      expect(signupContent).toContain("signup-confirm-password");
      expect(signupContent).toContain("calculatePasswordStrength");
      expect(signupContent).toContain("/privacy");
      expect(signupContent).toContain("/login");
    });
  });

  describe("3. Responsive, Accessible AuthModal Component", () => {
    it("auth modal file exists and satisfies accessibility requirements", () => {
      expect(fs.existsSync(authModalPath)).toBe(true);
      expect(authModalContent).toContain('role="dialog"');
      expect(authModalContent).toContain('aria-modal="true"');
      expect(authModalContent).toContain('aria-labelledby="auth-modal-title"');
      expect(authModalContent).toContain('aria-describedby="auth-modal-description"');
      expect(authModalContent).toContain('aria-label="Close dialog"');
    });

    it("supports switching between Login and Signup modes", () => {
      expect(authModalContent).toContain('role="tablist"');
      expect(authModalContent).toContain('aria-selected={mode === "login"}');
      expect(authModalContent).toContain('aria-selected={mode === "signup"}');
      expect(authModalContent).toContain('setMode("login")');
      expect(authModalContent).toContain('setMode("signup")');
    });

    it("implements keyboard navigation: Escape to dismiss and Tab trapping", () => {
      expect(authModalContent).toContain('e.key === "Escape"');
      expect(authModalContent).toContain('e.key === "Tab"');
      expect(authModalContent).toContain("e.shiftKey");
      expect(authModalContent).toContain("handleDismiss");
    });

    it("implements backdrop click dismissibility", () => {
      expect(authModalContent).toContain("e.target === e.currentTarget");
      expect(authModalContent).toContain("handleDismiss()");
    });

    it("resumes original action on successful authentication", () => {
      expect(authModalContent).toContain("authModalOptions?.onSuccess");
      expect(authModalContent).toContain("refreshUser");
      expect(authModalContent).toContain("closeAuthModal()");
    });
  });

  describe("4. AppContext Global Modal Orchestration", () => {
    it("provides isAuthModalOpen, openAuthModal, and closeAuthModal in AppContext", () => {
      expect(appContextContent).toContain("isAuthModalOpen: boolean;");
      expect(appContextContent).toContain("openAuthModal: (options?: AuthModalOptions) => void;");
      expect(appContextContent).toContain("closeAuthModal: () => void;");
      expect(appContextContent).toContain("<AuthModal />");
    });

    it("Honest Session Expired Modal offers in-place sign in via modal and continue browsing", () => {
      expect(appContextContent).toContain("openAuthModal({");
      expect(appContextContent).toContain("Continue Browsing");
      expect(appContextContent).not.toContain("window.location.href = `/login?next=");
    });
  });

  describe("5. Auth-Gated Action Interception", () => {
    it("ScanView auth_required failure triggers AuthModal with scan retry callback", () => {
      expect(scanViewContent).toContain("openAuthModal({");
      expect(scanViewContent).toContain("handleScan();");
      expect(scanViewContent).toContain("Sign In to ContribLens");
    });

    it("Navbar triggers AuthModal for unauthenticated visitors while preserving hrefs", () => {
      expect(navbarContent).toContain("openAuthModal({ initialMode: \"login\" })");
      expect(navbarContent).toContain("openAuthModal({ initialMode: \"signup\" })");
      expect(navbarContent).toContain('href="/login"');
      expect(navbarContent).toContain('href="/signup"');
    });

    it("Landing Page primary and secondary CTAs open AuthModal for unauthenticated visitors", () => {
      expect(landingPageContent).toContain("openAuthModal({");
      expect(landingPageContent).toContain('href="/app/scan"');
      expect(landingPageContent).toContain('href="/signup"');
      expect(landingPageContent).toContain("Scan a repo → get a PR plan");
      expect(landingPageContent).toContain("Get started free");
    });
  });
});
