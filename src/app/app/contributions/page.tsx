'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { ContributionsStackSkeleton } from '@/components/ui/Skeleton';

const ContributionsView = dynamic(() => import('@/components/views/ContributionsView'), {
  ssr: false,
  loading: () => <ContributionsStackSkeleton />,
});

export default function AppContributionsPage() {
  return <ContributionsView />;
}
