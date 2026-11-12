"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/components/AppContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { GlassStepRail } from "@/components/ui/GlassStepRail";
import {
  Shield,
  Search,
  CheckCircle2,
  ArrowRight,
  Lock,
  Cpu,
  FileText,
  ChevronDown,
  GitPullRequest,
  Zap,
  BookOpen,
  FileSearch,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

const STAGE_TABS = ["finding", "explanation", "route", "draft"] as const;
type StageTab = (typeof STAGE_TABS)[number];

export default function LandingPage() {
  const router = useRouter();
  const { user, openAuthModal } = useApp();
  const [activeStep, setActiveStep] = useState<number>(0);
  const [activePreviewTab, setActivePreviewTab] = useState<StageTab>("finding");
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [isAutoCycle, setIsAutoCycle] = useState(true);

  // Respect prefers-reduced-motion
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setIsAutoCycle(false);
      return;
    }
  }, []);

  // Auto-cycle through the 4 steps unless user interacts
  useEffect(() => {
    if (!isAutoCycle) return;
    const timer = setInterval(() => {
      setActiveStep((prev) => {
        const next = (prev + 1) % 4;
        const tabMap: ("finding" | "explanation" | "route" | "draft")[] = [
          "finding",
          "finding",
          "explanation",
          "route",
        ];
        setActivePreviewTab(tabMap[next]);
        return next;
      });
    }, 6000);
    return () => clearInterval(timer);
  }, [isAutoCycle]);

  const handleStepClick = useCallback((index: number) => {
    setActiveStep(index);
    const tabMap: ("finding" | "explanation" | "route" | "draft")[] = [
      "finding",
      "finding",
      "explanation",
      "route",
    ];
    setActivePreviewTab(tabMap[index]);
    setIsAutoCycle(false);
  }, []);

  const handleTabClick = useCallback((tab: StageTab) => {
    setActivePreviewTab(tab);
    setIsAutoCycle(false);
  }, []);

  const handleTabKeyDown = useCallback(
    (e: React.KeyboardEvent, currentTab: StageTab) => {
      const currentIndex = STAGE_TABS.indexOf(currentTab);
      let nextIndex = currentIndex;
      if (e.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % STAGE_TABS.length;
      } else if (e.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + STAGE_TABS.length) % STAGE_TABS.length;
      } else if (e.key === "Home") {
        nextIndex = 0;
      } else if (e.key === "End") {
        nextIndex = STAGE_TABS.length - 1;
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleTabClick(currentTab);
        return;
      } else {
        return;
      }
      e.preventDefault();
      const nextTab = STAGE_TABS[nextIndex];
      handleTabClick(nextTab);
      const el = document.getElementById(`preview-tab-${nextTab}`);
      el?.focus();
    },
    [handleTabClick]
  );

  const toggleFaq = useCallback((index: number) => {
    setOpenFaq((prev) => (prev === index ? null : index));
  }, []);

  const faqs = [
    {
      q: "How does ContribLens prevent AI from hallucinating security vulnerabilities?",
      a: "ContribLens uses a deterministic security scanner that owns finding existence, severity, and confidence. Code verifies first. The server-only AI adapter (Gemma 4 31B with Gemini fallback) is strictly grounded: it only explains verified, in-memory redacted evidence with SHA-256 hashes. If no API key is provided, the deterministic rule engine provides full explanations without calling external AI.",
    },
    {
      q: "Does ContribLens ever execute repository code during a scan?",
      a: "Never. Scans are 100% read-only static analysis bounded by 60 files, 180 KB/file, and 15 MB total. ContribLens never runs npm install, python setup.py, shell scripts, or CI workflows. Binaries, vendor folders, and generated files are automatically ignored.",
    },
    {
      q: "What is the Skills Gap panel and how does it help first-time contributors?",
      a: "For every verified finding, ContribLens maps the exact skills you will learn by fixing it (e.g. GitHub Actions least-privilege permissions, SHA pinning, semver dependency patching) and provides 2–3 free learning resources (MDN, freeCodeCamp, official documentation, YouTube) so beginners can learn and contribute with confidence.",
    },
    {
      q: "Does ContribLens auto-create pull requests or issues on GitHub?",
      a: "No. ContribLens strictly enforces the human approval principle: Code verifies. AI explains. Human approves. ContribLens produces polite, maintainer-reviewable Markdown issue drafts that you review, copy, and submit yourself. Furthermore, secret leaks and critical findings are guarded: public issue generation is blocked with responsible disclosure guidance (Disclosure Guard).",
    },
    {
      q: "How do I get started with ContribLens?",
      a: "Sign up for a free account with your email to run live security scans on any public repository. ContribLens provides deterministic verification, grounded AI explanations, and beginner-ready PR plans with zero paid dependencies.",
    },
    {
      q: "What visual design system does ContribLens use?",
      a: "ContribLens uses a cohesive 12-token dark-luxury palette: Black Hole base (#222222), Electric Tangerine accent (#FF6D1F), Lemon Chiffon CTAs (#FFF8CA), Botticelli info cues (#CDE3E8), Rosewood critical cues (#6B0B0C), Mocha Brown ambient glows (#6F4E37), Platinum Silver reflections (#E5E4E2), Pale Lavender AI learning accents (#E6E0F0), and Sustainable Linen surfaces (#FAF3E1), wrapped in Apple iOS 26 liquid glass materials.",
    },
  ];

  return (
    <div className="flex flex-col min-h-screen w-full bg-transparent text-textPrimary overflow-x-hidden">
      {/* ========================================================
          SECTION A — HEADER (Floating Capsule Navigation)
          ======================================================== */}
      <Navbar />

      <main className="flex-1 w-full pt-20 sm:pt-24">
        {/* ========================================================
            SECTION B — HERO
            ======================================================== */}
        <section className="relative min-h-[85vh] flex items-center justify-center pt-8 pb-16 px-4 sm:px-6 lg:px-8">
          {/* Ambient atmosphere provided globally by reference background */}



          <div className="max-w-4xl mx-auto w-full space-y-6 text-center relative z-10">
            {/* Headline, sub, CTAs */}
            <div className="space-y-6 text-center">
              <div className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-platinumSilver/20 text-xs font-mono text-platinumSilver/90 shadow-sm backdrop-blur-md">
                <span className="inline-flex items-center gap-1.5 text-[11px] text-electricTangerine font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-electricTangerine animate-pulse" />
                  <span>v2::active</span>
                </span>
                <span className="text-platinumSilver/30">{"//"}</span>
                <span className="font-semibold text-lemonChiffon">ContribLens</span>
                <span className="hidden sm:inline text-platinumSilver/30">•</span>
                <span className="hidden sm:inline text-platinumSilver/70">
                  Security findings → beginner pull requests
                </span>
              </div>

              {/* Single H1 for the entire landing page */}
              <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-sustainableLinen leading-[1.12]">
                Security findings →{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-lemonChiffon via-electricTangerine to-lemonChiffon">
                  beginner pull requests.
                </span>
              </h1>

              <p className="text-base sm:text-lg text-textMuted max-w-2xl mx-auto leading-relaxed">
                Paste any public GitHub repo. Get verified findings, a plain-English explanation, and a beginner-ready PR plan with tests, acceptance criteria, and the skills you&apos;ll learn — exportable as a maintainer-reviewable issue draft.
              </p>

              {/* Primary & Secondary CTAs */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
                <Link
                  href="/app/scan"
                  onClick={(e) => {
                    if (!user) {
                      e.preventDefault();
                      openAuthModal({
                        initialMode: "login",
                        title: "Scan a Repository",
                        subtitle: "Sign in to run vulnerability audits and generate beginner-ready PR plans.",
                        onSuccess: () => router.push("/app/scan"),
                      });
                    }
                  }}
                  className="px-6 py-3 rounded-full bg-lemonChiffon text-black font-bold text-sm hover:bg-lemonChiffon-hover transition-all inline-flex items-center gap-2 shadow-lg hover:shadow-lemonChiffon/20 press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
                >
                  Scan a repo → get a PR plan
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/signup"
                  onClick={(e) => {
                    if (!user) {
                      e.preventDefault();
                      openAuthModal({
                        initialMode: "signup",
                        title: "Join ContribLens",
                        subtitle: "Create a free account to track PR plans and save scan histories.",
                        onSuccess: () => router.push("/app/scan"),
                      });
                    } else {
                      e.preventDefault();
                      router.push("/app/scan");
                    }
                  }}
                  className="px-6 py-3 rounded-full glass-panel text-sustainableLinen font-medium text-sm hover:border-platinumSilver/40 transition-all inline-flex items-center gap-2 press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
                >
                  <Sparkles className="w-4 h-4 text-electricTangerine" />
                  Get started free
                </Link>
              </div>

              {/* Core Principle Tagline */}
              <div className="pt-2 flex items-center justify-center gap-3 text-xs text-textMuted">
                <span className="flex items-center gap-1.5 text-botticelli font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  Code verifies
                </span>
                <span className="text-platinumSilver/30">•</span>
                <span className="flex items-center gap-1.5 text-paleLavender font-medium">
                  <Cpu className="w-4 h-4" />
                  AI explains
                </span>
                <span className="text-platinumSilver/30">•</span>
                <span className="flex items-center gap-1.5 text-lemonChiffon font-medium">
                  <GitPullRequest className="w-4 h-4" />
                  Human approves
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ========================================================
            SECTION C — TRUST STRIP (Glass Capsules)
            ======================================================== */}
        <section className="border-y border-platinumSilver/15 bg-black/60 py-6 px-4">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs text-textMuted">
            <div className="glass-capsule px-4 py-2 rounded-full flex items-center gap-2 border-platinumSilver/20 press-spring">
              <Lock className="w-3.5 h-3.5 text-electricTangerine shrink-0" />
              <span className="text-sustainableLinen font-medium">Zero code execution</span>
            </div>
            <div className="glass-capsule px-4 py-2 rounded-full flex items-center gap-2 border-platinumSilver/20 press-spring">
              <Shield className="w-3.5 h-3.5 text-botticelli shrink-0" />
              <span className="text-sustainableLinen font-medium">Secrets redacted in-memory</span>
            </div>
            <div className="glass-capsule px-4 py-2 rounded-full flex items-center gap-2 border-platinumSilver/20 press-spring">
              <CheckCircle2 className="w-3.5 h-3.5 text-lemonChiffon shrink-0" />
              <span className="text-sustainableLinen font-medium">OSV.dev verified</span>
            </div>
            <div className="glass-capsule px-4 py-2 rounded-full flex items-center gap-2 border-platinumSilver/20 press-spring">
              <FileSearch className="w-3.5 h-3.5 text-paleLavender shrink-0" />
              <span className="text-sustainableLinen font-medium">Evidence hashed (SHA-256)</span>
            </div>
          </div>
        </section>

        {/* ========================================================
            SECTION D — HOW IT WORKS (GlassStepRail)
            ======================================================== */}
        <section id="process" className="py-20 lg:py-28 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-4">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-electricTangerine">
              The Journey
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-sustainableLinen tracking-tight">
              From verified issue to confident contribution.
            </h2>
            <p className="text-sm sm:text-base text-textMuted">
              Four disciplined stages designed to turn raw security findings into actionable learning tasks.
            </p>
          </div>

          <GlassStepRail currentStep={activeStep} onStepChange={handleStepClick} />
        </section>

        {/* ========================================================
            SECTION E — INTERACTIVE PREVIEW
            ======================================================== */}
        <section className="py-16 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto">
          <div className="glass-panel glass-refraction p-6 sm:p-10 rounded-3xl border border-platinumSilver/25 relative shadow-2xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
              <div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/10 text-botticelli border border-white/10 uppercase font-semibold">
                  Live pipeline preview
                </span>
                <h3 className="text-xl font-bold text-sustainableLinen mt-1">
                  Inspect the live ContribLens pipeline
                </h3>
              </div>
              {/* Stage switcher tabs */}
              <div
                role="tablist"
                aria-label="Pipeline stages"
                className="flex items-center gap-1 bg-black/60 p-1 rounded-full border border-platinumSilver/15"
              >
                {STAGE_TABS.map((tab) => {
                  const isSelected = activePreviewTab === tab;
                  return (
                    <button
                      key={tab}
                      id={`preview-tab-${tab}`}
                      role="tab"
                      aria-selected={isSelected}
                      aria-controls={`preview-panel-${tab}`}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => handleTabClick(tab)}
                      onKeyDown={(e) => handleTabKeyDown(e, tab)}
                      className={`px-3.5 py-1.5 text-xs font-mono rounded-full capitalize transition-all press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine ${
                        isSelected
                          ? "bg-electricTangerine text-black font-bold shadow-sm"
                          : "text-textMuted hover:text-sustainableLinen"
                      }`}
                    >
                      {tab}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Stage tab content */}
            <div
              id={`preview-panel-${activePreviewTab}`}
              role="tabpanel"
              aria-labelledby={`preview-tab-${activePreviewTab}`}
              tabIndex={0}
              className="pt-6 min-h-[260px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-platinumSilver/30 rounded-xl"
            >
              {activePreviewTab === "finding" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-red-300 bg-rosewood/25 border border-rosewood/60 px-2.5 py-1 rounded">
                      HIGH SEVERITY · DETERMINISTIC RULE
                    </span>
                    <span className="font-mono text-textMuted text-[11px]">
                      SHA-256: 7d4a...b912 (Verified)
                    </span>
                  </div>
                  <h4 className="text-lg font-bold text-sustainableLinen">
                    GH-ACTIONS-UNPINNED: Action not pinned to full commit SHA
                  </h4>
                  <p className="text-xs text-textMuted leading-relaxed">
                    File: <code className="text-botticelli">.github/workflows/deploy.yml:24</code> uses mutable tag <code className="text-electricTangerine">actions/checkout@v4</code> instead of a full 40-character commit SHA.
                  </p>
                  <div className="p-3 bg-blackHole border border-white/10 rounded-xl text-xs font-mono text-sustainableLinen">
                    <code>uses: actions/checkout@v4 # Should be pinned to SHA</code>
                  </div>
                </div>
              )}

              {activePreviewTab === "explanation" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2 text-xs text-paleLavender font-mono">
                    <Cpu className="w-4 h-4 text-electricTangerine" />
                    <span>Engine: Gemma 4 31B (server-side, grounded) · Deterministic fallback available</span>
                  </div>
                  <h4 className="text-lg font-bold text-sustainableLinen">
                    Plain-English Explanation
                  </h4>
                  <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
                    When GitHub Actions workflows reference third-party actions by a tag (like @v4), an attacker who compromises the upstream repository can move that tag to point to malicious code. Pinning to a cryptographic SHA-256 commit hash guarantees that the exact code you reviewed is what executes in your build pipeline.
                  </p>
                  <div className="p-3 rounded-xl bg-paleLavender/5 border border-paleLavender/20 text-xs text-paleLavender">
                    ✦ Contributor hint: You can find the latest verified commit SHA on the action&apos;s GitHub release page.
                  </div>
                </div>
              )}

              {activePreviewTab === "route" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-lemonChiffon font-semibold uppercase tracking-wider">
                      Beginner Route · 15 Minutes
                    </span>
                    <span className="text-electricTangerine font-mono">+10 Contributor XP</span>
                  </div>
                  <h4 className="text-lg font-bold text-sustainableLinen">
                    Contribution Task: Pin third-party actions to commit SHAs
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                      <span className="font-semibold text-botticelli">Acceptance Criteria</span>
                      <p className="text-textMuted">1. Replace @v4 with 40-character SHA.</p>
                      <p className="text-textMuted">2. Append version comment: # v4.1.2.</p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-black/40 border border-white/10 space-y-1">
                      <span className="font-semibold text-lemonChiffon">Test Plan</span>
                      <p className="text-textMuted">1. Open draft PR in your fork.</p>
                      <p className="text-textMuted">2. Verify GitHub Actions CI runs successfully.</p>
                    </div>
                  </div>
                </div>
              )}

              {activePreviewTab === "draft" && (
                <div className="space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-botticelli font-mono">
                      Markdown Export · Maintainer-reviewable
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono font-semibold">
                      Disclosure Guard Passed
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-sustainableLinen text-black font-mono text-xs space-y-2 max-h-48 overflow-y-auto">
                    <div className="font-bold">### Summary: Pin CI actions to immutable commit SHAs</div>
                    <p className="text-neutral-700">
                      **Problem:** `.github/workflows/deploy.yml` references mutable action tags.
                    </p>
                    <p className="text-neutral-700">
                      **Proposed Fix:** Pin `actions/checkout` to verified commit SHA.
                    </p>
                    <p className="text-neutral-700">
                      **Test Plan:** Verified workflow execution in fork branch.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Section E Primary Action CTA */}
            <div className="mt-8 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="text-xs text-textMuted">
                Ready to generate real pull request plans for your own repositories?
              </div>
              <Link
                href="/signup"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuthModal({
                      initialMode: "signup",
                      title: "Generate Real PR Plans",
                      subtitle: "Create your free account to run scans and build verified PR plans.",
                      onSuccess: () => router.push("/app/scan"),
                    });
                  } else {
                    e.preventDefault();
                    router.push("/app/scan");
                  }
                }}
                className="px-5 py-2.5 rounded-full bg-lemonChiffon text-black font-bold text-xs hover:bg-lemonChiffon-hover transition-all inline-flex items-center gap-2 shadow-md hover:shadow-lemonChiffon/20 press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
              >
                Try it live → Sign up
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================
            SECTION F — FEATURE GRID (6 Glass Cards)
            ======================================================== */}
        <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
          <div className="text-center max-w-3xl mx-auto mb-14 space-y-4">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-lemonChiffon">
              Core Capabilities
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-sustainableLinen tracking-tight">
              Engineered for precision and contributor growth.
            </h2>
            <p className="text-sm sm:text-base text-textMuted">
              Built to bridge the gap between technical security audits and safe open-source pull requests.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Card 1: Evidence-first */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-electricTangerine/10 border border-electricTangerine/30 flex items-center justify-center text-electricTangerine">
                <FileSearch className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                Evidence-First Verification
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Every finding captures the exact file, 1-based line range, and code snippet with a SHA-256 cryptographic evidence hash. Zero vague warnings.
              </p>
            </div>

            {/* Card 2: Beginner PR plans */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-lemonChiffon/10 border border-lemonChiffon/30 flex items-center justify-center text-lemonChiffon">
                <GitPullRequest className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                Beginner-Ready PR Plans
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Actionable tasks with difficulty rating, estimated completion time, suggested changes, test plans, and acceptance criteria.
              </p>
            </div>

            {/* Card 3: Skills Gap Panel */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-paleLavender/10 border border-paleLavender/30 flex items-center justify-center text-paleLavender">
                <BookOpen className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                Skills Gap & Free Resources
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Learn what the fix requires before writing code. Curated free learning links from MDN, freeCodeCamp, official docs, and YouTube.
              </p>
            </div>

            {/* Card 4: OSV Verified */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-botticelli/10 border border-botticelli/30 flex items-center justify-center text-botticelli">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                OSV.dev Advisory Cross-Check
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Real CVE and GHSA advisories cross-referenced via Google&apos;s OSV.dev batch API. AI never invents or hallucinates vulnerability IDs.
              </p>
            </div>

            {/* Card 5: Maintainer-Safe Drafts */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-sustainableLinen/10 border border-sustainableLinen/30 flex items-center justify-center text-sustainableLinen">
                <FileText className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                Maintainer-Safe Issue Drafts
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Structured 8-section Markdown drafts formatted to open-source norms. Zero automated bot spam; human review is required before publishing.
              </p>
            </div>

            {/* Card 6: Keyless Deterministic Fallback */}
            <div className="glass-card p-6 sm:p-7 space-y-4 rounded-2xl border border-platinumSilver/15">
              <div className="w-10 h-10 rounded-xl bg-mochaBrown/20 border border-mochaBrown/40 flex items-center justify-center text-lemonChiffon">
                <Zap className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-sustainableLinen">
                Keyless Deterministic Fallback
              </h3>
              <p className="text-xs text-textMuted leading-relaxed">
                The full scanning and explanation pipeline works with zero API keys and no signup. Judges and contributors reach value in under 2 minutes.
              </p>
            </div>
          </div>
        </section>

        {/* ========================================================
            SECTION G — SAFETY & GOVERNANCE
            ======================================================== */}
        <section id="safety" className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="glass-panel p-8 sm:p-12 rounded-3xl border border-electricTangerine/30 space-y-6 text-center shadow-2xl">
            <div className="w-12 h-12 mx-auto rounded-full bg-electricTangerine/10 border border-electricTangerine/30 flex items-center justify-center text-electricTangerine">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-sustainableLinen">
              Code verifies. AI explains. Human approves.
            </h2>
            <p className="text-sm text-textMuted max-w-2xl mx-auto leading-relaxed">
              ContribLens is an assistive tool for open-source contributors, not an autonomous authority. Secrets are masked in memory before leaving your machine, and public issue generation is automatically blocked for credential leaks and critical vulnerabilities (Disclosure Guard).
            </p>
            <div className="pt-2">
              <Link
                href="/safety"
                className="text-xs font-mono text-electricTangerine hover:underline inline-flex items-center gap-1.5 press-spring"
              >
                Read our full Security Model & Disclosure Policy →
              </Link>
            </div>
          </div>
        </section>

        {/* ========================================================
            SECTION H — FAQ (Glass Accordions)
            ======================================================== */}
        <section id="faqs" className="py-20 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto">
          <div className="text-center mb-12 space-y-3">
            <span className="text-xs font-mono font-semibold uppercase tracking-wider text-botticelli">
              FAQ
            </span>
            <h2 className="text-3xl font-extrabold text-sustainableLinen">
              Frequently Asked Questions
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, index) => {
              const isOpen = openFaq === index;
              return (
                <div
                  key={index}
                  className="glass-card overflow-hidden border border-platinumSilver/15 rounded-xl transition-all"
                >
                  <button
                    id={`faq-btn-${index}`}
                    aria-controls={`faq-panel-${index}`}
                    aria-expanded={isOpen}
                    onClick={() => toggleFaq(index)}
                    className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon/60 rounded-xl press-spring"
                  >
                    <span className="text-sm sm:text-base font-semibold text-sustainableLinen">
                      {faq.q}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-textMuted transition-transform duration-200 shrink-0 ${
                        isOpen ? "rotate-180 text-electricTangerine" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div
                      id={`faq-panel-${index}`}
                      role="region"
                      aria-labelledby={`faq-btn-${index}`}
                      className="px-4 pb-5 sm:px-5 pt-0 text-xs sm:text-sm text-textMuted leading-relaxed border-t border-white/5 mt-2 animate-in fade-in duration-150"
                    >
                      <div className="pt-3">{faq.a}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ========================================================
            SECTION I — FINAL CTA
            ======================================================== */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto">
          <div className="glass-panel p-8 sm:p-14 rounded-3xl border border-lemonChiffon/30 text-center space-y-6 relative overflow-hidden shadow-2xl">

            <h2 className="text-3xl sm:text-4xl font-extrabold text-sustainableLinen tracking-tight">
              Find your first contribution in 2 minutes.
            </h2>
            <p className="text-sm sm:text-base text-textMuted max-w-xl mx-auto">
              Scan any public repository, get a verified PR plan with tests and learning links, and make a meaningful contribution today.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link
                href="/app/scan"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuthModal({
                      initialMode: "login",
                      title: "Scan a Repository",
                      subtitle: "Sign in to audit repositories and get plain-English PR plans.",
                      onSuccess: () => router.push("/app/scan"),
                    });
                  }
                }}
                className="px-7 py-3.5 rounded-full bg-lemonChiffon text-black font-bold text-sm hover:bg-lemonChiffon-hover transition-all shadow-lg hover:shadow-lemonChiffon/20 inline-flex items-center gap-2 press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
              >
                Scan a repo → get a PR plan
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/signup"
                onClick={(e) => {
                  if (!user) {
                    e.preventDefault();
                    openAuthModal({
                      initialMode: "signup",
                      title: "Join ContribLens",
                      subtitle: "Create your account in seconds and start contributing.",
                      onSuccess: () => router.push("/app/scan"),
                    });
                  } else {
                    e.preventDefault();
                    router.push("/app/scan");
                  }
                }}
                className="px-7 py-3.5 rounded-full glass-panel text-sustainableLinen font-medium text-sm hover:border-platinumSilver/40 transition-colors press-spring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electricTangerine"
              >
                Get started free
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ========================================================
          SECTION J — FOOTER
          ======================================================== */}
      <Footer />
    </div>
  );
}
