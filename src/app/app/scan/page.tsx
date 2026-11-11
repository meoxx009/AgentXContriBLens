'use client';

import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import ScanView from '@/components/views/ScanView';
import { Search } from 'lucide-react';

export default function AppScanPage() {
  const { user, loading, openAuthModal } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      openAuthModal({
        initialMode: 'login',
        title: 'Sign In to Scan',
        subtitle: 'Please sign in to scan public repositories and save PR plans.',
        onDismiss: () => router.push('/'),
      });
    }
  }, [user, loading, router, openAuthModal]);

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono text-lemonChiffon/80">
          Checking authentication...
        </p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="max-w-md mx-auto w-full px-4 py-16 text-center space-y-4">
        <div className="liquid-glass p-6 sm:p-8 rounded-2xl border border-platinumSilver/25 space-y-4 shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-electricTangerine/10 border border-electricTangerine/30 flex items-center justify-center mx-auto text-electricTangerine">
            <Search className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-sustainableLinen">Authentication Required</h2>
          <p className="text-xs text-textMuted leading-relaxed">
            Please sign in to scan public repositories and generate PR plans.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center pt-2">
            <button
              type="button"
              onClick={() =>
                openAuthModal({
                  initialMode: 'login',
                  onDismiss: () => router.push('/'),
                })
              }
              className="px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black text-xs font-bold transition-all shadow-glow-tangerine press-spring"
            >
              Sign In / Sign Up
            </button>
            <Link
              href="/"
              className="px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-sustainableLinen text-xs font-semibold transition-colors border border-platinumSilver/20"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-lemonChiffon/80">
            Initializing ContribLens Scanner...
          </p>
        </div>
      }
    >
      <ScanView />
    </Suspense>
  );
}
