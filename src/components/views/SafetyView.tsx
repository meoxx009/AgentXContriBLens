'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import {
  Shield,
  ArrowLeft,
  CheckCircle2,
  Lock,
  FileCheck2,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  Terminal,
  EyeOff,
  Zap,
} from 'lucide-react';

const SAFETY_FAQ = [
  {
    q: 'How does the Disclosure Guard protect exposed secrets?',
    a: 'All API keys, GitHub tokens, AWS credentials, and passwords detected during analysis are masked in-memory before database persistence, logs, or AI prompt contexts. When secrets or critical severity findings are identified, public issue draft generation is strictly blocked (DISCLOSURE_BLOCKED 403), and maintainer private disclosure guidance is provided instead.',
  },
  {
    q: 'Does ContribLens execute repository code?',
    a: 'Never. ContribLens performs 100% static, read-only AST and manifest parsing. It never executes repository code, never runs shell scripts, and never executes package manager commands (e.g. npm install, pip install).',
  },
  {
    q: 'Will ContribLens ever auto-publish pull requests or issues?',
    a: 'Strictly never. Operating under the invariant "Code verifies. AI explains. Human approves.", ContribLens requires explicit human approval for any external publication or PR submission. We never auto-create GitHub issues or PRs.',
  },
  {
    q: 'How are vulnerability advisories and CVEs verified?',
    a: 'Vulnerabilities are cross-referenced directly against official OSV.dev schemas and deterministic scanner rules. AI explanations can only interpret verified finding IDs and cannot invent CVEs or manipulate risk ratings.',
  },
  {
    q: 'Where is my repository analysis data stored?',
    a: 'Analysis results are stored ephemerally with zero long-term raw repository caching. You have complete data sovereignty: export your entire history as JSON at any time or purge all records with one click.',
  },
];

export default function SafetyView() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

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
                ContribLens Safety Center
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-sustainableLinen tracking-tight font-heading">
              Safety Guarantees &amp; Responsible Disclosure
            </h1>
            <p className="mt-2 text-sm text-textMuted leading-relaxed">
              ContribLens is engineered with non-negotiable safety boundaries. We verify facts through deterministic code, summarize evidence through grounded AI, and mandate human approval before anything is published.
            </p>
          </div>

          {/* Safety Guarantees Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="liquid-glass-card p-6 space-y-3">
              <div className="flex items-center gap-2 text-lemonChiffon font-semibold text-sm">
                <Terminal className="w-5 h-5 text-electricTangerine" />
                <span>Zero Code Execution</span>
              </div>
              <p className="text-xs text-textMuted leading-relaxed">
                We never execute untrusted scripts, test runners, or dependency hooks. All analysis is performed through safe, in-memory static AST and manifest parsers.
              </p>
            </div>

            <div className="liquid-glass-card p-6 space-y-3">
              <div className="flex items-center gap-2 text-lemonChiffon font-semibold text-sm">
                <Lock className="w-5 h-5 text-electricTangerine" />
                <span>Zero Secret Exposure</span>
              </div>
              <p className="text-xs text-textMuted leading-relaxed">
                Detected tokens, API keys, and passwords are masked with asterisks before database writes or AI requests. Public issue drafts are unconditionally blocked for secrets.
              </p>
            </div>

            <div className="liquid-glass-card p-6 space-y-3">
              <div className="flex items-center gap-2 text-lemonChiffon font-semibold text-sm">
                <FileCheck2 className="w-5 h-5 text-electricTangerine" />
                <span>Grounded AI Boundary</span>
              </div>
              <p className="text-xs text-textMuted leading-relaxed">
                Our model adapter is strictly prohibited from inventing CVEs, inflating severities, or discussing ungrounded hypotheses. Every explanation links directly to a deterministic rule finding.
              </p>
            </div>

            <div className="liquid-glass-card p-6 space-y-3">
              <div className="flex items-center gap-2 text-lemonChiffon font-semibold text-sm">
                <CheckCircle2 className="w-5 h-5 text-electricTangerine" />
                <span>Human Maintainer Approval</span>
              </div>
              <p className="text-xs text-textMuted leading-relaxed">
                No automatic pull requests or public issue spam. Maintainers review, verify, and publish issue drafts manually. The badge always reads &ldquo;Maintainer review required&rdquo;.
              </p>
            </div>
          </div>

          {/* Responsible Disclosure FAQ Accordion */}
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-platinumSilver/15 space-y-6">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-5 h-5 text-lemonChiffon" />
              <h2 className="text-base font-bold text-sustainableLinen font-heading">
                Responsible Disclosure &amp; Safety FAQ
              </h2>
            </div>

            <div className="space-y-3">
              {SAFETY_FAQ.map((faq, idx) => {
                const isOpen = openFaq === idx;
                return (
                  <div key={idx} className="rounded-xl border border-borderDark bg-black/60 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setOpenFaq(isOpen ? null : idx)}
                      className="w-full p-4 text-left flex items-center justify-between text-xs sm:text-sm font-semibold text-textPrimary hover:bg-blackHole transition-colors"
                    >
                      <span>{faq.q}</span>
                      <ChevronDown
                        className={`w-4 h-4 text-botticelli transition-transform shrink-0 ml-3 ${
                          isOpen ? 'rotate-180 text-lemonChiffon' : ''
                        }`}
                      />
                    </button>
                    {isOpen && (
                      <div className="p-4 pt-1 text-xs text-textMuted border-t border-borderDark/60 leading-relaxed bg-black/40">
                        {faq.a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Disclosure Contact Card */}
          <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-rosewood/40 space-y-3">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="text-base font-bold text-sustainableLinen font-heading">
                Coordinated Vulnerability Disclosure
              </h3>
            </div>
            <p className="text-xs text-textMuted leading-relaxed">
              If you identify a security issue in ContribLens itself or have responsible disclosure inquiries, contact{' '}
              <a
                href="mailto:security@contriblens.org"
                className="text-lemonChiffon font-mono underline hover:text-sustainableLinen transition-colors"
              >
                security@contriblens.org
              </a>
              . We respond within 48 hours and adhere to coordinated disclosure standards.
            </p>
          </div>

          <div className="pt-6 border-t border-borderDark flex flex-wrap items-center justify-between gap-4 text-xs text-textMuted">
            <p>© 2026 ContribLens. Safety, privacy, and beginner enablement.</p>
            <div className="flex items-center gap-4">
              <Link href="/security" className="hover:text-lemonChiffon transition-colors">Security Model</Link>
              <Link href="/privacy" className="hover:text-lemonChiffon transition-colors">Privacy Notice</Link>
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
