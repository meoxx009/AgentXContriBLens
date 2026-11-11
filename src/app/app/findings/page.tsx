'use client';

import React, { Suspense } from 'react';
import FindingsView from '@/components/views/FindingsView';
import { Loader2 } from 'lucide-react';

export default function AppFindingsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-transparent flex flex-col items-center justify-center text-sustainableLinen">
          <Loader2 className="w-8 h-8 text-lemonChiffon animate-spin mb-3" />
          <p className="text-xs font-mono text-platinumSilver/60">Loading verified findings...</p>
        </div>
      }
    >
      <FindingsView />
    </Suspense>
  );
}
