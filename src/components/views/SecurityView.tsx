'use client';

import React from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Shield,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Cpu,
  FileCheck2,
  UserCheck,
  AlertTriangle,
  EyeOff,
  Server,
  FileText,
  KeyRound,
  ExternalLink,
} from 'lucide-react';

export default function SecurityView() {
  return (
    <div className="flex flex-col min-h-screen bg-transparent text-textPrimary">
      <Navbar />

      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 pt-24 pb-16 relative overflow-hidden">
        {/* Ambient Tangerine Glow (capped blur <= 40px for mobile GPU budget) */}


        <div className="relative z-10 space-y-10">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted hover:text-lemonChiffon transition-colors mb-6"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Home
            </Link>

            <div className="flex items-center gap-3 mb-3">
              <span className="p-2 rounded-lg bg-electricTangerine/10 border border-electricTangerine/20 text-electricTangerine">
                <Shield className="w-6 h-6" />
              </span>
              <span className="text-xs font-mono uppercase tracking-widest text-electricTangerine">
                ContribLens Security &amp; Safety Model
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-sustainableLinen tracking-tight font-heading">
              Security Guarantees &amp; Responsible Disclosure
            </h1>
            <p className="mt-2 text-sm text-textMuted leading-relaxed">
              ContribLens adheres to a strict non-negotiable safety invariant:
              <strong className="text-lemonChiffon block mt-1 font-semibold">
                Code verifies. AI explains. Human approves.
              </strong>
            </p>
          </div>

          {/* 3 Core Pillars */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="liquid-glass-card p-5 rounded-2xl space-y-2">
              <Cpu className="w-6 h-6 text-electricTangerine" />
              <h3 className="text-sm font-semibold text-sustainableLinen">1. Code Verifies</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Vulnerabilities and security risks are detected solely by deterministic AST/manifest parsers and official OSV.dev advisories.
              </p>
            </div>

            <div className="liquid-glass-card p-5 rounded-2xl space-y-2">
              <FileCheck2 className="w-6 h-6 text-lemonChiffon" />
              <h3 className="text-sm font-semibold text-sustainableLinen">2. AI Explains</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                Gemma 4 31B and Gemini translate validated evidence into beginner-friendly guidance. AI cannot invent CVEs or inflate severities.
              </p>
            </div>

            <div className="liquid-glass-card p-5 rounded-2xl space-y-2">
              <UserCheck className="w-6 h-6 text-botticelli" />
              <h3 className="text-sm font-semibold text-sustainableLinen">3. Human Approves</h3>
              <p className="text-xs text-textMuted leading-relaxed">
                No automatic pull requests or public issue spam. Maintainers review, verify, and publish issue drafts manually.
              </p>
            </div>
          </div>

          {/* Scanning Scope */}
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-platinumSilver/15 space-y-6">
            <h2 className="text-base font-semibold text-lemonChiffon uppercase tracking-wider font-heading">
              Repository Scanning Scope &amp; Safety Boundaries
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="p-4 rounded-xl bg-black/60 border border-emerald-500/20 space-y-2">
                <span className="font-bold text-emerald-400 block text-sm">What ContribLens Scans:</span>
                <ul className="space-y-1.5 text-textMuted list-disc pl-3">
                  <li>Public GitHub repositories accessible over HTTPS.</li>
                  <li>Dependency manifests (package.json, lockfiles, requirements.txt, pyproject.toml).</li>
                  <li>CI/CD workflows (.github/workflows/*.yml) for permission misconfigurations.</li>
                  <li>Community governance health files (SECURITY.md, LICENSE, README, CONTRIBUTING.md).</li>
                  <li>Bounded text/configuration files strictly under 60 files, 180 KB per file, and 15 MB total.</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-black/60 border border-rosewood/40 space-y-2">
                <span className="font-bold text-red-300 block text-sm">What ContribLens Never Does:</span>
                <ul className="space-y-1.5 text-textMuted list-disc pl-3">
                  <li>Never executes repository code or shell scripts.</li>
                  <li>Never runs package managers (npm install, pip install).</li>
                  <li>Never scans private repositories without explicit user credentials.</li>
                  <li>Never submits public pull requests or issues automatically.</li>
                  <li>Never logs or transmits unmasked secrets or credentials.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Disclosure Guard Policy */}
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-rosewood/30 space-y-4">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5 text-red-400" />
              <h2 className="text-base font-semibold text-sustainableLinen font-heading">
                Responsible Disclosure Guard (SECURITY.md §4)
              </h2>
            </div>
            <p className="text-xs text-textMuted leading-relaxed">
              When ContribLens detects high-confidence exposed secrets or critical unpatched RCE vulnerabilities, it automatically invokes the Disclosure Guard: public issue drafts are BLOCKED with HTTP 403 <code className="text-lemonChiffon font-mono">DISCLOSURE_BLOCKED</code>. Instead, the contributor is provided with private security disclosure instructions and maintainer security contact details to prevent accidental public disclosure.
            </p>
          </div>

          {/* Responsible Disclosure Contact */}
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-electricTangerine/30 space-y-3">
            <div className="flex items-center gap-2 text-electricTangerine">
              <Lock className="w-5 h-5" />
              <h2 className="text-base font-semibold text-sustainableLinen font-heading">
                Reporting Vulnerabilities in ContribLens
              </h2>
            </div>
            <p className="text-xs text-textMuted leading-relaxed">
              If you discover a security vulnerability in ContribLens itself, please report it via private email only (never public issues) to{' '}
              <a
                href="mailto:security@contriblens.org"
                className="text-lemonChiffon font-mono underline hover:text-sustainableLinen transition-colors"
              >
                security@contriblens.org
              </a>
              . We acknowledge receipt within 48 hours and coordinate responsible disclosure.
            </p>
          </div>

          <div className="pt-6 border-t border-borderDark flex flex-wrap items-center justify-between gap-4 text-xs text-textMuted">
            <p>© 2026 ContribLens. Code verifies. AI explains. Human approves.</p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-lemonChiffon transition-colors">Privacy Notice</Link>
              <Link href="/safety" className="hover:text-lemonChiffon transition-colors">Safety Model</Link>
              <Link href="/stats" className="hover:text-lemonChiffon transition-colors">Public Stats</Link>
              <Link href="/" className="hover:text-lemonChiffon transition-colors">Home</Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
