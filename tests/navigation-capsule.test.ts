import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

describe("Prompt P3 — Floating Capsule Liquid-Glass Navigation", () => {
  const navbarPath = path.join(process.cwd(), "src", "components", "Navbar.tsx");
  const appLayoutPath = path.join(process.cwd(), "src", "app", "app", "layout.tsx");
  const pagePath = path.join(process.cwd(), "src", "app", "page.tsx");
  const statsPath = path.join(process.cwd(), "src", "app", "stats", "page.tsx");
  const appContextPath = path.join(process.cwd(), "src", "components", "AppContext.tsx");

  const navbarContent = fs.readFileSync(navbarPath, "utf-8");
  const appLayoutContent = fs.readFileSync(appLayoutPath, "utf-8");
  const pageContent = fs.readFileSync(pagePath, "utf-8");
  const statsContent = fs.readFileSync(statsPath, "utf-8");
  const appContextContent = fs.readFileSync(appContextPath, "utf-8");

  describe("Public Navbar (src/components/Navbar.tsx)", () => {
    it("renders floating capsule geometry with glass-nav-capsule token", () => {
      expect(navbarContent).toContain("fixed top-3");
      expect(navbarContent).toContain("rounded-full");
      expect(navbarContent).toContain("glass-nav-capsule");
      expect(navbarContent).toContain("max-w-5xl");
      expect(navbarContent).toContain("h-14");
    });

    it("renders Lemon Chiffon active indicator and spring CTA", () => {
      expect(navbarContent).toContain("bg-lemonChiffon");
      expect(navbarContent).toContain("press-spring");
    });

    it("renders mobile in-capsule horizontal scroll rail and detached dropdown panel (never a sidebar)", () => {
      expect(navbarContent).toContain('data-testid="mobile-nav-rail"');
      expect(navbarContent).toContain("overflow-x-auto");
      expect(navbarContent).toContain("no-scrollbar");
      // Detached dropdown panel uses .glass-panel
      expect(navbarContent).toContain("glass-panel");
      expect(navbarContent).toContain("rounded-2xl");
      // Never a sidebar
      expect(navbarContent).not.toContain("w-64");
      expect(navbarContent).not.toContain("inset-y-0 left-0");
    });

    it("implements rAF-throttled scroll listener with reduced-motion check", () => {
      expect(navbarContent).toContain("requestAnimationFrame");
      expect(navbarContent).toContain("prefers-reduced-motion");
      expect(navbarContent).toContain("window.scrollY > 8");
      expect(navbarContent).toContain("removeEventListener");
    });
  });

  describe("App Shell Nav (src/app/app/layout.tsx)", () => {
    it("renders floating nav capsule with glass-nav-capsule and max-w-6xl", () => {
      expect(appLayoutContent).toContain("fixed top-3");
      expect(appLayoutContent).toContain("rounded-full");
      expect(appLayoutContent).toContain("glass-nav-capsule");
      expect(appLayoutContent).toContain("max-w-6xl");
    });

    it("renders secondary mobile horizontal scroll rail as detached glass capsule", () => {
      expect(appLayoutContent).toContain('data-testid="app-mobile-nav-rail"');
      expect(appLayoutContent).toContain("glass-capsule");
      expect(appLayoutContent).toContain("overflow-x-auto");
      expect(appLayoutContent).toContain("no-scrollbar");
    });

    it("renders all 6 horizontal app sections with accurate icons and active pill styling", () => {
      const expectedSections = [
        "Dashboard",
        "Scan Repository",
        "Findings",
        "Contributions + Stack",
        "Issue Drafts",
        "Profile",
      ];
      for (const section of expectedSections) {
        expect(appLayoutContent).toContain(section);
      }
      expect(appLayoutContent).toContain("text-electricTangerine");
      expect(appLayoutContent).toContain("bg-lemonChiffon");
    });

    it("implements rAF-throttled scroll elevation with reduced-motion check", () => {
      expect(appLayoutContent).toContain("requestAnimationFrame");
      expect(appLayoutContent).toContain("prefers-reduced-motion");
      expect(appLayoutContent).toContain("window.scrollY > 8");
    });
  });

  describe("Content Padding & Toast Layering Audit", () => {
    it("ensures main content has sufficient top padding to prevent floating nav overlap", () => {
      // Landing page main has top padding
      expect(pageContent).toMatch(/<main[^>]+pt-2[04]/);
      // Stats page main has top padding
      expect(statsContent).toMatch(/<main[^>]+pt-24/);
      // App layout main has top padding
      expect(appLayoutContent).toMatch(/<main[^>]+pt-32 md:pt-24/);
    });

    it("ensures toast container has higher z-index than floating navigation", () => {
      // Navbar and AppLayout use z-40
      expect(navbarContent).toContain("z-40");
      expect(appLayoutContent).toContain("z-40");
      // Toast container uses z-[60] or z-50
      expect(appContextContent).toMatch(/z-\[(?:60|50)\]|z-50/);
    });
  });
});
