'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Shield,
  Filter,
  Search,
  Sparkles,
  Compass,
  FileCode,
  Lock,
  ArrowRight,
  Loader2,
  X,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  Info,
  ChevronRight,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Clock,
  Layers,
  HelpCircle,
  GitCompare,
  TrendingUp,
  RotateCcw,
  EyeOff,
} from 'lucide-react';
import type { Finding, Severity, GroundedExplanation, ExplanationMode, AIFindingSuggestion } from '@/types';
import AIFindingSuggestionsSection from '@/components/views/AIFindingSuggestionsSection';
import { EngineBadge } from '@/components/ui/EngineBadge';
import { EvidenceChainView } from '@/components/ui/EvidenceChainView';
import { SkillsGapPanel } from '@/components/ui/SkillsGapPanel';
import { FindingsListSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';
import { useDebounceValue } from '@/lib/debounce';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

const SEVERITY_OPTIONS = ['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

const CATEGORY_OPTIONS = [
  { id: 'all', label: 'All Categories' },
  { id: 'dependency', label: 'Dependency' },
  { id: 'github-actions', label: 'GitHub Actions' },
  { id: 'secret', label: 'Secret' },
  { id: 'repository-health', label: 'Repository Health' },
] as const;

const READINESS_OPTIONS = [
  { id: 'ALL', label: 'All Readiness' },
  { id: 'good-first-contribution', label: 'Good First (80+)' },
  { id: 'beginner-friendly', label: 'Beginner (60-79)' },
  { id: 'intermediate', label: 'Intermediate (40-59)' },
  { id: 'maintainer-assistance', label: 'Maintainer (<40)' },
] as const;

const DIFF_OPTIONS = [
  { id: 'ALL', label: 'All Diff States' },
  { id: 'new', label: 'New' },
  { id: 'unchanged', label: 'Unchanged' },
  { id: 'resolved', label: 'Resolved' },
  { id: 'changed', label: 'Changed' },
  { id: 'needs-review', label: 'Needs Review' },
] as const;

const STATUS_OPTIONS = [
  { id: 'all', label: 'All Status' },
  { id: 'open', label: 'Open' },
  { id: 'approved', label: 'Approved' },
  { id: 'dismissed', label: 'Dismissed / Resolved' },
] as const;

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 5,
  critical: 5,
  HIGH: 4,
  high: 4,
  MEDIUM: 3,
  medium: 3,
  LOW: 2,
  low: 2,
  INFO: 1,
  info: 1,
};

function getConfidenceScore(conf: number | string | undefined): number {
  if (typeof conf === 'number') return conf;
  if (!conf) return 0.5;
  const upper = String(conf).toUpperCase();
  if (upper === 'HIGH') return 0.85;
  if (upper === 'MEDIUM') return 0.70;
  if (upper === 'LOW') return 0.50;
  return 0.50;
}

/**
 * P8 Task 1 & 2: Severity badge ALWAYS includes both an icon and a text label.
 * Color is NEVER the only signal.
 */
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
 * P8 Task 2: Standardized disclosure mode badges per EVIDENCE_AND_SCHEMAS.md §2 & §7
 */
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

  // Display 3-5 lines of context
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
          className="inline-flex items-center gap-1 text-[11px] font-mono text-botticelli hover:text-lemonChiffon transition-colors shrink-0"
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

interface FindingRowItemProps {
  finding: Finding;
  rowId: string;
  isSelected: boolean;
  isChecked: boolean;
  onSelect: (finding: Finding) => void;
  onToggleSelect: (id: string) => void;
}

const FindingRowItem = React.memo(function FindingRowItem({
  finding,
  rowId,
  isSelected,
  isChecked,
  onSelect,
  onToggleSelect,
}: FindingRowItemProps) {
  const isCritical = finding.severity?.toUpperCase() === 'CRITICAL';
  const readiness = finding.readiness;
  const topReason = Array.isArray(readiness?.reasons) ? readiness.reasons[0] : undefined;

  let cardStyle = 'glass-panel hover:border-platinumSilver/30';
  if (isSelected) {
    if (isCritical) {
      cardStyle = 'border-rosewood bg-rosewood/25 shadow-md ring-1 ring-rosewood/50';
    } else {
      cardStyle = 'border-electricTangerine shadow-liquid-glow bg-blackHole/80';
    }
  } else if (isCritical) {
    cardStyle = 'border-rosewood/40 bg-rosewood/10 hover:border-rosewood/70';
  }

  return (
    <li role="listitem" id={`finding-${finding.id}`}>
      <div
        className={`w-full p-4 rounded-xl border transition-all ${cardStyle} flex items-start gap-2.5 cursor-pointer touch-manipulation focus:outline-none focus:ring-1 focus:ring-lemonChiffon/60`}
        onClick={() => onSelect(finding)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSelect(finding);
          }
        }}
        tabIndex={0}
        role="button"
        aria-pressed={isSelected}
        aria-label={`View details for finding: ${finding.title}`}
      >
        {/* Individual Row Checkbox with Accessible Touch Target */}
        <label
          htmlFor={`finding-checkbox-${finding.id}`}
          className="min-w-[44px] min-h-[44px] -ml-2 -mt-2 shrink-0 flex items-center justify-center cursor-pointer touch-manipulation"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            id={`finding-checkbox-${finding.id}`}
            name={`select-finding-${finding.id}`}
            checked={isChecked}
            onChange={() => onToggleSelect(finding.id)}
            aria-label={`Select finding: ${finding.title}`}
            className="w-4 h-4 rounded border-borderDark bg-black text-lemonChiffon focus:ring-1 focus:ring-lemonChiffon cursor-pointer touch-manipulation"
          />
        </label>

        {/* Card Body Clickable Region */}
        <div className="flex-1 min-w-0 text-left">
          {/* Top Badges Row: Severity (Text + Icon), Readiness, Diff Status */}
          <div className="flex flex-wrap items-center justify-between text-[11px] mb-2 gap-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <SeverityBadge severity={finding.severity} />

              {finding.urgencyScore !== undefined && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-black border border-borderDark text-textMuted">
                  Urg: {finding.urgencyScore}
                </span>
              )}

              {readiness && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${getReadinessBadge(readiness.label)}`}>
                  Readiness: {readiness.total ?? 0}/100
                </span>
              )}

              {finding.diffStatus && finding.diffStatus !== 'unchanged' && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase font-bold border ${getDiffStatusBadge(finding.diffStatus)}`}>
                  {finding.diffStatus}
                </span>
              )}

              {finding.reviewed && (
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-300 border border-emerald-600/40 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Reviewed
                </span>
              )}
            </div>

            <span className="text-[10px] font-mono text-textMuted">
              {typeof finding.confidence === 'number'
                ? `${Math.round(finding.confidence * 100)}%`
                : finding.confidence || 'HIGH'}{' '}
              Conf.
            </span>
          </div>

          <h4 className="text-xs font-heading font-semibold text-textPrimary line-clamp-2">
            {finding.title}
          </h4>

          {/* Top Readiness reason preview */}
          {topReason && (
            <p className="mt-1.5 text-[11px] text-textMuted line-clamp-1 italic">
              💡 {topReason}
            </p>
          )}

          <div className="mt-2.5 text-[11px] text-botticelli font-mono flex items-center justify-between">
            <span className="truncate max-w-[200px]">{finding.file || 'Repository Root'}</span>
            <ChevronRight className="w-3.5 h-3.5 text-textMuted shrink-0" />
          </div>
        </div>
      </div>
    </li>
  );
});

export default function FindingsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeScan, showToast, setActiveScan, setSessionExpired, openAuthModal, selectedFindingId, setSelectedFindingId } = useApp();

  const [findings, setFindings] = useState<Finding[]>(() => {
    if (activeScan?.findings && Array.isArray(activeScan.findings) && activeScan.findings.length > 0) {
      return activeScan.findings as Finding[];
    }
    return [];
  });
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [loading, setLoading] = useState(() => !(activeScan?.findings && activeScan.findings.length > 0));
  const showDelayedSkeleton = useDelayedLoading(loading, 150);
  const [fetchError, setFetchError] = useState<string | null>(null);
  type ErrorState = 'session_expired' | 'forbidden' | 'not_found' | 'server_error' | 'network_offline' | null;
  const [errorType, setErrorType] = useState<ErrorState>(null);

  // Filters with URL-synced state per P8 Task 6 & List Filtering upgrade
  const [severityFilter, setSeverityFilter] = useState<string>(
    () => searchParams?.get('severity') || 'ALL'
  );
  const [categoryFilter, setCategoryFilter] = useState<string>(
    () => searchParams?.get('category') || 'all'
  );
  const [readinessFilter, setReadinessFilter] = useState<string>(
    () => searchParams?.get('readiness') || 'ALL'
  );
  const [diffFilter, setDiffFilter] = useState<string>(
    () => searchParams?.get('diff') || 'ALL'
  );
  const [statusFilter, setStatusFilter] = useState<string>(
    () => searchParams?.get('status') || 'all'
  );
  const [ruleIdFilter, setRuleIdFilter] = useState<string>(
    () => searchParams?.get('ruleId') || 'ALL'
  );
  const [filePathFilter, setFilePathFilter] = useState<string>(
    () => searchParams?.get('file') || ''
  );
  const debouncedFilePathFilter = useDebounceValue(filePathFilter, 300);
  const [searchQuery, setSearchQuery] = useState<string>(
    () => searchParams?.get('q') || ''
  );
  const debouncedSearchQuery = useDebounceValue(searchQuery, 300);
  const [totalScanFindings, setTotalScanFindings] = useState<number>(() => {
    return activeScan?.findingsCount?.total || activeScan?.findings?.length || 0;
  });
  const fetchSequenceRef = useRef(0);
  const inFlightParamsRef = useRef<string | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const hasInitializedSelectionRef = useRef(false);
  const lastSyncedUrlParamRef = useRef<string | null>(null);
  const previousUrlFindingIdRef = useRef<string | null>(
    searchParams?.get('findingId') || searchParams?.get('finding') || null
  );

  // Sync browser back/forward popstate to component filter state
  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      setSeverityFilter(params.get('severity') || 'ALL');
      setCategoryFilter(params.get('category') || 'all');
      setReadinessFilter(params.get('readiness') || 'ALL');
      setDiffFilter(params.get('diff') || 'ALL');
      setStatusFilter(params.get('status') || 'all');
      setRuleIdFilter(params.get('ruleId') || 'ALL');
      setFilePathFilter(params.get('file') || '');
      setSearchQuery(params.get('q') || '');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Dynamic set of available rule IDs from the scan findings
  const availableRuleIds = useMemo(() => {
    const set = new Set<string>();
    findings.forEach((f) => {
      if (f.ruleId) set.add(f.ruleId);
    });
    return Array.from(set).sort();
  }, [findings]);

  // Active filter count chip calculation
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (severityFilter !== 'ALL') count++;
    if (categoryFilter !== 'all') count++;
    if (readinessFilter !== 'ALL') count++;
    if (diffFilter !== 'ALL') count++;
    if (statusFilter !== 'all') count++;
    if (ruleIdFilter !== 'ALL') count++;
    if (filePathFilter.trim()) count++;
    if (searchQuery.trim()) count++;
    return count;
  }, [
    severityFilter,
    categoryFilter,
    readinessFilter,
    diffFilter,
    statusFilter,
    ruleIdFilter,
    filePathFilter,
    searchQuery,
  ]);

  // Interactive actions & explanation depth mode
  const [explanationMode, setExplanationMode] = useState<ExplanationMode>('beginner');
  const [explainingId, setExplainingId] = useState<string | null>(null);
  const [currentExplanation, setCurrentExplanation] = useState<GroundedExplanation | null>(null);
  const [creatingRouteId, setCreatingRouteId] = useState<string | null>(null);
  const [updatingReviewId, setUpdatingReviewId] = useState<string | null>(null);
  const [reviewMutationError, setReviewMutationError] = useState<{
    findingId: string;
    message: string;
    retry: () => void;
  } | null>(null);
  const [copiedEvidence, setCopiedEvidence] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Bulk selection & multi-item management state
  const [selectedFindingIds, setSelectedFindingIds] = useState<Set<string>>(new Set());
  const [isBulkOperating, setIsBulkOperating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ current: number; total: number; actionName: string } | null>(null);
  const [bulkResultSummary, setBulkResultSummary] = useState<{
    actionName: string;
    successCount: number;
    failedCount: number;
    failedIds: string[];
    actionType: 'approve' | 'unmark' | 'dismiss';
  } | null>(null);
  const [showUnmarkConfirm, setShowUnmarkConfirm] = useState(false);
  const [showDismissConfirm, setShowDismissConfirm] = useState(false);
  const [singleFindingToUnmark, setSingleFindingToUnmark] = useState<Finding | null>(null);
  const [singleFindingToDismiss, setSingleFindingToDismiss] = useState<Finding | null>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // AI Finding Suggestions State (P8 Beginner Suggestions)
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<AIFindingSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsError, setSuggestionsError] = useState<string | null>(null);
  const [suggestionsTotalFindings, setSuggestionsTotalFindings] = useState(0);
  const [suggestionsIsPartial, setSuggestionsIsPartial] = useState(false);
  const suggestionsSeqRef = useRef(0);
  const isSuggestionsMountedRef = useRef(true);
  const suggestionsAbortControllerRef = useRef<AbortController | null>(null);

  // Requirement 2 & 3: Clean default on mount/return and abort on unmount
  useEffect(() => {
    isSuggestionsMountedRef.current = true;
    setShowSuggestions(false);
    setSuggestionsError(null);

    return () => {
      isSuggestionsMountedRef.current = false;
      if (suggestionsAbortControllerRef.current) {
        suggestionsAbortControllerRef.current.abort();
      }
    };
  }, []);

  const fetchSuggestions = useCallback(async (scanId: string) => {
    if (suggestionsAbortControllerRef.current) {
      suggestionsAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    suggestionsAbortControllerRef.current = controller;

    const currentSeq = ++suggestionsSeqRef.current;
    if (isSuggestionsMountedRef.current) {
      setSuggestionsLoading(true);
      setSuggestionsError(null);
    }

    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (!isSuggestionsMountedRef.current || currentSeq !== suggestionsSeqRef.current) return;
        setSuggestionsError('You appear to be offline.');
        setSuggestions([]);
        setSuggestionsLoading(false);
        return;
      }

      const res = await fetch(`/api/findings/suggestions?scanId=${encodeURIComponent(scanId)}`, {
        signal: controller.signal,
      });
      if (!isSuggestionsMountedRef.current || currentSeq !== suggestionsSeqRef.current) return;

      if (res.status === 401) {
        setSuggestionsError('Sign in required to view AI suggestions.');
        setSuggestions([]);
        return;
      }

      if (res.status === 403) {
        setSuggestionsError('You do not have authorization to view suggestions for this scan.');
        setSuggestions([]);
        return;
      }

      if (res.status === 404) {
        setSuggestionsError('The requested repository scan was not found.');
        setSuggestions([]);
        return;
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        setSuggestionsError(errorData.error || `Failed to load suggestions (HTTP ${res.status}).`);
        setSuggestions([]);
        return;
      }

      const data = await res.json();
      if (!isSuggestionsMountedRef.current || currentSeq !== suggestionsSeqRef.current) return;

      setSuggestions(data.suggestions || []);
      setSuggestionsTotalFindings(data.totalFindings || 0);
      setSuggestionsIsPartial(Boolean(data.isPartial));
    } catch (err: any) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        return;
      }
      if (!isSuggestionsMountedRef.current || currentSeq !== suggestionsSeqRef.current) return;
      console.warn('Failed to load AI finding suggestions:', err);
      setSuggestionsError(err.message || 'Unable to connect to suggestion engine.');
      setSuggestions([]);
    } finally {
      if (isSuggestionsMountedRef.current && currentSeq === suggestionsSeqRef.current) {
        setSuggestionsLoading(false);
      }
    }
  }, []);

  // When activeScan changes, discard old suggestions immediately, reset scan selection initialized state, and load new ones if open
  useEffect(() => {
    hasInitializedSelectionRef.current = false;
    lastSelectedIdRef.current = null;
    lastSyncedUrlParamRef.current = null;
    if (activeScan?.id) {
      setSuggestions([]);
      setSuggestionsError(null);
      if (showSuggestions) {
        fetchSuggestions(activeScan.id);
      }
    } else {
      setSuggestions([]);
      setSuggestionsLoading(false);
      setSuggestionsError(null);
    }
  }, [activeScan?.id, showSuggestions, fetchSuggestions]);

  const handleToggleSuggestions = useCallback(() => {
    setShowSuggestions((prev) => {
      const next = !prev;
      if (next && activeScan?.id && suggestions.length === 0 && !suggestionsLoading) {
        fetchSuggestions(activeScan.id);
      } else if (!next) {
        if (suggestionsAbortControllerRef.current) {
          suggestionsAbortControllerRef.current.abort();
        }
        setSuggestionsLoading(false);
      }
      return next;
    });
  }, [activeScan?.id, suggestions.length, suggestionsLoading, fetchSuggestions]);

  // Synchronize state changes to URL query parameters smoothly
  const syncFiltersToUrl = useCallback(
    (updates: {
      severity?: string;
      category?: string;
      readiness?: string;
      diff?: string;
      status?: string;
      ruleId?: string;
      file?: string;
      q?: string;
      findingId?: string | null;
    }) => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);

      const s = updates.severity !== undefined ? updates.severity : severityFilter;
      const c = updates.category !== undefined ? updates.category : categoryFilter;
      const r = updates.readiness !== undefined ? updates.readiness : readinessFilter;
      const d = updates.diff !== undefined ? updates.diff : diffFilter;
      const st = updates.status !== undefined ? updates.status : statusFilter;
      const ru = updates.ruleId !== undefined ? updates.ruleId : ruleIdFilter;
      const f = updates.file !== undefined ? updates.file : filePathFilter;
      const q = updates.q !== undefined ? updates.q : searchQuery;

      if (s && s !== 'ALL') params.set('severity', s);
      else params.delete('severity');

      if (c && c !== 'all') params.set('category', c);
      else params.delete('category');

      if (r && r !== 'ALL') params.set('readiness', r);
      else params.delete('readiness');

      if (d && d !== 'ALL') params.set('diff', d);
      else params.delete('diff');

      if (st && st !== 'all') params.set('status', st);
      else params.delete('status');

      if (ru && ru !== 'ALL') params.set('ruleId', ru);
      else params.delete('ruleId');

      if (f && f.trim()) params.set('file', f.trim());
      else params.delete('file');

      if (q && q.trim()) params.set('q', q.trim());
      else params.delete('q');

      if (updates.findingId !== undefined) {
        if (updates.findingId && updates.findingId.trim()) {
          const fid = updates.findingId.trim();
          params.set('findingId', fid);
          lastSyncedUrlParamRef.current = fid;
        } else {
          params.delete('findingId');
          params.delete('finding');
          lastSyncedUrlParamRef.current = null;
        }
      } else {
        const currentFid = lastSelectedIdRef.current || selectedFinding?.id || selectedFindingId;
        if (currentFid) {
          params.set('findingId', currentFid);
          lastSyncedUrlParamRef.current = currentFid;
        }
      }

      const qs = params.toString();
      const nextUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
      window.history.replaceState(null, '', nextUrl);
    },
    [
      severityFilter,
      categoryFilter,
      readinessFilter,
      diffFilter,
      statusFilter,
      ruleIdFilter,
      filePathFilter,
      searchQuery,
      selectedFinding?.id,
      selectedFindingId,
    ]
  );

  const ensureFindingVisible = useCallback(
    (finding: Finding) => {
      let filterAdjusted = false;
      const updates: {
        severity?: string;
        category?: string;
        readiness?: string;
        diff?: string;
        status?: string;
        ruleId?: string;
        file?: string;
        q?: string;
      } = {};

      if (severityFilter !== 'ALL' && finding.severity?.toUpperCase() !== severityFilter.toUpperCase()) {
        setSeverityFilter('ALL');
        updates.severity = 'ALL';
        filterAdjusted = true;
      }

      if (categoryFilter !== 'all' && finding.category !== categoryFilter) {
        setCategoryFilter('all');
        updates.category = 'all';
        filterAdjusted = true;
      }

      if (statusFilter !== 'all' && finding.status !== statusFilter) {
        setStatusFilter('all');
        updates.status = 'all';
        filterAdjusted = true;
      }

      if (ruleIdFilter !== 'ALL' && finding.ruleId !== ruleIdFilter) {
        setRuleIdFilter('ALL');
        updates.ruleId = 'ALL';
        filterAdjusted = true;
      }

      if (readinessFilter !== 'ALL' && finding.readiness?.label !== readinessFilter) {
        setReadinessFilter('ALL');
        updates.readiness = 'ALL';
        filterAdjusted = true;
      }

      if (diffFilter !== 'ALL' && finding.diffStatus !== diffFilter) {
        setDiffFilter('ALL');
        updates.diff = 'ALL';
        filterAdjusted = true;
      }

      if (
        filePathFilter.trim() &&
        finding.file &&
        !finding.file.toLowerCase().includes(filePathFilter.trim().toLowerCase())
      ) {
        setFilePathFilter('');
        updates.file = '';
        filterAdjusted = true;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matches =
          finding.title.toLowerCase().includes(q) ||
          (finding.file && finding.file.toLowerCase().includes(q)) ||
          finding.ruleId.toLowerCase().includes(q);
        if (!matches) {
          setSearchQuery('');
          updates.q = '';
          filterAdjusted = true;
        }
      }

      if (filterAdjusted) {
        syncFiltersToUrl({ ...updates, findingId: finding.id });
      }
    },
    [
      severityFilter,
      categoryFilter,
      statusFilter,
      ruleIdFilter,
      readinessFilter,
      diffFilter,
      filePathFilter,
      searchQuery,
      syncFiltersToUrl,
    ]
  );

  const handleSelectFinding = useCallback(
    (finding: Finding) => {
      if (!finding) return;
      const targetId =
        finding.id ||
        finding.fingerprint ||
        `${finding.ruleId || 'GENERIC'}-${finding.file || 'root'}-${finding.lineStart || finding.line || 0}`;
      const safeFinding = finding.id ? finding : { ...finding, id: targetId };

      lastSelectedIdRef.current = targetId;
      lastSyncedUrlParamRef.current = targetId;
      setSelectedFinding(safeFinding);
      setSelectedFindingId(targetId);
      syncFiltersToUrl({ findingId: targetId });

      if (typeof window !== 'undefined') {
        try {
          sessionStorage.setItem(
            `contriblens_selected_finding_${activeScan?.id || 'active'}`,
            targetId
          );
        } catch {
          // Safe ignore in restricted browser environments
        }

        if (window.innerWidth < 1024) {
          const detailEl = document.getElementById('finding-detail-panel');
          if (detailEl) {
            detailEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }
      }
    },
    [activeScan?.id, setSelectedFindingId, syncFiltersToUrl]
  );

  const handleSelectSuggestionFinding = useCallback(
    (findingId: string) => {
      const cleanId = (findingId || '').trim();
      const decoded = decodeURIComponent(cleanId);
      const targetFinding = findings.find(
        (f) =>
          f.id === cleanId ||
          f.id === decoded ||
          (f.id && decodeURIComponent(f.id) === decoded)
      );
      if (targetFinding) {
        handleSelectFinding(targetFinding);
        ensureFindingVisible(targetFinding);
      } else {
        showToast('This finding is from a previous scan — rescan the repository to refresh it', 'info');
      }
      if (typeof window !== 'undefined') {
        const el = document.getElementById(`finding-${cleanId}`) || document.getElementById(`finding-${decoded}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    },
    [findings, handleSelectFinding, ensureFindingVisible, showToast]
  );

  // Clear bulk selection when active filters, search query, or activeScan change
  useEffect(() => {
    setSelectedFindingIds(new Set());
    setBulkResultSummary(null);
  }, [
    activeScan,
    severityFilter,
    categoryFilter,
    readinessFilter,
    diffFilter,
    statusFilter,
    ruleIdFilter,
    debouncedFilePathFilter,
    debouncedSearchQuery,
  ]);

  const handleSeverityChange = (s: string) => {
    setSeverityFilter(s);
    syncFiltersToUrl({ severity: s });
  };

  const handleCategoryChange = (c: string) => {
    setCategoryFilter(c);
    syncFiltersToUrl({ category: c });
  };

  const handleReadinessChange = (r: string) => {
    setReadinessFilter(r);
    syncFiltersToUrl({ readiness: r });
  };

  const handleDiffChange = (d: string) => {
    setDiffFilter(d);
    syncFiltersToUrl({ diff: d });
  };

  const handleStatusChange = (st: string) => {
    setStatusFilter(st);
    syncFiltersToUrl({ status: st });
  };

  const handleRuleIdChange = (ru: string) => {
    setRuleIdFilter(ru);
    syncFiltersToUrl({ ruleId: ru });
  };

  const handleFilePathChange = (fp: string) => {
    setFilePathFilter(fp);
  };

  const handleSearchChange = (q: string) => {
    setSearchQuery(q);
  };

  useEffect(() => {
    syncFiltersToUrl({ file: debouncedFilePathFilter });
  }, [debouncedFilePathFilter, syncFiltersToUrl]);

  useEffect(() => {
    syncFiltersToUrl({ q: debouncedSearchQuery });
  }, [debouncedSearchQuery, syncFiltersToUrl]);

  useEffect(() => {
    const seq = fetchSequenceRef;
    return () => {
      seq.current++;
    };
  }, []);

  const handleResetFilters = () => {
    setSeverityFilter('ALL');
    setCategoryFilter('all');
    setReadinessFilter('ALL');
    setDiffFilter('ALL');
    setStatusFilter('all');
    setRuleIdFilter('ALL');
    setFilePathFilter('');
    setSearchQuery('');
    syncFiltersToUrl({
      severity: 'ALL',
      category: 'all',
      readiness: 'ALL',
      diff: 'ALL',
      status: 'all',
      ruleId: 'ALL',
      file: '',
      q: '',
    });
  };

  useEffect(() => {
    fetchFindings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeScan?.id,
    severityFilter,
    categoryFilter,
    readinessFilter,
    diffFilter,
    statusFilter,
    ruleIdFilter,
    debouncedFilePathFilter,
    debouncedSearchQuery,
  ]);

  const fetchFindings = async () => {
    const currentSeq = ++fetchSequenceRef.current;
    setLoading(true);
    setFetchError(null);
    setErrorType(null);
    try {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (currentSeq !== fetchSequenceRef.current) return;
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
        setFindings([]);
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (activeScan) params.set('scanId', activeScan.id);
      if (severityFilter !== 'ALL') params.set('severity', severityFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (readinessFilter !== 'ALL') params.set('readinessLabel', readinessFilter);
      if (diffFilter !== 'ALL') params.set('diffStatus', diffFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (ruleIdFilter !== 'ALL') params.set('ruleId', ruleIdFilter);
      if (debouncedFilePathFilter.trim()) params.set('file', debouncedFilePathFilter.trim());
      if (debouncedSearchQuery.trim()) params.set('search', debouncedSearchQuery.trim());

      const paramsKey = params.toString();
      if (inFlightParamsRef.current === paramsKey) {
        return;
      }
      inFlightParamsRef.current = paramsKey;

      let res = await fetch(`/api/findings?${paramsKey}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      // Handle 404: if activeScan has in-memory or persisted findings, preserve them instead of wiping state
      if (res.status === 404 && activeScan) {
        if (activeScan.findings && activeScan.findings.length > 0) {
          setTotalScanFindings(activeScan.findings.length);
          const sorted = [...(activeScan.findings as Finding[])].sort((a, b) => {
            const sevA = SEVERITY_RANK[a.severity?.toUpperCase()] || 0;
            const sevB = SEVERITY_RANK[b.severity?.toUpperCase()] || 0;
            if (sevB !== sevA) return sevB - sevA;
            return getConfidenceScore(b.confidence) - getConfidenceScore(a.confidence);
          });
          setFindings(sorted);
          setLoading(false);
          return;
        }
        // If no client findings exist for scanId, attempt general findings fallback without destroying activeScan
        const fallbackParams = new URLSearchParams();
        if (severityFilter !== 'ALL') fallbackParams.set('severity', severityFilter);
        if (categoryFilter !== 'all') fallbackParams.set('category', categoryFilter);
        if (readinessFilter !== 'ALL') fallbackParams.set('readinessLabel', readinessFilter);
        if (diffFilter !== 'ALL') fallbackParams.set('diffStatus', diffFilter);
        if (statusFilter !== 'all') fallbackParams.set('status', statusFilter);
        if (ruleIdFilter !== 'ALL') fallbackParams.set('ruleId', ruleIdFilter);
        if (debouncedFilePathFilter.trim()) fallbackParams.set('file', debouncedFilePathFilter.trim());
        if (debouncedSearchQuery.trim()) fallbackParams.set('search', debouncedSearchQuery.trim());
        res = await fetch(`/api/findings?${fallbackParams.toString()}`, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' },
        });
      }

      // Check if another request superseded this one while waiting for response
      if (currentSeq !== fetchSequenceRef.current) return;

      if (res.status === 401) {
        setErrorType('session_expired');
        setFetchError('Your ContribLens session has expired. Please sign in again to view verified security findings.');
        setSessionExpired(true);
        setFindings([]);
        return;
      }

      if (res.status === 403) {
        setErrorType('forbidden');
        setFetchError('You do not have authorization to view findings for this repository scan.');
        setFindings([]);
        return;
      }

      if (res.status === 404) {
        setErrorType('not_found');
        setFetchError('The requested repository scan could not be found. It may have been removed or deleted.');
        setFindings([]);
        setSelectedFinding(null);
        return;
      }

      if (res.status >= 500) {
        setErrorType('server_error');
        setFetchError(`Server error while loading findings (HTTP ${res.status}). Please retry.`);
        setFindings([]);
        return;
      }

      if (!res.ok) {
        setErrorType('server_error');
        setFetchError(`Failed to load findings (HTTP ${res.status}). Please retry.`);
        setFindings([]);
        return;
      }

      const data = await res.json();
      if (currentSeq !== fetchSequenceRef.current) return;

      const loaded: Finding[] = data.findings || [];
      const totalAvailable = typeof data.total === 'number'
        ? data.total
        : (activeScan?.findingsCount?.total || activeScan?.findings?.length || loaded.length);
      setTotalScanFindings(totalAvailable);

      // Sort deterministically: Severity rank descending, then Confidence descending
      const sorted = [...loaded].sort((a, b) => {
        const sevA = SEVERITY_RANK[a.severity?.toUpperCase()] || 0;
        const sevB = SEVERITY_RANK[b.severity?.toUpperCase()] || 0;
        if (sevB !== sevA) return sevB - sevA;
        return getConfidenceScore(b.confidence) - getConfidenceScore(a.confidence);
      });

      setFindings(sorted);
      if (activeScan && activeScan.id && (!activeScan.findings || activeScan.findings.length === 0)) {
        const scanToSync = { ...activeScan, findings: sorted };
        queueMicrotask(() => {
          setActiveScan(scanToSync);
        });
      }
      if (sorted.length > 0) {
        // Resolve intended target finding:
        // Priority 1: In-memory active selection ref (user's recent click)
        // Priority 2: URL search parameter 'findingId' or 'finding'
        // Priority 3: In-memory selectedFindingId from AppContext
        // Priority 4: SessionStorage for this scan
        let targetId =
          lastSelectedIdRef.current ||
          (typeof window !== 'undefined'
            ? new URLSearchParams(window.location.search).get('findingId') ||
              new URLSearchParams(window.location.search).get('finding')
            : null) ||
          selectedFindingId;

        if (!targetId && typeof window !== 'undefined') {
          try {
            targetId = sessionStorage.getItem(`contriblens_selected_finding_${activeScan?.id || 'active'}`);
          } catch {
            targetId = null;
          }
        }

        if (targetId) {
          const cleanTarget = targetId.trim();
          const decodedTarget = decodeURIComponent(cleanTarget);
          const matched = sorted.find(
            (f) =>
              f.id === cleanTarget ||
              f.id === decodedTarget ||
              (f.id && decodeURIComponent(f.id) === decodedTarget) ||
              (f.fingerprint && (f.fingerprint === cleanTarget || f.fingerprint === decodedTarget))
          );

          if (matched) {
            lastSelectedIdRef.current = matched.id;
            lastSyncedUrlParamRef.current = matched.id;
            setSelectedFinding(matched);
            if (selectedFindingId !== matched.id) {
              setSelectedFindingId(matched.id);
            }
            syncFiltersToUrl({ findingId: matched.id });
            ensureFindingVisible(matched);

            if (typeof window !== 'undefined') {
              setTimeout(() => {
                const el = document.getElementById(`finding-${matched.id}`);
                if (el) {
                  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
              }, 60);
            }
          } else if (!hasInitializedSelectionRef.current) {
            // Target ID was specified but is invalid, deleted, or unauthorized:
            // Safely ignore without selecting a wrong fallback finding
            lastSelectedIdRef.current = null;
            lastSyncedUrlParamRef.current = null;
            setSelectedFinding(null);
            if (selectedFindingId !== null) {
              setSelectedFindingId(null);
            }
            if (typeof window !== 'undefined') {
              try {
                sessionStorage.removeItem(`contriblens_selected_finding_${activeScan?.id || 'active'}`);
              } catch (storageErr) {
                console.debug('Failed to remove invalid selected finding from sessionStorage:', storageErr);
              }
            }
            syncFiltersToUrl({ findingId: null });
          } else {
            // If already initialized and active selection was filtered out, fallback to first sorted
            const fallback = sorted[0];
            lastSelectedIdRef.current = fallback.id;
            lastSyncedUrlParamRef.current = fallback.id;
            setSelectedFinding(fallback);
            if (selectedFindingId !== fallback.id) {
              setSelectedFindingId(fallback.id);
            }
            syncFiltersToUrl({ findingId: fallback.id });
          }
        } else {
          // No prior finding selection: default to sorted[0]
          const targetFinding = sorted[0];
          lastSelectedIdRef.current = targetFinding.id;
          lastSyncedUrlParamRef.current = targetFinding.id;
          setSelectedFinding(targetFinding);
          if (selectedFindingId !== targetFinding.id) {
            setSelectedFindingId(targetFinding.id);
          }
          syncFiltersToUrl({ findingId: targetFinding.id });
        }
        hasInitializedSelectionRef.current = true;
      } else {
        lastSelectedIdRef.current = null;
        lastSyncedUrlParamRef.current = null;
        setSelectedFinding(null);
        if (selectedFindingId !== null) {
          setSelectedFindingId(null);
        }
      }
    } catch (err: any) {
      if (currentSeq !== fetchSequenceRef.current) return;
      console.error('Failed to load findings:', err);
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setErrorType('network_offline');
        setFetchError('You appear to be offline. Please verify your internet connection.');
      } else if (!errorType) {
        setErrorType('server_error');
        setFetchError(err.message || 'Failed to load verified findings');
      }
    } finally {
      inFlightParamsRef.current = null;
      if (currentSeq === fetchSequenceRef.current) {
        setLoading(false);
      }
    }
  };

  // Listen for browser Back/Forward (popstate events)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      if (findings.length === 0) return;
      const params = new URLSearchParams(window.location.search);
      const currentParam = params.get('findingId') || params.get('finding');
      if (!currentParam) {
        lastSelectedIdRef.current = null;
        lastSyncedUrlParamRef.current = null;
        setSelectedFinding(null);
        if (selectedFindingId !== null) {
          setSelectedFindingId(null);
        }
        return;
      }

      const cleanParam = currentParam.trim();
      const decodedParam = decodeURIComponent(cleanParam);
      const match = findings.find(
        (f) =>
          f.id === cleanParam ||
          f.id === decodedParam ||
          (f.id && decodeURIComponent(f.id) === decodedParam) ||
          (f.fingerprint &&
            (f.fingerprint === cleanParam || f.fingerprint === decodedParam))
      );

      if (match && match.id !== lastSelectedIdRef.current) {
        lastSelectedIdRef.current = match.id;
        lastSyncedUrlParamRef.current = match.id;
        setSelectedFinding(match);
        if (selectedFindingId !== match.id) {
          setSelectedFindingId(match.id);
        }
        ensureFindingVisible(match);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [findings, selectedFindingId, setSelectedFindingId, ensureFindingVisible]);

  // Handle external Next.js router navigation into this page with findingId search param
  const urlFindingId = searchParams?.get('findingId') || searchParams?.get('finding');
  useEffect(() => {
    if (!urlFindingId || findings.length === 0) return;
    const cleanParam = urlFindingId.trim();
    const decodedParam = decodeURIComponent(cleanParam);

    // If urlFindingId has not changed from what Next.js router provided on page load or previous navigation,
    // then any divergence from lastSelectedIdRef is due to a local user click
    // (native replaceState updates address bar without updating useSearchParams). Preserve user click!
    if (urlFindingId === previousUrlFindingIdRef.current) {
      return;
    }

    // A genuine external navigation occurred with a changed URL finding parameter
    previousUrlFindingIdRef.current = urlFindingId;

    // If this URL param already matches our current selected finding, do nothing
    if (lastSelectedIdRef.current === cleanParam || lastSelectedIdRef.current === decodedParam) {
      return;
    }

    lastSyncedUrlParamRef.current = cleanParam;

    const match = findings.find(
      (f) =>
        f.id === cleanParam ||
        f.id === decodedParam ||
        (f.id && decodeURIComponent(f.id) === decodedParam) ||
        (f.fingerprint &&
          (f.fingerprint === cleanParam || f.fingerprint === decodedParam))
    );

    if (match) {
      lastSelectedIdRef.current = match.id;
      setSelectedFinding(match);
      if (selectedFindingId !== match.id) {
        setSelectedFindingId(match.id);
      }
      ensureFindingVisible(match);
    }
  }, [urlFindingId, findings, selectedFindingId, setSelectedFindingId, ensureFindingVisible]);

  const executeToggleReview = async (finding: Finding) => {
    if (updatingReviewId === finding.id) return;
    const targetId = finding.id;
    const previousFinding = { ...finding };
    const previousFindings = [...findings];
    const nextReviewed = !finding.reviewed;

    // Optimistic UI update
    const optimisticFinding: Finding = { ...finding, reviewed: nextReviewed };
    setFindings((prev) =>
      prev.map((f) => (f.id === targetId ? optimisticFinding : f))
    );
    if (selectedFinding?.id === targetId) {
      setSelectedFinding(optimisticFinding);
    }
    setUpdatingReviewId(targetId);
    setReviewMutationError(null);

    try {
      const res = await fetch(`/api/findings/${targetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewed: nextReviewed }),
      });
      if (res.ok) {
        const data = await res.json();
        const serverFinding: Finding = data.finding;
        setFindings((prev) =>
          prev.map((f) => (f.id === serverFinding.id ? serverFinding : f))
        );
        if (selectedFinding?.id === serverFinding.id) {
          setSelectedFinding(serverFinding);
        }
        showToast(
          nextReviewed ? 'Marked finding as reviewed' : 'Unmarked review status',
          'info'
        );
      } else if (res.status === 401) {
        setFindings(previousFindings);
        if (selectedFinding?.id === targetId) {
          setSelectedFinding(previousFinding);
        }
        setSessionExpired?.(true);
        openAuthModal?.({ initialMode: 'login' });
        showToast('Session expired — please sign in again', 'error');
      } else if (res.status === 403) {
        setFindings(previousFindings);
        if (selectedFinding?.id === targetId) {
          setSelectedFinding(previousFinding);
        }
        showToast('Responsible disclosure protocol: you do not have permission to modify this finding', 'info');
      } else if (res.status === 404) {
        setFindings(previousFindings);
        if (selectedFinding?.id === targetId) {
          setSelectedFinding(previousFinding);
        }
        showToast('This finding is from a previous scan — rescan the repository to refresh it', 'info');
      } else {
        const err = await res.json().catch(() => ({}));
        // Truthful rollback
        setFindings(previousFindings);
        if (selectedFinding?.id === targetId) {
          setSelectedFinding(previousFinding);
        }
        setReviewMutationError({
          findingId: targetId,
          message: err.error || 'Failed to update review status on server. Reverted state.',
          retry: () => executeToggleReview(previousFinding),
        });
        showToast(err.error || 'Failed to update review status; reverted', 'error');
      }
    } catch {
      // Truthful rollback
      setFindings(previousFindings);
      if (selectedFinding?.id === targetId) {
        setSelectedFinding(previousFinding);
      }
      setReviewMutationError({
        findingId: targetId,
        message: 'Network error updating review status. Reverted state.',
        retry: () => executeToggleReview(previousFinding),
      });
      showToast('Error connecting to review API; reverted state', 'error');
    } finally {
      setUpdatingReviewId(null);
    }
  };

  const handleToggleReview = (finding: Finding) => {
    if (finding.reviewed) {
      setSingleFindingToUnmark(finding);
    } else {
      executeToggleReview(finding);
    }
  };

  const handleCopyEvidence = async (text?: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedEvidence(true);
      showToast('Evidence snippet copied to clipboard', 'info');
      setTimeout(() => setCopiedEvidence(false), 2000);
    } catch {
      showToast('Unable to copy evidence snippet', 'error');
    }
  };

  const handleCopyHash = async (hash?: string) => {
    if (!hash) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopiedHash(true);
      showToast('Evidence SHA-256 hash copied to clipboard', 'info');
      setTimeout(() => setCopiedHash(false), 2000);
    } catch {
      showToast('Unable to copy SHA-256 hash', 'error');
    }
  };

  const handleRequestExplanation = async (finding: Finding) => {
    if (!finding || explainingId) return;
    setExplainingId(finding.id);
    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: finding.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setCurrentExplanation(data.explanation);
        showToast('Grounded explanation generated', 'success');
      } else if (res.status === 401) {
        setSessionExpired?.(true);
        openAuthModal?.({ initialMode: 'login' });
        showToast('Session expired — please sign in again', 'error');
      } else if (res.status === 403) {
        showToast('Responsible disclosure protocol: secrets and critical findings must not be shared publicly.', 'info');
      } else if (res.status === 404) {
        showToast('This finding is from a previous scan — rescan the repository to refresh it', 'info');
      } else {
        showToast(data.error || 'Failed to explain finding', 'error');
      }
    } catch {
      showToast('Network error while requesting explanation', 'error');
    } finally {
      setExplainingId(null);
    }
  };

  const handleCreateRoute = async (finding: Finding) => {
    if (!finding || creatingRouteId) return;
    setCreatingRouteId(finding.id);
    try {
      const res = await fetch('/api/routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingId: finding.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast('Contribution route created!', 'success');
        router.push(`/app/contributions?routeId=${data.route.id}`);
      } else if (res.status === 401) {
        setSessionExpired?.(true);
        openAuthModal?.({ initialMode: 'login' });
        showToast('Session expired — please sign in again', 'error');
      } else if (res.status === 403) {
        showToast('Responsible disclosure protocol: secrets and critical findings must not be shared publicly.', 'info');
      } else if (res.status === 404) {
        showToast('This finding is from a previous scan — rescan the repository to refresh it', 'info');
      } else {
        showToast(data.error || 'Failed to create route', 'error');
      }
    } catch {
      showToast('Network error while creating route', 'error');
    } finally {
      setCreatingRouteId(null);
    }
  };

  // Single source of truth client filter matching server-side logic
  const filteredFindings = useMemo(() => {
    return findings.filter((f) => {
      // 1. Severity filter
      if (severityFilter && severityFilter !== 'ALL') {
        const sev = (f.severity || '').toString().trim().toUpperCase();
        if (sev !== severityFilter.toUpperCase()) return false;
      }

      // 2. Category filter (supports singular/plural aliases)
      if (categoryFilter && categoryFilter !== 'all') {
        const cat = (f.category || '').toString().trim().toLowerCase();
        const target = categoryFilter.toLowerCase();
        const matchesCategory =
          target === 'actions' || target === 'github-actions' || target === 'workflow'
            ? cat === 'github-actions' || cat === 'actions' || cat === 'workflow'
            : target === 'dependency' || target === 'dependencies'
            ? cat === 'dependency' || cat === 'dependencies'
            : target === 'secret' || target === 'secrets'
            ? cat === 'secret' || cat === 'secrets'
            : target === 'health' || target === 'repository-health'
            ? cat === 'repository-health' || cat === 'health'
            : cat === target;
        if (!matchesCategory) return false;
      }

      // 3. Readiness filter
      if (readinessFilter && readinessFilter !== 'ALL') {
        const rawLabel = (f.readiness?.label || '').toString().trim().toLowerCase().replace(/_/g, '-');
        const targetLabel = readinessFilter.toLowerCase().replace(/_/g, '-');
        if (rawLabel !== targetLabel) return false;
      }

      // 4. Diff Status filter
      if (diffFilter && diffFilter !== 'ALL') {
        const ds = (f.diffStatus || 'new').toString().trim().toLowerCase().replace(/_/g, '-');
        const targetDiff = diffFilter.toLowerCase().replace(/_/g, '-');
        if (ds !== targetDiff) return false;
      }

      // 5. Text search query
      if (debouncedSearchQuery && debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.trim().toLowerCase();
        const title = (f.title || '').toLowerCase();
        const file = (f.file || '').toLowerCase();
        const rid = (f.ruleId || '').toLowerCase();
        const impact = (f.impact || '').toLowerCase();
        const evidence = (f.evidence || f.redactedEvidence || '').toLowerCase();
        const fixHint = (f.fixHint || '').toLowerCase();
        const matchesQuery =
          title.includes(q) ||
          file.includes(q) ||
          rid.includes(q) ||
          impact.includes(q) ||
          evidence.includes(q) ||
          fixHint.includes(q);
        if (!matchesQuery) return false;
      }

      // 6. Rule ID filter
      if (ruleIdFilter && ruleIdFilter !== 'ALL') {
        const rLower = ruleIdFilter.trim().toLowerCase();
        const rid = (f.ruleId || '').toLowerCase();
        const matchesRule = rid === rLower || rid.includes(rLower);
        if (!matchesRule) return false;
      }

      // 7. File path filter (contains)
      if (debouncedFilePathFilter && debouncedFilePathFilter.trim()) {
        const fp = debouncedFilePathFilter.trim().toLowerCase();
        const filePath = (f.file || '').toLowerCase();
        if (!filePath.includes(fp)) return false;
      }

      // 8. Status filter
      if (statusFilter && statusFilter !== 'all') {
        if (statusFilter === 'open') {
          if (f.reviewed || f.status === 'resolved' || f.diffStatus === 'resolved' || f.status === 'dismissed') {
            return false;
          }
        } else if (statusFilter === 'approved' || statusFilter === 'reviewed') {
          if (!f.reviewed) return false;
        } else if (statusFilter === 'dismissed' || statusFilter === 'resolved') {
          if (f.status !== 'resolved' && f.diffStatus !== 'resolved' && f.status !== 'dismissed') {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    findings,
    severityFilter,
    categoryFilter,
    readinessFilter,
    diffFilter,
    debouncedSearchQuery,
    ruleIdFilter,
    debouncedFilePathFilter,
    statusFilter,
  ]);

  // Selection helpers: Header select-all / partial indeterminate calculation
  const allFilteredSelected = useMemo(() => {
    return (
      filteredFindings.length > 0 &&
      filteredFindings.every((f) => selectedFindingIds.has(f.id))
    );
  }, [filteredFindings, selectedFindingIds]);

  const someFilteredSelected = useMemo(() => {
    return (
      filteredFindings.some((f) => selectedFindingIds.has(f.id)) &&
      !allFilteredSelected
    );
  }, [filteredFindings, selectedFindingIds, allFilteredSelected]);

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someFilteredSelected;
    }
  }, [someFilteredSelected]);

  const handleToggleSelectFinding = useCallback((findingId: string) => {
    setSelectedFindingIds((prev) => {
      const next = new Set(prev);
      if (next.has(findingId)) {
        next.delete(findingId);
      } else {
        next.add(findingId);
      }
      return next;
    });
  }, []);

  const handleToggleSelectAll = useCallback(() => {
    if (allFilteredSelected) {
      // Deselect all filtered findings
      setSelectedFindingIds((prev) => {
        const next = new Set(prev);
        filteredFindings.forEach((f) => next.delete(f.id));
        return next;
      });
    } else {
      // Select all filtered findings
      setSelectedFindingIds((prev) => {
        const next = new Set(prev);
        filteredFindings.forEach((f) => next.add(f.id));
        return next;
      });
    }
  }, [allFilteredSelected, filteredFindings]);

  // Bulk action execution with batched sequential calls and honest partial-failure handling
  const executeBulkReview = async (markReviewed: boolean, targetIds?: string[]) => {
    const idsToRun = targetIds || Array.from(selectedFindingIds);
    if (idsToRun.length === 0 || isBulkOperating) return;

    setIsBulkOperating(true);
    setBulkResultSummary(null);
    const actionName = markReviewed ? 'Approve' : 'Unmark Review';
    const total = idsToRun.length;

    let successCount = 0;
    const failedIds: string[] = [];
    const updatedMap = new Map<string, Finding>();

    for (let i = 0; i < idsToRun.length; i++) {
      const id = idsToRun[i];
      setBulkProgress({ current: i + 1, total, actionName });

      try {
        const res = await fetch(`/api/findings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reviewed: markReviewed }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.finding) {
            updatedMap.set(id, data.finding);
            successCount++;
          } else {
            failedIds.push(id);
          }
        } else {
          failedIds.push(id);
        }
      } catch (err) {
        console.warn(`Bulk approve failed for item ${id}:`, err);
        failedIds.push(id);
      }
    }

    // Apply all successful updates to findings list
    if (updatedMap.size > 0) {
      setFindings((prev) =>
        prev.map((f) => (updatedMap.has(f.id) ? updatedMap.get(f.id)! : f))
      );
      if (selectedFinding && updatedMap.has(selectedFinding.id)) {
        setSelectedFinding(updatedMap.get(selectedFinding.id)!);
      }
    }

    // Retain only failed items selected for retry
    setSelectedFindingIds(new Set(failedIds));
    setIsBulkOperating(false);
    setBulkProgress(null);

    if (failedIds.length > 0) {
      setBulkResultSummary({
        actionName,
        successCount,
        failedCount: failedIds.length,
        failedIds,
        actionType: markReviewed ? 'approve' : 'unmark',
      });
      showToast(
        `${successCount} ${markReviewed ? 'approved' : 'unmarked'}, ${failedIds.length} failed — retry`,
        'error'
      );
    } else {
      setBulkResultSummary(null);
      showToast(
        `${successCount} finding${successCount === 1 ? '' : 's'} successfully ${
          markReviewed ? 'approved' : 'unmarked'
        }`,
        'success'
      );
    }
    // Refresh filtered query after bulk review updates
    fetchFindings();
  };

  const executeBulkDismiss = async (dismiss: boolean, targetIds?: string[]) => {
    const idsToRun = targetIds || Array.from(selectedFindingIds);
    if (idsToRun.length === 0 || isBulkOperating) return;

    setIsBulkOperating(true);
    setBulkResultSummary(null);
    const actionName = dismiss ? 'Dismiss' : 'Restore';
    const total = idsToRun.length;

    let successCount = 0;
    const failedIds: string[] = [];
    const updatedMap = new Map<string, Finding>();

    for (let i = 0; i < idsToRun.length; i++) {
      const id = idsToRun[i];
      setBulkProgress({ current: i + 1, total, actionName });

      try {
        const res = await fetch(`/api/findings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: dismiss ? 'dismissed' : 'open' }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.finding) {
            updatedMap.set(id, data.finding);
            successCount++;
          } else {
            failedIds.push(id);
          }
        } else {
          failedIds.push(id);
        }
      } catch (err) {
        console.warn(`Bulk approve failed for item ${id}:`, err);
        failedIds.push(id);
      }
    }

    if (updatedMap.size > 0) {
      setFindings((prev) =>
        prev.map((f) => (updatedMap.has(f.id) ? updatedMap.get(f.id)! : f))
      );
      if (selectedFinding && updatedMap.has(selectedFinding.id)) {
        setSelectedFinding(updatedMap.get(selectedFinding.id)!);
      }
    }

    setSelectedFindingIds(new Set(failedIds));
    setIsBulkOperating(false);
    setBulkProgress(null);

    if (failedIds.length > 0) {
      setBulkResultSummary({
        actionName,
        successCount,
        failedCount: failedIds.length,
        failedIds,
        actionType: 'dismiss',
      });
      showToast(
        `${successCount} ${dismiss ? 'dismissed' : 'restored'}, ${failedIds.length} failed — retry`,
        'error'
      );
    } else {
      setBulkResultSummary(null);
      showToast(
        `${successCount} finding${successCount === 1 ? '' : 's'} successfully ${
          dismiss ? 'dismissed' : 'restored'
        }`,
        'info'
      );
    }
    // Refresh filtered query after bulk dismiss updates
    fetchFindings();
  };

  // Aggregate count metrics
  const counts = useMemo(() => {
    const bySev: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
    let reviewed = 0;
    let goodFirst = 0;
    let maintainerAssistance = 0;
    let resolved = 0;

    findings.forEach((f) => {
      const sev = f.severity?.toUpperCase() || 'INFO';
      if (bySev[sev] !== undefined) bySev[sev]++;
      if (f.reviewed) reviewed++;

      const rLabel = f.readiness?.label;
      if (rLabel === 'good-first-contribution') goodFirst++;
      if (rLabel === 'maintainer-assistance') maintainerAssistance++;
      if (f.diffStatus === 'resolved') resolved++;
    });

    return { bySev, reviewed, goodFirst, maintainerAssistance, resolved, total: findings.length };
  }, [findings]);

  // Derived 3-depth explanation text for selected finding
  const explanationText = useMemo(() => {
    if (!selectedFinding) return '';
    if (selectedFinding.explanationModes?.[explanationMode]) {
      return selectedFinding.explanationModes[explanationMode];
    }
    const file = selectedFinding.file || 'Repository Root';
    if (explanationMode === 'beginner') {
      return `This finding identifies "${selectedFinding.title}" in \`${file}\`. Addressing this improves repository security posture and ensures clean standards. As an open-source contributor, you will inspect the file, apply the recommended action, and verify it locally before submitting a clean pull request.`;
    }
    if (explanationMode === 'developer') {
      return `Deterministic rule \`${selectedFinding.ruleId}\` flagged in \`${file}\` with verified severity **${selectedFinding.severity}**. Action required: ${selectedFinding.fixHint}. Validate changes locally using existing tests or linter checks.`;
    }
    return `Maintainer hygiene finding: **${selectedFinding.severity}** severity risk in \`${file}\`. Impact: ${selectedFinding.impact}. Requires strict adherence to disclosure policy and non-breaking regression boundaries.`;
  }, [selectedFinding, explanationMode]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full space-y-6 bg-transparent text-textPrimary overflow-x-hidden">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-borderDark">
        <div>
          <h1 className="text-2xl font-heading font-bold text-textPrimary flex items-center gap-2">
            <span>Verified Findings</span>
            {activeScan && (
              <span className="text-xs font-mono font-medium text-lemonChiffon bg-coffeeBean px-3 py-1 rounded-full border border-lemonChiffon/20">
                {activeScan.repoName}
              </span>
            )}
          </h1>
          <p className="text-xs text-textMuted mt-1">
            Deterministic security, manifest, and health findings with exact evidence, Contribution Readiness scoring, and grounded contributor trails.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start md:self-auto flex-wrap">
          {/* AI Suggestions Accessible Switch Toggle */}
          <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-full bg-blackHole/60 border border-borderDark text-xs font-medium text-textPrimary select-none">
            <Sparkles className={`w-3.5 h-3.5 transition-colors ${showSuggestions ? 'text-lemonChiffon' : 'text-textMuted'}`} aria-hidden="true" />
            <span id="ai-suggestions-toggle-label" className="text-xs font-medium text-textPrimary">
              AI Suggestions
            </span>
            <button
              type="button"
              role="switch"
              id="ai-suggestions-toggle"
              aria-checked={showSuggestions}
              aria-labelledby="ai-suggestions-toggle-label"
              onClick={handleToggleSuggestions}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon focus-visible:ring-offset-2 focus-visible:ring-offset-black press-spring touch-manipulation ${
                showSuggestions ? 'bg-lemonChiffon' : 'bg-blackHole border-borderDark'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-black shadow-lg ring-0 transition duration-200 ease-in-out ${
                  showSuggestions ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <button
            onClick={() => router.push('/app/scan')}
            className="min-h-[44px] px-5 py-2.5 rounded-full bg-blackHole hover:bg-blackHole/80 text-textPrimary border border-borderDark text-xs font-medium transition-colors self-start md:self-auto flex items-center justify-center press-spring touch-manipulation"
          >
            Scan Another Repo
          </button>
        </div>
      </div>

      {/* Beginner-Friendly AI Finding Suggestions (Grounded in Verified Scanner Results) */}
      {showSuggestions && (
        <AIFindingSuggestionsSection
          suggestions={suggestions}
          loading={suggestionsLoading}
          error={suggestionsError}
          onRetry={() => {
            if (activeScan?.id) {
              fetchSuggestions(activeScan.id);
            }
          }}
          isPartial={suggestionsIsPartial}
          totalFindings={suggestionsTotalFindings}
          hasScan={Boolean(activeScan)}
          onSelectFinding={handleSelectSuggestionFinding}
          onClose={() => {
            setShowSuggestions(false);
            if (suggestionsAbortControllerRef.current) {
              suggestionsAbortControllerRef.current.abort();
            }
            setSuggestionsLoading(false);
          }}
        />
      )}

      {/* Filter Toolbar with URL Sync, Debounced Inputs, and Active Filter Chips */}
      <div className="glass-panel p-4 sm:p-5 rounded-2xl border border-borderDark space-y-3.5">
        {/* Row 1: Search, File Path Filter & Active Filter Chips */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            {/* General Search */}
            <div className="w-full sm:w-72 relative shrink-0">
              <Search className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Search findings or rules..."
                aria-label="Search findings by title, rule ID, or impact"
                className="w-full min-h-[44px] pl-9 pr-11 py-2 bg-black/60 backdrop-blur-md border border-borderDark rounded-xl text-base sm:text-sm text-textPrimary placeholder:text-textTertiary focus:outline-none focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon"
              />
              {searchQuery && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {searchQuery !== debouncedSearchQuery && (
                    <span className="w-3 h-3 border-2 border-lemonChiffon border-t-transparent rounded-full animate-spin" title="Debouncing filter..." />
                  )}
                  <button
                    type="button"
                    onClick={() => handleSearchChange('')}
                    className="min-w-[44px] min-h-[44px] text-textMuted hover:text-textPrimary flex items-center justify-center press-spring touch-manipulation"
                    aria-label="Clear search query"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* File Path Contains Filter */}
            <div className="w-full sm:w-64 relative shrink-0">
              <FileCode className="w-4 h-4 text-textMuted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={filePathFilter}
                onChange={(e) => handleFilePathChange(e.target.value)}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="Filter by file path..."
                aria-label="Filter findings by file path substring"
                className="w-full min-h-[44px] pl-9 pr-11 py-2 bg-black/60 backdrop-blur-md border border-borderDark rounded-xl text-base sm:text-xs text-textPrimary placeholder:text-textTertiary focus:outline-none focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon font-mono"
              />
              {filePathFilter && (
                <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {filePathFilter !== debouncedFilePathFilter && (
                    <span className="w-3 h-3 border-2 border-lemonChiffon border-t-transparent rounded-full animate-spin" title="Debouncing file filter..." />
                  )}
                  <button
                    type="button"
                    onClick={() => handleFilePathChange('')}
                    className="min-w-[44px] min-h-[44px] text-textMuted hover:text-textPrimary flex items-center justify-center press-spring touch-manipulation"
                    aria-label="Clear file path filter"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Active Filter Chips & Clear All */}
          <div className="flex items-center gap-2 self-start lg:self-auto shrink-0 flex-wrap">
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 min-h-[44px] px-3 py-1.5 rounded-full bg-lemonChiffon/15 text-lemonChiffon border border-lemonChiffon/30 text-xs font-mono font-bold">
                  <Filter className="w-3.5 h-3.5" />
                  <span>{activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 text-textMuted hover:text-lemonChiffon border border-borderDark text-xs font-medium transition-colors flex items-center gap-1.5 press-spring touch-manipulation"
                  aria-label="Clear all active filters"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Clear all</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Row 2: Severity & Status Filters */}
        <div className="pt-2.5 border-t border-borderDark/40 flex flex-wrap items-center justify-between gap-3">
          {/* Severity Filter */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="toolbar" aria-label="Severity filter">
            <span className="text-xs text-textMuted font-medium flex items-center gap-1 shrink-0 mr-1">
              <Filter className="w-3.5 h-3.5" /> Severity:
            </span>
            {SEVERITY_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSeverityChange(s)}
                className={`min-h-[44px] px-3.5 py-1.5 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                  severityFilter === s
                    ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                    : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Status Filter: Open / Approved / Dismissed */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="toolbar" aria-label="Status filter">
            <span className="text-xs text-textMuted font-medium shrink-0 mr-1">Status:</span>
            {STATUS_OPTIONS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => handleStatusChange(st.id)}
                className={`min-h-[44px] px-3.5 py-1.5 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                  statusFilter === st.id
                    ? 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-semibold'
                    : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Row 3: Rule Type & Category Filters */}
        <div className="pt-2.5 border-t border-borderDark/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Category Filter */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5" role="toolbar" aria-label="Category filter">
            <span className="text-xs text-textMuted font-medium shrink-0 mr-1">Category:</span>
            {CATEGORY_OPTIONS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => handleCategoryChange(c.id)}
                className={`min-h-[44px] px-3.5 py-1.5 text-xs rounded-full font-medium transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                  categoryFilter === c.id
                    ? 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-semibold'
                    : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>

          {/* Rule Type Dropdown Filter */}
          <div className="flex items-center gap-2">
            <label htmlFor="rule-type-select" className="text-xs text-textMuted font-medium shrink-0">
              Rule Type:
            </label>
            <select
              id="rule-type-select"
              value={ruleIdFilter}
              onChange={(e) => handleRuleIdChange(e.target.value)}
              aria-label="Filter findings by rule type"
              className="min-h-[44px] px-3.5 py-2 bg-black/70 border border-borderDark rounded-xl text-xs text-lemonChiffon font-mono focus:outline-none focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon cursor-pointer"
            >
              <option value="ALL">All Rule Types {availableRuleIds.length > 0 ? `(${availableRuleIds.length})` : ''}</option>
              {availableRuleIds.map((rid) => (
                <option key={rid} value={rid}>
                  {rid}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 4: Contribution Readiness & Diff Status */}
        <div className="pt-2.5 border-t border-borderDark/40 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Readiness Filter */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-textMuted font-medium flex items-center gap-1 shrink-0 mr-1">
              <TrendingUp className="w-3.5 h-3.5 text-lemonChiffon" /> Readiness:
            </span>
            {READINESS_OPTIONS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => handleReadinessChange(r.id)}
                className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[11px] font-mono transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                  readinessFilter === r.id
                    ? 'bg-lemonChiffon text-black font-semibold shadow-sm'
                    : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {/* Diff Status Filter */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-textMuted font-medium flex items-center gap-1 shrink-0 mr-1">
              <GitCompare className="w-3.5 h-3.5 text-botticelli" /> Diff Status:
            </span>
            {DIFF_OPTIONS.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => handleDiffChange(d.id)}
                className={`min-h-[44px] px-3.5 py-1.5 rounded-full text-[11px] font-mono transition-colors shrink-0 flex items-center justify-center press-spring touch-manipulation ${
                  diffFilter === d.id
                    ? 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-semibold'
                    : 'text-textMuted hover:text-textPrimary bg-black/50 backdrop-blur-sm border border-borderDark'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        {/* Count Summary & Screen Reader Live Announcement */}
        <div className="pt-3 border-t border-borderDark/60 flex flex-wrap items-center justify-between text-xs text-textMuted gap-2">
          {/* Screen reader live announcement */}
          <div className="sr-only" role="status" aria-live="polite">
            Showing {filteredFindings.length} of {Math.max(totalScanFindings, counts.total, filteredFindings.length)} findings
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span>
              Showing <strong className="text-textPrimary">{filteredFindings.length}</strong> of{' '}
              <strong className="text-textPrimary">{Math.max(totalScanFindings, counts.total, filteredFindings.length)}</strong> findings
            </span>
            <span className="text-borderDark">•</span>
            <span className="text-emerald-400 font-medium">{counts.goodFirst} Good First</span>
            <span className="text-red-300 font-medium">{counts.maintainerAssistance} Maintainer Assistance</span>
            <span className="text-borderDark">•</span>
            <span className="text-red-300 font-medium">{counts.bySev.CRITICAL} Critical</span>
            <span className="text-electricTangerine font-medium">{counts.bySev.HIGH} High</span>
            <span className="text-lemonChiffon font-medium">{counts.bySev.MEDIUM} Medium</span>
            <span className="text-botticelli font-medium">{counts.bySev.LOW} Low</span>
          </div>

          <div className="flex items-center gap-3">
            <LastUpdatedBadge
              timestamp={activeScan?.scannedAt}
              onRefresh={fetchFindings}
              refreshing={loading}
              prefix="Scanned"
            />
            {counts.resolved > 0 && (
              <span className="text-blue-400 font-mono text-[11px]">
                {counts.resolved} Resolved
              </span>
            )}
            <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{counts.reviewed} Reviewed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Error State Banner */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-rosewood/25 border border-rosewood/60 text-sustainableLinen flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            onClick={fetchFindings}
            className="px-3 py-1 rounded-md bg-rosewood hover:bg-rosewood/80 text-white text-xs font-semibold flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Loading State with Content-Matching Skeleton */}
      {loading ? (
        showDelayedSkeleton ? (
          <FindingsListSkeleton />
        ) : null
      ) : filteredFindings.length > 0 ? (
        /* Master-Detail Split Layout (P8 Task 1: list left, detail right, stack on <lg without horizontal overflow) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left: Accessible Finding List (Col span 5) */}
          <div className="lg:col-span-5 space-y-3 w-full overflow-x-hidden" role="region" aria-label="Findings List">
            
            {/* Bulk Selection Header */}
            <div className="glass-panel p-3 rounded-xl border border-borderDark flex flex-wrap items-center justify-between gap-3 text-xs">
              <label className="min-h-[44px] flex items-center gap-2.5 cursor-pointer select-none touch-manipulation">
                <input
                  ref={headerCheckboxRef}
                  type="checkbox"
                  id="findings-select-all"
                  name="selectAllFindings"
                  checked={allFilteredSelected}
                  onChange={handleToggleSelectAll}
                  aria-label="Select or deselect all filtered findings"
                  className="w-4 h-4 rounded border-borderDark bg-black text-lemonChiffon focus:ring-1 focus:ring-lemonChiffon cursor-pointer touch-manipulation"
                />
                <span className="font-semibold text-sustainableLinen text-xs">
                  Select all ({filteredFindings.length})
                </span>
              </label>

              <div className="flex items-center gap-2">
                {selectedFindingIds.size > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-lemonChiffon/15 border border-lemonChiffon/30 font-mono text-[11px] text-lemonChiffon font-bold">
                    {selectedFindingIds.size} selected
                  </span>
                )}
                <span className="text-[11px] text-textMuted uppercase font-mono">
                  {filteredFindings.length} items
                </span>
              </div>
            </div>

            {/* Bulk Action Bar (Visible when items selected) */}
            {selectedFindingIds.size > 0 && (
              <div
                role="region"
                aria-label="Bulk actions toolbar"
                className="max-w-full p-3.5 rounded-xl bg-blackHole border border-lemonChiffon/40 shadow-liquid-glow space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150"
              >
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-lemonChiffon shrink-0" />
                    <span className="text-xs font-bold text-sustainableLinen">
                      {selectedFindingIds.size} selected
                    </span>
                    {bulkProgress && (
                      <span className="text-[11px] font-mono text-lemonChiffon flex items-center gap-1.5 ml-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>
                          {bulkProgress.actionName} {bulkProgress.current} of {bulkProgress.total}...
                        </span>
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Bulk Action 1: Approve Selected */}
                    <button
                      type="button"
                      onClick={() => executeBulkReview(true)}
                      disabled={isBulkOperating}
                      className="min-h-[44px] px-4 py-2 rounded-xl bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50 press-spring touch-manipulation"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-black" />
                      <span>Approve Selected</span>
                    </button>

                    {/* Bulk Action 2: Unmark Selected (Destructive Confirmation) */}
                    <button
                      type="button"
                      onClick={() => setShowUnmarkConfirm(true)}
                      disabled={isBulkOperating}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/60 hover:bg-rosewood/30 border border-rosewood/50 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 press-spring touch-manipulation"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-red-400" />
                      <span>Unmark Selected</span>
                    </button>

                    {/* Bulk Action 3: Dismiss Selected (Destructive Confirmation) */}
                    <button
                      type="button"
                      onClick={() => setShowDismissConfirm(true)}
                      disabled={isBulkOperating}
                      className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/60 hover:bg-rosewood/30 border border-rosewood/50 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-all disabled:opacity-50 press-spring touch-manipulation"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-red-400" />
                      <span>Dismiss Selected</span>
                    </button>

                    {/* Deselect All */}
                    <button
                      type="button"
                      onClick={() => setSelectedFindingIds(new Set())}
                      disabled={isBulkOperating}
                      className="min-h-[44px] px-3 py-2 rounded-xl text-xs text-textMuted hover:text-sustainableLinen transition-colors disabled:opacity-50 press-spring touch-manipulation flex items-center justify-center"
                      title="Clear selection"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Truthful Bulk Result Summary Alert (Partial failure handling with retry) */}
            {bulkResultSummary && bulkResultSummary.failedCount > 0 && (
              <div
                role="alert"
                className="p-3.5 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-sustainableLinen flex flex-wrap items-center justify-between gap-3 animate-fade-in"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>
                    <strong>{bulkResultSummary.successCount}</strong> {bulkResultSummary.actionType === 'approve' ? 'approved' : 'unmarked'},{' '}
                    <strong className="text-red-300">{bulkResultSummary.failedCount}</strong> failed — retry
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      executeBulkReview(
                        bulkResultSummary.actionType === 'approve',
                        bulkResultSummary.failedIds
                      )
                    }
                    disabled={isBulkOperating}
                    className="min-h-[44px] px-4 py-2 rounded-full bg-lemonChiffon text-black text-xs font-bold hover:bg-sustainableLinen transition-colors disabled:opacity-50 press-spring touch-manipulation flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry Failed ({bulkResultSummary.failedCount})</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkResultSummary(null)}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-textMuted hover:text-white touch-manipulation"
                    aria-label="Dismiss summary banner"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            <ul role="list" className="space-y-2.5 max-h-[780px] overflow-y-auto pr-1 no-scrollbar">
              {filteredFindings.map((finding) => {
                const rowId =
                  finding.id ||
                  finding.fingerprint ||
                  `${finding.ruleId || 'GEN'}-${finding.file || 'root'}-${finding.lineStart || finding.line || 0}`;
                const isSelected = selectedFinding?.id === finding.id || selectedFinding?.id === rowId;
                const isChecked = selectedFindingIds.has(finding.id) || selectedFindingIds.has(rowId);
                return (
                  <FindingRowItem
                    key={finding.id || rowId}
                    finding={finding}
                    rowId={rowId}
                    isSelected={isSelected}
                    isChecked={isChecked}
                    onSelect={handleSelectFinding}
                    onToggleSelect={handleToggleSelectFinding}
                  />
                );
              })}
            </ul>
          </div>

          {/* Right: Finding Detail Panel (Col span 7) */}
          <div className="lg:col-span-7 w-full overflow-x-hidden">
            {selectedFinding ? (
              <div
                id="finding-detail-panel"
                className={`glass-panel p-5 sm:p-8 rounded-2xl border transition-all space-y-6 break-words ${
                  selectedFinding.severity?.toUpperCase() === 'CRITICAL'
                    ? 'border-rosewood/70 bg-rosewood/10 shadow-md'
                    : selectedFinding.severity?.toUpperCase() === 'HIGH'
                    ? 'border-electricTangerine/40 bg-coffeeBean/40'
                    : 'border-borderDark'
                }`}
              >
                
                {/* Header: Title, Category, Severity Badge, Rule ID, Confidence, Disclosure Label, Review Toggle */}
                <div className="space-y-3 pb-4 border-b border-borderDark">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={selectedFinding.severity} />

                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-black border border-borderDark text-textMuted uppercase font-mono">
                        {selectedFinding.category || 'general'}
                      </span>

                      <span className="text-[11px] font-mono text-lemonChiffon bg-blackHole px-2 py-0.5 rounded border border-borderDark">
                        Rule: {selectedFinding.ruleId || 'GENERIC-SECURITY-RULE'}
                      </span>

                      <span className="text-[11px] font-mono text-textMuted bg-blackHole px-2 py-0.5 rounded border border-borderDark">
                        Confidence:{' '}
                        {typeof selectedFinding.confidence === 'number'
                          ? `${Math.round(selectedFinding.confidence * 100)}%`
                          : selectedFinding.confidence || 'HIGH'}
                      </span>

                      {/* P8 Task 2: Disclosure label */}
                      <DisclosureLabel
                        mode={selectedFinding.disclosureMode}
                        category={selectedFinding.category}
                      />

                      {selectedFinding.diffStatus && (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold border ${getDiffStatusBadge(selectedFinding.diffStatus)}`}>
                          Diff: {selectedFinding.diffStatus}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Review State Toggle Button */}
                      <button
                        type="button"
                        onClick={() => handleToggleReview(selectedFinding)}
                        disabled={updatingReviewId === selectedFinding.id}
                        className={`min-h-[44px] px-3.5 py-2 inline-flex items-center gap-1.5 rounded-xl text-xs font-semibold border transition-all press-spring touch-manipulation ${
                          selectedFinding.reviewed
                            ? 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50 hover:bg-emerald-900/60'
                            : 'bg-white/5 text-textMuted border-borderDark hover:text-lemonChiffon hover:border-lemonChiffon/30'
                        }`}
                      >
                        {updatingReviewId === selectedFinding.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : selectedFinding.reviewed ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <span className="w-1.5 h-1.5 rounded-full bg-textMuted" />
                        )}
                        <span>{selectedFinding.reviewed ? 'Reviewed ✓' : 'Mark as Reviewed'}</span>
                      </button>

                      {/* Dismiss / Restore Finding (Soft delete / archive semantics) */}
                      {selectedFinding.status === 'dismissed' ? (
                        <button
                          type="button"
                          onClick={() => executeBulkDismiss(false, [selectedFinding.id])}
                          disabled={isBulkOperating}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 text-xs font-semibold flex items-center gap-1.5 transition-colors press-spring touch-manipulation"
                          title="Restore finding to active list"
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-lemonChiffon" />
                          <span>Restore</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSingleFindingToDismiss(selectedFinding)}
                          disabled={isBulkOperating}
                          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-black/60 hover:bg-rosewood/20 border border-rosewood/40 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors press-spring touch-manipulation"
                          title="Dismiss finding from active reports"
                        >
                          <EyeOff className="w-3.5 h-3.5 text-red-400" />
                          <span>Dismiss</span>
                        </button>
                      )}

                      {/* Deep Link to Dedicated Detail Page */}
                      <Link
                        href={`/app/findings/${encodeURIComponent(selectedFinding.id)}`}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-textMuted hover:text-lemonChiffon hover:bg-black/40 border border-borderDark transition-colors press-spring touch-manipulation"
                        title="Open finding deep link in dedicated page"
                        aria-label="Open finding deep link in dedicated page"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Link>

                      {/* Close / Deselect Control */}
                      <button
                        type="button"
                        onClick={() => {
                          lastSelectedIdRef.current = null;
                          lastSyncedUrlParamRef.current = null;
                          setSelectedFinding(null);
                          setSelectedFindingId(null);
                          syncFiltersToUrl({ findingId: null });
                        }}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center p-2 rounded-xl text-textMuted hover:text-white hover:bg-black/40 border border-borderDark transition-colors press-spring touch-manipulation"
                        title="Close detail panel"
                        aria-label="Close detail panel"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Error on Review Mutation Failure with Honest Rollback & Retry */}
                  {reviewMutationError && reviewMutationError.findingId === selectedFinding.id && (
                    <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                        <span>{reviewMutationError.message}</span>
                      </div>
                      <button
                        type="button"
                        onClick={reviewMutationError.retry}
                        className="px-3 py-1 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring"
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  <h3 className="text-lg font-heading font-bold text-textPrimary leading-snug">
                    {selectedFinding.title}
                  </h3>

                  {/* P8 Task 2: file:line and copyable SHA-256 evidenceHash */}
                  <div className="p-3.5 rounded-xl bg-black border border-borderDark space-y-2 text-xs font-mono">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-botticelli">
                      <div className="flex items-center gap-2 truncate">
                        <FileCode className="w-4 h-4 text-lemonChiffon shrink-0" />
                        <span>Exact Location: </span>
                        <strong className="text-textPrimary truncate">
                          {selectedFinding.file || 'Repository Root'}
                          {(selectedFinding.lineStart || selectedFinding.line) && (
                            <span className="text-lemonChiffon ml-1">
                              :{selectedFinding.lineStart || selectedFinding.line}
                              {selectedFinding.lineEnd &&
                              selectedFinding.lineEnd !== (selectedFinding.lineStart || selectedFinding.line)
                                ? `-${selectedFinding.lineEnd}`
                                : ''}
                            </span>
                          )}
                        </strong>
                      </div>
                      <span className="text-[10px] text-textMuted uppercase font-mono px-2 py-0.5 rounded bg-blackHole border border-borderDark shrink-0 self-start sm:self-auto">
                        {selectedFinding.sourceTool || 'Deterministic Engine'}
                      </span>
                    </div>

                    {/* Copyable SHA-256 evidenceHash */}
                    {selectedFinding.evidenceHash && (
                      <div className="pt-2 border-t border-platinumSilver/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 truncate text-textMuted">
                          <span className="text-lemonChiffon/80 uppercase tracking-wider font-semibold">SHA-256:</span>
                          <span className="text-platinumSilver font-mono truncate max-w-xs sm:max-w-md">
                            {selectedFinding.evidenceHash}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyHash(selectedFinding.evidenceHash)}
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

                {/* P8 Task 2: 3-line code context snippet (monospace, Botticelli-tinted) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-textMuted uppercase tracking-wider">
                      Verified Code Context (Redacted)
                    </span>
                    <span className="text-lemonChiffon text-[11px] flex items-center gap-1">
                      <Lock className="w-3 h-3" /> Secrets Redacted In-Memory
                    </span>
                  </div>

                  <CodeContextViewer
                    code={selectedFinding.redactedEvidence || selectedFinding.evidence}
                    file={selectedFinding.file}
                    lineStart={selectedFinding.lineStart || selectedFinding.line}
                    lineEnd={selectedFinding.lineEnd}
                    onCopy={() =>
                      handleCopyEvidence(
                        selectedFinding.redactedEvidence || selectedFinding.evidence
                      )
                    }
                    copied={copiedEvidence}
                  />

                  <p className="text-[10px] text-textMuted">
                    {selectedFinding.category === 'secret'
                      ? 'Credentials strictly redacted. Raw secret material is never logged or exposed.'
                      : 'Evidence extracted deterministically from scanned repository tree.'}
                  </p>
                </div>

                {/* P8 Task 3: Evidence Chain (8 Trust Steps) */}
                <EvidenceChainView evidenceHash={selectedFinding.evidenceHash} />

                {/* P8 Task 4: Engine label EVERYWHERE an explanation renders */}
                <div className="space-y-3 pt-2 border-t border-borderDark">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-lemonChiffon" />
                      <span className="text-xs font-bold text-textPrimary uppercase tracking-wider">
                        Grounded Explanation &amp; Guidance
                      </span>
                    </div>

                    {/* Mode Toggle Pills (Beginner / Developer / Maintainer) */}
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

                  {/* Engine Badge rendering active engine label + fallback notice */}
                  <EngineBadge
                    engine={currentExplanation?.generatedBy || (currentExplanation?.fallback ? 'deterministic' : (activeScan ? 'deterministic' : 'gemma'))}
                    fallback={currentExplanation?.fallback ?? (!currentExplanation || currentExplanation.generatedBy === 'deterministic')}
                    fallbackReason={currentExplanation?.fallbackReason || (!currentExplanation ? 'Deterministic perspective rules — verified evidence' : undefined)}
                  />

                  <div className="p-4 rounded-xl bg-black border border-borderDark space-y-2">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-semibold text-lemonChiffon capitalize">
                        {explanationMode} Perspective
                      </span>
                      <span className="text-textMuted font-mono text-[10px]">
                        Grounded in identical verified evidence
                      </span>
                    </div>
                    <p className="text-xs text-textPrimary leading-relaxed">
                      {explanationText}
                    </p>
                  </div>
                </div>

                {/* P8 Task 5: Skills Gap panel with Pale Lavender accents & impact score */}
                <SkillsGapPanel
                  skills={Array.isArray(selectedFinding.skills) ? selectedFinding.skills : []}
                  learningResources={Array.isArray(selectedFinding.learningResources) ? selectedFinding.learningResources : []}
                  difficulty={selectedFinding.readiness?.difficulty}
                  category={selectedFinding.category}
                  contributorImpact={15}
                />

                {/* Contribution Readiness & Risk Separation Section */}
                <div className="space-y-3 pt-2 border-t border-borderDark">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-lemonChiffon" />
                      <span>Contribution Readiness &amp; Risk Separation</span>
                    </span>
                    <span className="text-[10px] font-mono text-textMuted">
                      Deterministic Invariant: Urgency ≠ Readiness
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Urgency & Risk Card */}
                    <div className="p-4 rounded-xl bg-black border border-borderDark space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-textMuted uppercase tracking-wider font-semibold text-[10px]">
                          Risk / Urgency Score
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase bg-rosewood/20 text-sustainableLinen border border-rosewood/40">
                          {selectedFinding.urgencyLabel || 'medium'}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-mono text-electricTangerine">
                          {selectedFinding.urgencyScore ?? 50}
                        </span>
                        <span className="text-textMuted text-[10px] font-mono">/ 100</span>
                      </div>
                      <p className="text-[11px] text-textMuted leading-relaxed">
                        Urgency measures repository threat priority. Critical vulnerabilities must be fixed immediately by maintainers, NOT delegated to beginner contributors.
                      </p>
                    </div>

                    {/* Contribution Readiness Card */}
                    {selectedFinding.readiness ? (
                      <div className="p-4 rounded-xl bg-black border border-lemonChiffon/30 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-textMuted uppercase tracking-wider font-semibold text-[10px]">
                            Contribution Readiness
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${getReadinessBadge(selectedFinding.readiness?.label)}`}>
                            {selectedFinding.readiness?.label ? selectedFinding.readiness.label.replace(/-/g, ' ') : 'Standard Contribution'}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold font-mono text-lemonChiffon">
                            {selectedFinding.readiness?.total ?? 50}
                          </span>
                          <span className="text-textMuted text-[10px] font-mono">/ 100</span>
                          {selectedFinding.readiness?.estimatedMinutes && (
                            <span className="text-textMuted text-[10px] font-mono ml-auto">
                              ~{selectedFinding.readiness.estimatedMinutes} mins
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-lemonChiffon/80 leading-relaxed">
                          Readiness evaluates whether a new contributor can safely fix and test this finding with clear bounds.
                        </p>
                      </div>
                    ) : (
                      <div className="p-4 rounded-xl bg-black border border-borderDark flex items-center justify-center text-textMuted text-xs">
                        Readiness calculated during scan
                      </div>
                    )}
                  </div>

                  {/* 5-Factor Weighted Criteria Breakdown */}
                  {selectedFinding.readiness && (
                    <div className="p-4 rounded-xl bg-black border border-borderDark space-y-3">
                      <span className="text-[11px] font-semibold text-textMuted uppercase tracking-wider block">
                        5-Factor Deterministic Weighting
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-[11px]">
                        <div className="p-2 rounded-lg bg-blackHole border border-borderDark space-y-1">
                          <div className="text-textMuted text-[10px]">Clarity</div>
                          <div className="font-mono font-bold text-lemonChiffon">
                            {selectedFinding.readiness.evidenceClarity ?? 0} <span className="text-textMuted font-normal">/ 25</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-blackHole border border-borderDark space-y-1">
                          <div className="text-textMuted text-[10px]">Scope</div>
                          <div className="font-mono font-bold text-lemonChiffon">
                            {selectedFinding.readiness.scopeSimplicity ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-blackHole border border-borderDark space-y-1">
                          <div className="text-textMuted text-[10px]">Testability</div>
                          <div className="font-mono font-bold text-lemonChiffon">
                            {selectedFinding.readiness.testability ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-blackHole border border-borderDark space-y-1">
                          <div className="text-textMuted text-[10px]">Skill Accessibility</div>
                          <div className="font-mono font-bold text-lemonChiffon">
                            {selectedFinding.readiness.skillAccessibility ?? 0} <span className="text-textMuted font-normal">/ 20</span>
                          </div>
                        </div>
                        <div className="p-2 rounded-lg bg-blackHole border border-borderDark space-y-1">
                          <div className="text-textMuted text-[10px]">Context</div>
                          <div className="font-mono font-bold text-lemonChiffon">
                            {selectedFinding.readiness.contextCompleteness ?? 0} <span className="text-textMuted font-normal">/ 15</span>
                          </div>
                        </div>
                      </div>

                      {/* Reasons list */}
                      {Array.isArray(selectedFinding.readiness.reasons) && selectedFinding.readiness.reasons.length > 0 && (
                        <div className="pt-2 border-t border-borderDark/40 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-lemonChiffon font-semibold">Positive Indicators:</span>
                          <ul className="space-y-1">
                            {selectedFinding.readiness.reasons.map((r, i) => (
                              <li key={i} className="text-[11px] text-textMuted flex items-start gap-1.5">
                                <span className="text-emerald-400 mt-0.5">•</span>
                                <span>{r}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Blockers list */}
                      {Array.isArray(selectedFinding.readiness.blockers) && selectedFinding.readiness.blockers.length > 0 && (
                        <div className="pt-2 border-t border-borderDark/40 space-y-1">
                          <span className="text-[10px] font-mono uppercase text-red-300 font-semibold">Disclosure Blockers:</span>
                          <ul className="space-y-1">
                            {selectedFinding.readiness.blockers.map((b, i) => (
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

                {/* Suggested Action & Operational Impact */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-borderDark">
                  <div className="p-3.5 rounded-xl bg-black border border-borderDark text-xs text-textPrimary space-y-1">
                    <span className="font-semibold text-lemonChiffon block">Suggested Action</span>
                    <p className="text-textMuted leading-relaxed">
                      {selectedFinding.fixHint || 'Follow standard open-source contribution workflow to remediate this finding.'}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-black border border-borderDark text-xs text-textPrimary space-y-1">
                    <span className="font-semibold text-textMuted uppercase tracking-wider block">Impact Summary</span>
                    <p className="text-textMuted leading-relaxed">
                      {selectedFinding.impact || 'Addressing this finding improves repository security and code quality.'}
                    </p>
                  </div>
                </div>

                {/* Action Buttons: Explain with Gemma 4 & Create Contribution Route */}
                <div className="pt-4 flex flex-col sm:flex-row items-center gap-3 border-t border-borderDark">
                  <button
                    onClick={() => handleRequestExplanation(selectedFinding)}
                    disabled={explainingId === selectedFinding.id}
                    className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-full bg-coffeeBean hover:bg-coffeeBean/80 text-textPrimary border border-borderDark text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-50 press-spring touch-manipulation"
                  >
                    {explainingId === selectedFinding.id ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-electricTangerine" />
                        <span>Querying Grounded Explanation...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5 text-lemonChiffon" />
                        <span>Explain with Gemma 4</span>
                      </>
                    )}
                  </button>

                  {selectedFinding.disclosureMode === 'security-disclosure' ||
                  selectedFinding.category === 'secret' ? (
                    <div className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-full bg-rosewood/30 text-sustainableLinen border border-rosewood text-xs font-semibold flex items-center justify-center gap-2">
                      <Lock className="w-3.5 h-3.5 text-lemonChiffon" />
                      <span>Public Draft Blocked (Private Disclosure Only)</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleCreateRoute(selectedFinding)}
                      disabled={creatingRouteId === selectedFinding.id}
                      className="w-full sm:w-auto min-h-[44px] px-6 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md hover:shadow-lemonChiffon/20 disabled:opacity-50 press-spring touch-manipulation"
                    >
                      {creatingRouteId === selectedFinding.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Planning Route...</span>
                        </>
                      ) : (
                        <>
                          <Compass className="w-3.5 h-3.5" />
                          <span>Find Safe Contribution</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            ) : null}
          </div>

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
              ? 'Scan Not Found'
              : errorType === 'network_offline'
              ? 'Connection Lost'
              : 'Unable to Load Findings'
          }
          message={fetchError || 'An error occurred while loading verified findings.'}
          onRetry={fetchFindings}
          retrying={loading}
          secondaryAction={
            errorType === 'forbidden' || errorType === 'not_found'
              ? { label: 'Return to Dashboard', href: '/app/dashboard' }
              : undefined
          }
        />
      ) : (
        /* Empty State with distinct honest empty-after-filter state */
        totalScanFindings > 0 || activeFilterCount > 0 ? (
          <EmptyState
            icon={Filter}
            title="No findings match these filters"
            description="No deterministic findings match your current criteria (rule, file path, status, severity, or search query). Try clearing or loosening your filters."
            action={{
              label: 'Reset all filters',
              onClick: handleResetFilters,
            }}
            secondaryHint={
              totalScanFindings > 0
                ? `${totalScanFindings} total finding${totalScanFindings === 1 ? '' : 's'} available in this scan without filters.`
                : 'Try running a new scan or adjusting your search parameters.'
            }
          />
        ) : (
          <EmptyState
            icon={Shield}
            title="No supported deterministic findings detected"
            description="ContribLens analyzes bounded repository manifests, GitHub Actions workflows, repository governance, and exposed secrets. No supported deterministic issues were detected in this bounded scan."
            action={{ label: 'Scan Another Repository', href: '/app/scan' }}
            secondaryHint="All parsed manifests adhere to baseline deterministic hygiene policies."
          />
        )
      )}

      {/* Grounded Explanation Modal with EngineBadge */}
      {currentExplanation && selectedFinding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="max-w-2xl w-full glass-panel border border-borderDark rounded-2xl shadow-glass-card p-6 sm:p-8 space-y-5 animate-in zoom-in-95 duration-200">
            
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <EngineBadge
                    engine={currentExplanation.generatedBy || (currentExplanation.fallback ? 'deterministic' : 'gemma')}
                    fallback={currentExplanation.fallback}
                    fallbackReason={currentExplanation.fallbackReason}
                  />
                  <span className="text-xs text-botticelli capitalize font-mono">
                    {currentExplanation.difficulty} Track
                  </span>
                </div>
                <h3 className="text-lg font-heading font-bold text-textPrimary">{selectedFinding.title}</h3>
              </div>
              <button
                onClick={() => setCurrentExplanation(null)}
                className="text-textMuted hover:text-textPrimary p-1"
                aria-label="Close explanation modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-textPrimary">
              <div>
                <h4 className="font-heading font-semibold text-textMuted uppercase tracking-wider mb-1">
                  Educational Context
                </h4>
                <p className="leading-relaxed bg-black p-3.5 rounded-xl border border-borderDark">
                  {currentExplanation.explanation}
                </p>
              </div>

              <div>
                <h4 className="font-heading font-semibold text-textMuted uppercase tracking-wider mb-1">
                  Repository Risk
                </h4>
                <p className="leading-relaxed bg-black p-3.5 rounded-xl border border-borderDark">
                  {currentExplanation.riskContext}
                </p>
              </div>

              <div>
                <h4 className="font-heading font-semibold text-textMuted uppercase tracking-wider mb-1">
                  Step-by-Step Fix Guidance
                </h4>
                <p className="leading-relaxed bg-black p-3.5 rounded-xl border border-borderDark text-lemonChiffon">
                  {currentExplanation.recommendedFix}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-black border border-borderDark">
                  <span className="text-textMuted text-[10px] block mb-0.5">Estimated Time</span>
                  <span className="font-semibold text-textPrimary">{currentExplanation.estimatedEffort}</span>
                </div>
                <div className="p-3 rounded-xl bg-black border border-borderDark">
                  <span className="text-textMuted text-[10px] block mb-0.5">Required Skills</span>
                  <span className="font-semibold text-textPrimary">{currentExplanation.skillsNeeded.join(', ')}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-borderDark">
              <button
                onClick={() => setCurrentExplanation(null)}
                className="px-4 py-2 rounded-full bg-blackHole text-textPrimary text-xs font-semibold hover:bg-black transition-colors"
              >
                Close
              </button>
              {selectedFinding.disclosureMode !== 'security-disclosure' && selectedFinding.category !== 'secret' && (
                <button
                  onClick={() => {
                    const target = selectedFinding;
                    setCurrentExplanation(null);
                    handleCreateRoute(target);
                  }}
                  className="px-5 py-2 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Create Route from this Explanation</span>
                </button>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Destructive Action Confirmation Dialog 1: Unmark */}
      <ConfirmDialog
        isOpen={showUnmarkConfirm}
        title={`Unmark ${selectedFindingIds.size} Selected Finding${selectedFindingIds.size === 1 ? '' : 's'}?`}
        description={`Are you sure you want to remove review approval from ${selectedFindingIds.size} selected finding${selectedFindingIds.size === 1 ? '' : 's'}? This will reset their review state and audit history.`}
        consequenceWarning="Removing review approval returns these findings to an unreviewed state."
        confirmLabel={`Unmark ${selectedFindingIds.size} Finding${selectedFindingIds.size === 1 ? '' : 's'}`}
        cancelLabel="Keep Reviewed"
        isDestructive={true}
        isBusy={isBulkOperating}
        onConfirm={async () => {
          setShowUnmarkConfirm(false);
          await executeBulkReview(false);
        }}
        onCancel={() => setShowUnmarkConfirm(false)}
      />

      {/* Destructive Action Confirmation Dialog 2: Dismiss */}
      <ConfirmDialog
        isOpen={showDismissConfirm}
        title={`Dismiss ${selectedFindingIds.size} Selected Finding${selectedFindingIds.size === 1 ? '' : 's'}?`}
        description={`Dismiss ${selectedFindingIds.size} finding${selectedFindingIds.size === 1 ? '' : 's'}? This hides them from this scan's active report.`}
        consequenceWarning="Dismissed findings will be hidden from active contribution routes and default lists. You can view or restore them at any time using the Dismissed / Resolved filter."
        confirmLabel={`Dismiss ${selectedFindingIds.size} Finding${selectedFindingIds.size === 1 ? '' : 's'}`}
        cancelLabel="Keep Open"
        isDestructive={true}
        isBusy={isBulkOperating}
        onConfirm={async () => {
          setShowDismissConfirm(false);
          await executeBulkDismiss(true);
        }}
        onCancel={() => setShowDismissConfirm(false)}
      />

      {/* Destructive Action Confirmation Dialog 3: Single Finding Unmark */}
      <ConfirmDialog
        isOpen={Boolean(singleFindingToUnmark)}
        title="Unmark Finding as Reviewed?"
        description={`Are you sure you want to remove the reviewed status from "${singleFindingToUnmark?.title || 'this finding'}"?`}
        consequenceWarning="Removing review verification returns this finding to the unreviewed state in your workspace."
        confirmLabel="Unmark Review"
        cancelLabel="Keep Reviewed"
        isDestructive={true}
        isBusy={updatingReviewId === singleFindingToUnmark?.id}
        onConfirm={async () => {
          if (singleFindingToUnmark) {
            const target = singleFindingToUnmark;
            setSingleFindingToUnmark(null);
            await executeToggleReview(target);
          }
        }}
        onCancel={() => setSingleFindingToUnmark(null)}
      />

      {/* Destructive Action Confirmation Dialog 4: Single Finding Dismiss */}
      <ConfirmDialog
        isOpen={Boolean(singleFindingToDismiss)}
        title="Dismiss Finding?"
        description={`Dismiss "${singleFindingToDismiss?.title || 'this finding'}"? This hides it from this scan's active report.`}
        consequenceWarning="Dismissed findings will be hidden from active contribution routes and default lists. You can view or restore them at any time using the Dismissed / Resolved filter."
        confirmLabel="Dismiss Finding"
        cancelLabel="Keep Open"
        isDestructive={true}
        isBusy={isBulkOperating}
        onConfirm={async () => {
          if (singleFindingToDismiss) {
            const targetId = singleFindingToDismiss.id;
            setSingleFindingToDismiss(null);
            await executeBulkDismiss(true, [targetId]);
          }
        }}
        onCancel={() => setSingleFindingToDismiss(null)}
      />

    </div>
  );
}
