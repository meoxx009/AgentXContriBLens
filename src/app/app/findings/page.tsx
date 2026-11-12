'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FindingsListSkeleton } from '@/components/ui/Skeleton';

const FindingsView = dynamic(() => import('@/components/views/FindingsView'), {
  ssr: false,
  loading: () => <FindingsListSkeleton />,
});

export default function AppFindingsPage() {
  return <FindingsView />;
}
