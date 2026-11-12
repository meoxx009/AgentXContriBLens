'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppContext';
import {
  Search,
  Shield,
  GitBranch,
  Loader2,
  AlertTriangle,
  ArrowRight,
  Lock,
  CheckCircle2,
  AlertCircle,
  GitCompare,
  Sparkles,
  RotateCw,
  ExternalLink,
  Terminal,
  X,
} from 'lucide-react';
import { ScanSummary, Finding } from '@/types';
import { GlassStepRail, SCAN_PIPELINE_STEPS } from '@/components/ui/GlassStepRail';
import { classifyError, FailureDetails } from '@/lib/scan-errors';
import { getScanNextSteps } from '@/lib/recommendations';
import { SCAN_MAX_TOTAL_MB } from '@/lib/scanner/limits';
import { ScanListSkeleton, useDelayedLoading } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';
import { useRepoUrlValidation } from '@/lib/debounce';
import { useFormValidation, ScanInputSchema, FormFieldError } from '@/lib/validation';
import { parseGitHubUrl } from '@/lib/scanner/github';

export function getCanonicalRepoId(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  const parsed = parseGitHubUrl(rawUrl);
  if (parsed) {
    return `${parsed.owner.toLowerCase()}/${parsed.repo.toLowerCase()}`;
  }
  return rawUrl
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
}

export function isSameRepository(repoA?: string | null, repoB?: string | null): boolean {
  if (!repoA || !repoB) return false;
  const keyA = getCanonicalRepoId(repoA);
  const keyB = getCanonicalRepoId(repoB);
  return Boolean(keyA && keyB && keyA === keyB);
}

type ScanStage =
  | 'idle'
  | 'validating'
  | 'fetching_tree'
  | 'parsing_manifests'
  | 'querying_osv'
  | 'auditing_actions'
  | 'scoring_readiness'
  | 'complete'
  | 'complete_with_warnings';

const STAGE_PROGRESS_INDEX: Record<ScanStage, number> = {
  idle: -1,
  validating: 0,
  fetching_tree: 1,
  parsing_manifests: 2,
  querying_osv: 3,
  auditing_actions: 4,
  scoring_readiness: 5,
  complete: 6,
  complete_with_warnings: 6,
};

const STAGE_LABELS: Record<ScanStage, string> = {
  idle: 'Ready to scan',
  validating: '1. Validating repository URL and access permissions...',
  fetching_tree: '2. Retrieving bounded repository tree (up to 60 configuration files max)...',
  parsing_manifests: '3. Parsing text configuration, manifests, and CI workflows...',
  querying_osv: '4. Enriching findings via OSV.dev batch vulnerability queries...',
  auditing_actions: '5. Auditing GitHub Actions security and least-privilege tokens...',
  scoring_readiness: '6. Computing deterministic contribution readiness score...',
  complete: 'Scan completed successfully with all checks verified.',
  complete_with_warnings: 'Scan completed with advisory warnings (e.g. files skipped due to size bounds).',
};

export default function ScanView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeScan, setActiveScan, showToast, refreshUser, setSessionExpired, openAuthModal } = useApp();

  const urlParam = searchParams.get('url') || searchParams.get('repositoryUrl') || searchParams.get('repoUrl') || '';
  const scanIdParam = searchParams.get('scanId') || '';

  const initialRepoUrl = urlParam || activeScan?.repoUrl || '';
  const initialBranch = activeScan && !urlParam ? (activeScan.branch || '') : '';
  const initialScope = activeScan && !urlParam ? (activeScan.scope || 'partial') : 'partial';

  const {
    values: formValues,
    errors: formErrors,
    setFieldValue,
    handleBlur: handleFormBlur,
    validateAll,
    applyServerErrors,
    clearErrors,
  } = useFormValidation({
    schema: ScanInputSchema,
    initialValues: {
      repositoryUrl: initialRepoUrl,
      branch: initialBranch,
      scope: initialScope,
    },
    idPrefix: 'scan',
  });

  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const repoValidation = useRepoUrlValidation(repoUrl, 400);
  const [branch, setBranch] = useState(initialBranch);
  const [scope, setScope] = useState<'partial' | 'deep'>(initialScope);
  const [scanning, setScanning] = useState(false);
  const [stage, setStage] = useState<ScanStage>('idle');
  const [failure, setFailure] = useState<FailureDetails | null>(null);

  // Category Checklist defaults all-on
  const [categories, setCategories] = useState({
    dependencies: true,
    actions: true,
    secrets: true,
    health: true,
  });

  // Hydrate current scan result immediately on mount from activeScan if no conflicting URL parameters
  const [scanResult, setScanResult] = useState<{
    scan: ScanSummary;
    findings: Finding[];
    hasWarnings?: boolean;
  } | null>(() => {
    if (activeScan && !urlParam && !scanIdParam) {
      return {
        scan: activeScan,
        findings: activeScan.findings || [],
        hasWarnings:
          activeScan.status === 'complete_with_warnings' ||
          Boolean(activeScan.warnings && activeScan.warnings.length > 0) ||
          (activeScan.scope === 'partial' && (activeScan.filesSkipped || 0) > 0),
      };
    }
    return null;
  });

  const [recentScans, setRecentScans] = useState<ScanSummary[]>([]);
  const [loadingRecentScans, setLoadingRecentScans] = useState(true);
  const showDelayedRecentScans = useDelayedLoading(loadingRecentScans, 150);
  const [refreshingRecentScans, setRefreshingRecentScans] = useState(false);
  const isRefreshingScansRef = useRef(false);
  const isScanningRef = useRef(false);
  const scanSeqRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const isUserClearedRef = useRef(false);
  const [recentScansError, setRecentScansError] = useState<{
    message: string;
    retry: () => void;
  } | null>(null);

  // Filter out the currently displayed scan from Previous Scans so it is never rendered twice
  const previousScans = useMemo(() => {
    const currentScanId = scanResult?.scan.id || activeScan?.id;
    if (!currentScanId) return recentScans;
    return recentScans.filter((s) => s.id !== currentScanId);
  }, [recentScans, scanResult?.scan.id, activeScan?.id]);

  // Explicit clear control: resets input, branch, activeScan, visible results and returns page to clean state
  const handleClearRepoInput = useCallback(() => {
    isUserClearedRef.current = true;
    setRepoUrl('');
    setFieldValue('repositoryUrl', '');
    setBranch('');
    setFieldValue('branch', '');
    setScanResult(null);
    setActiveScan(null);
    setFailure(null);
    clearErrors();
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [setFieldValue, setActiveScan, clearErrors]);

  // Handle repository URL change: switch to existing scan if available, or clear mismatched current scan
  const handleRepoUrlChange = useCallback((newUrl: string) => {
    isUserClearedRef.current = true;
    setRepoUrl(newUrl);
    setFieldValue('repositoryUrl', newUrl);
    if (failure) setFailure(null);

    if (!newUrl.trim()) {
      setScanResult(null);
      setActiveScan(null);
      clearErrors();
      return;
    }

    const newCanonical = getCanonicalRepoId(newUrl);
    const currentCanonical = getCanonicalRepoId(scanResult?.scan.repoUrl);

    // If still matching the currently rendered scan, keep it
    if (currentCanonical && newCanonical && currentCanonical === newCanonical) {
      return;
    }

    // If user switched to another repository that already has a scan in recentScans, show that repo's latest scan
    if (newCanonical) {
      const matchingScan = recentScans.find((s) => getCanonicalRepoId(s.repoUrl) === newCanonical);
      if (matchingScan) {
        setScanResult({
          scan: matchingScan,
          findings: matchingScan.findings || [],
          hasWarnings:
            matchingScan.status === 'complete_with_warnings' ||
            Boolean(matchingScan.warnings && matchingScan.warnings.length > 0) ||
            (matchingScan.scope === 'partial' && (matchingScan.filesSkipped || 0) > 0),
        });
        setBranch(matchingScan.branch || '');
        setFieldValue('branch', matchingScan.branch || '');
        if (matchingScan.scope) setScope(matchingScan.scope);
        setActiveScan(matchingScan);
        return;
      }
    }

    // Otherwise, clear visible current scan result so stale scan from another repo is not shown
    setScanResult(null);
  }, [failure, scanResult?.scan.repoUrl, recentScans, setFieldValue, setActiveScan, clearErrors]);

  // Synchronize repository and scan state when recentScans loads or when returning to page
  useEffect(() => {
    if (scanning) return;

    // Case 1: Specific scanId requested in URL
    if (scanIdParam) {
      const match = recentScans.find((s) => s.id === scanIdParam);
      if (match) {
        isUserClearedRef.current = false;
        setRepoUrl(match.repoUrl);
        setFieldValue('repositoryUrl', match.repoUrl);
        setBranch(match.branch || '');
        setFieldValue('branch', match.branch || '');
        if (match.scope) setScope(match.scope);
        setScanResult({
          scan: match,
          findings: match.findings || [],
          hasWarnings:
            match.status === 'complete_with_warnings' ||
            Boolean(match.warnings && match.warnings.length > 0) ||
            (match.scope === 'partial' && (match.filesSkipped || 0) > 0),
        });
        setActiveScan(match);
        return;
      }
    }

    // Case 2: Specific repo URL requested in URL
    if (urlParam) {
      const match = recentScans.find((s) => isSameRepository(s.repoUrl, urlParam));
      if (match) {
        isUserClearedRef.current = false;
        setRepoUrl(match.repoUrl);
        setFieldValue('repositoryUrl', match.repoUrl);
        setBranch(match.branch || '');
        setFieldValue('branch', match.branch || '');
        if (match.scope) setScope(match.scope);
        setScanResult({
          scan: match,
          findings: match.findings || [],
          hasWarnings:
            match.status === 'complete_with_warnings' ||
            Boolean(match.warnings && match.warnings.length > 0) ||
            (match.scope === 'partial' && (match.filesSkipped || 0) > 0),
        });
        setActiveScan(match);
        return;
      }
    }

    // Case 3: Returning from Findings or Live Agent without search params — ensure activeScan is restored
    if (!urlParam && !scanIdParam && activeScan) {
      if (isUserClearedRef.current) return;
      const currentScanId = scanResult?.scan.id;
      if (!currentScanId || currentScanId !== activeScan.id) {
        setRepoUrl(activeScan.repoUrl);
        setFieldValue('repositoryUrl', activeScan.repoUrl);
        setBranch(activeScan.branch || '');
        setFieldValue('branch', activeScan.branch || '');
        if (activeScan.scope) setScope(activeScan.scope);
        setScanResult({
          scan: activeScan,
          findings: activeScan.findings || [],
          hasWarnings:
            activeScan.status === 'complete_with_warnings' ||
            Boolean(activeScan.warnings && activeScan.warnings.length > 0) ||
            (activeScan.scope === 'partial' && (activeScan.filesSkipped || 0) > 0),
        });
      }
    }
  }, [scanIdParam, urlParam, activeScan, recentScans, scanning, setFieldValue, setActiveScan, scanResult?.scan.id]);

  // Lazily load full verified findings array if scanResult has empty findings but non-zero findingsCount
  useEffect(() => {
    if (!scanResult?.scan.id) return;
    if (scanResult.findings && scanResult.findings.length > 0) return;
    if ((scanResult.scan.findingsCount?.total || 0) === 0) return;

    let isSubscribed = true;
    fetch(`/api/findings?scanId=${encodeURIComponent(scanResult.scan.id)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isSubscribed && data && Array.isArray(data.findings) && data.findings.length > 0) {
          setScanResult((prev) => (prev && prev.scan.id === scanResult.scan.id ? { ...prev, findings: data.findings } : prev));
        }
      })
      .catch((err) => {
        console.debug('Failed to load findings for active scan:', err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [scanResult?.scan.id, scanResult?.findings, scanResult?.scan.findingsCount?.total]);

  // Clean up on unmount to cancel in-flight stale responses
  useEffect(() => {
    const seqRef = scanSeqRef;
    return () => {
      seqRef.current++;
    };
  }, []);

  const handleRefreshRecentScans = async () => {
    if (isRefreshingScansRef.current || refreshingRecentScans) return;
    isRefreshingScansRef.current = true;
    const previousScans = [...recentScans];
    setRefreshingRecentScans(true);
    setRecentScansError(null);

    try {
      const res = await fetch('/api/scans', { cache: 'no-store' });
      if (res.status === 401) {
        setSessionExpired(true);
        setRefreshingRecentScans(false);
        return;
      }
      if (res.ok) {
        const data = await res.json();
        setRecentScans(data.scans || []);
      } else {
        // Honest rollback on server error
        setRecentScans(previousScans);
        setRecentScansError({
          message: 'Failed to refresh recent scans. Restored previous scan list.',
          retry: () => handleRefreshRecentScans(),
        });
      }
    } catch {
      // Honest rollback on network failure
      setRecentScans(previousScans);
      setRecentScansError({
        message: 'Network error refreshing recent scans. Restored previous scan list.',
        retry: () => handleRefreshRecentScans(),
      });
    } finally {
      setRefreshingRecentScans(false);
      isRefreshingScansRef.current = false;
    }
  };

  const nextSteps = useMemo(() => {
    if (!scanResult?.findings || scanResult.findings.length === 0) return null;
    return getScanNextSteps(scanResult.findings);
  }, [scanResult]);

  const fetchRecentScans = useCallback(async () => {
    try {
      const res = await fetch('/api/scans');
      if (res.ok) {
        const data = await res.json();
        setRecentScans(data.scans || []);
        setRecentScansError(null);
      } else if (res.status === 401) {
        setSessionExpired(true);
        setRecentScansError({
          message: 'Your session has expired. Sign in again to view your saved scans.',
          retry: fetchRecentScans,
        });
      } else if (res.status === 404) {
        setRecentScans([]);
        setRecentScansError(null);
      } else {
        setRecentScansError({
          message: 'Unable to load recent repository scans. Please retry.',
          retry: fetchRecentScans,
        });
      }
    } catch {
      setRecentScansError({
        message: 'Network error loading recent scans. Please check your connection.',
        retry: fetchRecentScans,
      });
    } finally {
      setLoadingRecentScans(false);
    }
  }, [setSessionExpired]);

  useEffect(() => {
    fetchRecentScans();
  }, [fetchRecentScans]);

  const handleScan = async (eOrBranch?: React.FormEvent | string) => {
    if (isScanningRef.current || scanning) return;
    isScanningRef.current = true;
    const currentSeq = ++scanSeqRef.current;
    let targetBranch = branch.trim();
    if (eOrBranch && typeof eOrBranch !== 'string' && 'preventDefault' in eOrBranch) {
      eOrBranch.preventDefault();
    } else if (typeof eOrBranch === 'string') {
      targetBranch = eOrBranch.trim();
      setBranch(eOrBranch);
    }

    setFailure(null);
    setScanResult(null);

    const cleanUrl = repoUrl.trim();
    const validation = validateAll({
      repositoryUrl: cleanUrl,
      branch: targetBranch,
      scope,
    });
    if (!validation.isValid) {
      isScanningRef.current = false;
      const firstError = Object.values(validation.errors)[0];
      if (firstError) {
        setFailure(classifyError(firstError, 'GITHUB_INVALID_URL'));
      }
      return;
    }

    setScanning(true);
    setStage('validating');

    // Progression of state stages
    const timer1 = setTimeout(() => {
      if (scanSeqRef.current === currentSeq) setStage('fetching_tree');
    }, 600);
    const timer2 = setTimeout(() => {
      if (scanSeqRef.current === currentSeq) setStage('parsing_manifests');
    }, 1300);
    const timer3 = setTimeout(() => {
      if (scanSeqRef.current === currentSeq) setStage('querying_osv');
    }, 2100);
    const timer4 = setTimeout(() => {
      if (scanSeqRef.current === currentSeq) setStage('auditing_actions');
    }, 2900);
    const timer5 = setTimeout(() => {
      if (scanSeqRef.current === currentSeq) setStage('scoring_readiness');
    }, 3700);

    try {
      const selectedChecks = Object.entries(categories)
        .filter(([_, enabled]) => Boolean(enabled))
        .map(([cat]) => cat);

      const res = await fetch('/api/scans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          repositoryUrl: cleanUrl,
          repoUrl: cleanUrl,
          ref: targetBranch || undefined,
          branch: targetBranch || undefined,
          checks: selectedChecks,
          scope,
        }),
      });

      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);

      if (scanSeqRef.current !== currentSeq) {
        return;
      }

      const data = await res.json();

      if (scanSeqRef.current !== currentSeq) {
        return;
      }

      if (!res.ok) {
        if (res.status === 401) {
          setSessionExpired(true);
        }
        if (scanSeqRef.current !== currentSeq) {
          return;
        }
        setStage('idle');
        applyServerErrors(data);
        const failureObj = classifyError(
          data.error || 'Failed to scan repository.',
          data.errorCode,
          data.correlationId,
          data.resetTime,
          data.defaultBranch
        );
        setFailure(failureObj);
        return;
      }

      if (scanSeqRef.current !== currentSeq) {
        return;
      }
      if (!isSameRepository(cleanUrl, data.scan?.repoUrl)) {
        return;
      }
      isUserClearedRef.current = false;

      // Check if complete or complete_with_warnings per ROUTES_AND_STATES.md §4
      const filesSkipped = data.scan.filesSkipped || 0;
      const hasWarnings =
        (data.warnings && data.warnings.length > 0) ||
        (scope === 'partial' && filesSkipped > 0);

      setStage(hasWarnings ? 'complete_with_warnings' : 'complete');
      setScanResult({
        scan: data.scan,
        findings: data.findings || [],
        hasWarnings,
      });

      // P6 Contract: synchronize activeScan across views
      setActiveScan(data.scan);

      if (data.scan) {
        if (data.scan.branch) {
          setBranch(data.scan.branch);
        }
        setRecentScans((prev) => [data.scan, ...prev.filter((s) => s.id !== data.scan.id)]);
      }

      showToast(
        hasWarnings
          ? `Scan complete with advisory warnings (${data.findings?.length || 0} findings).`
          : `Scan complete: ${data.findings?.length || 0} findings verified.`,
        hasWarnings ? 'info' : 'success'
      );
    } catch (err: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
      clearTimeout(timer4);
      clearTimeout(timer5);

      if (scanSeqRef.current !== currentSeq) {
        return;
      }

      setStage('idle');
      const failureObj = classifyError(err.message || '');
      setFailure(failureObj);
    } finally {
      if (scanSeqRef.current === currentSeq) {
        setScanning(false);
        isScanningRef.current = false;
      }
    }
  };

  const handleQuickFill = (sampleUrl: string) => {
    isUserClearedRef.current = false;
    handleRepoUrlChange(sampleUrl);
    setBranch('');
    setFieldValue('branch', '');
    setFailure(null);
    clearErrors();
  };

  return (
    <div className="max-w-6xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Editorial Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-platinumSilver/15">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full liquid-chrome-pill text-[11px] font-mono text-platinumSilver mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-electricTangerine animate-pulse" />
            <span>Deterministic Scanner</span>
            <span className="text-platinumSilver/40">•</span>
            <span className="text-lemonChiffon">Zero Code Execution</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-heading font-extrabold text-textPrimary tracking-tight">
            Repository Security &amp; Contribution Scanner
          </h1>
          <p className="text-xs sm:text-sm text-platinumSilver/80 mt-1">
            Audit public repositories for dependency vulnerabilities, workflow misconfigurations, and beginner-ready PR plans.
          </p>
        </div>
      </div>

      {/* Safety Contract Callout */}
      <div className="p-4 rounded-2xl bg-black/60 border border-platinumSilver/15 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-electricTangerine/20 text-electricTangerine border border-electricTangerine/30 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <strong className="text-textPrimary block">Zero Code Execution Safety Contract</strong>
            <p className="text-[11px] text-platinumSilver/70">
              Read-only AST parsing · In-memory secret masking before storage/AI/logs · Ingestion bounded to 60 files / 15 MB max.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/5 border border-platinumSilver/20 text-botticelli">
            SHA-256 Grounded
          </span>
          <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/5 border border-platinumSilver/20 text-lemonChiffon">
            OSV.dev Verified
          </span>
        </div>
      </div>

      {/* Failure State Display with Safe Typed User Message + Correlation ID + Actions */}
      {failure && (
        <div className="liquid-glass-card p-5 sm:p-6 rounded-2xl border border-rosewood/60 bg-gradient-to-br from-rosewood/25 via-blackHole to-black space-y-4 shadow-md">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rosewood/40 border border-rosewood flex items-center justify-center text-red-300 shrink-0 mt-0.5">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div className="space-y-1.5 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-lemonChiffon uppercase tracking-wider">
                  Scan Failed ({failure.type.replace(/_/g, ' ')})
                </span>
                <span className="text-[10px] font-mono text-platinumSilver/60">
                  Ref: {failure.correlationId}
                </span>
              </div>
              <p className="text-xs text-textPrimary leading-relaxed">{failure.userMessage}</p>

              {failure.resetTime && (
                <p className="text-[11px] text-lemonChiffon/90 font-mono pt-1">
                  Estimated Rate Limit Reset: <strong>{new Date(failure.resetTime).toLocaleTimeString()} UTC</strong>
                </p>
              )}

              {/* Action Buttons preserving user input */}
              <div className="flex flex-wrap items-center gap-2.5 pt-3">
                {failure.type === 'auth_required' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        openAuthModal({
                          initialMode: 'login',
                          title: 'Sign In to Scan',
                          subtitle: 'Authentication is required to audit repositories and save PR plans.',
                          onSuccess: () => {
                            setFailure(null);
                            handleScan();
                          },
                        });
                      }}
                      className="min-h-[44px] px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-sm active:scale-95 press-spring touch-manipulation"
                    >
                      <span>Sign In to ContribLens</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {failure.type === 'branch_not_found' && failure.defaultBranch && (
                  <button
                    type="button"
                    onClick={() => {
                      const def = failure.defaultBranch || 'main';
                      setBranch(def);
                      setFailure(null);
                      handleScan(def);
                    }}
                    className="min-h-[44px] px-5 py-2.5 rounded-full bg-lemonChiffon text-black text-xs font-bold hover:bg-sustainableLinen transition-colors touch-manipulation press-spring"
                  >
                    Use default branch ({failure.defaultBranch})
                  </button>
                )}

                {failure.type !== 'auth_required' && (
                  <button
                    type="button"
                    onClick={() => {
                      setFailure(null);
                      handleScan();
                    }}
                    className="min-h-[44px] px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-glow-tangerine active:scale-95 touch-manipulation press-spring"
                  >
                    <RotateCw className="w-3.5 h-3.5" />
                    <span>Retry Scan (Preserving Input)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Scan Form */}
      <div className="liquid-glass-card p-6 sm:p-8 rounded-3xl space-y-6">
        <form onSubmit={handleScan} className="space-y-6">
          
          {/* Repository URL Input */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-bold text-textPrimary uppercase tracking-wider font-mono">
                GitHub Repository URL <span className="text-electricTangerine">*</span>
              </label>
              {repoValidation.status === 'valid' && (
                <span className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Valid repository format</span>
                </span>
              )}
              {repoValidation.status === 'invalid' && !repoValidation.isValidating && (
                <span className="text-[11px] font-mono text-red-400 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span>Invalid format</span>
                </span>
              )}
            </div>
            <div className="relative flex items-center">
              <input
                ref={inputRef}
                id="scan-repositoryUrl"
                name="repositoryUrl"
                type="text"
                inputMode="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={repoUrl}
                onChange={(e) => {
                  handleRepoUrlChange(e.target.value);
                }}
                onBlur={() => handleFormBlur('repositoryUrl')}
                aria-invalid={Boolean(formErrors.repositoryUrl || (repoValidation.status === 'invalid' && !repoValidation.isValidating))}
                aria-describedby="scan-repositoryUrl-error"
                placeholder="https://github.com/owner/repository or owner/repo"
                disabled={scanning}
                className={`w-full min-h-[48px] pl-11 pr-24 py-3 bg-black/60 backdrop-blur-md border rounded-2xl text-base sm:text-sm text-textPrimary placeholder:text-textTertiary focus:outline-none font-mono transition-colors shadow-inner ${
                  repoValidation.status === 'valid' && !formErrors.repositoryUrl
                    ? 'border-emerald-500/50 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400'
                    : (formErrors.repositoryUrl || (repoValidation.status === 'invalid' && !repoValidation.isValidating))
                    ? 'border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400'
                    : 'border-borderDark focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon'
                }`}
              />
              <Search className="w-5 h-5 text-textMuted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                {Boolean(repoUrl) && !scanning && (
                  <button
                    type="button"
                    data-testid="clear-repo-input-btn"
                    onClick={handleClearRepoInput}
                    aria-label="Clear repository URL"
                    title="Clear repository URL"
                    className="min-w-[44px] min-h-[44px] w-11 h-11 rounded-full text-platinumSilver/70 hover:text-sustainableLinen hover:bg-white/10 active:scale-95 transition-all flex items-center justify-center press-spring touch-manipulation"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                {repoValidation.status === 'valid' && !formErrors.repositoryUrl && (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 animate-fade-in pointer-events-none mr-1" />
                )}
                {(formErrors.repositoryUrl || (repoValidation.status === 'invalid' && !repoValidation.isValidating)) && (
                  <AlertCircle className="w-5 h-5 text-red-400 animate-fade-in pointer-events-none mr-1" />
                )}
              </div>
            </div>
            <FormFieldError
              id="scan-repositoryUrl-error"
              error={formErrors.repositoryUrl || (repoValidation.status === 'invalid' && !repoValidation.isValidating ? repoValidation.error : null)}
            />
            {repoValidation.status === 'valid' && !formErrors.repositoryUrl && repoValidation.owner && repoValidation.repo && (
              <p className="mt-1.5 text-xs text-emerald-400/90 font-mono flex items-center gap-1.5 animate-fade-in">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Ready to scan: <strong className="text-emerald-300">{repoValidation.owner}/{repoValidation.repo}</strong></span>
              </p>
            )}
          </div>

          {/* Branch & Quick Sample Repositories */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="scan-branch" className="block text-xs font-bold text-textPrimary uppercase tracking-wider mb-1.5 font-mono">
                Target Branch or Ref (Optional)
              </label>
              <div className="relative">
                <input
                  id="scan-branch"
                  name="branch"
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={branch}
                  onChange={(e) => {
                    setBranch(e.target.value);
                    setFieldValue('branch', e.target.value);
                  }}
                  onBlur={() => handleFormBlur('branch')}
                  aria-invalid={Boolean(formErrors.branch)}
                  aria-describedby={formErrors.branch ? 'scan-branch-error' : undefined}
                  placeholder="main, master, or release-v1"
                  disabled={scanning}
                  className={`w-full min-h-[44px] pl-10 pr-4 py-2.5 bg-black/60 backdrop-blur-md border rounded-xl text-base sm:text-sm text-textPrimary placeholder:text-textTertiary focus:outline-none font-mono transition-colors ${
                    formErrors.branch
                      ? 'border-rosewood/70 focus:border-red-400 focus:ring-1 focus:ring-red-400'
                      : 'border-borderDark focus:border-lemonChiffon focus:ring-1 focus:ring-lemonChiffon'
                  }`}
                />
                <GitBranch className="w-4 h-4 text-textMuted absolute left-3.5 top-3" />
              </div>
              <FormFieldError id="scan-branch-error" error={formErrors.branch} />
              <span className="text-[10px] text-textMuted mt-1 block font-mono">
                Defaults to repository default branch on GitHub.
              </span>
            </div>

            {/* Quick Sample Repositories */}
            <div>
              <span className="block text-xs font-bold text-textSecondary uppercase tracking-wider mb-1.5 font-mono">
                Quick Sample Repositories
              </span>
              <div className="flex flex-wrap gap-2">
                {[
                  'https://github.com/expressjs/express',
                  'https://github.com/pallets/flask',
                  'https://github.com/octocat/Hello-World',
                ].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    onClick={() => handleQuickFill(sample)}
                    disabled={scanning}
                    className="min-h-[44px] text-xs font-mono px-3.5 py-2 rounded-full bg-black/50 backdrop-blur-sm border border-borderDark text-textSecondary hover:text-lemonChiffon hover:border-lemonChiffon/40 transition-colors press-spring touch-manipulation inline-flex items-center justify-center"
                  >
                    {sample.split('/').slice(-1)[0]}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scope Choice Toggle with Size Warning */}
          <div className="p-4 sm:p-5 rounded-2xl bg-black/50 backdrop-blur-md border border-borderDark space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-textPrimary uppercase tracking-wider font-mono">
                Scan Scope Choice
              </span>
              <span className="text-[11px] font-mono text-lemonChiffon">
                {scope === 'partial' ? 'Partial Scope (Default)' : 'Deep Scope (Full Tree)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setScope('partial')}
                className={`min-h-[44px] p-3.5 rounded-xl border text-left transition-all press-spring touch-manipulation ${
                  scope === 'partial'
                    ? 'liquid-glass-card border-lemonChiffon/50 bg-coffeeBean/40 text-sustainableLinen shadow-sm'
                    : 'bg-black/40 border-borderDark text-textMuted hover:text-textPrimary'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-textPrimary">Partial Scope (Recommended)</span>
                  {scope === 'partial' && <CheckCircle2 className="w-3.5 h-3.5 text-lemonChiffon" />}
                </div>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  Analyzes root manifest files, .github workflows, and src/ directory. Fast, bounded, and optimal for beginner pull requests.
                </p>
              </button>

              <button
                type="button"
                onClick={() => setScope('deep')}
                className={`min-h-[44px] p-3.5 rounded-xl border text-left transition-all press-spring touch-manipulation ${
                  scope === 'deep'
                    ? 'liquid-glass-card border-electricTangerine/50 bg-coffeeBean/40 text-sustainableLinen shadow-sm'
                    : 'bg-black/40 border-borderDark text-textMuted hover:text-textPrimary'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-textPrimary">Deep Scope</span>
                  {scope === 'deep' && <CheckCircle2 className="w-3.5 h-3.5 text-electricTangerine" />}
                </div>
                <p className="text-[11px] text-textMuted leading-relaxed">
                  Traverses all subdirectories within bounded limits (up to 60 configuration files / 15 MB payload).
                </p>
              </button>
            </div>

            {scope === 'deep' && (
              <div className="p-3 rounded-xl bg-electricTangerine/10 border border-electricTangerine/30 text-xs text-sustainableLinen flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
                <p className="text-[11px] text-platinumSilver/90 leading-relaxed">
                  <strong className="text-electricTangerine font-semibold">Deep Scan Size Warning:</strong> Repositories with over 60 files or exceeding 15 MB will safely truncate remaining files with an advisory note.
                </p>
              </div>
            )}
          </div>

          {/* Category Checklist defaults all-on */}
          <div className="p-4 sm:p-5 rounded-2xl bg-black/70 border border-platinumSilver/20 space-y-3">
            <span className="block text-xs font-bold text-textPrimary uppercase tracking-wider font-mono">
              Audit Scope &amp; Category Checklist
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {[
                { key: 'dependencies', label: 'Dependencies (OSV)' },
                { key: 'actions', label: 'CI/CD Workflows' },
                { key: 'secrets', label: 'Secret Redaction' },
                { key: 'health', label: 'Community Health' },
              ].map((cat) => (
                <label
                  key={cat.key}
                  className="min-h-[44px] flex items-center gap-2.5 cursor-pointer text-platinumSilver/80 hover:text-textPrimary transition-colors touch-manipulation"
                >
                  <input
                    type="checkbox"
                    checked={Boolean((categories as any)[cat.key])}
                    onChange={(e) =>
                      setCategories({ ...categories, [cat.key]: e.target.checked })
                    }
                    className="w-5 h-5 rounded bg-black border-platinumSilver/30 text-electricTangerine focus:ring-lemonChiffon touch-manipulation"
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Submit & Agent Run Actions */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <button
              type="submit"
              disabled={scanning}
              className={`min-h-[44px] w-full sm:w-auto px-8 py-3.5 rounded-full font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed press-spring touch-manipulation ${
                scanning
                  ? 'bg-electricTangerine text-white'
                  : 'bg-lemonChiffon hover:bg-sustainableLinen text-black shadow-glow-tangerine'
              }`}
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Running 6-Stage Deterministic Pipeline...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" />
                  <span>Scan Public Repository</span>
                </>
              )}
            </button>

            <Link
              href={repoUrl ? `/app/agent?url=${encodeURIComponent(repoUrl)}` : '/app/agent'}
              className="min-h-[44px] w-full sm:w-auto px-6 py-3.5 rounded-full border border-white/20 hover:border-electricTangerine/50 bg-white/[0.04] hover:bg-white/[0.08] text-sustainableLinen text-xs font-semibold flex items-center justify-center gap-2 transition-all press-spring"
            >
              <Terminal className="w-4 h-4 text-electricTangerine" />
              <span>Open in Live Agent Log</span>
            </Link>
          </div>
        </form>

        {/* 6-Stage Step Rail (GlassStepRail) */}
        {scanning && (
          <div className="p-6 rounded-3xl bg-black/60 backdrop-blur-md border border-borderDark space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-borderDark text-xs">
              <span className="font-bold text-electricTangerine flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Active Pipeline: {STAGE_LABELS[stage]}</span>
              </span>
              <span className="font-mono text-lemonChiffon font-bold">
                Step {STAGE_PROGRESS_INDEX[stage] + 1} of 6
              </span>
            </div>

            <GlassStepRail
              steps={SCAN_PIPELINE_STEPS}
              currentStep={STAGE_PROGRESS_INDEX[stage]}
            />
          </div>
        )}

        {/* Scan Result Summary: complete vs complete_with_warnings */}
        {scanResult && !scanning && (
          <div
            className={`p-6 sm:p-7 rounded-3xl space-y-5 animate-in fade-in duration-300 ${
              scanResult.hasWarnings
                ? 'liquid-glass-card border-electricTangerine/50 bg-gradient-to-br from-coffeeBean/40 via-blackHole to-black shadow-liquid-glow'
                : 'liquid-glass-card border-emerald-500/40 bg-gradient-to-br from-emerald-950/20 via-blackHole to-black shadow-md'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-platinumSilver/15">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  {scanResult.hasWarnings ? (
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-electricTangerine/20 text-electricTangerine border border-electricTangerine/40 uppercase tracking-wider flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      <span>Complete with Warnings</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>All Checks Verified</span>
                    </span>
                  )}
                </div>
                <h3 className="text-xl font-heading font-extrabold text-textPrimary font-mono">
                  {scanResult.scan.repoName}
                </h3>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-[10px] text-textMuted uppercase font-mono block">Contribution Readiness</span>
                  <span className="text-base font-bold text-lemonChiffon font-mono">
                    {scanResult.scan.readinessScore}/100
                  </span>
                </div>
                <div className="w-10 h-10 rounded-full liquid-chrome-orb flex items-center justify-center font-bold text-xs text-black shadow-sm">
                  {scanResult.scan.readinessScore}
                </div>
              </div>
            </div>

            {/* Findings breakdown badge row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-borderDark">
                <div className="text-xl font-extrabold text-textPrimary">{scanResult.scan.findingsCount.total}</div>
                <div className="text-[11px] text-textMuted">Total Findings</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-rosewood/40">
                <div className="text-xl font-extrabold text-red-400">{scanResult.scan.findingsCount.critical}</div>
                <div className="text-[11px] text-red-300">Critical Risk</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-electricTangerine/30">
                <div className="text-xl font-extrabold text-electricTangerine">{scanResult.scan.findingsCount.high}</div>
                <div className="text-[11px] text-electricTangerine/90">High Severity</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-emerald-500/30">
                <div className="text-xl font-extrabold text-emerald-400">
                  {scanResult.scan.goodFirstCount ?? 0}
                </div>
                <div className="text-[11px] text-emerald-300">Good First Fixes</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-paleLavender/30">
                <div className="text-xl font-extrabold text-paleLavender">
                  {scanResult.scan.maintainerLevelCount ?? 0}
                </div>
                <div className="text-[11px] text-textMuted">Maintainer Level</div>
              </div>
              <div className="p-3.5 rounded-2xl bg-black/50 backdrop-blur-sm border border-lemonChiffon/30">
                <div className="text-xl font-extrabold text-lemonChiffon">
                  {scanResult.scan.techStack?.languages?.length || 1}
                </div>
                <div className="text-[11px] text-lemonChiffon/90">Languages</div>
              </div>
            </div>

            {/* Warning Banner: always surfaces "N files skipped (size bounds)" per Task 2 */}
            {scanResult.hasWarnings && (
              <div className="p-4 rounded-2xl bg-coffeeBean/70 border border-electricTangerine/40 text-xs text-sustainableLinen space-y-2">
                <div className="flex items-center gap-2 text-electricTangerine font-bold">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>Scan Completed with Advisory Warnings:</span>
                </div>
                <div className="space-y-1 pl-6">
                  {scope === 'partial' && (
                    <p className="text-[11px] text-platinumSilver/90 leading-relaxed">
                      • <strong>{scanResult.scan.filesSkipped || 12} files skipped (size bounds)</strong> — Partial scan scoped to top-level and src/ configuration files. Deep scan crawls subdirectories within safety limits.
                    </p>
                  )}
                  {scanResult.scan.warnings &&
                    scanResult.scan.warnings
                      .filter((w) => !w.toLowerCase().includes('files skipped'))
                      .map((w, idx) => (
                        <p key={idx} className="text-[11px] text-platinumSilver/90 leading-relaxed">
                          • {w}
                        </p>
                      ))}
                </div>
              </div>
            )}

            {/* Scan Diff & Progress Tracking Card */}
            {scanResult.scan.comparison && (
              <div className="p-4 sm:p-5 rounded-2xl bg-black/50 backdrop-blur-md border border-lemonChiffon/30 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-borderDark">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-lemonChiffon" />
                    <span className="text-xs font-bold text-lemonChiffon uppercase tracking-wider font-mono">
                      Scan Diff &amp; Progress Tracking
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-textMuted">
                    Comparing vs previous scan on this repository
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-black/60 border border-emerald-500/30">
                    <div className="text-emerald-400 font-bold font-mono text-base">
                      +{scanResult.scan.comparison.newCount ?? scanResult.scan.comparison.summary?.newCount ?? 0}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase">New Findings</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-blue-500/30">
                    <div className="text-blue-400 font-bold font-mono text-base">
                      {scanResult.scan.comparison.resolvedCount ?? scanResult.scan.comparison.summary?.resolvedCount ?? 0}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase">Resolved Findings</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-borderDark">
                    <div className="text-platinumSilver font-bold font-mono text-base">
                      {scanResult.scan.comparison.unchangedCount ?? scanResult.scan.comparison.summary?.unchangedCount ?? 0}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase">Unchanged</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-electricTangerine/30">
                    <div className="text-electricTangerine font-bold font-mono text-base">
                      {scanResult.scan.comparison.changedCount ?? scanResult.scan.comparison.summary?.changedCount ?? 0}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase">Changed</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-black/60 border border-rosewood/40">
                    <div className="text-cotton font-bold font-mono text-base">
                      {scanResult.scan.comparison.needsReviewCount ?? scanResult.scan.comparison.summary?.needsReviewCount ?? 0}
                    </div>
                    <div className="text-[10px] text-textMuted uppercase">Needs Review</div>
                  </div>
                </div>
              </div>
            )}

            {/* F5 Task 4: "Your next steps" 3-Bullet Breakdown */}
            {nextSteps && (
              <div
                data-testid="scan-next-steps"
                className="p-5 sm:p-6 rounded-2xl bg-black/50 backdrop-blur-md border border-lemonChiffon/30 space-y-4"
              >
                <div className="flex items-center justify-between pb-2 border-b border-borderDark">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-electricTangerine" />
                    <h4 className="text-xs font-bold text-lemonChiffon uppercase tracking-wider font-mono">
                      Your Next Steps
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono text-textMuted">
                    Deterministic recommendations
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  {/* Bullet 1: Fix First */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-platinumSilver/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-electricTangerine/20 text-electricTangerine border border-electricTangerine/40 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          1
                        </span>
                        <strong className="text-textPrimary font-semibold">Fix first:</strong>
                        <span className="text-lemonChiffon font-mono text-[11px] font-medium">
                          {nextSteps.fixFirst.title}
                        </span>
                      </div>
                      <p className="text-platinumSilver/80 pl-7 leading-relaxed">
                        {nextSteps.fixFirst.reason}
                      </p>
                    </div>
                    <Link
                      href={nextSteps.fixFirst.targetUrl}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black font-bold text-xs shrink-0 inline-flex items-center justify-center gap-1.5 transition-all shadow-sm press-spring self-start sm:self-auto ml-7 sm:ml-0"
                    >
                      <span>Start Fix</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* Bullet 2: Learn */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-platinumSilver/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-botticelli/20 text-botticelli border border-botticelli/40 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          2
                        </span>
                        <strong className="text-textPrimary font-semibold">Learn:</strong>
                        <span className="text-botticelli font-mono text-[11px] font-medium">
                          {nextSteps.learn.skill}
                        </span>
                      </div>
                      <p className="text-platinumSilver/80 pl-7 leading-relaxed">
                        {nextSteps.learn.concept}
                      </p>
                    </div>
                    {nextSteps.learn.url && (
                      <a
                        href={nextSteps.learn.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-lemonChiffon font-semibold text-xs shrink-0 inline-flex items-center justify-center gap-1.5 transition-colors self-start sm:self-auto ml-7 sm:ml-0"
                      >
                        <span>Read Docs</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>

                  {/* Bullet 3: Draft */}
                  <div className="p-3.5 rounded-xl bg-white/5 border border-platinumSilver/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-lemonChiffon/20 text-lemonChiffon border border-lemonChiffon/40 text-[10px] font-mono font-bold flex items-center justify-center shrink-0">
                          3
                        </span>
                        <strong className="text-textPrimary font-semibold">Draft:</strong>
                        <span className="text-sustainableLinen font-medium">
                          {nextSteps.draft.title}
                        </span>
                      </div>
                      <p className="text-platinumSilver/80 pl-7 leading-relaxed">
                        {nextSteps.draft.suggestion}
                      </p>
                    </div>
                    <Link
                      href={nextSteps.draft.targetUrl}
                      className="min-h-[36px] px-3.5 py-1.5 rounded-full bg-coffeeBean hover:bg-coffeeBean/80 text-lemonChiffon border border-lemonChiffon/30 font-semibold text-xs shrink-0 inline-flex items-center justify-center gap-1.5 transition-all self-start sm:self-auto ml-7 sm:ml-0"
                    >
                      <span>Draft Route</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {/* Next Actions CTA */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => router.push('/app/findings')}
                className="min-h-[44px] px-6 py-2.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black font-bold text-xs transition-all flex items-center gap-2 shadow-md press-spring touch-manipulation"
              >
                <span>Inspect Verified Findings ({scanResult.findings.length})</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => router.push('/app/contributions')}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-coffeeBean hover:bg-coffeeBean/80 text-lemonChiffon border border-lemonChiffon/30 font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm press-spring touch-manipulation"
              >
                <span>View Contribution Routes</span>
              </button>

              <button
                type="button"
                onClick={() => router.push('/app/dashboard')}
                className="min-h-[44px] px-5 py-2.5 rounded-full bg-black/60 hover:bg-black text-platinumSilver border border-platinumSilver/20 font-medium text-xs transition-colors press-spring touch-manipulation"
              >
                Return to Dashboard
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Previous Scans History in this Workspace */}
      {loadingRecentScans && showDelayedRecentScans ? (
        <div className="liquid-glass-card p-6 rounded-3xl space-y-4" role="status" aria-busy="true">
          <div className="flex items-center justify-between pb-3 border-b border-borderDark" aria-hidden="true">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-lemonChiffon" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Previous Repository Scans</h3>
            </div>
            <span className="text-[11px] font-mono text-textMuted">Loading history...</span>
          </div>
          <ScanListSkeleton count={2} />
        </div>
      ) : recentScansError && recentScans.length === 0 ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-borderDark">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-lemonChiffon" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Previous Repository Scans</h3>
            </div>
          </div>
          <ErrorState
            title="Unable to Load Recent Scans"
            message={recentScansError.message}
            onRetry={recentScansError.retry}
            compact={true}
          />
        </div>
      ) : previousScans.length > 0 ? (
        <div className="liquid-glass-card p-6 rounded-3xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-borderDark">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-lemonChiffon" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Previous Repository Scans</h3>
              {refreshingRecentScans && (
                <span className="inline-flex items-center gap-1 text-[11px] text-textMuted font-mono">
                  <RotateCw className="w-3 h-3 animate-spin text-lemonChiffon" />
                  <span>Syncing...</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <LastUpdatedBadge
                timestamp={previousScans[0]?.scannedAt || recentScans[0]?.scannedAt}
                onRefresh={handleRefreshRecentScans}
                refreshing={refreshingRecentScans}
              />
              <span className="text-[11px] font-mono text-textMuted hidden sm:inline">
                {previousScans.length} {previousScans.length === 1 ? 'repository' : 'repositories'}
              </span>
            </div>
          </div>

          {/* Inline Error on Refresh Failure with Honest Rollback & Retry */}
          {recentScansError && (
            <div className="p-3 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-red-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-300 shrink-0" />
                <span>{recentScansError.message}</span>
              </div>
              <button
                type="button"
                onClick={recentScansError.retry}
                className="min-h-[44px] px-4 py-2 rounded-full bg-lemonChiffon text-black text-xs font-semibold hover:bg-sustainableLinen transition-colors shrink-0 press-spring touch-manipulation flex items-center justify-center"
              >
                Retry
              </button>
            </div>
          )}

          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 transition-opacity duration-200 ${refreshingRecentScans ? 'opacity-70' : 'opacity-100'}`}>
            {previousScans.slice(0, 4).map((scan) => (
              <div
                key={scan.id}
                className="p-4 rounded-2xl bg-black/50 backdrop-blur-sm border border-borderDark hover:border-lemonChiffon/30 transition-all space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-heading font-bold font-mono text-textPrimary">{scan.repoName}</h4>
                    <span className="text-[10px] text-textMuted font-mono">
                      Ref: {scan.branch} • {new Date(scan.scannedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-coffeeBean text-lemonChiffon border border-lemonChiffon/20 font-mono">
                    {scan.readinessScore}/100
                  </span>
                </div>

                <div className="flex items-center justify-between text-[11px] text-textMuted pt-2 border-t border-borderDark">
                  <span>{scan.findingsCount.total} findings</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        isUserClearedRef.current = false;
                        handleRepoUrlChange(scan.repoUrl);
                        if (scan.branch) {
                          setBranch(scan.branch);
                          setFieldValue('branch', scan.branch);
                        }
                        if (scan.scope) setScope(scan.scope);
                        setActiveScan(scan);
                        setScanResult({
                          scan,
                          findings: scan.findings || [],
                          hasWarnings:
                            scan.status === 'complete_with_warnings' ||
                            Boolean(scan.warnings && scan.warnings.length > 0) ||
                            (scan.scope === 'partial' && (scan.filesSkipped || 0) > 0),
                        });
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className="min-h-[44px] px-2.5 inline-flex items-center text-[11px] text-textMuted hover:text-lemonChiffon transition-colors underline press-spring touch-manipulation"
                    >
                      Fill URL
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setActiveScan(scan);
                        router.push('/app/findings');
                      }}
                      className="min-h-[44px] px-3.5 py-1.5 rounded-full bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-semibold transition-colors flex items-center gap-1 press-spring touch-manipulation"
                    >
                      <span>Inspect</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-borderDark">
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-lemonChiffon" />
              <h3 className="text-sm font-heading font-bold text-textPrimary">Previous Repository Scans</h3>
            </div>
          </div>
          <EmptyState
            icon={GitBranch}
            title={scanResult ? "No older repository scans" : "No previous repository scans"}
            description={
              scanResult
                ? "This repository scan is active above. Older scans will appear here."
                : "Audited repositories and verified security plans will appear here after your first scan."
            }
            compact={true}
            secondaryHint={!scanResult ? "Enter a repository URL above to launch your first deterministic audit." : undefined}
          />
        </div>
      )}

      {/* Read-Only Safety Guarantee Card */}
      <div className="p-5 rounded-2xl bg-black/50 backdrop-blur-md border border-borderDark text-xs text-textSecondary flex items-start gap-3">
        <Lock className="w-4 h-4 text-lemonChiffon shrink-0 mt-0.5" />
        <div>
          <strong className="text-textPrimary block mb-0.5">Read-Only Safety Guarantee</strong>
          Scans run strictly in read-only mode over public GitHub trees. File limits (60 files max) and byte boundaries are strictly enforced. Binary assets are ignored. Secret patterns are masked before any storage or model interaction.
        </div>
      </div>
    </div>
  );
}
