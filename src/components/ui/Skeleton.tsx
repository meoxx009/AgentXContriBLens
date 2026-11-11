'use client';

import React, { useState, useEffect } from 'react';

/**
 * useDelayedLoading
 * Prevents flash-of-skeleton artifacts for instant / fast responses.
 * If data arrives within `delayMs` (default 150ms), the skeleton never renders.
 */
export function useDelayedLoading(loading: boolean, delayMs: number = 150): boolean {
  const [showSkeleton, setShowSkeleton] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSkeleton(false);
      return;
    }

    const timer = setTimeout(() => {
      setShowSkeleton(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [loading, delayMs]);

  return loading && showSkeleton;
}

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'line' | 'block' | 'card' | 'circle' | 'badge';
  width?: string | number;
  height?: string | number;
  rounded?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | 'full';
}

const ROUNDED_CLASSES = {
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
  '2xl': 'rounded-2xl',
  '3xl': 'rounded-3xl',
  full: 'rounded-full',
};

/**
 * Skeleton Primitive
 * Uses existing design tokens and .skeleton-shimmer with prefers-reduced-motion fallback.
 */
export function Skeleton({
  variant = 'block',
  width,
  height,
  rounded,
  className = '',
  style,
  children,
  ...props
}: SkeletonProps) {
  let defaultRounded = 'rounded-xl';
  if (rounded) {
    defaultRounded = ROUNDED_CLASSES[rounded];
  } else if (variant === 'circle' || variant === 'badge') {
    defaultRounded = 'rounded-full';
  } else if (variant === 'line') {
    defaultRounded = 'rounded-md';
  }

  const defaultHeight =
    height !== undefined
      ? undefined
      : variant === 'line'
      ? 'h-4'
      : variant === 'badge'
      ? 'h-6'
      : variant === 'circle'
      ? 'h-10'
      : undefined;

  const defaultWidth =
    width !== undefined
      ? undefined
      : variant === 'circle'
      ? 'w-10'
      : variant === 'badge'
      ? 'w-16'
      : 'w-full';

  return (
    <div
      aria-hidden="true"
      className={`skeleton-shimmer border border-white/[0.08] relative overflow-hidden ${defaultRounded} ${defaultHeight || ''} ${defaultWidth || ''} ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * SkeletonText
 * Multiple text lines with varying widths mimicking natural paragraph flow.
 */
export function SkeletonText({
  lines = 2,
  gap = 'gap-2',
  className = '',
  lastLineWidth = '65%',
}: {
  lines?: number;
  gap?: string;
  className?: string;
  lastLineWidth?: string;
}) {
  return (
    <div className={`flex flex-col ${gap} ${className}`} aria-hidden="true">
      {Array.from({ length: lines }).map((_, idx) => {
        const isLast = idx === lines - 1;
        return (
          <Skeleton
            key={idx}
            variant="line"
            className="h-3.5"
            width={isLast && lines > 1 ? lastLineWidth : '100%'}
          />
        );
      })}
    </div>
  );
}

/**
 * SkeletonBlock
 * Rectangular content placeholder.
 */
export function SkeletonBlock({
  height = 'h-24',
  className = '',
}: {
  height?: string | number;
  className?: string;
}) {
  return (
    <Skeleton
      variant="block"
      height={typeof height === 'number' ? height : undefined}
      className={`${typeof height === 'string' ? height : ''} ${className}`}
    />
  );
}

/**
 * SkeletonCard
 * Glass card container matching liquid-glass design tokens.
 */
export function SkeletonCard({
  className = '',
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={`liquid-glass-card p-5 sm:p-6 rounded-3xl border border-platinumSilver/15 space-y-4 ${className}`}
      aria-hidden="true"
    >
      {children || (
        <>
          <div className="flex items-center justify-between pb-3 border-b border-platinumSilver/10">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
          <SkeletonText lines={3} />
        </>
      )}
    </div>
  );
}

/**
 * SkeletonRow
 * Mimics a list or table row with avatar/icon, title + subtitle, and action/badge.
 */
export function SkeletonRow({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`p-4 rounded-2xl bg-black/40 border border-platinumSilver/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
      aria-hidden="true"
    >
      <div className="flex items-start sm:items-center gap-3 flex-1 min-w-0">
        <Skeleton variant="circle" className="w-9 h-9 rounded-xl shrink-0" />
        <div className="space-y-1.5 flex-1 min-w-0">
          <Skeleton className="h-4 w-40 max-w-full" />
          <Skeleton className="h-3 w-64 max-w-full" />
        </div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-center">
        <Skeleton variant="badge" className="h-6 w-16" />
        <Skeleton variant="badge" className="h-6 w-20" />
      </div>
    </div>
  );
}

/* =========================================================================
   Scoped Layout Skeletons (Matching Actual Content Layouts)
   ========================================================================= */

/**
 * ScanListSkeleton
 * Mirrors the repository scan history list cards in DashboardView & ScanView.
 */
export function ScanListSkeleton({
  count = 4,
  label = 'repository scans',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-3 w-full"
    >
      <span className="sr-only">Loading {label}...</span>
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="min-h-[44px] p-4 rounded-2xl border border-platinumSilver/15 bg-black/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          aria-hidden="true"
        >
          <div className="flex items-start gap-3 flex-1">
            <Skeleton variant="circle" className="w-5 h-5 rounded-md mt-0.5 shrink-0" />
            <div className="space-y-2 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-44 rounded-md" />
                <Skeleton className="h-4 w-16 rounded-full" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-platinumSilver/15">
            <Skeleton variant="badge" className="h-5 w-16" />
            <Skeleton variant="badge" className="h-5 w-20" />
            <div className="text-right space-y-1">
              <Skeleton className="h-4 w-12 rounded ml-auto" />
              <Skeleton className="h-2.5 w-14 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * FindingsListSkeleton
 * Mirrors FindingsView: filter summary bar, left finding rows, and right detail panel.
 */
export function FindingsListSkeleton({
  label = 'verified findings',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-6 w-full"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Filter and stats pill bar skeleton */}
      <div className="glass-panel p-4 rounded-2xl border border-borderDark flex flex-wrap items-center justify-between gap-3" aria-hidden="true">
        <div className="flex flex-wrap items-center gap-2">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>
        <Skeleton className="h-7 w-36 rounded-full" />
      </div>

      {/* Main 2-column layout: Left finding items list, Right detail viewer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6" aria-hidden="true">
        {/* Left column: Findings rows */}
        <div className="lg:col-span-5 space-y-3">
          {Array.from({ length: 5 }).map((_, idx) => (
            <div
              key={idx}
              className="p-4 rounded-2xl bg-black/50 border border-borderDark space-y-2.5"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton variant="badge" className="h-5 w-16" />
                  <Skeleton className="h-4 w-28 rounded" />
                </div>
                <Skeleton variant="badge" className="h-5 w-14" />
              </div>
              <Skeleton className="h-4 w-full rounded" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-36 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Right column: Selected finding detail panel */}
        <div className="lg:col-span-7">
          <div className="glass-panel p-6 rounded-3xl border border-borderDark space-y-5">
            <div className="flex items-start justify-between pb-4 border-b border-borderDark">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <Skeleton variant="badge" className="h-5 w-20" />
                  <Skeleton className="h-4 w-28 rounded" />
                </div>
                <Skeleton className="h-6 w-3/4 rounded-lg" />
              </div>
              <Skeleton className="h-9 w-32 rounded-xl" />
            </div>

            {/* Exact location & evidence box */}
            <div className="p-4 rounded-xl bg-black border border-borderDark space-y-3">
              <Skeleton className="h-4 w-48 rounded" />
              <Skeleton className="h-16 w-full rounded-lg" />
              <div className="flex items-center justify-between pt-1">
                <Skeleton className="h-3 w-40 rounded" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>

            {/* AI Explanation / Blueprint guidance */}
            <div className="p-5 rounded-2xl bg-black/40 border border-borderDark space-y-3">
              <Skeleton className="h-5 w-44 rounded-md" />
              <SkeletonText lines={3} />
            </div>

            {/* Action buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <Skeleton className="h-10 w-36 rounded-full" />
              <Skeleton className="h-10 w-44 rounded-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * FindingDetailsSkeleton
 * Mirrors FindingDetailsView: standalone dedicated deep-link finding detail page.
 */
export function FindingDetailsSkeleton({
  label = 'finding evidence details',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="max-w-4xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Top back breadcrumb */}
      <div className="flex items-center justify-between pb-4 border-b border-borderDark" aria-hidden="true">
        <Skeleton className="h-8 w-28 rounded-full" />
        <Skeleton className="h-6 w-36 rounded-full" />
      </div>

      {/* Main finding card */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-borderDark space-y-6" aria-hidden="true">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Skeleton variant="badge" className="h-5 w-20" />
            <Skeleton className="h-4 w-32 rounded" />
          </div>
          <Skeleton className="h-7 w-4/5 rounded-xl" />
        </div>

        {/* Location & SHA-256 evidence block */}
        <div className="p-5 rounded-2xl bg-black border border-borderDark space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-48 rounded" />
            <Skeleton className="h-7 w-24 rounded-full" />
          </div>
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="flex items-center justify-between text-xs">
            <Skeleton className="h-3 w-56 rounded" />
            <Skeleton className="h-5 w-24 rounded-full" />
          </div>
        </div>

        {/* Grounded explanation tabs & text */}
        <div className="p-6 rounded-2xl bg-black/50 border border-borderDark space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-5 w-40 rounded" />
            <div className="flex gap-1.5">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-20 rounded-full" />
            </div>
          </div>
          <SkeletonText lines={4} />
        </div>

        {/* Create route CTA */}
        <div className="pt-2 flex justify-end">
          <Skeleton className="h-11 w-52 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * ContributionsStackSkeleton
 * Mirrors ContributionsView: Detected Technology Stack grid + Blueprint route cards.
 */
export function ContributionsStackSkeleton({
  label = 'contribution routes and technology stack',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-8 w-full"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Header and top readiness banner */}
      <div className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/15 space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
        <Skeleton className="h-2.5 w-full rounded-full" />
      </div>

      {/* Detected Tech Stack 4-column card grid */}
      <div className="space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between pb-2 border-b border-borderDark">
          <Skeleton className="h-4 w-60 rounded" />
          <Skeleton className="h-4 w-36 rounded" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {['Languages', 'Frameworks', 'Tooling', 'Manifests'].map((name, i) => (
            <div key={i} className="glass-panel p-5 rounded-2xl border border-borderDark space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Contribution Route Blueprint Cards */}
      <div className="space-y-4" aria-hidden="true">
        <div className="flex items-center justify-between pb-2 border-b border-borderDark">
          <Skeleton className="h-5 w-52 rounded" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="glass-panel p-6 rounded-3xl border border-borderDark space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <Skeleton variant="badge" className="h-5 w-16" />
                    <Skeleton variant="badge" className="h-5 w-20" />
                  </div>
                  <Skeleton className="h-5 w-4/5 rounded-lg" />
                </div>
                <Skeleton variant="circle" className="w-10 h-10 rounded-full shrink-0" />
              </div>

              <SkeletonText lines={2} />

              <div className="p-3 rounded-xl bg-black border border-borderDark space-y-2">
                <Skeleton className="h-3 w-28 rounded" />
                <Skeleton className="h-4 w-48 rounded" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-borderDark">
                <Skeleton className="h-4 w-24 rounded" />
                <Skeleton className="h-9 w-28 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * RouteDetailsSkeleton
 * Mirrors RouteDetailsView: dedicated route page with status stepper, files diff, and checklist.
 */
export function RouteDetailsSkeleton({
  label = 'contribution route details',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="max-w-5xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Top back navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-borderDark" aria-hidden="true">
        <Skeleton className="h-8 w-32 rounded-full" />
        <Skeleton className="h-8 w-44 rounded-full" />
      </div>

      {/* Main route banner */}
      <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-borderDark space-y-6" aria-hidden="true">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <Skeleton variant="badge" className="h-5 w-20" />
              <Skeleton variant="badge" className="h-5 w-24" />
            </div>
            <Skeleton className="h-7 w-3/4 rounded-xl" />
            <Skeleton className="h-4 w-full max-w-xl rounded" />
          </div>
          <Skeleton variant="circle" className="w-12 h-12 rounded-full shrink-0" />
        </div>

        {/* 4-step contribution stepper card */}
        <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-44 rounded" />
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 rounded-xl border border-borderDark bg-black space-y-2">
                <div className="flex items-center justify-between">
                  <Skeleton variant="circle" className="w-6 h-6 rounded-full" />
                  <Skeleton className="h-3 w-8 rounded" />
                </div>
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-3 w-full rounded" />
              </div>
            ))}
          </div>
        </div>

        {/* Learning checklist card */}
        <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-52 rounded" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3.5 rounded-xl border border-borderDark bg-blackHole flex items-start gap-3">
                <Skeleton variant="circle" className="w-4 h-4 rounded-md mt-0.5 shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Action bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Skeleton className="h-10 w-36 rounded-full" />
          <Skeleton className="h-10 w-48 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/**
 * StatsPageSkeleton
 * Mirrors StatsView: headline hero, 4 metric cards, architecture table, live verification stream.
 */
export function StatsPageSkeleton({
  label = 'public platform statistics',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-10 w-full"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Hero Headline Skeleton */}
      <div className="liquid-glass-hero p-8 rounded-3xl space-y-3 border border-platinumSilver/20" aria-hidden="true">
        <Skeleton className="h-10 sm:h-12 w-2/3 rounded-2xl" />
        <Skeleton className="h-4 w-full max-w-xl rounded-md" />
      </div>

      {/* 4 Metric Glass Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div
            key={idx}
            className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/20 space-y-3 min-h-[140px]"
          >
            <div className="flex items-center justify-between">
              <Skeleton variant="circle" className="w-10 h-10 rounded-2xl" />
              <Skeleton className="h-4 w-12 rounded" />
            </div>
            <Skeleton className="h-8 w-24 rounded-lg" />
            <Skeleton className="h-3 w-32 rounded" />
          </div>
        ))}
      </div>

      {/* Architecture & Live Verification Table Skeleton */}
      <div className="liquid-glass-card p-6 sm:p-8 rounded-3xl border border-platinumSilver/20 space-y-5" aria-hidden="true">
        <div className="flex items-center justify-between pb-3 border-b border-platinumSilver/15">
          <Skeleton className="h-5 w-44 rounded" />
          <Skeleton className="h-4 w-28 rounded" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-3.5 rounded-xl bg-black/40 border border-platinumSilver/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton variant="circle" className="w-6 h-6 rounded-md" />
                <Skeleton className="h-4 w-40 rounded" />
              </div>
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * LiveActionLogSkeleton
 * Mirrors LiveActionLog: plan overview cards and stream log lines while connecting.
 */
export function LiveActionLogSkeleton({
  label = 'agent execution plan and live stream',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-6 w-full"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* 3 Step Execution Plan Rail Skeleton */}
      <div className="rounded-2xl border border-white/10 bg-blackHole/60 p-4 sm:p-5 space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-xl border border-white/10 bg-white/[0.02] space-y-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton variant="badge" className="h-4 w-12" />
              </div>
              <Skeleton className="h-4 w-28 rounded" />
              <Skeleton className="h-3 w-full rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* Log Console Window Skeleton */}
      <div className="rounded-2xl border border-white/10 bg-black/90 p-4 space-y-3" aria-hidden="true">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <Skeleton className="h-4 w-36 rounded" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <div className="space-y-2 p-2 font-mono">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton variant="badge" className="h-4 w-16" />
                <Skeleton className="h-3 w-48 rounded" />
              </div>
              <Skeleton className="h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/**
 * ProfileSkeleton
 * Mirrors ProfileView: user greeting, profile controls, appearance cards, and security center.
 */
export function ProfileSkeleton({
  label = 'user profile and settings',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="max-w-4xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-6"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Header */}
      <div className="pb-6 border-b border-borderDark space-y-2" aria-hidden="true">
        <Skeleton className="h-8 w-64 rounded-xl" />
        <Skeleton className="h-4 w-96 max-w-full rounded" />
      </div>

      {/* Accordion Skeletons */}
      <div className="space-y-4" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="glass-panel p-6 rounded-2xl border border-borderDark flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Skeleton variant="circle" className="w-9 h-9 rounded-xl" />
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-44 rounded" />
                <Skeleton className="h-3 w-64 max-w-full rounded" />
              </div>
            </div>
            <Skeleton variant="circle" className="w-5 h-5 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * AuthModalSkeleton
 * Mirrors AuthModal form layout when initializing or submitting OAuth.
 */
export function AuthModalSkeleton({
  label = 'authentication form',
}: {
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="space-y-5 w-full"
    >
      <span className="sr-only">Loading {label}...</span>

      {/* Top OAuth Button Skeleton */}
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-11 w-full rounded-xl" />
        <div className="flex items-center justify-center relative my-2">
          <div className="border-t border-platinumSilver/15 w-full" />
          <Skeleton className="h-3 w-32 rounded-full absolute" />
        </div>
      </div>

      {/* Form input fields */}
      <div className="space-y-4" aria-hidden="true">
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-20 rounded" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-3 w-16 rounded" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <Skeleton className="h-11 w-full rounded-full mt-2" />
      </div>
    </div>
  );
}
