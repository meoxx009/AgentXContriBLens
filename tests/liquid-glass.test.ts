import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import tailwindConfig from "../tailwind.config";

describe("Prompt P1 — Apple Liquid Glass (iOS 26) Token System", () => {
  const tokensPath = path.join(process.cwd(), "src", "styles", "tokens.css");
  const globalsPath = path.join(process.cwd(), "src", "app", "globals.css");
  const tokensContent = fs.readFileSync(tokensPath, "utf-8");
  const globalsContent = fs.readFileSync(globalsPath, "utf-8");

  it("preserves the locked 12-token palette with exact hex hues", () => {
    const lockedTokens = [
      "--color-black: #000000",
      "--color-black-hole: #222222",
      "--color-coffee-bean: #2D120D",
      "--color-rosewood: #6B0B0C",
      "--color-electric-tangerine: #FF6D1F",
      "--color-lemon-chiffon: #FFF8CA",
      "--color-botticelli: #CDE3E8",
      "--color-mocha-brown: #6F4E37",
      "--color-platinum-silver: #E5E4E2",
      "--color-pale-lavender: #E6E0F0",
      "--color-sustainable-linen: #FAF3E1",
      "--color-recycled-cotton: #F5E7C6",
    ];

    for (const token of lockedTokens) {
      expect(tokensContent).toContain(token);
    }
  });

  it("defines all iOS 26 liquid glass material classes", () => {
    expect(tokensContent).toContain(".glass-panel");
    expect(tokensContent).toContain(".glass-card");
    expect(tokensContent).toContain(".glass-capsule");
    expect(tokensContent).toContain(".glass-nav-capsule");
    expect(tokensContent).toContain(".glass-refraction");
  });

  it("verifies specular rim lighting and blur values", () => {
    // Top rim specular reflection
    expect(tokensContent).toContain("inset 0 1px 0 rgba(245, 243, 237, 0.30)");
    // Specular backdrop blurs
    expect(tokensContent).toContain("blur(32px)");
    expect(tokensContent).toContain("blur(36px)");
    expect(tokensContent).toContain("blur(28px)");
  });

  it("defines spring motion tokens and press-spring utility", () => {
    expect(tokensContent).toContain("--ease-spring: cubic-bezier(0.32, 0.72, 0, 1)");
    expect(tokensContent).toContain("--ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1)");
    expect(tokensContent).toContain("--dur-fast: 180ms");
    expect(tokensContent).toContain("--dur-med: 260ms");
    expect(tokensContent).toContain(".press-spring");
    expect(tokensContent).toContain("scale(0.97)");
  });

  it("preserves backward-compatibility aliases for legacy liquid-glass classes", () => {
    expect(tokensContent).toContain(".liquid-glass");
    expect(tokensContent).toContain(".liquid-glass-card");
    expect(tokensContent).toContain(".liquid-glass-nav");
    expect(tokensContent).toContain(".liquid-glass-hero");
    expect(tokensContent).toContain(".liquid-chrome-pill");
    expect(tokensContent).toContain(".liquid-chrome-orb");
  });

  it("verifies accessible high-contrast fallback for non-backdrop-filter browsers", () => {
    expect(tokensContent).toContain("@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px)))");
    expect(tokensContent).toContain("#222222 !important");
    expect(tokensContent).toContain("#1a1a1c !important");
  });

  it("verifies tailwind.config.ts extends glass-capsule, glass-rim, and spring curves", () => {
    const themeExtend = tailwindConfig.theme?.extend as any;
    expect(themeExtend).toBeDefined();

    // Box shadows
    expect(themeExtend.boxShadow["glass-capsule"]).toBeDefined();
    expect(themeExtend.boxShadow["glass-capsule"]).toContain("0 16px 40px -8px rgba(0, 0, 0, 0.65)");
    expect(themeExtend.boxShadow["glass-rim"]).toBeDefined();

    // Spring transition timing
    expect(themeExtend.transitionTimingFunction.spring).toBe("cubic-bezier(0.32, 0.72, 0, 1)");
    expect(themeExtend.transitionTimingFunction["out-back"]).toBe("cubic-bezier(0.34, 1.56, 0.64, 1)");

    // Durations
    expect(themeExtend.transitionDuration.fast).toBe("180ms");
    expect(themeExtend.transitionDuration.med).toBe("260ms");
  });

  it("verifies reduced-motion rules disable transitions and spring transforms", () => {
    expect(globalsContent).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globalsContent).toContain(".reduce-motion");
    expect(globalsContent).toContain("transition: none !important");
    expect(globalsContent).toContain("transform: none !important");
  });
});
