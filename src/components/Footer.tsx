import React from "react";
import Link from "next/link";
import ContribLensLogo from "./ContribLensLogo";
import { Shield, Lock, ExternalLink, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="w-full border-t border-borderDark bg-black/80 backdrop-blur-md relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand Col */}
          <div className="space-y-4 md:col-span-1">
            <ContribLensLogo size={28} showTagline={true} />
            <p className="text-xs text-textMuted leading-relaxed">
              Transforming verified security and hygiene findings into beginner-ready pull request plans with tests and acceptance criteria.
            </p>
            <div className="flex items-center gap-2 pt-2 text-[11px] text-platinumSilver/60">
              <Shield className="w-3.5 h-3.5 text-botticelli" />
              <span>Zero repository code execution</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-platinumSilver/60">
              <Lock className="w-3.5 h-3.5 text-electricTangerine" />
              <span>In-memory secret redaction</span>
            </div>
          </div>

          {/* Product links */}
          <div>
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-sustainableLinen mb-4">
              Product
            </h4>
            <ul className="space-y-2.5 text-xs text-textMuted">
              <li>
                <Link href="/app/scan" className="hover:text-sustainableLinen transition-colors">
                  Scan Repository
                </Link>
              </li>
              <li>
                <Link href="/stats" className="hover:text-sustainableLinen transition-colors flex items-center gap-1.5">
                  Public Stats
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-electricTangerine/20 text-electricTangerine font-mono">
                    Live
                  </span>
                </Link>
              </li>
              <li>
                <Link href="/#process" className="hover:text-sustainableLinen transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="/#features" className="hover:text-sustainableLinen transition-colors">
                  Features
                </Link>
              </li>
            </ul>
          </div>

          {/* Safety & Policy */}
          <div>
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-sustainableLinen mb-4">
              Trust & Safety
            </h4>
            <ul className="space-y-2.5 text-xs text-textMuted">
              <li>
                <Link href="/safety" className="hover:text-sustainableLinen transition-colors">
                  Safety Promise
                </Link>
              </li>
              <li>
                <Link href="/security" className="hover:text-sustainableLinen transition-colors">
                  Security Policy & Disclosure
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-sustainableLinen transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/#faqs" className="hover:text-sustainableLinen transition-colors">
                  Frequently Asked Questions
                </Link>
              </li>
            </ul>
          </div>

          {/* Community & Open Source */}
          <div>
            <h4 className="text-xs font-mono font-semibold uppercase tracking-wider text-sustainableLinen mb-4">
              Open Source
            </h4>
            <ul className="space-y-2.5 text-xs text-textMuted">
              <li>
                <a
                  href="https://github.com/meoxx009/AgentXContriBLens"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sustainableLinen transition-colors inline-flex items-center gap-1.5"
                >
                  GitHub Repository
                  <ExternalLink className="w-3 h-3 text-platinumSilver/40" />
                </a>
              </li>
              <li>
                <a
                  href="https://osv.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sustainableLinen transition-colors inline-flex items-center gap-1.5"
                >
                  OSV.dev Database
                  <ExternalLink className="w-3 h-3 text-platinumSilver/40" />
                </a>
              </li>
              <li>
                <a
                  href="https://ai.google.dev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-sustainableLinen transition-colors inline-flex items-center gap-1.5"
                >
                  Google Gemma / Gemini
                  <ExternalLink className="w-3 h-3 text-platinumSilver/40" />
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-borderDark flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-textMuted">
          <div className="flex items-center gap-2">
            <span>© 2026 ContribLens.</span>
            <span className="text-platinumSilver/30">•</span>
            <span className="text-sustainableLinen font-medium">
              Code verifies. AI explains. Human approves.
            </span>
          </div>
          <div className="flex items-center gap-1 text-[11px] text-platinumSilver/50">
            <span>Built for open-source beginners</span>
            <Heart className="w-3 h-3 text-electricTangerine fill-electricTangerine" />
          </div>
        </div>
      </div>
    </footer>
  );
}
