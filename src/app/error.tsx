'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  RotateCw,
  Home,
  LayoutDashboard,
  Search,
} from 'lucide-react';
import ContribLensLogo from '@/components/ContribLensLogo';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isWebpackDesync =
    error?.message?.includes('__webpack_modules__') ||
    error?.message?.includes('is not a function') ||
    error?.message?.includes('Loading chunk');

  useEffect(() => {
    // Log safe error summary to console for developer debugging
    console.error('[ContribLens Application Error]:', error?.message || error);

    // Self-heal chunk mismatch after deployments
    if (isWebpackDesync && typeof window !== 'undefined') {
      const key = '__cl_desync_reload';
      const last = parseInt(sessionStorage.getItem(key) || '0', 10);
      if (Date.now() - last > 5000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
      }
    }
  }, [error, isWebpackDesync]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <main
      role="alert"
      aria-labelledby="error-heading"
      className="min-h-screen bg-transparent text-textPrimary flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden"
    >
      {/* Smoky Ambient Glow Background */}
      <div
        className="absolute inset-0 pointer-events-none -z-10 flex items-center justify-center overflow-hidden"
        aria-hidden="true"
      >
        <div className="w-[450px] sm:w-[600px] h-[450px] sm:h-[600px] rounded-full bg-rosewood/15 blur-[120px]" />
        <div className="w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] rounded-full bg-electricTangerine/10 blur-[100px] -translate-y-24" />
      </div>

      <div className="liquid-glass-card p-6 sm:p-10 max-w-xl w-full text-center space-y-7 rounded-3xl border border-rosewood/50 shadow-glass-card animate-in fade-in zoom-in-95 duration-200">
        
        {/* Brand Header */}
        <div className="flex flex-col items-center justify-center gap-2">
          <ContribLensLogo size={32} showTagline={false} />
          <span className="text-[11px] font-mono tracking-widest uppercase text-red-300 px-3 py-0.5 rounded-full bg-rosewood/30 border border-rosewood/60">
            Application Error
          </span>
        </div>

        {/* Visual Error Icon Orb */}
        <div className="w-16 h-16 mx-auto rounded-full bg-rosewood/30 border border-rosewood/70 flex items-center justify-center text-red-300 shadow-inner">
          <AlertTriangle className="w-8 h-8 text-electricTangerine" aria-hidden="true" />
        </div>

        {/* Honest Copy */}
        <div className="space-y-2">
          <h1
            id="error-heading"
            className="text-2xl sm:text-3xl font-heading font-bold text-sustainableLinen tracking-tight"
          >
            Something went wrong on our side
          </h1>
          <p className="text-xs sm:text-sm text-textMuted max-w-md mx-auto leading-relaxed">
            An unexpected error occurred while rendering this view. No repository data or security findings were compromised.
          </p>
        </div>

        {/* Safe Error Reference ID (never raw stack traces in production) */}
        {error?.digest && (
          <div className="inline-block">
            <span className="font-mono text-[11px] text-textMuted bg-black/60 px-3 py-1 rounded-full border border-borderDark">
              Reference ID: <strong className="text-lemonChiffon">{error.digest}</strong>
            </span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-1">
          {/* Retry Button */}
          <button
            type="button"
            onClick={() => reset()}
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-all shadow-glow-tangerine press-spring touch-manipulation"
          >
            <RotateCw className="w-4 h-4 shrink-0" />
            <span>Try Again</span>
          </button>

          {/* Reload Page Button */}
          <button
            type="button"
            onClick={handleReload}
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-blackHole hover:bg-blackHole/80 border border-borderDark text-sustainableLinen hover:text-lemonChiffon font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors press-spring touch-manipulation"
          >
            <RotateCw className="w-4 h-4 shrink-0" />
            <span>Reload Page</span>
          </button>

          {/* Back to Home Link */}
          <Link
            href="/"
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-borderDark text-textMuted hover:text-sustainableLinen font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors press-spring touch-manipulation"
          >
            <Home className="w-4 h-4 shrink-0" />
            <span>Back to Home</span>
          </Link>
        </div>

        {/* Workspace Quick Navigation */}
        <div className="pt-4 border-t border-borderDark/60 text-xs text-textMuted space-y-2">
          <span className="text-[11px] font-mono uppercase tracking-wider text-textTertiary block">
            Or continue in workspace
          </span>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link
              href="/app/dashboard"
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-borderDark hover:border-lemonChiffon/30 text-sustainableLinen inline-flex items-center gap-1.5 transition-colors font-mono text-xs press-spring touch-manipulation"
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-lemonChiffon" />
              <span>Dashboard</span>
            </Link>

            <Link
              href="/app/scan"
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/40 hover:bg-black/60 border border-borderDark hover:border-lemonChiffon/30 text-sustainableLinen inline-flex items-center gap-1.5 transition-colors font-mono text-xs press-spring touch-manipulation"
            >
              <Search className="w-3.5 h-3.5 text-botticelli" />
              <span>Scan Repository</span>
            </Link>
          </div>
        </div>

      </div>
    </main>
  );
}
