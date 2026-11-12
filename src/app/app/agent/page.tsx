'use client';

import React, { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import LiveActionLog from '@/components/agent/LiveActionLog';
import { Shield, ArrowRight } from 'lucide-react';

function AgentRunnerContent() {
  const searchParams = useSearchParams();
  const { activeScan } = useApp();
  const urlParam = searchParams.get('url') || searchParams.get('repositoryUrl') || activeScan?.repoUrl || '';
  const branchParam = searchParams.get('branch') || activeScan?.branch || '';
  const goalParam = searchParams.get('goal') || undefined;
  const scanIdParam = searchParams.get('scanId') || activeScan?.id || undefined;

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {activeScan && (
        <div className="p-4 rounded-xl border border-electricTangerine/30 bg-electricTangerine/5 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-glass">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-electricTangerine/10 text-electricTangerine border border-electricTangerine/20">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-electricTangerine font-semibold">Active Repository Context</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-botticelli/10 text-botticelli border border-botticelli/20">
                  {activeScan.branch || 'default'}
                </span>
              </div>
              <h2 className="text-base font-semibold text-textPrimary font-mono mt-0.5">
                {activeScan.repoName || activeScan.repoUrl}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-[11px] font-mono text-textTertiary">Verified Findings</p>
              <p className="text-sm font-mono font-bold text-lemonChiffon">
                {activeScan.findingsCount?.total || (activeScan.findings ? activeScan.findings.length : 0)} Total
              </p>
            </div>
            <Link
              href="/app/findings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-botticelli/10 hover:bg-botticelli/20 text-botticelli border border-botticelli/30 transition-colors"
            >
              <span>View Findings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      )}
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
