'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { FindingsListSkeleton } from '@/components/ui/Skeleton';

const DraftsView = dynamic(() => import('@/components/views/DraftsView'), {
  ssr: false,
  loading: () => <FindingsListSkeleton />,
});

export default function AppIssueDraftsPage() {
  return <DraftsView />;
}
