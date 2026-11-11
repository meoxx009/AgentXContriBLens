'use client';

import React, { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import LiveActionLog from '@/components/agent/LiveActionLog';

function AgentRunnerContent() {
  const searchParams = useSearchParams();
  const { activeScan } = useApp();
  const urlParam = searchParams.get('url') || searchParams.get('repositoryUrl') || activeScan?.repoUrl || '';
  const branchParam = searchParams.get('branch') || activeScan?.branch || '';
  const goalParam = searchParams.get('goal') || undefined;
  const scanIdParam = searchParams.get('scanId') || activeScan?.id || undefined;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <LiveActionLog
        initialRepoUrl={urlParam}
        initialBranch={branchParam}
        initialGoal={goalParam}
        scanId={scanIdParam}
      />
    </div>
  );
}

export default function AgentRunnerPage() {
  const { user, loading, openAuthModal } = useApp();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      openAuthModal({
        initialMode: 'login',
        title: 'Sign In to Live Agent',
        subtitle: 'Please sign in to monitor autonomous live agent executions.',
        onDismiss: () => router.push('/'),
      });
    }
  }, [user, loading, router, openAuthModal]);

  if (loading || !user) {
    return (
      <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center space-y-3">
        <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-xs font-mono text-lemonChiffon/80">
          Checking authentication...
        </p>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-16 text-center space-y-3">
          <div className="w-8 h-8 border-2 border-electricTangerine border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-mono text-lemonChiffon/80">
            Initializing Live Agent Log...
          </p>
        </div>
      }
    >
      <AgentRunnerContent />
    </Suspense>
  );
}
