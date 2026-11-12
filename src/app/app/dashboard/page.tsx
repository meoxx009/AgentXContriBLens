'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ScanListSkeleton } from '@/components/ui/Skeleton';

const DashboardView = dynamic(() => import('@/components/views/DashboardView'), {
  ssr: false,
  loading: () => (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
      <ScanListSkeleton count={4} />
    </div>
  ),
});

export default function DashboardPage() {
  return <DashboardView />;
}
