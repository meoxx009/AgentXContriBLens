'use client';

import React, { use, useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Shield,
  FileCode,
  Sparkles,
  Compass,
  ArrowLeft,
  Loader2,
  Lock,
  Copy,
  Check,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  BookOpen,
  Info,
  TrendingUp,
  Layers,
  GitCompare,
  Clock,
  EyeOff,
  RotateCcw,
} from 'lucide-react';
import type { Finding, GroundedExplanation, ExplanationMode, Severity } from '@/types';
import { EngineBadge } from '@/components/ui/EngineBadge';
import { EvidenceChainView } from '@/components/ui/EvidenceChainView';
import { SkillsGapPanel } from '@/components/ui/SkillsGapPanel';
import { getDeterministicExplanationParts } from '@/lib/scanner/explanations';
import { scoreRecommendationItem } from '@/lib/recommendations';
import { FindingDetailsSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

function SeverityBadge({ severity, className = '' }: { severity?: Severity | string; className?: string }) {
  const sev = (severity || 'INFO').toUpperCase();
  let colorStyles = 'bg-blackHole text-platinumSilver border-borderDark';
  let Icon = HelpCircle;

  switch (sev) {
    case 'CRITICAL':
      colorStyles = 'bg-rosewood/40 text-red-200 border-rosewood/80 shadow-sm';
      Icon = AlertOctagon;
      break;
    case 'HIGH':
      colorStyles = 'bg-electricTangerine/20 text-[#FFB082] border-electricTangerine/50 shadow-sm';
      Icon = AlertTriangle;
      break;
    case 'MEDIUM':
      colorStyles = 'bg-lemonChiffon/15 text-lemonChiffon border-lemonChiffon/40 shadow-sm';
      Icon = AlertCircle;
      break;
    case 'LOW':
      colorStyles = 'bg-botticelli/15 text-botticelli border-botticelli/40';
      Icon = Info;
      break;
    case 'INFO':
    default:
      colorStyles = 'bg-white/10 text-platinumSilver border-platinumSilver/30';
      Icon = HelpCircle;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${colorStyles} ${className}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{sev}</span>
    </span>
  );
}

function DisclosureLabel({ mode, category }: { mode?: string; category?: string }) {
  const isPrivate = mode === 'security-disclosure' || category === 'secret';
  const isMaintainer = mode === 'maintainer-review';

  if (isPrivate) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-rosewood/40 text-sustainableLinen border border-rosewood">
        <Lock className="w-3 h-3 text-sustainableLinen" />
        <span>Private Disclosure Only</span>
      </span>
    );
  }

  if (isMaintainer) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-coffeeBean text-lemonChiffon border border-lemonChiffon/40">
        <AlertCircle className="w-3 h-3 text-lemonChiffon" />
        <span>Maintainer Review Required</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
      <span>Public Issue Allowed</span>
    </span>
  );
}

function getReadinessBadge(label?: string) {
  switch (label) {
    case 'good-first-contribution':
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50';
    case 'beginner-friendly':
      return 'bg-coffeeBean text-lemonChiffon border-lemonChiffon/40';
    case 'intermediate':
      return 'bg-[#2D120D] text-electricTangerine border-electricTangerine/40';
    case 'maintainer-assistance':
    default:
      return 'bg-rosewood/30 text-sustainableLinen border-rosewood/40';
  }
}

function getDiffStatusBadge(status?: string) {
  switch (status) {
    case 'new':
      return 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40';
    case 'resolved':
      return 'bg-blue-950/60 text-blue-300 border-blue-500/40';
    case 'changed':
      return 'bg-coffeeBean text-electricTangerine border-electricTangerine/40';
    case 'needs-review':
      return 'bg-rosewood/30 text-lemonChiffon border-rosewood/40';
    case 'unchanged':
    default:
      return 'bg-black text-textMuted border-borderDark';
  }
}

/**
 * P8 Task 2: 3-line code context snippet (monospace, Botticelli-tinted)
 */
function CodeContextViewer({
  code,
  file,
  lineStart,
  lineEnd,
  onCopy,
  copied,
}: {
  code?: string;
  file?: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  onCopy: () => void;
  copied: boolean;
}) {
  const rawLines = (code || '').split('\n').filter((l) => l.trim().length > 0);
  const startLine = lineStart || 1;

  const displayLines =
    rawLines.length > 0
      ? rawLines.slice(0, 5)
      : ['// Structural finding: no raw source snippet required for this check.'];

  return (
    <div className="rounded-xl overflow-hidden border border-botticelli/30 bg-black/90 shadow-inner">
      <div className="px-3.5 py-2 bg-botticelli/[0.06] border-b border-botticelli/20 flex items-center justify-between text-xs text-botticelli">
        <div className="flex items-center gap-2 truncate">
          <FileCode className="w-3.5 h-3.5 text-lemonChiffon shrink-0" />
          <span className="font-mono truncate">{file || 'Repository Configuration'}</span>
          {lineStart && (
            <span className="text-lemonChiffon font-mono font-semibold">
              :{lineStart}
              {lineEnd && lineEnd !== lineStart ? `-${lineEnd}` : ''}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onCopy}
          className="min-h-[44px] inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-botticelli hover:text-lemonChiffon transition-colors shrink-0 press-spring touch-manipulation"
          title="Copy code context snippet"
          aria-label="Copy code context snippet"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      <div className="p-3.5 space-y-1 overflow-x-auto whitespace-pre font-mono text-xs">
        {displayLines.map((line, idx) => {
          const currentLine = startLine + idx;
          return (
            <div key={idx} className="flex items-start gap-3">
              <span className="select-none text-textTertiary w-6 text-right shrink-0 text-[11px]">
                {currentLine}
              </span>
              <span className="text-botticelli break-all whitespace-pre-wrap">{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function FindingDetailPage({
  params,
}: {
  params?: Promise<{ findingId: string }> | { findingId: string };
} = {}) {
  const routerParams = useParams();
  const unwrappedParams = params
    ? typeof (params as any).then === 'function'
      ? use(params as Promise<{ findingId: string }>)
      : (params as { findingId: string })
    : null;
  const findingId =
    unwrappedParams?.findingId || (routerParams?.findingId as string) || '';
  const router = useRouter();
  const { showToast } = useApp();

  const [finding, setFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(true);
  const showDelayedSkeleton = useDelayedLoading(loading, 150);
  const [copied, setCopied] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<GroundedExplanation | null>(null);
  const [creatingRoute, setCreatingRoute] = useState(false);
  const [updatingReview, setUpdatingReview] = useState(false);
  const [updatingDismiss, setUpdatingDismiss] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [showUnmarkConfirm, setShowUnmarkConfirm] = useState(false);
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>('beginner');
  const [reviewError, setReviewError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);

  const executeToggleReview = async () => {
    if (!finding || updatingReview) return;
    const previousFinding = { ...finding };
    const nextReviewed = !finding.reviewed;

    // Optimistic UI update
    setFinding({ ...finding, reviewed: nextReviewed });
    setUpdatingReview(true);
    setReviewError(null);

    try {
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed: nextReviewed }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.finding) {
          setFinding(data.finding);
        }
        showToast(nextReviewed ? 'Marked finding as reviewed' : 'Unmarked review', 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        // Truthful rollback
        setFinding(previousFinding);
        setReviewError({
          message: err.error || 'Failed to update review status on server. Reverted state.',
          retry: () => executeToggleReview(),
        });
        showToast(err.error || 'Failed to update review status; reverted', 'error');
      }
    } catch {
      // Truthful rollback
      setFinding(previousFinding);
      setReviewError({
        message: 'Network error updating review status. Reverted state.',
        retry: () => executeToggleReview(),
      });
      showToast('Failed to update review status; reverted', 'error');
    } finally {
      setUpdatingReview(false);
    }
  };

  const handleToggleReviewClick = () => {
    if (!finding) return;
    if (finding.reviewed) {
      // Unmarking review is an irreversible state removal; require confirmation
      setShowUnmarkConfirm(true);
    } else {
      executeToggleReview();
    }
  };

  const handleDismissFinding = async (dismiss: boolean) => {
    if (!finding || updatingDismiss) return;
    const targetStatus = dismiss ? 'dismissed' : 'open';
    const previousFinding = { ...finding };

    setFinding({ ...finding, status: targetStatus });
    setUpdatingDismiss(true);

    try {
      const res = await fetch(`/api/findings/${finding.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.finding) {
          setFinding(data.finding);
        }
        showToast(dismiss ? 'Finding dismissed from active reports' : 'Finding restored to open', 'info');
      } else {
        setFinding(previousFinding);
        showToast('Failed to update finding status', 'error');
      }
    } catch {
      setFinding(previousFinding);
      showToast('Network error updating finding status', 'error');
    } finally {
      setUpdatingDismiss(false);
    }
  };

  const [fetchError, setFetchError] = useState<string | null>(null);
  type FindingDetailsError = 'session_expired' | 'forbidden' | 'server_error' | 'network_offline' | 'not_found' | null;
  const [errorType, setErrorType] = useState<FindingDetailsError>(null);

  const loadFinding = useCallback(async () => {
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
      const directRes = await fetch(`/api/findings/${encodeURIComponent(findingId)}`);
      if (directRes.ok) {
        const directData = await directRes.json();
        if (directData.finding) {
          setFinding(directData.finding);
          return;
        }
      } else if (directRes.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        return;
      } else if (directRes.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view this finding.');
        return;
      } else if (directRes.status === 404) {
        // Fallback to checking the active list before marking not found
      }

      const res = await fetch('/api/findings');
      if (res.ok) {
        const data = await res.json();
        const allFindings: Finding[] = data.findings || [];
        const matched = allFindings.find((f) => f.id === findingId);
        if (matched) {
          setFinding(matched);
          return;
        }
      } else if (res.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again.');
        return;
      } else if (res.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view this finding.');
        return;
      }

      // If both calls succeeded or 404'd without finding the record:
      setErrorType('not_found');
      setFetchError(`Finding ID "${findingId}" could not be located in this workspace.`);
    } catch (err: any) {
      console.error('Failed to load finding details:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
      } else {
        setErrorType('server_error');
        setFetchError(err?.message || 'Failed to load finding details. Please check your network and retry.');
      }
    } finally {
      setLoading(false);
    }
  }, [findingId]);

  useEffect(() => {
    loadFinding();
  }, [loadFinding]);

  useEffect(() => {
    const currentFindingId = finding?.id;
    if (!currentFindingId) return;
    let cancelled = false;
    async function autoFetchExplain() {
      try {
        const res = await fetch('/api/explain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ findingId: currentFindingId }),
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (data.explanation) {
            setExplanation(data.explanation);
          }
        }
      } catch (err) {
        console.warn('Auto explain request failed, using deterministic fallback', err);
      }
    }
    autoFetchExplain();
    return () => {
      cancelled = true;
    };
  }, [finding?.id]);

  const fallbackParts = useMemo(() => {
    if (!finding) return null;
    return getDeterministicExplanationParts(
      finding.ruleId,
      finding.category,
      finding.title,
      finding.impact,
      finding.fixHint,
      finding.file || 'Repository Configuration'
    );
  }, [finding]);

  const recommendation = useMemo(() => {
    if (!finding) return null;
    return scoreRecommendationItem(finding, null);
  }, [finding]);

  const summaryWhatHappened =
    explanation?.whatHappened || fallbackParts?.whatHappened || finding?.title || '';
  const summaryWhyItMatters =
    explanation?.whyItMatters || fallbackParts?.whyItMatters || finding?.impact || '';
  const summaryHowToFix =
    explanation?.howToFix || fallbackParts?.howToFix || finding?.fixHint || '';

  const plainEnglishDifficulty =
    explanation?.difficulty || finding?.readiness?.difficulty || 'beginner';
  const plainEnglishEffort =
    explanation?.estimatedEffort ||
    (finding?.readiness?.estimatedMinutes ? `${finding.readiness.estimatedMinutes} mins` : '30-45 mins');
  const plainEnglishSkills =
    explanation?.skillsNeeded && explanation.skillsNeeded.length > 0
      ? explanation.skillsNeeded
      : finding?.skills && finding.skills.length > 0
      ? finding.skills
      : ['Git', 'GitHub'];

  const handleCopyEvidence = () => {
    const textToCopy = finding?.redactedEvidence || finding?.evidence || '';
    if (!textToCopy) return;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    showToast('Evidence snippet copied to clipboard', 'info');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyHash = () => {
    const hashToCopy = finding?.evidenceHash || finding?.evidenceChain?.evidenceHash || '';
    if (!hashToCopy) return;
    navigator.clipboard.writeText(hashToCopy);
    setCopiedHash(true);
    showToast('Evidence SHA-256 hash copied to clipboard', 'info');
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleExplain = async () => {
    if (!finding || explaining) return;
    setExplaining(true);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: finding.id }),
      });
      if (res.ok) {
        const data = await res.json();
        setExplanation(data.explanation);
        showToast('Grounded explanation generated', 'success');
      } else {
        showToast('Failed to generate explanation', 'error');
      }
    } catch {
      showToast('Error requesting AI explanation', 'error');
    } finally {
      setExplaining(false);
    }
  };

  const handleCreateRoute = async () => {
    if (!finding || creatingRoute) return;
    setCreatingRoute(true);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: finding.id }),
      });
      if (res.ok) {
        const data = await res.json();
        showToast('Contribution route generated', 'success');
        router.push(`/app/contributions?routeId=${data.route.id}`);
      } else {
        showToast('Failed to create route', 'error');
      }
    } catch {
      showToast('Error connecting to route planner', 'error');
    } finally {
      setCreatingRoute(false);
    }
  };

  const explanationModeText = useMemo(() => {
    if (!finding) return '';
    if (finding.explanationModes?.[explanationMode]) {
      return finding.explanationModes[explanationMode];
    }
    const file = finding.file || 'Repository Root';
    if (explanationMode === 'beginner') {
      return `This finding identifies "${finding.title}" in \`${file}\`. In open-source repositories, addressing this keeps configuration clean and avoids security vulnerabilities. As a new contributor, you can inspect the file, apply the recommended fix, and run local checks to verify your work.`;
    }
    if (explanationMode === 'developer') {
      return `Deterministic static check flagged \`${finding.ruleId}\` in \`${file}\` with verified severity **${finding.severity}**. Remediation: ${finding.fixHint}. Validate changes locally using existing tests or linters without touching unrelated code.`;
    }
    return `Hygiene finding: **${finding.severity}** severity risk in \`${file}\`. Impact: ${finding.impact}. Ensure regression verification and adherence to project maintainer contribution guidelines.`;
  }, [finding, explanationMode]);

  if (loading) {
    if (!showDelayedSkeleton) {
      return null;
    }
    return <FindingDetailsSkeleton />;
  }

  if (!finding) {
    return (
      <div className="min-h-screen bg-transparent text-sustainableLinen px-4 py-16 flex items-center justify-center">
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
                : 'Unable to Load Finding'
            }
            message={fetchError || 'Unable to load finding details.'}
            onRetry={loadFinding}
            retrying={loading}
            secondaryAction={{ label: 'Back to Findings', href: '/app/findings' }}
          />
        ) : (
          <EmptyState
            icon={HelpCircle}
            title="Finding Not Found"
            description={`Finding ID "${findingId}" could not be located in this workspace.`}
            action={{
              label: 'Back to Findings',
              href: '/app/findings',
              icon: ArrowLeft,
            }}
          />
        )}
      </div>
    );
  }

  const confidenceDisplay =
    typeof finding.confidence === 'number'
      ? `${Math.round(finding.confidence * 100)}%`
      : finding.confidence || 'HIGH';

  const readiness = finding.readiness;
  const isCritical = finding.severity?.toUpperCase() === 'CRITICAL';

  return (
    <div className="min-h-screen bg-transparent text-sustainableLinen px-4 sm:px-6 lg:px-8 py-10 relative overflow-x-hidden">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Navigation Breadcrumb */}
        <div>
          <Link
            href="/app/findings"
            className="min-h-[44px] inline-flex items-center gap-2 text-xs font-mono text-textMuted hover:text-lemonChiffon transition-colors press-spring touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Findings
          </Link>
        </div>

        {/* F5 Task 3: "Recommended for you" Strip */}
        {recommendation && (
          <div
            data-testid="recommendation-strip"
            className="glass-panel p-5 sm:p-6 rounded-2xl border border-lemonChiffon/30 bg-coffeeBean/20 shadow-glass-card space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-textMuted flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-electricTangerine shrink-0" />
                  <span>Recommendation:</span>
                </span>
                <span
                  className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border uppercase tracking-wider ${
                    recommendation.priorityLabel === 'Fix this now'
                      ? 'bg-rosewood/30 text-sustainableLinen border-rosewood/50'
                      : recommendation.priorityLabel === 'Good next step'
                      ? 'bg-coffeeBean text-lemonChiffon border-lemonChiffon/40'
                      : 'bg-white/5 text-textMuted border-borderDark'
                  }`}
                >
                  {recommendation.priorityLabel}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-coffeeBean text-lemonChiffon/90 border border-lemonChiffon/20 capitalize">
                  {recommendation.difficulty}
                </span>
                <span className="text-[10px] font-mono text-textMuted flex items-center gap-1">
                  <Clock className="w-3 h-3 text-textMuted" />
                  <span>{recommendation.estimatedMinutes} mins</span>
                </span>
              </div>

              <div className="text-[10px] font-mono text-textMuted">
                Score: <strong className="text-lemonChiffon">{recommendation.score}</strong> pts
              </div>
            </div>

            {/* Plain-English Reason */}
            <p className="text-xs sm:text-sm text-textPrimary leading-relaxed">
              {recommendation.reason}
            </p>

            {/* What to learn first: Top skill + first learning link */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2.5 border-t border-borderDark text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-textMuted flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-botticelli" />
                  <span>What to learn first:</span>
                </span>
                <strong className="text-lemonChiffon font-semibold">{recommendation.learnSkill}</strong>
                {recommendation.learnUrl && (
                  <a
                    href={recommendation.learnUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-botticelli hover:text-lemonChiffon underline transition-colors"
                  >
                    <span>Read Guide</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>

              {!isCritical && finding.disclosureMode !== 'security-disclosure' && (
                <button
                  type="button"
                  onClick={handleCreateRoute}
                  disabled={creatingRoute}
                  className="min-h-[44px] px-4 py-1.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-white text-xs font-bold transition-all shadow-glow-tangerine inline-flex items-center justify-center gap-1.5 press-spring touch-manipulation self-start sm:self-auto"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>{creatingRoute ? 'Planning Route...' : 'Start Contribution Route'}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* F4 Task 2: Plain-English Summary Card (Beginner First, Before Technical Evidence) */}
        <div
          data-testid="plain-english-summary-card"
          className="glass-panel p-6 sm:p-8 rounded-2xl border border-lemonChiffon/30 bg-coffeeBean/20 shadow-glass-card space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-borderDark/60">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-electricTangerine shrink-0" />
                <h2 className="text-xl sm:text-2xl font-heading font-bold text-textPrimary tracking-tight">
                  Plain-English Summary
                </h2>
              </div>
              <p className="text-xs text-textMuted font-sans">
                Friendly senior engineer explanation for beginner contributors
              </p>
            </div>

            <EngineBadge
              engine={explanation?.generatedBy || 'deterministic'}
              fallback={explanation?.fallback ?? (!explanation || explanation.generatedBy === 'deterministic')}
              fallbackReason={explanation?.fallbackReason}
            />
          </div>

          {/* 3-Part Beginner Explanation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 1. What happened (1 sentence) */}
            <div className="p-4 rounded-xl bg-black/70 border border-botticelli/30 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-botticelli flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-botticelli shrink-0" />
                  <span>What happened</span>
                </span>
                <p className="text-xs sm:text-sm text-textPrimary leading-relaxed font-sans">
                  {summaryWhatHappened}
                </p>
              </div>
              <span className="text-[10px] font-mono text-textMuted pt-2 border-t border-borderDark/40">
                Finding overview
              </span>
            </div>

            {/* 2. Why it matters (1 sentence) */}
            <div className="p-4 rounded-xl bg-black/70 border border-electricTangerine/30 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-electricTangerine flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-electricTangerine shrink-0" />
                  <span>Why it matters</span>
                </span>
                <p className="text-xs sm:text-sm text-textPrimary leading-relaxed font-sans">
                  {summaryWhyItMatters}
                </p>
              </div>
              <span className="text-[10px] font-mono text-textMuted pt-2 border-t border-borderDark/40">
                Real-world impact
              </span>
            </div>

            {/* 3. How to fix (1 sentence) */}
            <div className="p-4 rounded-xl bg-black/70 border border-lemonChiffon/30 space-y-2 flex flex-col justify-between">
              <div className="space-y-1.5">
                <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-lemonChiffon flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-lemonChiffon shrink-0" />
                  <span>How to fix</span>
                </span>
                <p className="text-xs sm:text-sm text-textPrimary leading-relaxed font-sans">
                  {summaryHowToFix}
                </p>
              </div>
              <span className="text-[10px] font-mono text-textMuted pt-2 border-t border-borderDark/40">
                Beginner fix guidance
              </span>
            </div>
          </div>

          {/* Chips Row: difficulty, estimated effort, skills, engine badge */}
          <div className="pt-2 flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-mono font-bold uppercase bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30">
              Difficulty: {plainEnglishDifficulty}
            </span>

            <span className="px-3 py-1 rounded-full text-xs font-mono text-botticelli bg-blackHole border border-borderDark flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-lemonChiffon" />
              <span>Effort: {plainEnglishEffort}</span>
            </span>

            {plainEnglishSkills.map((skill, idx) => (
              <span
                key={idx}
                className="px-2.5 py-0.5 rounded-full text-xs font-mono text-platinumSilver bg-blackHole border border-borderDark"
              >
                {skill}
              </span>
            ))}
          </div>
        </div>

        {/* Technical Evidence (Secondary Details Header) */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2 text-xs font-mono text-textMuted">
            <Layers className="w-4 h-4 text-botticelli" />
            <span className="uppercase tracking-wider font-semibold">Technical Evidence &amp; Verification (Secondary Details)</span>
          </div>
          <span className="text-[11px] font-mono text-textTertiary">Deterministic static analysis</span>
        </div>

        {/* 1 & 2. Main Finding Panel */}
        <div
          className={`glass-panel p-6 sm:p-8 rounded-2xl border transition-all space-y-5 shadow-glass-card break-words ${
            isCritical
              ? 'border-rosewood/70 bg-rosewood/10'
              : finding.severity?.toUpperCase() === 'HIGH'
              ? 'border-electricTangerine/40 bg-coffeeBean/40'
              : 'border-borderDark'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <SeverityBadge severity={finding.severity} />

              <span className="text-xs px-2.5 py-0.5 rounded-full bg-black border border-borderDark text-textMuted uppercase font-mono">
                {finding.category}
              </span>

              <span className="text-[11px] font-mono text-lemonChiffon bg-blackHole px-2 py-0.5 rounded border border-borderDark">
                Rule: {finding.ruleId || 'DETERMINISTIC'}
              </span>

              <span className="text-[11px] font-mono text-textMuted bg-blackHole px-2 py-0.5 rounded border border-borderDark">
                Confidence: {confidenceDisplay}
              </span>

              <DisclosureLabel mode={finding.disclosureMode} category={finding.category} />

              {finding.diffStatus && (
                <span className={`text-[10px] px-2 py-0.5 rounded uppercase font-mono font-semibold border ${getDiffStatusBadge(finding.diffStatus)}`}>
                  Diff: {finding.diffStatus}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleToggleReviewClick}
                disabled={updatingReview}
                className={`min-h-[44px] inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all press-spring touch-manipulation ${
                  finding.reviewed
                    ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
                    : 'bg-white/5 text-textMuted border-borderDark hover:text-lemonChiffon hover:border-lemonChiffon/30'
                }`}
              >
                {updatingReview ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : finding.reviewed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-textMuted" />
                )}
                <span>{finding.reviewed ? 'Reviewed ✓' : 'Mark as Reviewed'}</span>
              </button>

              {/* Dismiss / Restore Finding (Soft delete / archive semantics) */}
              {finding.status === 'dismissed' ? (
                <button
                  type="button"
                  onClick={() => handleDismissFinding(false)}
                  disabled={updatingDismiss}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 text-xs font-semibold flex items-center gap-1.5 transition-colors press-spring touch-manipulation"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-lemonChiffon" />
                  <span>Restore Finding</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowDismissConfirm(true)}
                  disabled={updatingDismiss}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-black/60 hover:bg-rosewood/20 border border-rosewood/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors press-spring touch-manipulation"
                >
                  <EyeOff className="w-3.5 h-3.5 text-red-400" />
                  <span>Dismiss Finding</span>
                </button>
              )}

              <span className="text-xs text-textMuted font-mono">
                {new Date(finding.createdAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Inline Error on Review Mutation Failure with Honest Rollback & Retry */}
          {reviewError && (
            <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                <span>{reviewError.message}</span>
              </div>
              <button
                type="button"
                onClick={reviewError.retry}
                className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring"
              >
                Retry
              </button>
            </div>
          )}

          <div>
            <h1 className="text-2xl sm:text-3xl font-heading font-bold text-textPrimary leading-snug">
              {finding.title}
            </h1>
          </div>

          {/* Location & Copyable SHA-256 Hash */}
          <div className="p-3.5 rounded-xl bg-black border border-borderDark space-y-2 text-xs font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-botticelli">
              <div className="flex items-center gap-2 truncate">
                <FileCode className="w-4 h-4 text-lemonChiffon shrink-0" />
                <span>Exact Location: </span>
                <strong className="text-textPrimary truncate">
                  {finding.file || (finding.ruleId === 'REPO-NO-TEST-SIGNAL' ? 'Repository Root (Test Suite Configuration)' : 'Repository Root (Configuration)')}
                  {(finding.lineStart || finding.line) && (
                    <span className="text-lemonChiffon ml-1">
                      :{finding.lineStart || finding.line}
                      {finding.lineEnd && finding.lineEnd !== (finding.lineStart || finding.line)
                        ? `-${finding.lineEnd}`
                        : ''}
                    </span>
                  )}
                </strong>
              </div>
              <span className="text-[10px] text-textMuted uppercase font-mono px-2 py-0.5 rounded bg-blackHole border border-borderDark shrink-0 self-start sm:self-auto">
                {finding.sourceTool || 'Deterministic Engine'}
              </span>
            </div>

            {/* Copyable SHA-256 evidenceHash */}
            {finding.evidenceHash && (
              <div className="pt-2 border-t border-platinumSilver/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                <div className="flex items-center gap-2 truncate text-textMuted">
                  <span className="text-lemonChiffon/80 uppercase tracking-wider font-semibold">SHA-256:</span>
                  <span className="text-platinumSilver font-mono truncate max-w-xs sm:max-w-md">
                    {finding.evidenceHash}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-blackHole hover:bg-black border border-borderDark text-[11px] text-botticelli hover:text-lemonChiffon transition-colors self-start sm:self-auto shrink-0"
                >
                  {copiedHash ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Hash</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 3-Line Code Context Snippet (Botticelli-tinted) */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-textMuted uppercase tracking-wider">
              Verified Code Context (Redacted)
            </span>
            <span className="text-lemonChiffon text-[11px] flex items-center gap-1 font-mono">
              <Lock className="w-3 h-3" /> Secrets Redacted In-Memory
            </span>
          </div>

          <CodeContextViewer
            code={finding.redactedEvidence || finding.evidence}
            file={finding.file}
            lineStart={finding.lineStart || finding.line}
            lineEnd={finding.lineEnd}
            onCopy={handleCopyEvidence}
            copied={copied}
          />

          <p className="text-[11px] text-textMuted">
            Zero raw secrets are stored or logged. Sensitive credentials are conservatively masked with asterisks.
          </p>
        </div>

        {/* Evidence Chain: 8 Trust Steps */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-4">
          <EvidenceChainView evidenceHash={finding.evidenceHash} />
        </div>

        {/* Skills Gap Panel (Pale Lavender accents) */}
        <SkillsGapPanel
          skills={finding.skills}
          learningResources={finding.learningResources}
          difficulty={finding.readiness?.difficulty}
          category={finding.category}
          contributorImpact={15}
        />

        {/* Contribution Readiness & Risk Separation Section */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-lemonChiffon" />
              <h2 className="text-base font-heading font-semibold text-textPrimary">
                Contribution Readiness &amp; Risk Separation
              </h2>
            </div>
            <span className="text-xs font-mono text-textMuted">
              Invariant: Urgency ≠ Readiness
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            {/* Risk / Urgency Card */}
            <div className="p-4 rounded-xl bg-black/60 border border-borderDark space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-textMuted uppercase font-semibold text-[10px]">
                  Risk / Urgency Priority
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-rosewood/30 text-sustainableLinen border border-rosewood/50">
                  {finding.urgencyLabel || 'medium'}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold font-mono text-electricTangerine">
                  {finding.urgencyScore ?? 50}
                </span>
                <span className="text-textMuted text-[10px] font-mono">/ 100</span>
              </div>
              <p className="text-[11px] text-textMuted leading-relaxed">
                Urgency measures how critically this finding impacts repository security. High urgency findings require maintainer attention and must not be delegated to beginner contributors.
              </p>
            </div>

            {/* Contribution Readiness Card */}
            {readiness ? (
              <div className="p-4 rounded-xl bg-black/60 border border-lemonChiffon/30 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-textMuted uppercase font-semibold text-[10px]">
                    Contribution Readiness Score
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getReadinessBadge(readiness.label)}`}>
                    {readiness.label ? readiness.label.replace(/-/g, ' ') : 'Standard Contribution'}
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-lemonChiffon">
                    {readiness.total ?? 50}
                  </span>
                  <span className="text-textMuted text-[10px] font-mono">/ 100</span>
                  {readiness.estimatedMinutes && (
                    <span className="text-textMuted text-[10px] font-mono ml-auto">
                      ~{readiness.estimatedMinutes} mins
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-lemonChiffon/80 leading-relaxed">
                  Deterministic assessment of scope bounded-ness, testability, and clarity for open-source contributors.
                </p>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-black/60 border border-borderDark flex items-center justify-center text-textMuted text-xs">
                Readiness evaluation calculated during scan
              </div>
            )}
          </div>

          {/* 5 Weighted Factor Breakdown */}
          {readiness && (
            <div className="p-4 rounded-xl bg-black/60 border border-borderDark space-y-3">
              <span className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block">
                5-Factor Deterministic Criteria Breakdown
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
                <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark space-y-1">
                  <div className="text-textMuted text-[10px]">Evidence Clarity</div>
                  <div className="font-mono font-bold text-lemonChiffon">
                    {readiness.evidenceClarity ?? 0} <span className="text-textMuted font-normal">/ 25</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark space-y-1">
                  <div className="text-textMuted text-[10px]">Scope Simplicity</div>
                  <div className="font-mono font-bold text-lemonChiffon">
                    {readiness.scopeSimplicity ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark space-y-1">
                  <div className="text-textMuted text-[10px]">Testability</div>
                  <div className="font-mono font-bold text-lemonChiffon">
                    {readiness.testability ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark space-y-1">
                  <div className="text-textMuted text-[10px]">Skill Accessibility</div>
                  <div className="font-mono font-bold text-lemonChiffon">
                    {readiness.skillAccessibility ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                  </div>
                </div>
                <div className="p-2.5 rounded-lg bg-blackHole border border-borderDark space-y-1">
                  <div className="text-textMuted text-[10px]">Context Completeness</div>
                  <div className="font-mono font-bold text-lemonChiffon">
                    {readiness.contextCompleteness ?? 0} <span className="text-textMuted font-normal">/ 15</span>
                  </div>
                </div>
              </div>

              {/* Reasons */}
              {Array.isArray(readiness.reasons) && readiness.reasons.length > 0 && (
                <div className="pt-2 border-t border-borderDark/40 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-lemonChiffon font-semibold">Positive Reasons:</span>
                  <ul className="space-y-1">
                    {readiness.reasons.map((r, i) => (
                      <li key={i} className="text-[11px] text-textMuted flex items-start gap-1.5">
                        <span className="text-emerald-400 mt-0.5">•</span>
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Blockers */}
              {Array.isArray(readiness.blockers) && readiness.blockers.length > 0 && (
                <div className="pt-2 border-t border-borderDark/40 space-y-1">
                  <span className="text-[10px] font-mono uppercase text-red-300 font-semibold">Blockers:</span>
                  <ul className="space-y-1">
                    {readiness.blockers.map((b, i) => (
                      <li key={i} className="text-[11px] text-sustainableLinen flex items-start gap-1.5">
                        <span className="text-red-400 mt-0.5">✕</span>
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Grounded Explanation Depth Switcher (Beginner / Developer / Maintainer) */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-lemonChiffon" />
              <div>
                <h2 className="text-base font-heading font-semibold text-textPrimary">
                  Explanation Depth &amp; Grounded Perspectives
                </h2>
                <span className="text-xs text-textMuted">
                  Same verified evidence explained for 3 contributor skill levels
                </span>
              </div>
            </div>

            {/* Depth Switcher Pills */}
            <div className="flex items-center gap-1 bg-black p-1 rounded-full border border-borderDark overflow-x-auto no-scrollbar">
              {(['beginner', 'developer', 'maintainer'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setExplanationMode(mode)}
                  className={`min-h-[44px] px-3.5 py-2 text-xs font-mono capitalize rounded-full transition-all press-spring touch-manipulation flex items-center justify-center shrink-0 ${
                    explanationMode === mode
                      ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                      : 'text-textMuted hover:text-textPrimary'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          <EngineBadge
            engine={explanation?.generatedBy || 'deterministic'}
            fallback={explanation?.fallback ?? true}
            fallbackReason={explanation?.fallbackReason}
          />

          <div className="p-5 rounded-xl bg-black/60 border border-borderDark space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-lemonChiffon capitalize">
                {explanationMode} Explanation Depth
              </span>
              <span className="text-textMuted font-mono text-[10px]">
                Deterministic &amp; Evidence-Grounded
              </span>
            </div>
            <p className="text-sm text-textPrimary leading-relaxed">
              {explanationModeText}
            </p>
          </div>
        </div>

        {/* AI Grounded Explanation Query Panel with EngineBadge */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-electricTangerine" />
              <div>
                <h2 className="text-base font-heading font-semibold text-textPrimary">
                  Gemma 4 Deep Explanation Query
                </h2>
                <span className="text-xs text-textMuted">Evidence-grounded assistance (never mutates severity)</span>
              </div>
            </div>
            {!explanation && (
              <button
                onClick={handleExplain}
                disabled={explaining}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-lemonChiffon text-black font-semibold text-xs hover:opacity-90 disabled:opacity-50 transition-opacity shrink-0"
              >
                {explaining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                {explaining ? 'Grounding...' : 'Explain with Gemma 4'}
              </button>
            )}
          </div>

          {explanation ? (
            <div className="space-y-4 pt-2">
              <div className="p-5 rounded-xl bg-black/60 border border-lemonChiffon/20 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-textMuted">
                  <EngineBadge
                    engine={explanation.generatedBy || 'gemma'}
                    fallback={explanation.fallback}
                    fallbackReason={explanation.fallbackReason}
                  />
                  <span>Estimated effort: <strong className="text-textPrimary">{explanation.estimatedEffort}</strong></span>
                </div>

                <p className="text-sm text-textPrimary leading-relaxed">{explanation.explanation}</p>

                <div className="pt-3 border-t border-borderDark space-y-1">
                  <span className="text-xs text-electricTangerine font-semibold uppercase">Risk Context:</span>
                  <p className="text-xs text-textMuted">{explanation.riskContext}</p>
                </div>

                {/* Required Skills */}
                <div className="pt-2 border-t border-borderDark">
                  <span className="text-xs text-textMuted block mb-1 font-semibold">Required Skills:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {explanation.skillsNeeded.map((skill, i) => (
                      <span
                        key={i}
                        className="text-xs px-2.5 py-0.5 rounded-full bg-blackHole text-botticelli border border-botticelli/20"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-xs text-textMuted">
              Generate a beginner-friendly, evidence-grounded explanation and contributor readiness breakdown using Gemma 4.
            </p>
          )}
        </div>

        {/* Suggested Action & Impact */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="glass-panel p-6 rounded-2xl border border-borderDark space-y-2">
            <h3 className="text-xs font-heading font-semibold text-electricTangerine uppercase tracking-wider">
              Why it Matters (Impact)
            </h3>
            <p className="text-xs text-textPrimary leading-relaxed">{finding.impact}</p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-borderDark space-y-2">
            <h3 className="text-xs font-heading font-semibold text-lemonChiffon uppercase tracking-wider">
              Recommended Action
            </h3>
            <p className="text-xs text-textPrimary leading-relaxed">{finding.fixHint}</p>
          </div>
        </div>

        {/* Contributor Roadmap & Actions */}
        <div className="glass-panel p-6 sm:p-8 rounded-2xl border border-borderDark space-y-6">
          <h2 className="text-base font-heading font-semibold text-textPrimary flex items-center gap-2">
            <Compass className="w-5 h-5 text-electricTangerine" />
            <span>Contributor Roadmap &amp; Actions</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl bg-black/60 border border-borderDark">
              <span className="font-semibold text-lemonChiffon block mb-1">Target Location</span>
              <code className="text-botticelli font-mono block break-all">
                {finding.file || (finding.ruleId === 'REPO-NO-TEST-SIGNAL' ? 'Repository Root (Test Suite Configuration)' : 'Repository Root (Configuration)')}
              </code>
            </div>

            <div className="p-4 rounded-xl bg-black/60 border border-borderDark">
              <span className="font-semibold text-lemonChiffon block mb-1">Suggested Verification Tests</span>
              <span className="text-textMuted leading-relaxed block">
                {finding.ruleId === 'REPO-NO-TEST-SIGNAL'
                  ? 'Configure automated test script and verify local test execution passes cleanly.'
                  : 'Run local unit tests or linter matching file extension.'}
              </span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="pt-4 border-t border-borderDark flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-textMuted flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-botticelli" />
              <span>References: Static scanner rules &amp; GitHub Security Best Practices</span>
            </div>

            <div className="flex items-center gap-3">
              {finding.disclosureMode === 'security-disclosure' || finding.category === 'secret' ? (
                <div className="px-5 py-2.5 rounded-full bg-rosewood/30 text-sustainableLinen text-xs font-semibold flex items-center gap-2 border border-rosewood">
                  <Lock className="w-4 h-4 text-lemonChiffon" />
                  <span>Public Draft Blocked (Private Disclosure Only)</span>
                </div>
              ) : (
                <button
                  onClick={handleCreateRoute}
                  disabled={creatingRoute}
                  className="w-full sm:w-auto min-h-[44px] inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black font-semibold text-xs shadow-md transition-all disabled:opacity-50 press-spring touch-manipulation"
                >
                  {creatingRoute ? <Loader2 className="w-4 h-4 animate-spin" /> : <Compass className="w-4 h-4" />}
                  <span>{creatingRoute ? 'Building Route...' : 'Create Contribution Route'}</span>
                </button>
              )}
            </div>
          </div>
        </div>

      </div>

      {/* Confirmation Dialog 1: Unmark Review */}
      <ConfirmDialog
        isOpen={showUnmarkConfirm}
        title="Unmark Reviewed Finding?"
        description={`Are you sure you want to remove review approval from "${finding.title}"?`}
        consequenceWarning="Removing review verification returns this finding to the unreviewed state in your workspace."
        confirmLabel="Unmark Review"
        cancelLabel="Keep Reviewed"
        isDestructive={true}
        isBusy={updatingReview}
        onConfirm={async () => {
          setShowUnmarkConfirm(false);
          await executeToggleReview();
        }}
        onCancel={() => setShowUnmarkConfirm(false)}
      />

      {/* Confirmation Dialog 2: Dismiss Finding (Soft Delete / Archive) */}
      <ConfirmDialog
        isOpen={showDismissConfirm}
        title="Dismiss Finding?"
        description={`Dismiss "${finding.title}"? This hides it from active triage reports and suggested routes.`}
        consequenceWarning="Dismissed findings are soft-archived. You can view or restore them at any time by selecting the Dismissed / Resolved filter."
        confirmLabel="Dismiss Finding"
        cancelLabel="Keep Open"
        isDestructive={true}
        isBusy={updatingDismiss}
        onConfirm={async () => {
          setShowDismissConfirm(false);
          await handleDismissFinding(true);
        }}
        onCancel={() => setShowDismissConfirm(false)}
      />

    </div>
  );
}
