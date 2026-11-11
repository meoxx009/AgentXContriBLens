import Link from 'next/link';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import { Shield, ArrowLeft, Lock, Database, EyeOff, Terminal, CheckCircle2 } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — ContribLens',
  description: 'Privacy-preserving static analysis and zero raw secret storage guarantees.',
};

export default function PrivacyPage() {
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
                Privacy &amp; Data Stewardship
              </span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-sustainableLinen tracking-tight font-heading">
              Privacy Policy &amp; Data Principles
            </h1>
            <p className="mt-2 text-sm text-textMuted leading-relaxed">
              ContribLens is built from the ground up on privacy-preserving, evidence-first principles. We do not monetize personal data or retain repository code.
            </p>
          </div>

          <div className="space-y-6">
            <div className="liquid-glass-card p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-3 text-lemonChiffon font-semibold text-base font-heading">
                <Lock className="w-5 h-5 text-electricTangerine" />
                <h2>1. Zero Raw Secret Storage</h2>
              </div>
              <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
                When scanning repositories, any matching API tokens, AWS keys, GitHub PATs, private keys, or passwords are automatically and irreversibly redacted using in-memory regex masking (<code className="text-lemonChiffon font-mono">ghp_****</code>). Raw secrets never touch the database, logs, or AI prompt contexts.
              </p>
            </div>

            <div className="liquid-glass-card p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-3 text-lemonChiffon font-semibold text-base font-heading">
                <Terminal className="w-5 h-5 text-electricTangerine" />
                <h2>2. Zero Code Execution</h2>
              </div>
              <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
                ContribLens never runs arbitrary code, executes scripts, or executes package manager installers (<code className="text-lemonChiffon font-mono">npm install</code>, <code className="text-lemonChiffon font-mono">pip install</code>) against audited repositories. All analysis is purely static, AST/manifest parsed, and read-only.
              </p>
            </div>

            <div className="liquid-glass-card p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-3 text-lemonChiffon font-semibold text-base font-heading">
                <EyeOff className="w-5 h-5 text-electricTangerine" />
                <h2>3. Safe AI Contract &amp; Minimal Bundles</h2>
              </div>
              <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
                We send the AI adapter minimal, redacted evidence bundles rather than whole-repository dumps. Gemma and Gemini are constrained to explain validated facts only and cannot alter findings, invent CVEs, or transmit repository contents outside our secure adapter boundary.
              </p>
            </div>

            <div className="liquid-glass-card p-6 sm:p-8 space-y-3">
              <div className="flex items-center gap-3 text-lemonChiffon font-semibold text-base font-heading">
                <Database className="w-5 h-5 text-electricTangerine" />
                <h2>4. User Rights, Export &amp; Data Portability</h2>
              </div>
              <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
                You own your scan history and generated issue drafts. From your Profile settings, you can export all stored records as a formatted JSON bundle or permanently purge your repository activity and scan history at any time.
              </p>
            </div>
          </div>

          <div className="pt-6 border-t border-borderDark flex flex-wrap items-center justify-between gap-4 text-xs text-textMuted">
            <p>© 2026 ContribLens. Built for open source safety.</p>
            <div className="flex items-center gap-4">
              <Link href="/security" className="hover:text-lemonChiffon transition-colors">Security Model</Link>
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
