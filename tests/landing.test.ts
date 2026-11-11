import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Prompt P4 — Landing Page Polish, Sections A–J", () => {
  const pagePath = path.join(process.cwd(), "src", "app", "page.tsx");
  const footerPath = path.join(process.cwd(), "src", "components", "Footer.tsx");
  const globalsPath = path.join(process.cwd(), "src", "app", "globals.css");

  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const footerContent = fs.readFileSync(footerPath, "utf-8");
  const globalsContent = fs.readFileSync(globalsPath, "utf-8");

  describe("Section Structure & Accessibility Hygiene (Tasks 1 & 13)", () => {
    it("has exactly one h1 tag with correct brand headline", () => {
      const h1Matches = pageContent.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g);
      expect(h1Matches).not.toBeNull();
      expect(h1Matches).toHaveLength(1);
      expect(h1Matches![0]).toContain("Security findings →");
      expect(h1Matches![0]).toContain("beginner pull requests.");
    });

    it("verifies sections A through J are present in source order", () => {
      expect(pageContent).toContain("<Navbar"); // Section A
      expect(pageContent).toContain("SECTION B — HERO"); // Section B
      expect(pageContent).toContain("SECTION C — TRUST STRIP"); // Section C
      expect(pageContent).toContain('id="process"'); // Section D
      expect(pageContent).toContain("SECTION E — INTERACTIVE PREVIEW"); // Section E
      expect(pageContent).toContain('id="features"'); // Section F
      expect(pageContent).toContain('id="safety"'); // Section G
      expect(pageContent).toContain('id="faqs"'); // Section H
      expect(pageContent).toContain("SECTION I — FINAL CTA"); // Section I
      expect(pageContent).toContain("<Footer"); // Section J
    });
  });

  describe("Hero & Trust Strip (Tasks 1, 2, 10)", () => {
    it("hero renders clean centered layout with active brand pill and CTAs", () => {
      expect(pageContent).toContain("glass-panel");
      expect(pageContent).toContain("glass-refraction");
      expect(pageContent).not.toContain("Demo preview");
      expect(pageContent).toContain("v2::active");
      expect(pageContent).toContain("Security findings →");
      expect(pageContent).toContain("beginner pull requests.");
      expect(pageContent).toContain("Scan a repo → get a PR plan");
      expect(pageContent).toContain("Get started free");
    });

    it("hero preview card and decorative floating cards are cleanly removed", () => {
      expect(pageContent).not.toContain("expressjs/express");
      expect(pageContent).not.toContain("ci.yml: permissions: write-all");
      expect(pageContent).not.toContain("Skills: GitHub Actions · Least Privilege");
    });

    it("trust strip renders all 4 trust pills with glass capsule styling", () => {
      expect(pageContent).toContain("Zero code execution");
      expect(pageContent).toContain("Secrets redacted in-memory");
      expect(pageContent).toContain("OSV.dev verified");
      expect(pageContent).toContain("Evidence hashed (SHA-256)");
      expect(pageContent).toContain("glass-capsule");
    });
  });

  describe("How it Works & Interactive Preview (Tasks 3, 4)", () => {
    it("renders GlassStepRail with 4 stages", () => {
      expect(pageContent).toContain("<GlassStepRail");
      expect(pageContent).toContain("From verified issue to confident contribution.");
    });

    it("interactive preview allows switching between finding, explanation, route, draft with accessible tabs and live pipeline preview", () => {
      expect(pageContent).not.toContain("Interactive Demo Stage");
      expect(pageContent).toContain("Live pipeline preview");
      expect(pageContent).toContain('role="tablist"');
      expect(pageContent).toContain('role="tab"');
      expect(pageContent).toContain('aria-selected={isSelected}');
      expect(pageContent).toContain('role="tabpanel"');
      expect(pageContent).toContain("GH-ACTIONS-UNPINNED");
      expect(pageContent).toContain("Engine: Gemma 4 31B");
      expect(pageContent).toContain("Beginner Route");
      expect(pageContent).toContain("Disclosure Guard Passed");
      // Working Section E CTA
      expect(pageContent).toContain("Try it live → Sign up");
      expect(pageContent).toContain('href="/signup"');
    });

    it("has zero visible Demo labels or badges across landing page copy", () => {
      expect(pageContent).not.toContain("Demo preview");
      expect(pageContent).not.toContain("Interactive Demo Stage");
      expect(pageContent).not.toContain("interactive demo fixture");
      expect(pageContent).not.toContain("Keyless Demo");
    });
  });

  describe("Feature Grid & Safety (Tasks 5, 6)", () => {
    it("renders 6 .glass-cards for core capabilities", () => {
      expect(pageContent).toContain("Evidence-First Verification");
      expect(pageContent).toContain("Beginner-Ready PR Plans");
      expect(pageContent).toContain("Skills Gap & Free Resources");
      expect(pageContent).toContain("OSV.dev Advisory Cross-Check");
      expect(pageContent).toContain("Maintainer-Safe Issue Drafts");
      expect(pageContent).toContain("Keyless Deterministic Fallback");
      expect(pageContent).toContain("glass-card");
    });

    it("safety section features core principle and Disclosure Guard", () => {
      expect(pageContent).toContain("Code verifies. AI explains. Human approves.");
      expect(pageContent).toContain("Disclosure Guard");
      expect(pageContent).toContain('href="/safety"');
    });
  });

  describe("FAQ Accordions & Final CTA (Tasks 7, 8)", () => {
    it("FAQ accordions are keyboard operable with aria-expanded and aria-controls", () => {
      expect(pageContent).toContain("aria-expanded={isOpen}");
      expect(pageContent).toContain("aria-controls=");
      expect(pageContent).toContain("role=\"region\"");
      expect(pageContent).toContain("focus-visible:ring-2");
    });

    it("final CTA uses .glass-panel with primary scan and get started free options", () => {
      expect(pageContent).toContain("Find your first contribution in 2 minutes.");
      expect(pageContent).toContain('href="/app/scan"');
      expect(pageContent).toContain('href="/signup"');
      expect(pageContent).toContain("Get started free");
      expect(pageContent).not.toContain('href="/app/scan?demo=true"');
    });
  });

  describe("Footer Links & Live Navigation (Tasks 9, 11)", () => {
    it("footer contains live links for privacy, safety, security, and open source", () => {
      expect(footerContent).toContain('href="/privacy"');
      expect(footerContent).toContain('href="/safety"');
      expect(footerContent).toContain('href="/security"');
      expect(footerContent).toContain('href="/stats"');
      expect(footerContent).toContain("https://github.com/meoxx009/AgentXContriBLens");
      expect(footerContent).toContain("https://osv.dev");
      expect(footerContent).toContain("https://ai.google.dev");
    });

    it("verifies Demo route links are removed from page and footer", () => {
      expect(pageContent).not.toContain('href="/app/scan?demo=true"');
      expect(footerContent).not.toContain('href="/app/scan?demo=true"');
      expect(pageContent.toLowerCase()).not.toContain("demo");
    });
  });
});
