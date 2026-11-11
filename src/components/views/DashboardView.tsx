'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Search,
  AlertTriangle,
  Compass,
  CheckCircle2,
  GitBranch,
  ArrowRight,
  Clock,
  Layers,
  Sparkles,
  ChevronRight,
  ChevronLeft,
  FileText,
  Cpu,
  Zap,
  RotateCw,
  Filter,
  X,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ScanSummary, ContributionRoute, ActivityEvent, Finding } from '@/types';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { GlassMetricCard } from '@/components/ui/GlassMetricCard';
import {
  reconcileActiveScan,
  computeDashboardMetrics,
  getScanDiffBadgeData,
} from '@/lib/dashboard-sync';
import { getRecommendations } from '@/lib/recommendations';
import { Skeleton, SkeletonText, SkeletonRow, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useDebounceValue } from '@/lib/debounce';

const SCAN_DATE_OPTIONS = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: '7d', label: 'Last 7 days' },
  { id: '30d', label: 'Last 30 days' },
] as const;

const SCAN_STATUS_OPTIONS = [
  { id: 'all', label: 'All Status' },
  { id: 'completed', label: 'Completed' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'failed', label: 'Failed' },
] as const;

export default function DashboardView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, activeScan, setActiveScan, loading: appLoading, setSessionExpired, openAuthModal, showToast } = useApp();

  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [routes, setRoutes] = useState<ContributionRoute[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  type DashboardError = 'session_expired' | 'forbidden' | 'server_error' | 'network_offline' | null;
  const [errorType, setErrorType] = useState<DashboardError>(null);

  // Scans filter state with URL-synced params
  const [scanRepoFilter, setScanRepoFilter] = useState<string>(
    () => searchParams?.get('repo') || ''
  );
  const debouncedScanRepoFilter = useDebounceValue(scanRepoFilter, 300);

  const [scanDateFilter, setScanDateFilter] = useState<string>(
    () => searchParams?.get('dateRange') || 'all'
  );

  const [scanStatusFilter, setScanStatusFilter] = useState<string>(
    () => searchParams?.get('scanStatus') || 'all'
  );

  // Scans list pagination (filters combine with sort and reset page to 1)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const SCANS_PER_PAGE = 5;

  // Deletion confirmation state
  const [scanToDelete, setScanToDelete] = useState<ScanSummary | null>(null);
  const [showDeleteScanConfirm, setShowDeleteScanConfirm] = useState(false);
  const [deletingScan, setDeletingScan] = useState(false);

  const handleDeleteScan = async () => {
    if (!scanToDelete || deletingScan) return;
    const targetId = scanToDelete.id;
    const targetRepo = scanToDelete.repoName;
    setDeletingScan(true);

    try {
      const res = await fetch(`/api/scans/${targetId}`, { method: 'DELETE' });
      if (res.ok) {
        setScans((prev) => prev.filter((s) => s.id !== targetId));
        if (activeScan?.id === targetId) {
          setActiveScan(null);
          try {
            localStorage.removeItem('contriblens_active_scan');
          } catch (err) {
            console.debug('Failed to remove active scan from localStorage:', err);
          }
        }
        showToast(`Scan record for ${targetRepo} deleted.`, 'info');
        setShowDeleteScanConfirm(false);
        setScanToDelete(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Failed to delete scan', 'error');
      }
    } catch {
      showToast('Network error deleting scan', 'error');
    } finally {
      setDeletingScan(false);
    }
  };

  // Active filter count for scans
  const activeScanFilterCount = useMemo(() => {
    let count = 0;
    if (scanRepoFilter.trim()) count++;
    if (scanDateFilter !== 'all') count++;
    if (scanStatusFilter !== 'all') count++;
    return count;
  }, [scanRepoFilter, scanDateFilter, scanStatusFilter]);

  // Sync scan filters to URL query string
  const syncScanFiltersToUrl = useCallback(
    (updates: { repo?: string; dateRange?: string; scanStatus?: string }) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);

      const r = updates.repo !== undefined ? updates.repo : scanRepoFilter;
      const d = updates.dateRange !== undefined ? updates.dateRange : scanDateFilter;
      const s = updates.scanStatus !== undefined ? updates.scanStatus : scanStatusFilter;

      if (r && r.trim()) params.set('repo', r.trim());
      else params.delete('repo');

      if (d && d !== 'all') params.set('dateRange', d);
      else params.delete('dateRange');

      if (s && s !== 'all') params.set('scanStatus', s);
      else params.delete('scanStatus');

      const qs = params.toString();
      const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', nextUrl);
    },
    [scanRepoFilter, scanDateFilter, scanStatusFilter]
  );

  const handleScanRepoChange = (r: string) => {
    setScanRepoFilter(r);
    setCurrentPage(1);
  };

  const handleScanDateChange = (d: string) => {
    setScanDateFilter(d);
    setCurrentPage(1);
    syncScanFiltersToUrl({ dateRange: d });
  };

  const handleScanStatusChange = (s: string) => {
    setScanStatusFilter(s);
    setCurrentPage(1);
    syncScanFiltersToUrl({ scanStatus: s });
  };

  useEffect(() => {
    syncScanFiltersToUrl({ repo: debouncedScanRepoFilter });
  }, [debouncedScanRepoFilter, syncScanFiltersToUrl]);

  const handleResetScanFilters = () => {
    setScanRepoFilter('');
    setScanDateFilter('all');
    setScanStatusFilter('all');
    setCurrentPage(1);
    syncScanFiltersToUrl({ repo: '', dateRange: 'all', scanStatus: 'all' });
  };

  const buildScansUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedScanRepoFilter.trim()) params.set('repo', debouncedScanRepoFilter.trim());
    if (scanDateFilter !== 'all') params.set('dateRange', scanDateFilter);
    if (scanStatusFilter !== 'all') params.set('status', scanStatusFilter);
    const qs = params.toString();
    return qs ? `/api/scans?${qs}` : '/api/scans';
  }, [debouncedScanRepoFilter, scanDateFilter, scanStatusFilter]);

  // Optimistic UI for scan list refresh with truthful rollback
  const [refreshingScans, setRefreshingScans] = useState(false);
  const [scanRefreshError, setScanRefreshError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);
  const scanSequenceRef = React.useRef(0);

  const handleRefreshScans = async () => {
    if (refreshingScans) return;
    const currentSeq = ++scanSequenceRef.current;
    const previousScans = [...scans];
    setRefreshingScans(true);
    setScanRefreshError(null);

    try {
      const res = await fetch(buildScansUrl(), { cache: 'no-store' });
      if (currentSeq !== scanSequenceRef.current) return;
      if (res.status === 401) {
        setSessionExpired(true);
        setRefreshingScans(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        if (currentSeq !== scanSequenceRef.current) return;
        const serverScans: ScanSummary[] = data.scans || [];
        setScans(serverScans);
        const reconciled = reconcileActiveScan(serverScans, activeScan);
        if (reconciled?.id !== activeScan?.id || (reconciled && activeScan && reconciled.readinessScore !== activeScan.readinessScore)) {
          setActiveScan(reconciled);
        }
      } else {
        // Honest rollback on server error
        setScans(previousScans);
        setScanRefreshError({
          message: 'Failed to refresh repository scans. Reverted to cached view.',
          retry: () => handleRefreshScans(),
        });
      }
    } catch {
      if (currentSeq !== scanSequenceRef.current) return;
      // Honest rollback on network failure
      setScans(previousScans);
      setScanRefreshError({
        message: 'Network error refreshing repository scans. Reverted to cached view.',
        retry: () => handleRefreshScans(),
      });
    } finally {
      if (currentSeq === scanSequenceRef.current) {
        setRefreshingScans(false);
      }
    }
  };

  const isInitialMount = React.useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    setCurrentPage(1);
    handleRefreshScans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedScanRepoFilter, scanDateFilter, scanStatusFilter]);

  const fetchDashboardData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setErrorType(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
        setLoading(false);
        return;
      }

      const [scansRes, routesRes, findingsRes, profileRes] = await Promise.all([
        fetch(buildScansUrl()),
        fetch('/api/routes'),
        fetch('/api/findings'),
        fetch('/api/profile'),
      ]);

      // 1. Session expiration detection (401)
      if (scansRes.status === 401 || routesRes.status === 401 || findingsRes.status === 401 || profileRes.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again to access your workspace.');
        setSessionExpired(true);
        setLoading(false);
        return;
      }

      // 2. Authorization failure (403)
      if (scansRes.status === 403 || routesRes.status === 403 || findingsRes.status === 403 || profileRes.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view this workspace.');
        setLoading(false);
        return;
      }

      // 3. Server error failure (500+)
      if (scansRes.status >= 500 || routesRes.status >= 500 || findingsRes.status >= 500 || profileRes.status >= 500) {
        setErrorType('server_error');
        setFetchError('Unable to load workspace data due to a server error. Please retry.');
        setLoading(false);
        return;
      }

      if (scansRes.ok) {
        const data = await scansRes.json();
        const serverScans: ScanSummary[] = data.scans || [];
        setScans(serverScans);

        // Authoritative reconciliation: localStorage must never contradict server
        const reconciled = reconcileActiveScan(serverScans, activeScan);
        if (reconciled?.id !== activeScan?.id || (reconciled && activeScan && reconciled.readinessScore !== activeScan.readinessScore)) {
          setActiveScan(reconciled);
        }
      }

      if (routesRes.ok) {
        const data = await routesRes.json();
        setRoutes(data.routes || []);
      }

      if (findingsRes.ok) {
        const data = await findingsRes.json();
        setFindings(data.findings || []);
      }

      if (profileRes.ok) {
        const data = await profileRes.json();
        setActivities(data.activities || []);
      }
    } catch (e: any) {
      console.error('Failed to load dashboard data:', e);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please check your network and try again.');
      } else {
        setErrorType('server_error');
        setFetchError('Failed to load workspace data. Please check your network and try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeScan, setActiveScan, setSessionExpired, buildScansUrl]);

  useEffect(() => {
    if (!appLoading && !user) {
      openAuthModal({
        initialMode: 'login',
        title: 'Sign In to Dashboard',
        subtitle: 'Sign in to access your saved repositories and scan history.',
        onSuccess: () => {
          fetchDashboardData();
        },
        onDismiss: () => {
          router.push('/');
        },
      });
      return;
    }

    if (user) {
      fetchDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, appLoading, openAuthModal, router]);

  // Derive all metrics deterministically from real API data
  const {
    totalScans,
    activeFindingsCount,
    displayedRoutes,
    openRoutesCount,
    completedRoutesCount,
    progressPercentage,
    avgReadiness,
    recommendedRoute,
  } = computeDashboardMetrics({
    scans,
    activeScan,
    routes,
    findings,
  });

  const recommendations = useMemo(() => {
    const filteredFindings = activeScan
      ? findings.filter((f) => f.scanId === activeScan.id)
      : findings;
    const filteredRoutes = activeScan
      ? routes.filter((r) => r.scanId === activeScan.id)
      : routes;
    const scoped = getRecommendations({ findings: filteredFindings, routes: filteredRoutes });
    if (scoped.length > 0) return scoped;
    return getRecommendations({ findings, routes });
  }, [findings, routes, activeScan]);

  // Client-side fallback filter for scans: instant search response & local safety
  const filteredScans = useMemo(() => {
    return scans.filter((s) => {
      // 1. Repo text filter (debounced)
      if (debouncedScanRepoFilter.trim()) {
        const query = debouncedScanRepoFilter.trim().toLowerCase();
        const matchesRepo =
          s.repoName.toLowerCase().includes(query) ||
          s.repoUrl.toLowerCase().includes(query) ||
          (s.owner && s.owner.toLowerCase().includes(query));
        if (!matchesRepo) return false;
      }

      // 2. Date range filter
      if (scanDateFilter && scanDateFilter !== 'all') {
        const scanTime = new Date(s.scannedAt).getTime();
        const now = Date.now();
        if (scanDateFilter === 'today') {
          if (now - scanTime > 24 * 60 * 60 * 1000) return false;
        } else if (scanDateFilter === '7d') {
          if (now - scanTime > 7 * 24 * 60 * 60 * 1000) return false;
        } else if (scanDateFilter === '30d') {
          if (now - scanTime > 30 * 24 * 60 * 60 * 1000) return false;
        }
      }

      // 3. Status filter
      if (scanStatusFilter && scanStatusFilter !== 'all') {
        if (scanStatusFilter === 'completed') {
          if (
            s.status !== 'completed' &&
            s.status !== 'complete' &&
            s.status !== 'complete_with_warnings'
          ) {
            return false;
          }
        } else if (scanStatusFilter === 'in-progress') {
          if (s.status !== 'scanning' && s.status !== 'running') {
            return false;
          }
        } else if (scanStatusFilter === 'failed') {
          if (s.status !== 'failed') {
            return false;
          }
        }
      }

      return true;
    });
  }, [scans, debouncedScanRepoFilter, scanDateFilter, scanStatusFilter]);

  // Paginated scans
  const totalScanPages = Math.ceil(filteredScans.length / SCANS_PER_PAGE) || 1;
  const paginatedScans = useMemo(() => {
    const startIndex = (currentPage - 1) * SCANS_PER_PAGE;
    return filteredScans.slice(startIndex, startIndex + SCANS_PER_PAGE);
  }, [filteredScans, currentPage]);

  const showDelayedSkeleton = useDelayedLoading(loading, 150);

  // Skeleton loading state
  if (loading) {
    if (!showDelayedSkeleton) {
      return null; // Skip rendering skeleton for fast responses (<150ms) to prevent flash artifacts
    }

    return (
      <div
        role="status"
        aria-busy="true"
        aria-live="polite"
        className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8"
      >
        <span className="sr-only">Loading workspace dashboard and repository scans...</span>

        {/* Header skeleton */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-platinumSilver/15" aria-hidden="true">
          <div className="space-y-2">
            <Skeleton className="h-5 w-36 rounded-full" />
            <Skeleton className="h-8 w-64 rounded-xl" />
            <Skeleton className="h-4 w-96 max-w-full rounded-lg" />
          </div>
          <Skeleton className="h-10 w-36 rounded-full" />
        </div>

        {/* Pipeline Stepper skeleton */}
        <div className="liquid-glass-hero p-5 sm:p-6 rounded-3xl space-y-4" aria-hidden="true">
          <div className="flex items-center justify-between pb-3 border-b border-platinumSilver/15">
            <Skeleton className="h-6 w-48 rounded-lg" />
            <Skeleton className="h-8 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-black/60 border border-platinumSilver/10 h-16">
                <Skeleton className="h-3 w-16 mb-2" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            ))}
          </div>
        </div>

        {/* 4 Metric Cards skeleton */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" aria-hidden="true">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="liquid-glass-card p-4 rounded-2xl flex items-center gap-3 border-platinumSilver/20 h-20">
              <Skeleton variant="circle" className="w-10 h-10 rounded-xl shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-5 w-12 rounded" />
                <Skeleton className="h-3 w-24 rounded" />
              </div>
            </div>
          ))}
        </div>

        {/* Main Grid skeleton */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" aria-hidden="true">
          <div className="lg:col-span-2 space-y-6">
            <div className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/20 space-y-4">
              <div className="flex justify-between pb-3 border-b border-platinumSilver/10">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-4 w-20" />
              </div>
              <SkeletonText lines={3} />
            </div>
            <div className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/20 space-y-4">
              <div className="flex justify-between pb-3 border-b border-platinumSilver/10">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-4 w-24" />
              </div>
              <div className="space-y-3">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/20 space-y-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-24 w-full" />
            </div>
            <div className="liquid-glass-card p-6 rounded-3xl border border-platinumSilver/20 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-32 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Dashboard Editorial Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-platinumSilver/15">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full liquid-chrome-pill text-[11px] font-mono text-platinumSilver mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Workspace Active</span>
            <span className="text-textTertiary">•</span>
            <span className="text-lemonChiffon">ContribLens OSS</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-textPrimary tracking-tight flex items-center gap-2">
            Welcome back, <span className="font-showcase italic font-normal text-transparent bg-clip-text bg-gradient-to-r from-platinumSilver via-lemonChiffon to-electricTangerine">{user?.name || 'Contributor'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-textMuted mt-1">
            Navigate verified findings, plan bounded contributor fixes, and generate maintainer-ready drafts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/app/scan"
            className="min-h-[44px] px-6 py-3 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-white font-bold text-xs transition-all shadow-glow-tangerine flex items-center gap-2 press-spring touch-manipulation"
          >
            <Search className="w-4 h-4" />
            <span>Scan Repository</span>
          </Link>
        </div>
      </div>

      {/* Error state with functional retry button */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-rosewood/25 border border-rosewood/50 text-sustainableLinen text-xs flex items-center justify-between gap-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-electricTangerine shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={() => fetchDashboardData()}
            className="min-h-[44px] px-4 py-1.5 rounded-full bg-lemonChiffon text-black font-semibold text-xs hover:bg-sustainableLinen transition-colors flex items-center gap-1.5 shadow-sm press-spring touch-manipulation"
          >
            <RotateCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Visually Connected Readiness & Pipeline Stepper */}
      <div className="liquid-glass-hero p-5 sm:p-6 rounded-3xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-borderDark">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-electricTangerine/20 border border-electricTangerine/40 flex items-center justify-center text-electricTangerine">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-heading font-bold text-textPrimary">Contribution Pipeline Status</h2>
              <span className="text-[11px] text-textMuted">
                {activeScan ? `Active Context: ${activeScan.repoName}` : 'Select a repository to inspect pipeline'}
              </span>
            </div>
          </div>

          {activeScan && (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <span className="text-[10px] text-textMuted uppercase font-mono block">Repository Readiness</span>
                <span className="text-sm font-bold text-lemonChiffon font-mono">{activeScan.readinessScore}/100</span>
              </div>
              <div className="w-10 h-10 rounded-full liquid-chrome-orb flex items-center justify-center font-bold text-xs text-black shadow-sm" title="Repository environment & health readiness score">
                {activeScan.readinessScore}
              </div>
            </div>
          )}
        </div>

        {/* 4 Connected Pipeline Stages */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-3 rounded-xl bg-black/60 border border-platinumSilver/20 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-electricTangerine font-semibold">1. Scan</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] text-platinumSilver/80">Static analysis complete</p>
          </div>

          <div className="p-3 rounded-xl bg-black/60 border border-platinumSilver/20 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-botticelli font-semibold">2. Verify</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-[10px] text-platinumSilver/80">OSV &amp; SHA-256 verified</p>
          </div>

          <div className="p-3 rounded-xl bg-black/60 border border-platinumSilver/20 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-paleLavender font-semibold">3. Understand</span>
              <Cpu className="w-3.5 h-3.5 text-paleLavender" />
            </div>
            <p className="text-[10px] text-platinumSilver/80">Grounded Gemma 4 active</p>
          </div>

          <div className="p-3 rounded-xl bg-black/60 border border-platinumSilver/20 space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-lemonChiffon font-semibold">4. Drafts</span>
              <FileText className="w-3.5 h-3.5 text-lemonChiffon" />
            </div>
            <p className="text-[10px] text-platinumSilver/80">Ready for review</p>
          </div>
        </div>
      </div>

      {/* 4 Metric Cards with GlassMetricCard Primitives */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Repositories Scanned */}
        <GlassMetricCard
          value={totalScans}
          label="Repositories Scanned"
          icon={<GitBranch className="w-5 h-5 text-electricTangerine" />}
          badge={
            <span className="text-[10px] font-mono text-textMuted">
              {totalScans === 1 ? '1 repo' : `${totalScans} repos`}
            </span>
          }
        />

        {/* Metric 2: Active Findings */}
        <GlassMetricCard
          value={activeFindingsCount}
          label="Active Findings"
          icon={<AlertTriangle className="w-5 h-5 text-electricTangerine" />}
          badge={
            activeScan && activeScan.findingsCount?.critical > 0 ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rosewood/40 text-red-300 border border-rosewood">
                {activeScan.findingsCount.critical} critical
              </span>
            ) : activeScan ? (
              <span className="text-[10px] font-mono text-textMuted">
                in context
              </span>
            ) : undefined
          }
        />

        {/* Metric 3: Open Routes (isPrimary - Elevated Primary Metric) */}
        <GlassMetricCard
          value={openRoutesCount}
          label="Open Routes"
          isPrimary={true}
          icon={<Compass className="w-5 h-5 text-lemonChiffon" />}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-coffeeBean text-lemonChiffon border border-lemonChiffon/40">
              {completedRoutesCount} completed
            </span>
          }
        />

        {/* Metric 4: Avg Readiness */}
        <GlassMetricCard
          value={`${avgReadiness}/100`}
          label="Avg Readiness"
          icon={<Zap className="w-5 h-5 text-botticelli" />}
          badge={
            <span className="text-[10px] font-mono text-textMuted">
              {totalScans > 0 ? 'Across repos' : 'No scans'}
            </span>
          }
        />
      </div>

      {/* Main Grid: Recommended Task & Tech Snapshot */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Recommended Next Task (Col span 2) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* F5: "Recommended for you" Panel (Top 3 Recommendations) */}
          <div className="liquid-glass-card p-6 rounded-3xl space-y-4" data-testid="recommended-for-you-panel">
            <div className="flex items-center justify-between pb-3 border-b border-platinumSilver/15">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-electricTangerine" />
                <h3 className="text-sm font-heading font-bold text-textPrimary">Recommended for you</h3>
              </div>
              <span className="text-[11px] font-mono text-lemonChiffon bg-black/60 px-3 py-1 rounded-full border border-lemonChiffon/30 shadow-inner">
                {recommendations.length > 0
                  ? `Top ${Math.min(3, recommendations.length)} of ${recommendations.length}`
                  : 'Deterministic Scoring'}
              </span>
            </div>

            {recommendations.length > 0 ? (
              <div className="space-y-3.5">
                {recommendations.slice(0, 3).map((rec, index) => {
                  const isTopPick = index === 0;
                  const priorityColor =
                    rec.priorityLabel === 'Fix this now'
                      ? 'bg-rosewood/30 text-sustainableLinen border-rosewood/50'
                      : rec.priorityLabel === 'Good next step'
                      ? 'bg-coffeeBean text-lemonChiffon border-lemonChiffon/40'
                      : 'bg-white/5 text-textMuted border-borderDark';

                  return (
                    <div
                      key={rec.id}
                      className={`p-4 sm:p-5 rounded-2xl transition-all ${
                        isTopPick
                          ? 'bg-black/60 backdrop-blur-md border border-lemonChiffon/40 shadow-sm space-y-3'
                          : 'bg-black/40 backdrop-blur-sm border border-borderDark hover:border-lemonChiffon/30 space-y-2.5'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-white/10 text-platinumSilver">
                              #{index + 1}
                            </span>
                            <span
                              className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${priorityColor}`}
                            >
                              {rec.priorityLabel}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-coffeeBean text-lemonChiffon/90 border border-lemonChiffon/20 capitalize">
                              {rec.difficulty}
                            </span>
                            <span className="text-[10px] font-mono text-textMuted flex items-center gap-1">
                              <Clock className="w-3 h-3 text-textMuted" />
                              <span>{rec.estimatedMinutes} mins</span>
                            </span>
                          </div>
                          <h4 className="text-sm sm:text-base font-heading font-bold text-textPrimary leading-snug pt-0.5">
                            {rec.title}
                          </h4>
                          {rec.targetFile && (
                            <p className="text-[11px] text-textMuted font-mono">
                              File: <span className="text-lemonChiffon">{rec.targetFile}</span>
                            </p>
                          )}
                        </div>

                        <Link
                          href={rec.targetUrl}
                          className="min-h-[44px] px-4 py-2 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-bold shrink-0 inline-flex items-center justify-center gap-1.5 transition-all shadow-sm press-spring touch-manipulation self-start sm:self-auto"
                        >
                          <span>{rec.targetType === 'route' ? 'View Route' : 'Inspect'}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>

                      {/* One plain-English reason sentence */}
                      <p className="text-xs text-textSecondary leading-relaxed bg-white/5 p-2.5 rounded-xl border border-borderDark">
                        {rec.reason}
                      </p>

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-textMuted">
                        <div className="flex items-center gap-1.5">
                          <span>Focus skill:</span>
                          <strong className="text-lemonChiffon">{rec.learnSkill}</strong>
                        </div>
                        <span className="font-mono text-[10px]">Score: {rec.score} pts</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Actionable Empty State per Task 5 */
              <div className="text-center py-10 px-6 rounded-2xl bg-black/40 backdrop-blur-sm border border-dashed border-borderDark space-y-4">
                <div className="w-12 h-12 rounded-full liquid-chrome-orb flex items-center justify-center mx-auto text-black shadow-md">
                  <Compass className="w-6 h-6" />
                </div>
                <div className="max-w-md mx-auto space-y-1">
                  <h4 className="text-sm font-heading font-bold text-textPrimary">
                    Run a scan to get personalized next steps
                  </h4>
                  <p className="text-xs text-textMuted leading-relaxed">
                    Scan your first public GitHub repository to discover verified security findings and deterministic contribution routes.
                  </p>
                </div>
                <Link
                  href="/app/scan"
                  className="min-h-[44px] inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-white text-xs font-bold transition-all shadow-glow-tangerine press-spring touch-manipulation"
                >
                  <Search className="w-3.5 h-3.5" />
                  <span>Scan Repository</span>
                </Link>
              </div>
            )}
          </div>

          {/* Open Contribution Progress */}
          <div className="liquid-glass-card p-6 rounded-3xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-lemonChiffon" />
                <h3 className="text-sm font-heading font-bold text-textPrimary">Open Contribution Progress</h3>
              </div>
              <span className="text-xs font-mono font-semibold text-lemonChiffon">
                {completedRoutesCount} of {displayedRoutes.length} completed ({progressPercentage}%)
              </span>
            </div>
            <ProgressBar
              value={progressPercentage}
              variant="tangerine"
              size="md"
            />
            <div className="flex items-center justify-between text-[11px] text-platinumSilver/70 pt-1">
              <span>Status: {openRoutesCount} active routes awaiting review</span>
              <Link href="/app/contributions" className="text-lemonChiffon hover:underline font-medium">
                View All Routes →
              </Link>
            </div>
          </div>

          {/* Recent Repositories */}
          <div className="liquid-glass-card p-6 rounded-3xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-platinumSilver/15">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-heading font-bold text-textPrimary">Recent Repositories</h3>
                {refreshingScans && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-textMuted font-mono">
                    <RotateCw className="w-3 h-3 animate-spin text-lemonChiffon" />
                    <span>Syncing...</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <LastUpdatedBadge
                  timestamp={scans[0]?.scannedAt}
                  onRefresh={handleRefreshScans}
                  refreshing={refreshingScans}
                />
                <Link href="/app/scan" className="text-xs text-lemonChiffon hover:underline font-semibold">
                  New Scan →
                </Link>
              </div>
            </div>

            {/* Inline Error on Refresh Failure with Honest Rollback & Retry */}
            {scanRefreshError && (
              <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                  <span>{scanRefreshError.message}</span>
                </div>
                <button
                  type="button"
                  onClick={scanRefreshError.retry}
                  className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Scans Filter Toolbar with Debounced Search, Date Range, Status, and URL Sync */}
            <div className="glass-panel p-3.5 sm:p-4 rounded-2xl border border-borderDark space-y-3">
              {/* Row 1: Repository Search Input & Active Filter Chip */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={scanRepoFilter}
                    onChange={(e) => handleScanRepoChange(e.target.value)}
                    placeholder="Filter repositories by name or owner..."
                    aria-label="Filter repositories by name or owner"
                    className="w-full min-h-[44px] pl-9 pr-11 py-2 bg-black/60 backdrop-blur-md border border-borderDark rounded-xl text-base sm:text-xs text-textPrimary placeholder:text-textTertiary focus:outline-none focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon font-mono"
                  />
                  {scanRepoFilter && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {scanRepoFilter !== debouncedScanRepoFilter && (
                        <span className="w-3 h-3 border-2 border-lemonChiffon border-t-transparent rounded-full animate-spin" title="Debouncing filter..." />
                      )}
                      <button
                        type="button"
                        onClick={() => handleScanRepoChange('')}
                        className="min-w-[44px] min-h-[44px] text-textMuted hover:text-textPrimary flex items-center justify-center press-spring touch-manipulation"
                        aria-label="Clear repository filter"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {activeScanFilterCount > 0 && (
                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 flex-wrap">
                    <span className="inline-flex items-center gap-1 min-h-[44px] px-3 py-1.5 rounded-full bg-lemonChiffon/15 text-lemonChiffon border border-lemonChiffon/30 text-xs font-mono font-bold">
                      <Filter className="w-3 h-3" />
                      <span>{activeScanFilterCount} active {activeScanFilterCount === 1 ? 'filter' : 'filters'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={handleResetScanFilters}
                      className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-textMuted hover:text-lemonChiffon border border-borderDark text-xs font-medium transition-colors flex items-center gap-1 press-spring touch-manipulation"
                      aria-label="Clear all scan filters"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Clear all</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Row 2: Date Range & Status Filters */}
              <div className="pt-2 border-t border-borderDark/40 flex flex-wrap items-center justify-between gap-3 text-xs">
                {/* Date Range Selector */}
                <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="toolbar" aria-label="Date range filter">
                  <span className="text-textMuted font-medium flex items-center gap-1 shrink-0 mr-1">
                    <Clock className="w-3.5 h-3.5 text-botticelli" /> Date:
                  </span>
                  {SCAN_DATE_OPTIONS.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => handleScanDateChange(d.id)}
                      className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                        scanDateFilter === d.id
                          ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                          : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>

                {/* Status Selector */}
                <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="toolbar" aria-label="Scan status filter">
                  <span className="text-textMuted font-medium shrink-0 mr-1">Status:</span>
                  {SCAN_STATUS_OPTIONS.map((st) => (
                    <button
                      key={st.id}
                      type="button"
                      onClick={() => handleScanStatusChange(st.id)}
                      className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-xs font-mono transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                        scanStatusFilter === st.id
                          ? 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-semibold'
                          : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Scans Results Count & Screen Reader Announcement */}
              <div className="pt-2 border-t border-borderDark/40 flex items-center justify-between text-xs text-textMuted">
                <div className="sr-only" role="status" aria-live="polite">
                  Showing {filteredScans.length} of {scans.length} repository scans
                </div>
                <span>
                  Showing <strong className="text-textPrimary">{filteredScans.length}</strong> of{' '}
                  <strong className="text-textPrimary">{scans.length}</strong> repositories
                </span>
                {totalScanPages > 1 && (
                  <span className="font-mono text-[11px] text-textMuted">
                    Page {currentPage} of {totalScanPages}
                  </span>
                )}
              </div>
            </div>

            {filteredScans.length > 0 ? (
              <div className={`space-y-3 transition-opacity duration-200 ${refreshingScans ? 'opacity-70' : 'opacity-100'}`}>
                {paginatedScans.map((s) => {
                  const isSelected = activeScan?.id === s.id;
                  const diffData = getScanDiffBadgeData(s);
                  const highestRisk =
                    s.findingsCount.critical > 0
                      ? { label: 'CRITICAL', style: 'bg-rosewood/40 text-red-300 border-rosewood' }
                      : s.findingsCount.high > 0
                      ? { label: 'HIGH', style: 'bg-electricTangerine/20 text-electricTangerine border-electricTangerine/40' }
                      : s.findingsCount.medium > 0
                      ? { label: 'MEDIUM', style: 'bg-botticelli/20 text-botticelli border-botticelli/40' }
                      : { label: 'LOW', style: 'bg-white/10 text-platinumSilver/70 border-platinumSilver/20' };

                  const diffBadgeStyle =
                    diffData.badgeType === 'resolved'
                      ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                      : diffData.badgeType === 'new'
                      ? 'bg-electricTangerine/15 text-electricTangerine border-electricTangerine/30'
                      : diffData.badgeType === 'mixed'
                      ? 'bg-emerald-500/10 text-lemonChiffon border-lemonChiffon/30'
                      : 'bg-white/5 text-platinumSilver/60 border-platinumSilver/20';

                  const scanDate = s.scannedAt
                    ? new Date(s.scannedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })
                    : '';
                  const techList = (s.techStack?.languages || []).map((l) => l.name).slice(0, 3).join(', ') || 'Multi-tech';

                  return (
                    <div
                      key={s.id}
                      onClick={() => setActiveScan(s)}
                      className={`min-h-[44px] p-4 rounded-2xl border cursor-pointer transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 press-spring touch-manipulation ${
                        isSelected
                          ? 'bg-black/90 border-lemonChiffon shadow-md'
                          : 'bg-black/50 border-platinumSilver/15 hover:border-platinumSilver/30 hover:bg-black/70'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <GitBranch className={`w-4 h-4 mt-0.5 ${isSelected ? 'text-lemonChiffon' : 'text-platinumSilver/60'}`} />
                        <div>
                          <div className="text-sm font-semibold text-textPrimary flex items-center gap-2">
                            <span>{s.repoName}</span>
                            {isSelected && (
                              <span className="text-[10px] bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 px-2 py-0.5 rounded-full font-mono">
                                Active Context
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-platinumSilver/70 flex flex-wrap items-center gap-2 mt-1">
                            <span>Last scan: <strong suppressHydrationWarning className="text-platinumSilver">{scanDate}</strong></span>
                            <span>•</span>
                            <span>Stack: <strong className="text-lemonChiffon font-mono">{techList}</strong></span>
                            <span>•</span>
                            <span>{s.findingsCount.total} findings</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 pt-2 sm:pt-0 border-t sm:border-t-0 border-platinumSilver/15">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${diffBadgeStyle}`} title="Scan difference vs previous scan">
                          {diffData.label}
                        </span>
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${highestRisk.style}`}>
                          {highestRisk.label}
                        </span>
                        <div className="text-right">
                          <div className="text-xs font-bold text-lemonChiffon font-mono">{s.readinessScore}/100</div>
                          <div className="text-[10px] text-platinumSilver/60">Readiness</div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setScanToDelete(s);
                            setShowDeleteScanConfirm(true);
                          }}
                          aria-label={`Delete scan record for ${s.repoName}`}
                          className="min-w-[44px] min-h-[44px] p-2 text-textMuted hover:text-red-400 hover:bg-rosewood/20 rounded-xl transition-colors flex items-center justify-center press-spring touch-manipulation"
                          title="Delete scan record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-4 h-4 text-platinumSilver/50 hidden sm:block" />
                      </div>
                    </div>
                  );
                })}

                {/* Scans Pagination Footer */}
                {totalScanPages > 1 && (
                  <div className="flex items-center justify-between pt-2 border-t border-borderDark/60 text-xs">
                    <button
                      type="button"
                      disabled={currentPage <= 1}
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-borderDark text-textPrimary flex items-center gap-1 transition-all press-spring touch-manipulation font-mono text-xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Previous</span>
                    </button>
                    <span className="text-textMuted font-mono text-[11px]">
                      Page {currentPage} of {totalScanPages}
                    </span>
                    <button
                      type="button"
                      disabled={currentPage >= totalScanPages}
                      onClick={() => setCurrentPage((p) => Math.min(totalScanPages, p + 1))}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed border border-borderDark text-textPrimary flex items-center gap-1 transition-all press-spring touch-manipulation font-mono text-xs"
                    >
                      <span>Next</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            ) : scans.length > 0 || activeScanFilterCount > 0 ? (
              /* Distinct Honest Empty-after-filter state */
              <EmptyState
                icon={Filter}
                title="No repository scans match these filters"
                description="Try widening your repository search, adjusting the date range, or resetting the scan status filter."
                action={{
                  label: 'Reset scan filters',
                  onClick: handleResetScanFilters,
                }}
                secondaryHint={`${scans.length} total repository scan${scans.length === 1 ? '' : 's'} available in this workspace without filters.`}
              />
            ) : errorType ? (
              <ErrorState
                type={errorType}
                title={
                  errorType === 'session_expired'
                    ? 'Session Expired'
                    : errorType === 'forbidden'
                    ? 'Access Denied'
                    : errorType === 'network_offline'
                    ? 'Connection Lost'
                    : 'Unable to Load Repositories'
                }
                message={fetchError || 'An error occurred while loading your repository list.'}
                onRetry={() => fetchDashboardData()}
                retrying={loading}
                compact={true}
              />
            ) : (
              <EmptyState
                icon={GitBranch}
                title="Scan your first public repository"
                description="Provide any public GitHub repository URL to evaluate its health, dependencies, and contribution readiness."
                action={{
                  label: 'Scan your first repository →',
                  href: '/app/scan',
                  icon: Search,
                }}
                secondaryHint={
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
                    <span className="text-textMuted font-mono">Sample:</span>
                    <Link
                      href="/app/scan?url=https://github.com/expressjs/express"
                      className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-lemonChiffon border border-lemonChiffon/20 font-mono text-xs inline-flex items-center press-spring touch-manipulation"
                    >
                      expressjs/express
                    </Link>
                    <Link
                      href="/app/scan?url=https://github.com/pallets/flask"
                      className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-lemonChiffon border border-lemonChiffon/20 font-mono text-xs inline-flex items-center press-spring touch-manipulation"
                    >
                      pallets/flask
                    </Link>
                  </div>
                }
                compact={true}
              />
            )}
          </div>

        </div>

        {/* Sidebar: Latest Tech Snapshot & Activity Timeline */}
        <div className="space-y-6">
          
          {/* Latest Tech Snapshot */}
          <div className="liquid-glass-card p-6 rounded-3xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-platinumSilver/15">
              <Layers className="w-4 h-4 text-electricTangerine" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Technology Snapshot</h3>
            </div>

            {activeScan ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-platinumSilver/70 mb-1.5">Primary Languages</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(activeScan.techStack?.languages || []).map((l) => (
                      <span
                        key={l.name}
                        className="text-xs px-2.5 py-1 rounded-full bg-black/80 border border-platinumSilver/20 text-platinumSilver"
                      >
                        {l.name} ({l.percentage}%)
                      </span>
                    ))}
                  </div>
                </div>

                {(activeScan.techStack?.frameworks || []).length > 0 && (
                  <div>
                    <div className="text-xs text-platinumSilver/70 mb-1.5">Frameworks</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeScan.techStack?.frameworks || []).map((f) => (
                        <span
                          key={f.name}
                          className="text-xs px-2.5 py-1 rounded-full bg-black/80 border border-lemonChiffon/30 text-lemonChiffon"
                        >
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(activeScan.techStack?.tooling || []).length > 0 && (
                  <div>
                    <div className="text-xs text-platinumSilver/70 mb-1.5">Tooling &amp; CI/CD</div>
                    <div className="flex flex-wrap gap-1.5">
                      {(activeScan.techStack?.tooling || []).map((t) => (
                        <span
                          key={t.name}
                          className="text-xs px-2.5 py-1 rounded-full bg-black/80 border border-platinumSilver/20 text-cotton"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-platinumSilver/15">
                  <Link
                    href="/app/contributions"
                    className="min-h-[44px] inline-flex items-center gap-1 text-xs text-lemonChiffon hover:underline font-semibold press-spring touch-manipulation"
                  >
                    <span>View Stack Matrix &amp; Routes</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            ) : (
              <p className="text-xs text-platinumSilver/70 py-4 leading-relaxed">
                Select or scan a repository to inspect its technology snapshot and dependency signals.
              </p>
            )}
          </div>

          {/* Activity Timeline */}
          <div className="liquid-glass-card p-6 rounded-3xl space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-platinumSilver/15">
              <Clock className="w-4 h-4 text-platinumSilver/70" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Recent Activity</h3>
            </div>

            {activities.length > 0 ? (
              <div className="space-y-3">
                {activities.slice(0, 5).map((act) => (
                  <div key={act.id} className="text-xs border-l-2 border-lemonChiffon/60 pl-3 py-1 space-y-0.5">
                    <p className="text-textPrimary font-medium leading-snug">{act.description}</p>
                    <span suppressHydrationWarning className="text-[10px] text-platinumSilver/60 block font-mono">
                      {new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(act.timestamp).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center space-y-3">
                <p className="text-xs text-platinumSilver/70">No recent activity recorded.</p>
                <Link
                  href="/app/scan"
                  className="min-h-[44px] inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-full bg-lemonChiffon text-black text-xs font-bold hover:bg-sustainableLinen transition-colors shadow-sm press-spring touch-manipulation"
                >
                  Run First Scan
                </Link>
              </div>
            )}
          </div>

        </div>

      </div>

      {/* Confirmation Dialog: Delete Repository Scan */}
      {scanToDelete && (
        <ConfirmDialog
          isOpen={showDeleteScanConfirm}
          title="Delete Repository Scan?"
          description={`Are you sure you want to delete the scan record for ${scanToDelete.repoName}?`}
          consequenceWarning="This permanently deletes the scan record and all associated findings, routes, and issue drafts linked to this scan."
          confirmLabel="Delete Scan"
          cancelLabel="Keep Scan"
          isDestructive={true}
          isBusy={deletingScan}
          onConfirm={handleDeleteScan}
          onCancel={() => {
            setShowDeleteScanConfirm(false);
            setScanToDelete(null);
          }}
        />
      )}

    </div>
  );
}
