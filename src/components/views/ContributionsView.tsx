'use client';

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Compass,
  Layers,
  CheckCircle2,
  ArrowRight,
  FileText,
  Clock,
  Loader2,
  Terminal,
  Lock,
  Sparkles,
  ExternalLink,
  Code2,
  FileCode,
  Shield,
  Filter,
  Check,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Wrench,
  Download,
  RotateCw,
  ShieldAlert,
} from 'lucide-react';
import type { ContributionRoute, TechStack, Finding } from '@/types';
import { ContributionsStackSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';

function ContributionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightedRouteId = searchParams.get('routeId');

  const { activeScan, setActiveScan, showToast, setSessionExpired, openAuthModal } = useApp();

  const [routes, setRoutes] = useState<ContributionRoute[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [loading, setLoading] = useState(true);
  const showDelayedSkeleton = useDelayedLoading(loading, 150);
  type ContributionsError = 'session_expired' | 'forbidden' | 'not_found' | 'server_error' | 'network_offline' | null;
  const [errorType, setErrorType] = useState<ContributionsError>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [generatingDraftId, setGeneratingDraftId] = useState<string | null>(null);
  const [downloadingPackId, setDownloadingPackId] = useState<string | null>(null);
  const [updatingRouteId, setUpdatingRouteId] = useState<string | null>(null);
  const [generatingAllRoutes, setGeneratingAllRoutes] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(highlightedRouteId);

  // Filters
  const [difficultyFilter, setDifficultyFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const fetchSequenceRef = useRef<number>(0);

  useEffect(() => {
    const seq = fetchSequenceRef;
    return () => {
      seq.current++;
    };
  }, []);

  // Automatically bind to most recent scan if activeScan is null on page load
  useEffect(() => {
    if (!activeScan) {
      fetch('/api/scans')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.scans?.[0]) {
            setActiveScan(data.scans[0]);
          }
        })
        .catch((err) => {
          console.debug('Initial scan auto-bind suppressed:', err);
        });
    }
  }, [activeScan, setActiveScan]);

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeScan]);

  const fetchData = async () => {
    const currentSeq = ++fetchSequenceRef.current;
    setLoading(true);
    setFetchError(null);
    setErrorType(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (currentSeq !== fetchSequenceRef.current) return;
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
        setLoading(false);
        return;
      }

      let routeUrl = activeScan ? `/api/routes?scanId=${activeScan.id}` : '/api/routes';
      let findingUrl = activeScan ? `/api/findings?scanId=${activeScan.id}` : '/api/findings';

      let [routeRes, findingRes] = await Promise.all([
        fetch(routeUrl),
        fetch(findingUrl),
      ]);

      // Self-heal if 404 with stale activeScan
      if ((routeRes.status === 404 || findingRes.status === 404) && activeScan) {
        setActiveScan(null);
        try {
          localStorage.removeItem('contriblens_active_scan');
        } catch (err) {
          console.debug('Failed to remove active scan from localStorage:', err);
        }
        [routeRes, findingRes] = await Promise.all([
          fetch('/api/routes'),
          fetch('/api/findings'),
        ]);
      }

      // Discard stale response if newer request was launched
      if (currentSeq !== fetchSequenceRef.current) return;

      if (routeRes.status === 401 || findingRes.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        setSessionExpired(true);
        setRoutes([]);
        setFindings([]);
        setLoading(false);
        return;
      }

      if (routeRes.status === 403 || findingRes.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view contribution routes for this scan.');
        setRoutes([]);
        setFindings([]);
        setLoading(false);
        return;
      }

      if (routeRes.status === 404) {
        setErrorType('not_found');
        setFetchError('The requested repository scan or contribution routes could not be found.');
        setRoutes([]);
        setFindings([]);
        setLoading(false);
        return;
      }

      if (routeRes.status >= 500 || findingRes.status >= 500) {
        setErrorType('server_error');
        setFetchError('Failed to load contributions due to a server error. Please retry.');
        setRoutes([]);
        setFindings([]);
        setLoading(false);
        return;
      }

      if (currentSeq !== fetchSequenceRef.current) return;

      if (routeRes.ok) {
        const data = await routeRes.json();
        const loadedRoutes: ContributionRoute[] = data.routes || [];
        setRoutes(loadedRoutes);
        if (loadedRoutes.length > 0 && !selectedRouteId) {
          setSelectedRouteId(highlightedRouteId || loadedRoutes[0].id);
        }
      }

      if (findingRes.ok) {
        const fData = await findingRes.json();
        setFindings(fData.findings || []);
      }
    } catch (e: any) {
      if (currentSeq !== fetchSequenceRef.current) return;
      console.error('Failed to load contributions data:', e);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
      } else {
        setErrorType('server_error');
        setFetchError('Failed to load contributions data. Please check your network and retry.');
      }
    } finally {
      if (currentSeq === fetchSequenceRef.current) {
        setLoading(false);
      }
    }
  };

  const handleUpdateStatus = async (routeId: string, newStatus: ContributionRoute['status']) => {
    if (updatingRouteId) return;
    setUpdatingRouteId(routeId);
    try {
      const res = await fetch('/api/routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId, status: newStatus }),
      });
      const data = await res.json();
      if (res.ok) {
        setRoutes((prev) =>
          prev.map((r) => (r.id === routeId ? { ...r, status: newStatus } : r))
        );
        showToast(`Route status updated to "${newStatus.replace('-', ' ')}"`, 'info');
      } else {
        showToast(data.error || 'Failed to update route status', 'error');
      }
    } catch {
      showToast('Network error updating route status', 'error');
    } finally {
      setUpdatingRouteId(null);
    }
  };

  const handleGenerateDraft = async (routeId: string) => {
    if (generatingDraftId) return;
    setGeneratingDraftId(routeId);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast('Maintainer issue draft generated successfully!', 'success');
        router.push(`/app/issue-drafts?draftId=${data.draft.id}`);
      } else {
        showToast(data.error || 'Failed to generate draft', 'error');
      }
    } catch {
      showToast('Network error generating draft', 'error');
    } finally {
      setGeneratingDraftId(null);
    }
  };

  const handleDownloadPack = async (routeId: string) => {
    if (downloadingPackId) return;
    setDownloadingPackId(routeId);
    try {
      const res = await fetch(`/api/routes/${routeId}/pack`);
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'Failed to download pack', 'error');
        return;
      }
      const data = await res.json();
      const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename || `contriblens-pack-${routeId}.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      showToast('Contribution pack downloaded successfully!', 'success');
    } catch {
      showToast('Network error downloading contribution pack', 'error');
    } finally {
      setDownloadingPackId(null);
    }
  };

  const handleAutoGenerateRoutes = async () => {
    if (findings.length === 0 || generatingAllRoutes) {
      if (findings.length === 0) {
        showToast('No verified findings available to generate routes from.', 'info');
      }
      return;
    }
    setGeneratingAllRoutes(true);
    try {
      const unrouted = findings.filter(
        (f) => !routes.some((r) => r.findingId === f.id || (r.findingIds && r.findingIds.includes(f.id)))
      );

      if (unrouted.length === 0) {
        showToast('All findings already have active contribution routes.', 'info');
        setGeneratingAllRoutes(false);
        return;
      }

      let createdCount = 0;
      for (const f of unrouted.slice(0, 5)) {
        const res = await fetch('/api/routes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingId: f.id }),
        });
        if (res.ok) createdCount++;
      }

      showToast(`Created ${createdCount} new contribution routes!`, 'success');
      await fetchData();
    } catch {
      showToast('Failed to auto-generate contribution routes', 'error');
    } finally {
      setGeneratingAllRoutes(false);
    }
  };

  const techStack: TechStack | undefined = activeScan?.techStack;
  const readinessScore = activeScan?.readinessScore ?? 65;

  // Filtered routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      if (difficultyFilter !== 'all' && r.difficulty !== difficultyFilter) return false;
      if (statusFilter !== 'all' && (r.status || 'not-started') !== statusFilter) return false;
      return true;
    });
  }, [routes, difficultyFilter, statusFilter]);

  // Pick top contribution recommendation
  const topRoute = useMemo(() => {
    if (routes.length === 0) return null;
    const sorted = [...routes].sort((a, b) => {
      const diffWeight = { beginner: 3, intermediate: 2, advanced: 1 };
      const wA = diffWeight[a.difficulty] || 1;
      const wB = diffWeight[b.difficulty] || 1;
      if (wB !== wA) return wB - wA;
      const scoreA = a.readiness?.total ?? a.readinessScore ?? 0;
      const scoreB = b.readiness?.total ?? b.readinessScore ?? 0;
      return scoreB - scoreA;
    });
    return sorted[0];
  }, [routes]);

  // Selected route for the Contribution Impact Graph
  const activeRoute = useMemo(() => {
    if (selectedRouteId) {
      const found = routes.find((r) => r.id === selectedRouteId);
      if (found) return found;
    }
    return topRoute || routes[0] || null;
  }, [routes, selectedRouteId, topRoute]);

  // Find linked finding for active route
  const activeFinding = useMemo(() => {
    if (!activeRoute) return null;
    const fId = activeRoute.findingId || (activeRoute.findingIds && activeRoute.findingIds[0]);
    return findings.find((f) => f.id === fId) || null;
  }, [activeRoute, findings]);

  const isRouteDisclosureBlocked = (r: ContributionRoute) => {
    const fId = r.findingId || (r.findingIds && r.findingIds[0]);
    const matchedF = findings.find((f) => f.id === fId);
    return (
      r.category === 'secret' ||
      matchedF?.category === 'secret' ||
      matchedF?.disclosureMode === 'security-disclosure' ||
      matchedF?.disclosureMode === 'DISCLOSURE_BLOCKED' ||
      String(matchedF?.severity).toUpperCase() === 'CRITICAL'
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-10 bg-transparent text-textPrimary overflow-x-hidden">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-borderDark">
        <div>
          <h1 className="text-2xl font-heading font-bold text-textPrimary flex items-center gap-2">
            <span>Contributions + Technology Stack</span>
            {activeScan && (
              <span className="text-xs font-mono font-medium text-lemonChiffon bg-coffeeBean px-3 py-1 rounded-full border border-lemonChiffon/20">
                {activeScan.repoName}
              </span>
            )}
          </h1>
          <p className="text-xs text-textMuted mt-1">
            Merged architecture inspection and prioritized contributor tracks with concrete test plans and acceptance criteria.
          </p>
        </div>

        {/* Readiness Badge & Mandatory Maintainer Review Badge (P9 Task 5) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rosewood/25 border border-rosewood/60 text-xs font-mono font-semibold text-red-300">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Maintainer review required</span>
          </div>

          <div className="glass-panel p-3.5 rounded-2xl border border-borderDark flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-lemonChiffon/15 border border-lemonChiffon/30 flex items-center justify-center text-lemonChiffon font-bold text-base font-mono">
              {readinessScore}
            </div>
            <div>
              <div className="text-xs font-bold text-textPrimary">Repository Readiness</div>
              <div className="text-[11px] text-textMuted">
                {readinessScore >= 80 ? 'Excellent Onboarding' : readinessScore >= 60 ? 'Moderate Friction' : 'Needs Docs & Tooling'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Part 1: Top Technology Chips & Manifests (P9 Task 1: Botticelli/Linen borders with source paths + confidence) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-electricTangerine" />
            <h2 className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider">
              Detected Technology Stack &amp; Manifests
            </h2>
          </div>
          {techStack && (
            <span className="text-[11px] font-mono text-lemonChiffon">
              Confidence Score: {techStack.confidenceScore}% {techStack.confidenceScore > 0 ? '(Empirical Verification)' : '(No Supported Manifests Detected)'}
            </span>
          )}
        </div>

        {techStack ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              
              {/* Languages (Botticelli border) */}
              <div className="glass-panel p-5 rounded-2xl border border-botticelli/30 space-y-3">
                <h3 className="text-xs font-heading font-semibold text-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Languages</span>
                  <span className="text-botticelli font-mono text-[11px]">{(techStack.languages || []).length} detected</span>
                </h3>
                {(techStack.languages || []).length > 0 ? (
                  <div className="space-y-3">
                    {(techStack.languages || []).map((l) => (
                      <div key={l.name} className="p-2.5 rounded-xl bg-black border border-botticelli/20 space-y-1.5">
                        <div className="flex justify-between text-xs text-textPrimary">
                          <span className="font-semibold text-botticelli">{l.name}</span>
                          <span className="font-mono text-lemonChiffon text-[11px]">
                            {Math.round((l.confidence ?? 0.9) * 100)}% Conf
                          </span>
                        </div>
                        <div className="w-full bg-blackHole h-1.5 rounded-full overflow-hidden border border-botticelli/20">
                          <div className="bg-botticelli h-full rounded-full" style={{ width: `${l.percentage}%` }} />
                        </div>
                        <div className="text-[10px] text-textMuted font-mono truncate" title={l.sources?.join(', ') || 'Manifest analysis'}>
                          src: {l.sources && l.sources.length > 0 ? l.sources.slice(0, 2).join(', ') : 'package.json'}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted leading-relaxed">
                    No supported programming languages detected in indexed scope.
                  </p>
                )}
              </div>

              {/* Frameworks (Linen border) */}
              <div className="glass-panel p-5 rounded-2xl border border-sustainableLinen/30 space-y-3">
                <h3 className="text-xs font-heading font-semibold text-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Frameworks</span>
                  <span className="text-sustainableLinen font-mono text-[11px]">{(techStack.frameworks || []).length} found</span>
                </h3>
                {(techStack.frameworks || []).length > 0 ? (
                  <div className="space-y-2">
                    {(techStack.frameworks || []).map((f) => (
                      <div
                        key={f.name}
                        className="p-2.5 rounded-xl bg-black border border-sustainableLinen/20 text-xs flex flex-col space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="font-semibold text-sustainableLinen truncate">{f.name}</span>
                            {f.version && (
                              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-sustainableLinen/15 text-sustainableLinen border border-sustainableLinen/30 shrink-0">
                                v{f.version}
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-[10px] text-lemonChiffon shrink-0">
                            {Math.round((f.confidence ?? 0.95) * 100)}% Conf
                          </span>
                        </div>
                        <span className="text-[10px] text-textMuted">{f.category}</span>
                        <span className="text-[10px] font-mono text-sustainableLinen/70 truncate">
                          src: {f.sources && f.sources.length > 0 ? f.sources[0] : 'package.json'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted">No major web framework detected.</p>
                )}
              </div>

              {/* Tooling & CI (Botticelli border) */}
              <div className="glass-panel p-5 rounded-2xl border border-botticelli/30 space-y-3">
                <h3 className="text-xs font-heading font-semibold text-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Tooling &amp; CI</span>
                  <span className="text-botticelli font-mono text-[11px]">{(techStack.tooling || []).length} found</span>
                </h3>
                {(techStack.tooling || []).length > 0 ? (
                  <div className="space-y-2">
                    {(techStack.tooling || []).map((t) => (
                      <div
                        key={t.name}
                        className="p-2.5 rounded-xl bg-black border border-botticelli/20 text-xs flex flex-col space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-botticelli">{t.name}</span>
                          <span className="font-mono text-[10px] text-lemonChiffon">
                            {Math.round((t.confidence ?? 0.9) * 100)}% Conf
                          </span>
                        </div>
                        <span className="text-[10px] text-textMuted">{t.category}</span>
                        <span className="text-[10px] font-mono text-textMuted truncate">
                          src: {t.sources && t.sources.length > 0 ? t.sources[0] : '.github/workflows/'}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted leading-relaxed">No CI/CD or build tooling detected in repository.</p>
                )}
              </div>

              {/* Manifest Files & Package Managers (Linen border) */}
              <div className="glass-panel p-5 rounded-2xl border border-sustainableLinen/30 space-y-3">
                <h3 className="text-xs font-heading font-semibold text-textMuted uppercase tracking-wider flex items-center justify-between">
                  <span>Manifests &amp; Managers</span>
                  <span className="text-sustainableLinen font-mono text-[11px]">{(techStack.manifests || []).length} files</span>
                </h3>

                {/* Package Managers if detected */}
                {techStack.packageManagers && techStack.packageManagers.length > 0 && (
                  <div className="space-y-1.5 pb-2 border-b border-borderDark/60">
                    <span className="text-[10px] font-mono uppercase text-sustainableLinen font-semibold">
                      Package Manager:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {techStack.packageManagers.map((pm) => (
                        <span
                          key={pm.name}
                          className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-0.5 rounded-full bg-sustainableLinen/15 text-sustainableLinen border border-sustainableLinen/30"
                          title={pm.lockfile ? `Lockfile: ${pm.lockfile}` : 'Inferred from manifest'}
                        >
                          <strong className="font-bold uppercase">{pm.name}</strong>
                          {pm.version && <span>v{pm.version}</span>}
                          <span className="text-[9px] opacity-75">({pm.status})</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(techStack.manifests || []).length > 0 ? (
                  <div className="space-y-2">
                    {(techStack.manifests || []).map((m) => (
                      <div key={m.path} className="p-2.5 rounded-xl bg-black border border-sustainableLinen/20 text-xs">
                        <div className="font-mono text-lemonChiffon truncate">{m.path}</div>
                        <div className="text-[11px] text-textMuted mt-0.5 flex items-center justify-between">
                          <span>Type: <strong className="text-textPrimary uppercase">{m.type}</strong></span>
                          <span className="font-mono text-[10px] text-sustainableLinen">
                            {m.dependenciesCount} deps
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-textMuted">No standard package manifests found.</p>
                )}
              </div>

            </div>

            {/* Direct Dependencies preview strip with Linen & Botticelli borders */}
            {techStack.dependencies && techStack.dependencies.length > 0 && (
              <div className="glass-panel p-4 rounded-2xl border border-sustainableLinen/20 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-heading font-semibold text-textMuted uppercase tracking-wider">
                    Direct Dependencies ({techStack.dependencies.length} declared)
                  </span>
                  <span className="text-[10px] font-mono text-sustainableLinen">
                    Verified Package Manifests
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {techStack.dependencies.slice(0, 24).map((d, i) => (
                    <span
                      key={`${d.name}-${i}`}
                      className="px-2.5 py-1 rounded-md bg-black border border-botticelli/30 text-[11px] font-mono text-textPrimary flex items-center gap-1.5"
                      title={`Source: ${d.sourceFile} (${d.type})`}
                    >
                      <span className="font-semibold text-botticelli">{d.name}</span>
                      {d.version && <span className="text-[10px] text-textMuted">@{d.version}</span>}
                      {d.type === 'dev' && <span className="text-[9px] text-sustainableLinen/70 font-mono">(dev)</span>}
                    </span>
                  ))}
                  {techStack.dependencies.length > 24 && (
                    <span className="px-2.5 py-1 rounded-md bg-black border border-sustainableLinen/30 text-[10px] font-mono text-textMuted flex items-center">
                      +{techStack.dependencies.length - 24} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="glass-panel p-6 rounded-2xl border border-borderDark text-xs text-textMuted text-center">
            Run a repository scan to automatically detect languages, frameworks, and tooling.
          </div>
        )}
      </section>

      {/* Part 2: Top Contribution Recommendation */}
      {topRoute && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-lemonChiffon" />
              <h2 className="text-xs font-heading font-bold text-lemonChiffon uppercase tracking-wider">
                Top Contribution Recommendation
              </h2>
            </div>
            <span className="text-[11px] font-mono text-textMuted">
              Optimal First Contributor Track
            </span>
          </div>

          <div className="glass-panel p-5 sm:p-8 rounded-2xl border border-lemonChiffon/40 bg-gradient-to-br from-coffeeBean/40 to-black space-y-6 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="px-3 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-lemonChiffon text-black">
                    {topRoute.difficulty} track
                  </span>
                  <span className="text-xs font-medium text-textMuted flex items-center gap-1 font-mono">
                    <Clock className="w-3.5 h-3.5 text-botticelli" />
                    Est. {topRoute.estimatedEffort || `${topRoute.estimatedMinutes || 30} mins`}
                  </span>
                  <span className="text-xs font-mono text-lemonChiffon font-semibold">
                    Task Readiness: {topRoute.contributionReadiness?.total ?? topRoute.readiness?.total ?? topRoute.readinessScore ?? 85}/100
                  </span>
                  {(topRoute.contributionReadiness?.label || topRoute.readinessLabel) && (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase bg-emerald-950/70 text-emerald-300 border border-emerald-500/40">
                      {(topRoute.contributionReadiness?.label || topRoute.readinessLabel)?.replace(/-/g, ' ')}
                    </span>
                  )}
                  {topRoute.urgencyLabel && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-rosewood/30 text-red-200 border border-rosewood/60">
                      Urg: {topRoute.urgencyLabel}
                    </span>
                  )}
                </div>
                <h3 className="text-xl sm:text-2xl font-heading font-bold text-textPrimary leading-snug">
                  {topRoute.title}
                </h3>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/contributions/${topRoute.id}`}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-blackHole hover:bg-black text-textPrimary text-xs font-semibold border border-borderDark flex items-center justify-center gap-1.5 transition-colors press-spring touch-manipulation"
                >
                  <span>Route Blueprint</span>
                  <ExternalLink className="w-3.5 h-3.5 text-botticelli" />
                </Link>

                <button
                  onClick={() => handleDownloadPack(topRoute.id)}
                  disabled={downloadingPackId === topRoute.id || isRouteDisclosureBlocked(topRoute)}
                  className="min-h-[44px] px-4 py-2 rounded-full bg-blackHole hover:bg-black text-lemonChiffon text-xs font-semibold border border-lemonChiffon/30 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 press-spring touch-manipulation"
                  title="Download self-contained Contribution Pack (.md)"
                >
                  {downloadingPackId === topRoute.id ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5" />
                  )}
                  <span>Export Pack</span>
                </button>

                {isRouteDisclosureBlocked(topRoute) ? (
                  <div className="min-h-[44px] px-4 py-2 rounded-full bg-rosewood/30 text-sustainableLinen text-xs font-semibold flex items-center justify-center gap-1.5 border border-rosewood">
                    <Lock className="w-3.5 h-3.5 text-lemonChiffon" />
                    <span>Private Disclosure Required</span>
                  </div>
                ) : (
                  <button
                    onClick={() => handleGenerateDraft(topRoute.id)}
                    disabled={generatingDraftId === topRoute.id}
                    className="min-h-[44px] px-5 py-2 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-md hover:shadow-lemonChiffon/20 disabled:opacity-50 press-spring touch-manipulation"
                  >
                    {generatingDraftId === topRoute.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Generating...</span>
                      </>
                    ) : (
                      <>
                        <FileText className="w-3.5 h-3.5" />
                        <span>Generate Issue Draft</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Beginner 6-Question Framework Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-2 text-xs">
              
              {/* 1. What is wrong? */}
              <div className="p-4 rounded-xl bg-black border border-electricTangerine/30 space-y-1.5">
                <span className="font-bold text-electricTangerine uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> 1. What is wrong?
                </span>
                <p className="text-textMuted leading-relaxed">
                  {topRoute.summary || 'Security or repository health gap detected by deterministic scanner.'}
                </p>
              </div>

              {/* 2. Where is it? */}
              <div className="p-4 rounded-xl bg-black border border-botticelli/30 space-y-1.5">
                <span className="font-bold text-botticelli uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5" /> 2. Where is it?
                </span>
                <div className="font-mono text-sustainableLinen truncate">
                  {topRoute.files.join(', ') || 'Repository Root'}
                </div>
                {activeFinding && (
                  <span className="text-[10px] text-textMuted block font-mono">
                    Rule: {activeFinding.ruleId}
                  </span>
                )}
              </div>

              {/* 3. What skill is needed? */}
              <div className="p-4 rounded-xl bg-black border border-lemonChiffon/30 space-y-1.5">
                <span className="font-bold text-lemonChiffon uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Wrench className="w-3.5 h-3.5" /> 3. What skill is needed?
                </span>
                <div className="flex flex-wrap gap-1">
                  {topRoute.skills.map((s, i) => (
                    <span key={i} className="px-2 py-0.5 rounded bg-blackHole text-lemonChiffon text-[10px] font-mono border border-borderDark">
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              {/* 4. What should I change? */}
              <div className="p-4 rounded-xl bg-black border border-sustainableLinen/30 space-y-1.5">
                <span className="font-bold text-sustainableLinen uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Code2 className="w-3.5 h-3.5" /> 4. What should I change?
                </span>
                <p className="text-sustainableLinen/90 leading-relaxed">
                  {topRoute.suggestedChange || 'Update configuration to follow secure repository guidelines.'}
                </p>
              </div>

              {/* 5. How do I test it? */}
              <div className="p-4 rounded-xl bg-black border border-borderDark space-y-1.5">
                <span className="font-bold text-lemonChiffon uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Terminal className="w-3.5 h-3.5" /> 5. How do I test it?
                </span>
                <p className="text-textMuted leading-relaxed">
                  {topRoute.testPlan[0] || 'Run local verification linter or test suite.'}
                </p>
              </div>

              {/* 6. When is it complete? */}
              <div className="p-4 rounded-xl bg-black border border-emerald-500/30 space-y-1.5">
                <span className="font-bold text-emerald-400 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> 6. When is it complete?
                </span>
                <p className="text-textMuted leading-relaxed">
                  {topRoute.acceptanceCriteria[0] || 'CI passes and configuration changes are tested.'}
                </p>
              </div>

            </div>
          </div>
        </section>
      )}

      {/* Part 3: Contribution Impact Graph (P9 Task 1: Linen/Cotton/Botticelli nodes with staggered reveal 60ms) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-electricTangerine" />
            <h2 className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider">
              Contribution Impact Graph
            </h2>
          </div>
          <span className="text-[11px] font-mono text-textMuted">
            Interactive Flow: Finding → Location → Skills → Task → Test → Draft
          </span>
        </div>

        <div className="glass-panel p-4 sm:p-6 rounded-2xl border border-borderDark max-w-full overflow-x-auto scrollbar-thin scrollbar-thumb-borderDark">
          <div className="min-w-[900px] flex items-stretch justify-between gap-2.5 text-xs">
            
            {/* Stage 1: Finding (Botticelli node, Delay: 0ms) */}
            <div
              className="flex-1 min-w-[135px] p-3.5 rounded-xl bg-black border border-botticelli/40 flex flex-col justify-between space-y-2 transition-all duration-300 hover:border-botticelli motion-reduce:transition-none"
              style={{ animationDelay: '0ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-botticelli shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-botticelli uppercase">
                    1. Finding
                  </span>
                </div>
                <div className="text-xs font-semibold text-textPrimary leading-snug line-clamp-2" title={activeFinding?.title || activeRoute?.title}>
                  {activeFinding?.title || activeRoute?.title.replace('Fix: ', '') || 'Static Finding'}
                </div>
              </div>
              <span className="text-[10px] font-mono text-botticelli/80 block truncate">
                {activeFinding?.ruleId || 'DETERMINISTIC'}
              </span>
            </div>

            <div className="flex items-center text-borderDark font-bold text-sm shrink-0 px-0.5">→</div>

            {/* Stage 2: Location (Linen node, Delay: 60ms) */}
            <div
              className="flex-1 min-w-[135px] p-3.5 rounded-xl bg-black border border-sustainableLinen/40 flex flex-col justify-between space-y-2 transition-all duration-300 hover:border-sustainableLinen motion-reduce:transition-none"
              style={{ animationDelay: '60ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-sustainableLinen shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-sustainableLinen uppercase">
                    2. Location
                  </span>
                </div>
                <div className="text-xs font-mono text-sustainableLinen leading-snug break-all" title={activeRoute?.files[0] || 'Repository Root'}>
                  {activeRoute?.files[0] || 'Repository Root'}
                </div>
              </div>
              <span className="text-[10px] font-mono text-sustainableLinen/80 block">
                {activeFinding?.lineStart ? `Line ${activeFinding.lineStart}` : 'Repository Scope'}
              </span>
            </div>

            <div className="flex items-center text-borderDark font-bold text-sm shrink-0 px-0.5">→</div>

            {/* Stage 3: Skills Needed (Cotton node, Delay: 120ms) */}
            <div
              className="flex-1 min-w-[135px] p-3.5 rounded-xl bg-black border border-recycledCotton/40 flex flex-col justify-between space-y-2 transition-all duration-300 hover:border-recycledCotton motion-reduce:transition-none"
              style={{ animationDelay: '120ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-recycledCotton shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-recycledCotton uppercase">
                    3. Skills Needed
                  </span>
                </div>
                <div className="text-xs font-semibold text-textPrimary leading-snug break-words" title={activeRoute?.skills.join(', ')}>
                  {activeRoute?.skills.slice(0, 3).join(', ') || 'Git, Code Review'}
                </div>
              </div>
              <span className="text-[10px] font-mono text-recycledCotton capitalize block">
                {activeRoute?.difficulty || 'beginner'} track
              </span>
            </div>

            <div className="flex items-center text-borderDark font-bold text-sm shrink-0 px-0.5">→</div>

            {/* Stage 4: Task (Botticelli node, Delay: 180ms) */}
            <div
              className="flex-1 min-w-[145px] p-3.5 rounded-xl bg-black border border-botticelli/40 flex flex-col justify-between space-y-2 transition-all duration-300 hover:border-botticelli motion-reduce:transition-none"
              style={{ animationDelay: '180ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-botticelli shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-botticelli uppercase">
                    4. Task
                  </span>
                </div>
                <div className="text-xs font-semibold text-botticelli/90 line-clamp-3 leading-snug" title={activeRoute?.suggestedChange}>
                  {activeRoute?.suggestedChange || 'Update configuration per guidance'}
                </div>
              </div>
              <span className="text-[10px] font-mono text-textMuted block">
                Est. {activeRoute?.estimatedEffort || '30 mins'}
              </span>
            </div>

            <div className="flex items-center text-borderDark font-bold text-sm shrink-0 px-0.5">→</div>

            {/* Stage 5: Test Plan (Linen node, Delay: 240ms) */}
            <div
              className="flex-1 min-w-[140px] p-3.5 rounded-xl bg-black border border-sustainableLinen/40 flex flex-col justify-between space-y-2 transition-all duration-300 hover:border-sustainableLinen motion-reduce:transition-none"
              style={{ animationDelay: '240ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className="w-2.5 h-2.5 rounded-full bg-sustainableLinen shrink-0" />
                  <span className="text-[10px] font-mono font-bold text-sustainableLinen uppercase">
                    5. Test Plan
                  </span>
                </div>
                <div className="text-xs font-semibold text-textPrimary line-clamp-3 leading-snug" title={activeRoute?.testPlan[0]}>
                  {activeRoute?.testPlan[0] || 'Verify change locally'}
                </div>
              </div>
              <span className="text-[10px] font-mono text-sustainableLinen/80 block">
                {activeRoute?.testPlan.length || 1} verify step(s)
              </span>
            </div>

            <div className="flex items-center text-borderDark font-bold text-sm shrink-0 px-0.5">→</div>

            {/* Stage 6: Issue Draft (Cotton/Linen node, Delay: 300ms) */}
            <div
              className={`flex-1 min-w-[140px] p-3.5 rounded-xl border flex flex-col justify-between space-y-2 transition-all duration-300 motion-reduce:transition-none ${
                activeRoute?.draftId
                  ? 'bg-sustainableLinen text-black border-sustainableLinen shadow-md'
                  : 'bg-black text-textPrimary border-recycledCotton/40 hover:border-recycledCotton'
              }`}
              style={{ animationDelay: '300ms' }}
            >
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${activeRoute?.draftId ? 'bg-black' : 'bg-recycledCotton'}`} />
                  <span className={`text-[10px] font-mono font-bold uppercase ${activeRoute?.draftId ? 'text-black' : 'text-recycledCotton'}`}>
                    6. Issue Draft
                  </span>
                </div>
                <div className="text-xs font-bold leading-snug">
                  {activeRoute?.draftId ? 'Draft Persisted' : 'Draft Not Generated'}
                </div>
              </div>
              <span className={`text-[10px] font-mono font-semibold block ${activeRoute?.draftId ? 'text-black/80' : 'text-textMuted'}`}>
                {activeRoute?.draftId ? 'Saved & Reviewable' : 'Ready to Generate'}
              </span>
            </div>

          </div>
        </div>
      </section>

      {/* Part 4: All Available Routes & Actionable Plans */}
      <section className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-electricTangerine" />
            <h2 className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider">
              Available Contribution Routes ({filteredRoutes.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2 max-w-full">
            {/* Filter by Difficulty */}
            <div className="flex items-center gap-1 bg-black p-1 rounded-full border border-borderDark text-xs overflow-x-auto no-scrollbar max-w-full">
              <span className="text-[10px] font-mono text-textMuted px-2">Track:</span>
              {['all', 'beginner', 'intermediate', 'advanced'].map((d) => (
                <button
                  key={d}
                  onClick={() => setDifficultyFilter(d)}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[11px] font-mono capitalize transition-colors flex items-center justify-center shrink-0 press-spring touch-manipulation ${
                    difficultyFilter === d
                      ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            {/* Filter by Status */}
            <div className="flex items-center gap-1 bg-black p-1 rounded-full border border-borderDark text-xs overflow-x-auto no-scrollbar max-w-full">
              <span className="text-[10px] font-mono text-textMuted px-2">Status:</span>
              {['all', 'not-started', 'in-progress', 'needs-review', 'completed'].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[11px] font-mono capitalize transition-colors flex items-center justify-center shrink-0 press-spring touch-manipulation ${
                    statusFilter === st
                      ? 'bg-coffeeBean text-lemonChiffon font-semibold border border-lemonChiffon/30'
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  {st.replace('-', ' ')}
                </button>
              ))}
            </div>

            {findings.length > routes.length && (
              <button
                onClick={handleAutoGenerateRoutes}
                disabled={generatingAllRoutes}
                className="min-h-[44px] px-4 py-2 rounded-full bg-coffeeBean hover:bg-coffeeBean/80 text-lemonChiffon border border-lemonChiffon/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 press-spring touch-manipulation"
              >
                {generatingAllRoutes ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5 text-electricTangerine" />
                )}
                <span>+ Build routes from findings</span>
              </button>
            )}

            <LastUpdatedBadge
              timestamp={activeScan?.scannedAt}
              onRefresh={fetchData}
              refreshing={loading}
              prefix="Updated"
            />
          </div>
        </div>

        {loading ? (
          showDelayedSkeleton ? (
            <ContributionsStackSkeleton />
          ) : null
        ) : filteredRoutes.length > 0 ? (
          <div className="space-y-6">
            {filteredRoutes.map((route) => {
              const isSelected = selectedRouteId === route.id;
              const isCompleted = route.status === 'completed';
              const isInProgress = route.status === 'in-progress';
              const isNeedsReview = route.status === 'needs-review';
              const isBlocked = isRouteDisclosureBlocked(route);

              return (
                <div
                  key={route.id}
                  onClick={() => setSelectedRouteId(route.id)}
                  className={`glass-panel p-6 sm:p-8 rounded-2xl border transition-all space-y-6 cursor-pointer ${
                    isSelected
                      ? 'border-lemonChiffon/70 ring-1 ring-lemonChiffon/30 shadow-xl'
                      : 'border-borderDark hover:border-borderDark/80'
                  }`}
                >
                  
                  {/* Route Header */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-3 py-0.5 rounded-full border uppercase ${
                            route.difficulty === 'beginner'
                              ? 'bg-black text-lemonChiffon border-lemonChiffon/40'
                              : route.difficulty === 'intermediate'
                              ? 'bg-black text-electricTangerine border-electricTangerine/40'
                              : 'bg-black/60 text-red-300 border-rosewood/60'
                          }`}
                        >
                          {route.difficulty} track
                        </span>

                        <span
                          className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                            route.generatedBy === 'gemini'
                              ? 'bg-black text-lemonChiffon border-lemonChiffon/30'
                              : 'bg-coffeeBean text-lemonChiffon border-electricTangerine/40'
                          }`}
                        >
                          {route.generatedBy === 'gemini' ? 'Gemma 4 Grounded' : 'Fallback Used: Deterministic'}
                        </span>

                        <span className="text-xs font-medium text-textMuted flex items-center gap-1 font-mono">
                          <Clock className="w-3.5 h-3.5 text-botticelli" />
                          Est. Effort: <strong className="text-textPrimary">{route.estimatedEffort || '30 mins'}</strong>
                        </span>

                        <span className="text-xs font-mono text-lemonChiffon font-semibold">
                          Task Readiness: {route.contributionReadiness?.total ?? route.readiness?.total ?? route.readinessScore ?? 80}/100
                        </span>

                        {(route.contributionReadiness?.label || route.readinessLabel) && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 uppercase">
                            {(route.contributionReadiness?.label || route.readinessLabel)?.replace(/-/g, ' ')}
                          </span>
                        )}

                        {route.urgencyLabel && (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rosewood/30 text-red-200 border border-rosewood/60 uppercase">
                            Urg: {route.urgencyLabel}
                          </span>
                        )}
                      </div>

                      <h3 className="text-lg sm:text-xl font-heading font-bold text-textPrimary">{route.title}</h3>
                      <p className="text-xs text-textMuted leading-relaxed max-w-3xl">
                        {route.summary}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <Link
                        href={`/app/contributions/${route.id}`}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full bg-black hover:bg-blackHole text-textMuted hover:text-lemonChiffon border border-borderDark transition-colors press-spring touch-manipulation"
                        title="Open Dedicated Route Blueprint"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownloadPack(route.id);
                        }}
                        disabled={downloadingPackId === route.id || isBlocked}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full bg-black hover:bg-blackHole text-textMuted hover:text-lemonChiffon border border-borderDark transition-colors disabled:opacity-50 press-spring touch-manipulation"
                        title={isBlocked ? 'Export blocked for sensitive finding' : 'Download self-contained Contribution Pack (.md)'}
                      >
                        {downloadingPackId === route.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-lemonChiffon" />
                        ) : (
                          <Download className="w-4 h-4" />
                        )}
                      </button>

                      {isBlocked ? (
                        <div className="px-4 py-2 rounded-full bg-rosewood/30 text-sustainableLinen text-xs font-semibold flex items-center gap-1.5 border border-rosewood">
                          <Lock className="w-3.5 h-3.5 text-lemonChiffon" />
                          <span>Private Disclosure Required</span>
                        </div>
                      ) : route.draftId ? (
                        <div className="flex items-center gap-1.5">
                          <Link
                            href={`/app/issue-drafts?draftId=${route.draftId}`}
                            className="min-h-[44px] px-5 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lemonChiffon/20 press-spring touch-manipulation"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>View Saved Draft</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateDraft(route.id);
                            }}
                            disabled={generatingDraftId === route.id}
                            className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2.5 rounded-full bg-black hover:bg-blackHole text-textMuted hover:text-lemonChiffon border border-borderDark transition-colors text-xs press-spring touch-manipulation"
                            title="Regenerate maintainer draft"
                          >
                            {generatingDraftId === route.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-lemonChiffon" />
                            ) : (
                              <RotateCw className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleGenerateDraft(route.id);
                          }}
                          disabled={generatingDraftId === route.id}
                          className="min-h-[44px] px-5 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lemonChiffon/20 disabled:opacity-50 press-spring touch-manipulation"
                        >
                          {generatingDraftId === route.id ? (
                            <>
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <FileText className="w-3.5 h-3.5" />
                              <span>Generate Maintainer Draft</span>
                              <ArrowRight className="w-3.5 h-3.5" />
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Beginner Guidance 4-Box Overview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs pt-1">
                    <div className="p-3 rounded-xl bg-black border border-borderDark">
                      <span className="text-textMuted text-[10px] uppercase font-bold block mb-1">
                        {route.files[0]?.includes('Repository Root') ? 'Target Area' : 'Target File'}
                      </span>
                      <code className="text-lemonChiffon font-mono text-[11px] block break-all" title={route.files[0] || 'Repository Root'}>
                        {route.files[0] || 'Repository Root'}
                      </code>
                    </div>

                    <div className="p-3 rounded-xl bg-black border border-borderDark">
                      <span className="text-textMuted text-[10px] uppercase font-bold block mb-1">Required Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {route.skills.map((skill, sIdx) => (
                          <span
                            key={sIdx}
                            className="px-2 py-0.5 rounded bg-blackHole text-sustainableLinen border border-borderDark text-[10px] font-semibold"
                          >
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="p-3 rounded-xl bg-black border border-borderDark sm:col-span-2">
                      <span className="text-textMuted text-[10px] uppercase font-bold block mb-1">Suggested Change</span>
                      <p className="text-textPrimary text-[11px] leading-relaxed break-words" title={route.suggestedChange}>
                        {route.suggestedChange || 'Apply fix per repository best practices.'}
                      </p>
                    </div>
                  </div>

                  {/* Deterministic Readiness Score Breakdown (All 5 Sub-Scores) */}
                  {route.readiness && (
                    <div className="p-3.5 rounded-xl bg-black/60 border border-borderDark/80 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                      <span className="text-textMuted font-medium">Deterministic Readiness Breakdown (0–100):</span>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-sustainableLinen">Doc Clarity: +{route.readiness.documentationClarity ?? 20}</span>
                        <span className="text-borderDark">•</span>
                        <span className="text-lemonChiffon">Test Avail: +{route.readiness.testAvailability ?? 20}</span>
                        <span className="text-borderDark">•</span>
                        <span className="text-botticelli">CI Auto: +{route.readiness.ciAutomation ?? 20}</span>
                        <span className="text-borderDark">•</span>
                        <span className="text-sustainableLinen">Dep Freshness: +{route.readiness.dependencyFreshness ?? 20}</span>
                        <span className="text-borderDark">•</span>
                        <span className="text-cotton">Sec Governance: +{route.readiness.securityGovernance ?? 20}</span>
                        <span className="text-borderDark">•</span>
                        <span className="text-electricTangerine font-bold">Total: {route.readiness.total}/100</span>
                      </div>
                    </div>
                  )}

                  {/* Step-by-Step Test Plan & Acceptance Checklist */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    {/* Test Plan */}
                    <div className="p-4 rounded-xl bg-black border border-borderDark space-y-2.5">
                      <h4 className="font-heading font-semibold text-textPrimary uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5 text-lemonChiffon" />
                        Step-by-Step Verification Plan
                      </h4>
                      <ul className="space-y-1.5 text-textMuted">
                        {route.testPlan.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-lemonChiffon font-mono text-[11px] shrink-0">{idx + 1}.</span>
                            <span className="leading-relaxed text-textPrimary">{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Acceptance Criteria */}
                    <div className="p-4 rounded-xl bg-black border border-borderDark space-y-2.5">
                      <h4 className="font-heading font-semibold text-textPrimary uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-electricTangerine" />
                        Maintainer Acceptance Criteria
                      </h4>
                      <ul className="space-y-1.5 text-textMuted">
                        {route.acceptanceCriteria.map((crit, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-electricTangerine font-mono text-[11px] shrink-0">✓</span>
                            <span className="leading-relaxed text-textPrimary">{crit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Status Toggle & Persistence Bar (P9 Task 2) */}
                  <div className="pt-3 border-t border-borderDark flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-textMuted">Current Status:</span>
                      <span
                        className={`text-xs font-bold font-mono px-3 py-0.5 rounded-full capitalize ${
                          isCompleted
                            ? 'bg-lemonChiffon text-black'
                            : isInProgress
                            ? 'bg-electricTangerine text-black'
                            : isNeedsReview
                            ? 'bg-botticelli text-black'
                            : 'bg-coffeeBean text-lemonChiffon'
                        }`}
                      >
                        {(route.status || 'not-started').replace('-', ' ')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 bg-blackHole p-1 rounded-full border border-borderDark">
                      <span className="text-[10px] text-textMuted font-mono px-2">Update:</span>
                      {(['not-started', 'in-progress', 'needs-review', 'completed'] as const).map((st) => (
                        <button
                          key={st}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUpdateStatus(route.id, st);
                          }}
                          disabled={updatingRouteId === route.id}
                          className={`px-2.5 py-1 text-[10px] font-mono rounded-full capitalize transition-all ${
                            (route.status || 'not-started') === st
                              ? st === 'completed'
                                ? 'bg-lemonChiffon text-black font-bold'
                                : st === 'in-progress'
                                ? 'bg-electricTangerine text-black font-bold'
                                : st === 'needs-review'
                                ? 'bg-botticelli text-black font-bold'
                                : 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30'
                              : 'text-textMuted hover:text-textPrimary'
                          }`}
                        >
                          {st.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        ) : errorType ? (
          <ErrorState
            type={errorType}
            title={
              errorType === 'session_expired'
                ? 'Session Expired'
                : errorType === 'forbidden'
                ? 'Access Denied'
                : errorType === 'not_found'
                ? 'Routes Not Found'
                : errorType === 'network_offline'
                ? 'Connection Lost'
                : 'Unable to Load Contribution Routes'
            }
            message={fetchError || 'An error occurred while loading contribution routes.'}
            onRetry={fetchData}
            retrying={loading}
            secondaryAction={
              errorType === 'forbidden' || errorType === 'not_found'
                ? { label: 'Return to Dashboard', href: '/app/dashboard' }
                : undefined
            }
          />
        ) : (
          /* Empty State (P9 Task 6: "Routes are created from findings and health gaps.") */
          <EmptyState
            icon={Compass}
            title="Routes are created from findings and health gaps."
            description="Contribution routes are actionable fix blueprints constructed from verified security findings and repository health gaps. Open any verified finding to generate a beginner PR plan."
            action={{
              label: 'Browse Verified Findings →',
              href: activeFinding ? `/app/findings?findingId=${activeFinding.id}` : '/app/findings',
            }}
            secondaryHint={
              findings.length > 0 ? (
                <button
                  type="button"
                  onClick={handleAutoGenerateRoutes}
                  disabled={generatingAllRoutes}
                  className="px-4 py-2 rounded-full bg-coffeeBean hover:bg-coffeeBean/80 text-lemonChiffon border border-lemonChiffon/30 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 press-spring"
                >
                  {generatingAllRoutes ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="w-3.5 h-3.5 text-electricTangerine" />
                  )}
                  <span>Generate Routes from Findings ({findings.length})</span>
                </button>
              ) : undefined
            }
          />
        )}
      </section>

    </div>
  );
}

export default function ContributionsView() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex items-center justify-center p-16 bg-black">
          <div className="w-8 h-8 border-2 border-lemonChiffon border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <ContributionsContent />
    </Suspense>
  );
}
