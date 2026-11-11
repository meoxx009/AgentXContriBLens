'use client';

import React, { use, useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Compass,
  ArrowLeft,
  Clock,
  Terminal,
  CheckCircle2,
  FileText,
  Shield,
  ArrowRight,
  Loader2,
  AlertTriangle,
  Lock,
  Download,
  CheckSquare,
  Square,
  Sparkles,
  BookOpen,
  Layers,
  Wrench,
  HelpCircle,
  Code2,
  FileCode,
  AlertCircle,
  RotateCw,
  ExternalLink,
  ShieldAlert,
  Check,
} from 'lucide-react';
import type { ContributionRoute, Finding, SkillGapItem, ExplanationMode, LearningResource } from '@/types';
import { EngineBadge } from '@/components/ui/EngineBadge';
import { SkillsGapPanel } from '@/components/ui/SkillsGapPanel';
import { RouteDetailsSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';

const ROUTE_STEPS = [
  { id: 'not-started', label: 'Not Started', step: 1, desc: 'Triage & plan inspected' },
  { id: 'in-progress', label: 'In Progress', step: 2, desc: 'Local code changes active' },
  { id: 'needs-review', label: 'Needs Review', step: 3, desc: 'Testing & draft ready' },
  { id: 'completed', label: 'Completed', step: 4, desc: 'PR submitted or verified' },
] as const;

export default function RouteDetailPage({
  params,
}: {
  params?: Promise<{ routeId: string }> | { routeId: string };
} = {}) {
  const routerParams = useParams();
  const unwrappedParams = params
    ? typeof (params as any).then === 'function'
      ? use(params as Promise<{ routeId: string }>)
      : (params as { routeId: string })
    : null;
  const routeId =
    unwrappedParams?.routeId || (routerParams?.routeId as string) || '';

  const router = useRouter();
  const { showToast } = useApp();

  const [route, setRoute] = useState<ContributionRoute | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const showDelayedSkeleton = useDelayedLoading(loading, 150);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState(false);
  const [downloadingPack, setDownloadingPack] = useState(false);
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>('beginner');

  // Optimistic UI states and inline error rollbacks
  const [statusError, setStatusError] = useState<{
    status: string;
    message: string;
    retry: () => void;
  } | null>(null);

  const [syncingSkillId, setSyncingSkillId] = useState<string | null>(null);
  const [skillError, setSkillError] = useState<{
    skillId: string;
    message: string;
    retry: () => void;
  } | null>(null);

  const [fetchError, setFetchError] = useState<string | null>(null);
  type RouteDetailsError = 'session_expired' | 'forbidden' | 'server_error' | 'network_offline' | 'not_found' | null;
  const [errorType, setErrorType] = useState<RouteDetailsError>(null);

  const loadRouteDetail = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setErrorType(null);

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setErrorType('network_offline');
      setFetchError('You appear to be offline. Please verify your internet connection.');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(`/api/routes/${routeId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.route) {
          setRoute(data.route);
          if (data.finding) setFinding(data.finding);
          return;
        }
      } else if (res.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        return;
      } else if (res.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view this contribution route.');
        return;
      } else if (res.status === 404) {
        // Fallback to checking the active routes list before marking not found
      }

      // Fallback to list search
      const listRes = await fetch('/api/routes');
      if (listRes.ok) {
        const data = await listRes.json();
        const found = (data.routes || []).find((r: ContributionRoute) => r.id === routeId);
        if (found) {
          setRoute(found);
          const fId = found.findingId || (found.findingIds && found.findingIds[0]);
          if (fId) {
            const fRes = await fetch('/api/findings');
            if (fRes.ok) {
              const fData = await fRes.json();
              const matchedFinding = (fData.findings || []).find((f: Finding) => f.id === fId);
              if (matchedFinding) setFinding(matchedFinding);
            }
          }
          return;
        }
      } else if (listRes.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        return;
      } else if (listRes.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view this contribution route.');
        return;
      }

      setErrorType('not_found');
      setFetchError(`Contribution Route ID "${routeId}" could not be located in this workspace.`);
    } catch (e: any) {
      console.error('Failed to load route detail:', e);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
      } else {
        setErrorType('server_error');
        setFetchError(e?.message || 'Failed to load route details. Please check your network and retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [routeId]);

  useEffect(() => {
    if (routeId) {
      loadRouteDetail();
    }
  }, [routeId, loadRouteDetail]);

  const handleUpdateStatus = async (newStatus: ContributionRoute['status']) => {
    if (!route || updatingStatus) return;
    const previousRoute = { ...route };
    setUpdatingStatus(true);
    setStatusError(null);

    // Optimistic UI update
    setRoute({ ...route, status: newStatus });

    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.route) {
          setRoute(data.route);
        }
        showToast(`Route status updated to "${newStatus.replace('-', ' ')}"`, 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        // Truthful rollback
        setRoute(previousRoute);
        setStatusError({
          status: newStatus,
          message: err.error || 'Failed to update route status. Reverted to previous status.',
          retry: () => handleUpdateStatus(newStatus),
        });
        showToast(err.error || 'Failed to update status', 'error');
      }
    } catch {
      // Truthful rollback
      setRoute(previousRoute);
      setStatusError({
        status: newStatus,
        message: 'Network error updating status. Reverted to previous status.',
        retry: () => handleUpdateStatus(newStatus),
      });
      showToast('Network error updating status; reverted', 'error');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleToggleSkill = async (skillId: string, currentCompleted: boolean) => {
    if (!route) return;
    const previousChecklist = route.learningChecklist || [];
    const previousRoute = { ...route };
    const nextCompleted = !currentCompleted;
    const updatedChecklist = previousChecklist.map((item) =>
      item.id === skillId ? { ...item, completed: nextCompleted } : item
    );

    // Optimistic UI update
    setRoute({ ...route, learningChecklist: updatedChecklist });
    setSyncingSkillId(skillId);
    setSkillError(null);

    try {
      const res = await fetch(`/api/routes/${route.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          skillId,
          completed: nextCompleted,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.route?.learningChecklist) {
          setRoute((prev) => (prev ? { ...prev, learningChecklist: data.route.learningChecklist } : null));
        }
        showToast(nextCompleted ? 'Skill marked complete!' : 'Skill unchecked', 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        // Truthful rollback
        setRoute(previousRoute);
        setSkillError({
          skillId,
          message: err.error || 'Failed to persist skill progress. Reverted checklist.',
          retry: () => handleToggleSkill(skillId, currentCompleted),
        });
        showToast(err.error || 'Failed to save skill progress', 'error');
      }
    } catch {
      // Truthful rollback
      setRoute(previousRoute);
      setSkillError({
        skillId,
        message: 'Network error saving skill progress. Reverted checklist.',
        retry: () => handleToggleSkill(skillId, currentCompleted),
      });
      showToast('Failed to save skill progress; reverted checkbox', 'error');
    } finally {
      setSyncingSkillId(null);
    }
  };

  const handleDownloadPack = async () => {
    if (!route) return;
    setDownloadingPack(true);
    try {
      const res = await fetch(`/api/routes/${route.id}/pack`);
      if (res.ok) {
        const data = await res.json();
        const blob = new Blob([data.markdown], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.filename || `contribution-pack-${route.id}.md`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast('Contribution pack downloaded as .md file!', 'success');
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to download contribution pack', 'error');
      }
    } catch {
      showToast('Error downloading contribution pack', 'error');
    } finally {
      setDownloadingPack(false);
    }
  };

  const handleGenerateDraft = async () => {
    if (!route) return;
    setGeneratingDraft(true);
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: route.id }),
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
      setGeneratingDraft(false);
    }
  };

  if (loading) {
    if (!showDelayedSkeleton) {
      return null;
    }
    return <RouteDetailsSkeleton />;
  }

  if (!route) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 flex items-center justify-center text-textPrimary">
        {errorType && errorType !== 'not_found' ? (
          <ErrorState
            type={errorType}
            title={
              errorType === 'session_expired'
                ? 'Session Expired'
                : errorType === 'forbidden'
                ? 'Access Denied'
                : errorType === 'network_offline'
                ? 'Connection Lost'
                : 'Unable to Load Route'
            }
            message={fetchError || 'Unable to load contribution route details.'}
            onRetry={loadRouteDetail}
            retrying={loading}
            secondaryAction={{ label: 'Back to Contributions', href: '/app/contributions' }}
          />
        ) : (
          <EmptyState
            icon={Compass}
            title="Contribution Route Not Found"
            description={`Contribution Route ID "${routeId}" could not be located in this workspace.`}
            action={{
              label: 'Back to Contributions',
              href: '/app/contributions',
              icon: ArrowLeft,
            }}
          />
        )}
      </div>
    );
  }

  const currentStatus = route.status || 'not-started';
  const learningItems = route.learningChecklist || [];

  // P9 Task 4: DISCLOSURE GUARD (critical): secrets + critical severity
  const isDisclosureBlocked =
    route.category === 'secret' ||
    finding?.category === 'secret' ||
    finding?.disclosureMode === 'security-disclosure' ||
    finding?.disclosureMode === 'DISCLOSURE_BLOCKED' ||
    String(finding?.severity).toUpperCase() === 'CRITICAL';

  // Deterministic 0-100 with ALL FIVE sub-scores per P9 Task 2
  const docClarity = route.readiness?.documentationClarity ?? 20;
  const testAvail = route.readiness?.testAvailability ?? 20;
  const ciAuto = route.readiness?.ciAutomation ?? 20;
  const depFresh = route.readiness?.dependencyFreshness ?? 20;
  const secGov = route.readiness?.securityGovernance ?? 20;
  const totalReadiness = route.readiness?.total ?? route.contributionReadiness?.total ?? 80;

  const currentStepIndex = ROUTE_STEPS.findIndex((s) => s.id === currentStatus);
  const activeStepIdx = currentStepIndex >= 0 ? currentStepIndex : 0;

  const explanationText =
    route.explanationModes?.[explanationMode] ||
    (explanationMode === 'beginner'
      ? route.summary
      : explanationMode === 'developer'
      ? `Deterministic issue in ${route.files.join(', ')}. Follow task: ${route.suggestedChange}`
      : `Maintainer review guidance: Verify test plan and PR acceptance checklist.`);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-8 bg-transparent text-textPrimary overflow-x-hidden">
      {/* Top Navigation */}
      <div className="flex items-center justify-between pb-4 border-b border-borderDark">
        <Link
          href="/app/contributions"
          className="min-h-[44px] inline-flex items-center gap-2 text-xs font-semibold text-textMuted hover:text-lemonChiffon transition-colors font-mono press-spring touch-manipulation"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Contributions + Stack</span>
        </Link>

        <div className="flex items-center gap-2">
          {/* P9 Task 5: Badge always "Maintainer review required" — never "approved" */}
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rosewood/25 border border-rosewood/60 text-[11px] font-mono font-semibold text-red-300">
            <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
            <span>Maintainer review required</span>
          </span>

          <button
            onClick={handleDownloadPack}
            disabled={downloadingPack || isDisclosureBlocked}
            className="min-h-[44px] px-4 py-2 rounded-full bg-blackHole hover:bg-black text-lemonChiffon text-xs font-semibold flex items-center gap-1.5 transition-colors border border-lemonChiffon/30 disabled:opacity-50 press-spring touch-manipulation"
            title={isDisclosureBlocked ? 'Contribution pack blocked for private disclosure' : 'Download full contribution pack as Markdown (.md)'}
          >
            {downloadingPack ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{downloadingPack ? 'Exporting...' : 'Export Pack (.md)'}</span>
          </button>
        </div>
      </div>

      <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-8">
        {/* Route Header */}
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 pb-6 border-b border-borderDark">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30">
                Difficulty: {route.difficulty}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-mono text-botticelli bg-blackHole border border-borderDark flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>Effort: {route.estimatedEffort || `${route.estimatedMinutes || 30} mins`}</span>
              </span>
              {route.urgencyLabel && (
                <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-rosewood/30 text-red-200 border border-rosewood/60">
                  Urgency: {route.urgencyLabel}
                </span>
              )}
              <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-lemonChiffon text-black">
                Task Readiness: {totalReadiness}/100
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-textPrimary tracking-tight">
              {route.title}
            </h1>
          </div>

          {/* Action CTAs with P9 Task 4 Disclosure Guard */}
          <div className="flex flex-wrap items-center gap-3">
            {isDisclosureBlocked ? (
              <div className="min-h-[44px] px-5 py-2.5 rounded-full bg-rosewood/30 border border-rosewood text-sustainableLinen text-xs font-semibold flex items-center gap-2">
                <Lock className="w-4 h-4 text-lemonChiffon" />
                <span>Private Security Disclosure Only (Public Draft Blocked)</span>
              </div>
            ) : route.draftId ? (
              <div className="flex items-center gap-2">
                <Link
                  href={`/app/issue-drafts?draftId=${route.draftId}`}
                  className="min-h-[44px] px-6 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center gap-2 transition-all shadow-md shrink-0 press-spring touch-manipulation"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Saved Draft</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={handleGenerateDraft}
                  disabled={generatingDraft}
                  className="min-h-[44px] px-4 py-2.5 rounded-full bg-black hover:bg-blackHole text-textMuted hover:text-lemonChiffon border border-borderDark transition-colors text-xs font-semibold flex items-center gap-1.5 shrink-0 press-spring touch-manipulation"
                  title="Regenerate maintainer draft"
                >
                  {generatingDraft ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-lemonChiffon" />
                  ) : (
                    <>
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <button
                onClick={handleGenerateDraft}
                disabled={generatingDraft}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center gap-2 transition-all shadow-md shrink-0 disabled:opacity-50 press-spring touch-manipulation"
              >
                {generatingDraft ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Generating Draft...</span>
                  </>
                ) : (
                  <>
                    <FileText className="w-4 h-4" />
                    <span>Generate Maintainer Draft</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* P9 Task 2: Status Stepper not-started → in-progress → needs-review → completed (PERSISTED) */}
        <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-electricTangerine" />
                <span>Contribution Status Stepper</span>
                {updatingStatus && (
                  <span className="inline-flex items-center gap-1 text-[10px] text-textMuted font-mono lowercase">
                    <Loader2 className="w-3 h-3 animate-spin text-lemonChiffon" />
                    <span>syncing...</span>
                  </span>
                )}
              </span>
              <span className="text-[11px] text-textMuted font-mono">
                Changes persist automatically and sync with Dashboard metrics
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-textMuted">Active State:</span>
              <span
                className={`text-xs font-bold font-mono px-3 py-0.5 rounded-full capitalize ${
                  currentStatus === 'completed'
                    ? 'bg-lemonChiffon text-black'
                    : currentStatus === 'in-progress'
                    ? 'bg-electricTangerine text-black'
                    : currentStatus === 'needs-review'
                    ? 'bg-botticelli text-black'
                    : 'bg-coffeeBean text-lemonChiffon'
                }`}
              >
                {currentStatus.replace('-', ' ')}
              </span>
            </div>
          </div>

          {/* Inline Error on Status Update Failure with Honest Rollback & Retry */}
          {statusError && (
            <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                <span>{statusError.message}</span>
              </div>
              <button
                type="button"
                onClick={statusError.retry}
                className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring"
              >
                Retry
              </button>
            </div>
          )}

          {/* Stepper Graphic */}
          <div className={`grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 transition-opacity duration-200 ${updatingStatus ? 'opacity-80' : 'opacity-100'}`}>
            {ROUTE_STEPS.map((step, idx) => {
              const isPassed = idx < activeStepIdx;
              const isCurrent = idx === activeStepIdx;

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleUpdateStatus(step.id)}
                  disabled={updatingStatus}
                  className={`min-h-[44px] p-3.5 rounded-xl text-left border transition-all cursor-pointer relative press-spring touch-manipulation ${
                    isCurrent
                      ? 'bg-coffeeBean/70 border-lemonChiffon shadow-md'
                      : isPassed
                      ? 'bg-blackHole border-botticelli/40 text-botticelli'
                      : 'bg-black border-borderDark text-textMuted hover:border-borderDark/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`w-6 h-6 rounded-full font-mono text-xs font-bold flex items-center justify-center ${
                        isCurrent
                          ? 'bg-lemonChiffon text-black'
                          : isPassed
                          ? 'bg-botticelli text-black'
                          : 'bg-black border border-borderDark text-textMuted'
                      }`}
                    >
                      {isPassed ? '✓' : step.step}
                    </span>
                    <span className="text-[10px] font-mono text-textMuted uppercase">
                      {isCurrent ? 'Active' : isPassed ? 'Done' : 'Next'}
                    </span>
                  </div>
                  <div className="text-xs font-bold text-textPrimary">{step.label}</div>
                  <div className="text-[11px] text-textMuted leading-tight mt-0.5">{step.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Explanation Mode Switcher */}
        <div className="p-5 rounded-xl bg-black border border-borderDark space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-lemonChiffon uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-electricTangerine" />
              <span>Grounded Explanation Depth</span>
            </span>

            {/* Mode Switcher Buttons */}
            <div className="flex items-center gap-1 bg-blackHole p-1 rounded-full border border-borderDark text-xs">
              {(['beginner', 'developer', 'maintainer'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setExplanationMode(mode)}
                  className={`min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-full font-medium capitalize transition-colors press-spring touch-manipulation flex items-center justify-center ${
                    explanationMode === mode
                      ? 'bg-coffeeBean text-lemonChiffon font-bold border border-lemonChiffon/30'
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {explanationMode === 'beginner' && (route.whatHappened || route.whyItMatters || route.howToFix) ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
              <div className="p-3.5 rounded-lg bg-blackHole border border-botticelli/30 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase text-botticelli block">
                  What happened
                </span>
                <p className="text-xs text-textPrimary leading-relaxed">
                  {route.whatHappened || route.summary}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-blackHole border border-electricTangerine/30 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase text-electricTangerine block">
                  Why it matters
                </span>
                <p className="text-xs text-textPrimary leading-relaxed">
                  {route.whyItMatters || finding?.impact || 'Technical hygiene gap.'}
                </p>
              </div>

              <div className="p-3.5 rounded-lg bg-blackHole border border-lemonChiffon/30 space-y-1">
                <span className="text-[10px] font-mono font-bold uppercase text-lemonChiffon block">
                  How to fix
                </span>
                <p className="text-xs text-textPrimary leading-relaxed">
                  {route.howToFix || route.suggestedChange}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-xs sm:text-sm text-textPrimary leading-relaxed p-3.5 rounded-lg bg-blackHole border border-borderDark/60 font-sans">
              {explanationText}
            </p>
          )}

          <EngineBadge
            engine={route.generatedBy || 'deterministic'}
            fallback={route.fallback ?? (route.generatedBy === 'deterministic' || !route.generatedBy)}
            fallbackReason={route.fallbackReason || 'Deterministic explanation — AI unavailable'}
          />
        </div>

        {/* P9 Task 2: Contribution Readiness Breakdown with all 5 Sub-Scores */}
        <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider">
                Deterministic Readiness Breakdown (0–100)
              </h3>
              <span className="text-[11px] text-textMuted">
                Five independent criteria evaluated deterministically without speculation
              </span>
            </div>
            <div className="text-left sm:text-right">
              <span className="text-2xl font-extrabold text-lemonChiffon font-mono">{totalReadiness}/100</span>
              <span className="text-[10px] text-textMuted block capitalize font-mono">
                {totalReadiness >= 80 ? 'Good First Contribution' : totalReadiness >= 60 ? 'Beginner Friendly' : 'Maintainer Review'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-blackHole border border-borderDark space-y-1.5">
              <span className="text-textMuted block text-[10px] uppercase font-mono font-semibold">Documentation Clarity</span>
              <span className="font-mono text-sustainableLinen font-bold text-base">{docClarity} <span className="text-xs font-normal text-textMuted">/ 20</span></span>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-sustainableLinen h-full" style={{ width: `${Math.min(100, (docClarity / 20) * 100)}%` }} />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blackHole border border-borderDark space-y-1.5">
              <span className="text-textMuted block text-[10px] uppercase font-mono font-semibold">Test Availability</span>
              <span className="font-mono text-lemonChiffon font-bold text-base">{testAvail} <span className="text-xs font-normal text-textMuted">/ 20</span></span>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-lemonChiffon h-full" style={{ width: `${Math.min(100, (testAvail / 20) * 100)}%` }} />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blackHole border border-borderDark space-y-1.5">
              <span className="text-textMuted block text-[10px] uppercase font-mono font-semibold">CI Automation</span>
              <span className="font-mono text-botticelli font-bold text-base">{ciAuto} <span className="text-xs font-normal text-textMuted">/ 20</span></span>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-botticelli h-full" style={{ width: `${Math.min(100, (ciAuto / 20) * 100)}%` }} />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blackHole border border-borderDark space-y-1.5">
              <span className="text-textMuted block text-[10px] uppercase font-mono font-semibold">Dependency Freshness</span>
              <span className="font-mono text-cotton font-bold text-base">{depFresh} <span className="text-xs font-normal text-textMuted">/ 20</span></span>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-cotton h-full" style={{ width: `${Math.min(100, (depFresh / 20) * 100)}%` }} />
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blackHole border border-borderDark space-y-1.5">
              <span className="text-textMuted block text-[10px] uppercase font-mono font-semibold">Security Governance</span>
              <span className="font-mono text-electricTangerine font-bold text-base">{secGov} <span className="text-xs font-normal text-textMuted">/ 20</span></span>
              <div className="w-full bg-black h-1.5 rounded-full overflow-hidden">
                <div className="bg-electricTangerine h-full" style={{ width: `${Math.min(100, (secGov / 20) * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* P9 Task 2: Skills & Free Learning Resources (Pale Lavender accents) */}
        <SkillsGapPanel
          skills={route.skills}
          learningResources={route.learningResources || finding?.learningResources}
          difficulty={route.difficulty}
          category={route.category || finding?.category}
          contributorImpact={route.contributorLevelImpact || 15}
        />

        {/* Skill Gap & Learning Mode Interactive Checklist */}
        {learningItems.length > 0 && (
          <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-lemonChiffon" />
                <h3 className="text-xs font-heading font-bold text-textPrimary uppercase tracking-wider">
                  Skill Gap &amp; Learning Mode Checklist ({learningItems.filter((i) => i.completed).length}/{learningItems.length})
                </h3>
              </div>
              <span className="text-[11px] font-mono text-textMuted">
                Interactive learning tracking for beginner PR preparation
              </span>
            </div>

            {/* Inline Error on Skill Toggle Failure with Honest Rollback & Retry */}
            {skillError && (
              <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                  <span>{skillError.message}</span>
                </div>
                <button
                  type="button"
                  onClick={skillError.retry}
                  className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {learningItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleToggleSkill(item.id, Boolean(item.completed))}
                  className={`min-h-[44px] p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 press-spring touch-manipulation ${
                    item.completed
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200'
                      : 'bg-blackHole border-borderDark hover:border-lemonChiffon/30 text-textPrimary'
                  } ${syncingSkillId === item.id ? 'opacity-75' : ''}`}
                >
                  <div className="mt-0.5 text-lemonChiffon shrink-0">
                    {syncingSkillId === item.id ? (
                      <Loader2 className="w-4 h-4 animate-spin text-lemonChiffon" />
                    ) : item.completed ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4 text-textMuted" />
                    )}
                  </div>
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-semibold text-xs truncate">{item.concept}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-black text-lemonChiffon border border-lemonChiffon/20 uppercase shrink-0">
                        {item.level}
                      </span>
                    </div>
                    <p className="text-[11px] text-textMuted leading-relaxed">{item.whyNeeded}</p>
                    <span className="text-[10px] text-botticelli font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" /> ~{item.estimatedMinutes} mins
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blueprint Execution Details: Files, Suggested Change, Test Plan, Acceptance Criteria */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Target Files & Suggested Change */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-3">
              <span className="text-xs font-heading font-bold text-lemonChiffon uppercase tracking-wider block">
                Target Files to Touch
              </span>
              <div className="space-y-2 font-mono text-xs text-sustainableLinen">
                {route.files.map((file, i) => (
                  <div key={i} className="p-3 rounded-xl bg-blackHole border border-borderDark flex items-center gap-2 break-all">
                    <FileCode className="w-4 h-4 text-botticelli shrink-0" />
                    <span>{file}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-3">
              <span className="text-xs font-heading font-bold text-lemonChiffon uppercase tracking-wider block">
                Suggested Concrete Change
              </span>
              <p className="text-xs text-textPrimary leading-relaxed bg-blackHole p-4 rounded-xl border border-borderDark font-mono">
                {route.suggestedChange}
              </p>
            </div>
          </div>

          {/* Right Column: Test Plan & Acceptance Criteria */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-3">
              <span className="text-xs font-heading font-bold text-electricTangerine uppercase tracking-wider flex items-center gap-1.5">
                <Terminal className="w-4 h-4" />
                <span>Verification &amp; Test Plan</span>
              </span>
              <ul className="space-y-2 text-xs text-textPrimary">
                {route.testPlan.map((step, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-blackHole border border-borderDark">
                    <span className="text-electricTangerine font-mono font-bold">{idx + 1}.</span>
                    <span className="leading-relaxed">{step}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-6 rounded-2xl bg-black border border-borderDark space-y-3">
              <span className="text-xs font-heading font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Maintainer Acceptance Criteria</span>
              </span>
              <ul className="space-y-2 text-xs text-textPrimary">
                {route.acceptanceCriteria.map((crit, idx) => (
                  <li key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-blackHole border border-borderDark">
                    <span className="text-emerald-400 font-bold">✓</span>
                    <span className="leading-relaxed">{crit}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
