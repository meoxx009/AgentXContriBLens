'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <html lang="en" className="dark">
      <body className="bg-black text-textPrimary min-h-screen flex items-center justify-center p-4 sm:p-6 antialiased font-sans">
        <div className="bg-[#0C0F17] border border-white/10 rounded-3xl p-6 sm:p-10 max-w-lg w-full text-center space-y-6 shadow-2xl">
          
          {/* Brand Name */}
          <div className="space-y-1">
            <span className="text-xl font-bold tracking-tight text-white font-mono">
              Contrib<span className="text-[#FF6D1F]">Lens</span>
            </span>
            <span className="block text-[11px] font-mono tracking-widest uppercase text-[#FFB082]">
              Critical System Error
            </span>
          </div>

          {/* Visual Icon */}
          <div className="w-16 h-16 mx-auto rounded-full bg-[#3D0C02]/40 border border-[#3D0C02] flex items-center justify-center text-[#FF6D1F] shadow-inner">
            <AlertTriangle className="w-8 h-8" aria-hidden="true" />
          </div>

          {/* Honest Copy */}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Something went wrong on our side
            </h1>
            <p className="text-xs sm:text-sm text-gray-400 max-w-md mx-auto leading-relaxed">
              A critical failure occurred while loading the application shell. Reloading the page or returning home will restore your session.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleReload}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#FF6D1F] hover:bg-[#e05b12] text-white font-semibold text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4 shrink-0" />
              <span>Reload Application</span>
            </button>

            <Link
              href="/"
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/15 text-gray-300 hover:text-white font-medium text-xs sm:text-sm inline-flex items-center justify-center gap-2 transition-colors"
            >
              <Home className="w-4 h-4 shrink-0" />
              <span>Back to Home</span>
            </Link>
          </div>

        </div>
      </body>
    </html>
  );
}
