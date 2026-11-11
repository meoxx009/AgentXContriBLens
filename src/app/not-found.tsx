'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Compass,
  Search,
  Home,
  ArrowLeft,
  LayoutDashboard,
  Shield,
  Activity,
  ArrowRight,
} from 'lucide-react';
import ContribLensLogo from '@/components/ContribLensLogo';

export default function NotFound() {
  const router = useRouter();

  const handleGoBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      window.history.back();
    } else {
      router.push('/app/dashboard');
    }
  };

  return (
    <main
      role="main"
      aria-labelledby="not-found-heading"
      className="min-h-screen bg-transparent text-textPrimary flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden"
    >
      {/* Smoky Ambient Glow Background */}
      <div
        className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
      >
        <div className="w-[450px] sm:w-[600px] h-[450px] sm:h-[600px] rounded-full bg-electricTangerine/5 blur-[120px]" />
        <div className="w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] rounded-full bg-botticelli/5 blur-[100px] -translate-y-24" />
      </div>

      <div className="liquid-glass-card p-6 sm:p-10 max-w-xl w-full text-center space-y-7 rounded-3xl border border-borderDark shadow-glass-card animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center gap-2">
          <ContribLensLogo size={32} showTagline={false} />
          <span className="text-[11px] font-mono tracking-widest uppercase text-lemonChiffon px-3 py-0.5 rounded-full bg-coffeeBean/60 border border-lemonChiffon/25">
            HTTP 404 • Not Found
          </span>
        </div>

        {/* Visual Icon Orb */}
        <div className="w-16 h-16 mx-auto rounded-full bg-botticelli/10 border border-botticelli/30 flex items-center justify-center text-botticelli shadow-inner">
          <Compass className="w-8 h-8 animate-pulse text-lemonChiffon" aria-hidden="true" />
        </div>

        {/* Honest Copy */}
        <div className="space-y-2">
          <h1
            id="not-found-heading"
            className="text-2xl sm:text-3xl font-heading font-bold text-sustainableLinen tracking-tight"
          >
            This page doesn&apos;t exist
          </h1>
          <p className="text-xs sm:text-sm text-textMuted max-w-md mx-auto leading-relaxed">
            The link you followed may be outdated, removed, or the address might have been typed incorrectly. No repository data or verified findings were affected.
          </p>
        </div>

        {/* Useful Next Steps (No Dead Ends) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1">
          {/* Start a Scan - Primary Call to Action */}
          <Link
            href="/app/scan"
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-md press-spring touch-manipulation"
          >
            <Search className="w-4 h-4 shrink-0" />
            <span>Start a Scan</span>
          </Link>

          {/* Return Home */}
          <Link
            href="/"
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-blackHole hover:bg-blackHole/80 border border-borderDark text-sustainableLinen hover:text-lemonChiffon font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors press-spring touch-manipulation"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Home</span>
          </Link>

          {/* Interactive Back Button */}
          <button
            type="button"
            onClick={handleGoBack}
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-borderDark text-textMuted hover:text-sustainableLinen font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors press-spring touch-manipulation"
            aria-label="Navigate to previous page"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" />
            <span>Go Back</span>
          </button>
        </div>

        {/* Helpful Quick Navigation Links */}
        <div className="pt-4 border-t border-borderDark/60 text-xs text-textMuted space-y-2.5">
          <span className="text-[11px] font-mono uppercase tracking-wider text-textTertiary block">
            Popular destinations
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/app/dashboard"
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-borderDark hover:border-lemonChiffon/30 text-sustainableLinen inline-flex items-center gap-1.5 transition-colors font-mono text-[11px] press-spring"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-electricTangerine" />
              <span>Workspace Dashboard</span>
            </Link>

            <Link
              href="/app/findings"
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-borderDark hover:border-lemonChiffon/30 text-sustainableLinen inline-flex items-center gap-1.5 transition-colors font-mono text-[11px] press-spring"
            >
              <Shield className="w-3.5 h-3.5 text-botticelli" />
              <span>Verified Findings</span>
            </Link>

            <Link
              href="/stats"
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-borderDark hover:border-lemonChiffon/30 text-sustainableLinen inline-flex items-center gap-1.5 transition-colors font-mono text-[11px] press-spring"
            >
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              <span>Platform Stats</span>
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
