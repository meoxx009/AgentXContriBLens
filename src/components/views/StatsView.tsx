'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { GitPullRequest, Shield, FolderGit2, Users, ArrowLeft, Sparkles, CheckCircle2 } from 'lucide-react';
import { StatsPageSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';

interface PublicStatsData {
  reposScanned: number;
  findingsVerified: number;
  routesGenerated: number;
  contributorsGuided: number;
  lastUpdated?: string;
}

function AnimatedCounter({ value, duration = 1200 }: { value: number; duration?: number }) {
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      (window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
        document.documentElement.classList.contains('reduce-motion'));

    if (prefersReduced) {
      setDisplayValue(value);
      return;
    }

    let startTimestamp: number | null = null;
    let animationFrameId: number;

    const step = (timestamp: number) => {
      if (!startTimestamp) startTimestamp = timestamp;
      const progress = Math.min((timestamp - startTimestamp) / duration, 1);
      // ease-out cubic
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      setDisplayValue(Math.floor(easedProgress * value));

      if (progress < 1) {
        animationFrameId = requestAnimationFrame(step);
      } else {
        setDisplayValue(value);
      }
    };

    animationFrameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animationFrameId);
  }, [value, duration]);

  return <span>{displayValue.toLocaleString()}</span>;
}

export default function StatsView({ initialStats }: { initialStats?: PublicStatsData }) {
  const [stats, setStats] = useState<PublicStatsData | undefined>(initialStats);
  const [loading, setLoading] = useState(!initialStats);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const showDelayedSkeleton = useDelayedLoading(loading, 150);

  const fetchLiveStats = async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/stats');
      if (res.ok) {
        const data = await res.json();
        setStats({
          reposScanned: data.reposScanned ?? initialStats?.reposScanned ?? 0,
          findingsVerified: data.findingsVerified ?? initialStats?.findingsVerified ?? 0,
          routesGenerated: data.routesGenerated ?? initialStats?.routesGenerated ?? 0,
          contributorsGuided: data.contributorsGuided ?? initialStats?.contributorsGuided ?? 0,
          lastUpdated: data.lastUpdated || new Date().toISOString(),
        });
      } else {
        setFetchError('Unable to load platform statistics from server. Please retry.');
      }
    } catch {
      setFetchError('Network error connecting to platform statistics. Please check your connection and retry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading && !stats && showDelayedSkeleton) {
    return <StatsPageSkeleton />;
  }

  if (fetchError && !stats) {
    return (
      <div className="relative z-10 py-16 px-4">
        <ErrorState
          title="Unable to Load Ecosystem Stats"
          message={fetchError}
          onRetry={fetchLiveStats}
          retrying={loading}
          secondaryAction={{ label: 'Back to Home', href: '/' }}
        />
      </div>
    );
  }

  if (!stats) {
    return null;
  }

  const statCards = [
    {
      label: 'Repositories Scanned',
      value: stats.reposScanned,
      sub: 'Bounded read-only scans',
      icon: FolderGit2,
      color: 'text-electricTangerine',
    },
    {
      label: 'Verified Findings',
      value: stats.findingsVerified,
      sub: 'Deterministic + OSV cross-checked',
      icon: Shield,
      color: 'text-lemonChiffon',
    },
    {
      label: 'PR Plans Generated',
      value: stats.routesGenerated,
      sub: 'With tests & acceptance criteria',
      icon: GitPullRequest,
      color: 'text-paleLavender',
    },
    {
      label: 'Contributors Guided',
      value: stats.contributorsGuided,
      sub: 'First-time contributors supported',
      icon: Users,
      color: 'text-botticelli',
    },
  ];

  return (
    <>


      <div className="relative z-10 space-y-10">
        {/* Header & Smoky Hero Section */}
        <div className="space-y-4">
          <Link
            href="/"
            className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-textMuted hover:text-lemonChiffon transition-colors mb-2 press-spring touch-manipulation"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Home
          </Link>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-platinumSilver/20 text-xs font-mono text-lemonChiffon">
              <Sparkles className="w-3.5 h-3.5 text-electricTangerine" />
              <span>Verified Platform Metrics</span>
            </div>

            <LastUpdatedBadge
              timestamp={stats.lastUpdated}
              onRefresh={fetchLiveStats}
              refreshing={loading}
              prefix="Aggregates updated"
            />
          </div>

          <div className="liquid-glass-hero p-5 sm:p-8 rounded-2xl sm:rounded-3xl space-y-3 border border-platinumSilver/20 shadow-2xl">
            <h1 className="text-3xl sm:text-5xl font-extrabold text-sustainableLinen tracking-tight font-heading">
              ContribLens Public Activity
            </h1>
            <p className="text-sm sm:text-base text-textMuted max-w-2xl leading-relaxed">
              Real-time platform statistics computed from safe public aggregates. We never expose user credentials, private repo data, or unmasked secrets.
            </p>
          </div>
        </div>

        {/* Empty State when zero activity has been recorded yet */}
        {stats.reposScanned === 0 && stats.findingsVerified === 0 && (
          <EmptyState
            title="No platform activity recorded yet"
            description="Verified platform metrics will automatically populate as public repositories are scanned and contribution plans are created."
            action={{
              label: 'Run First Repository Scan',
              href: '/app/scan',
            }}
          />
        )}

        {/* 4 Stat Cards with Count-up Animation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {statCards.map((stat, idx) => {
            const Icon = stat.icon;
            return (
              <div key={idx} className="liquid-glass-card p-5 sm:p-6 space-y-3">
                <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
                  <Icon className={`w-5 h-5 ${stat.color}`} />
                </div>
                <div>
                  <div className="text-2xl sm:text-3xl font-extrabold text-sustainableLinen font-mono">
                    <AnimatedCounter value={stat.value} />
                  </div>
                  <div className="text-xs font-medium text-textMuted mt-1">{stat.label}</div>
                  <div className="text-[11px] text-platinumSilver/40 mt-0.5">{stat.sub}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Measurement Standard Card */}
        <div className="liquid-glass p-5 sm:p-8 rounded-2xl border border-platinumSilver/15 space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-lemonChiffon" />
            <h3 className="text-base font-bold text-sustainableLinen">
              Our Open Measurement Standard
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-textMuted leading-relaxed">
            All counters represent verified security and hygiene findings generated by the deterministic scanner, OSV.dev queries, and completed contribution plans. No vanity metrics or speculative numbers are logged in production. Aggregate numbers are cached for approximately 5 minutes on the server to prevent database overhead.
          </p>
          <div className="pt-2 flex flex-wrap items-center gap-4 text-xs font-mono text-textMuted">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Zero Private Data</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-lemonChiffon" />
              <span>Deterministic Counting</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-botticelli" />
              <span>Cached ~5m</span>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
