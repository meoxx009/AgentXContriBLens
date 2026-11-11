/**
 * ContribLens Scan Diff and Progress Tracking Engine
 * 
 * Compares current scan findings against the user's previous compatible scan on the same repository.
 * 
 * Invariants:
 * 1. Stable finding fingerprinting using normalized rule, repository, path, and redacted evidence.
 * 2. Classifies findings into: new, unchanged, resolved, changed, needs-review.
 * 3. FAIL-SAFE: If the scan was truncated or a provider failed, resolved findings are NOT falsely claimed.
 */

import { createHash } from 'crypto';
import { redactSecrets } from '../redaction.ts';
import type {
  Finding,
  ScanSummary,
  ScanComparison,
  FindingDiffItem,
  FindingDiffStatus,
} from '../../types.ts';

/**
 * Computes a stable SHA-256 fingerprint for a finding across scans.
 */
export function computeFindingFingerprint(finding: Finding): string {
  const normRule = (finding.ruleId || 'GENERIC').trim().toLowerCase();
  const normFile = (finding.file || 'root').trim().toLowerCase();
  const normLine = finding.lineStart || finding.line || 0;
  const safeEvidence = redactSecrets(finding.evidence || finding.redactedEvidence || '')
    .trim()
    .replace(/\s+/g, ' ');

  const raw = `${normRule}|${normFile}|${normLine}|${safeEvidence}`;
  return createHash('sha256').update(raw).digest('hex').substring(0, 24);
}

/**
 * Compares a current scan and its findings against a previous scan.
 */
export function compareScans(
  currentScan: ScanSummary,
  currentFindings: Finding[],
  previousScan?: ScanSummary,
  previousFindings?: Finding[]
): ScanComparison {
  if (!previousScan || !previousFindings || previousFindings.length === 0) {
    // No prior scan exists for comparison
    const initialDiffs: FindingDiffItem[] = currentFindings.map((f) => {
      const fingerprint = computeFindingFingerprint(f);
      return {
        findingId: f.id,
        fingerprint,
        title: f.title,
        file: f.file || 'Repository Root',
        category: f.category,
        severity: f.severity,
        status: 'new' as FindingDiffStatus,
        notes: 'Initial scan baseline finding.',
      };
    });

    return {
      currentScanId: currentScan.id,
      previousScanId: null,
      repoName: currentScan.repoName,
      branch: currentScan.branch,
      status: 'comparable',
      newCount: currentFindings.length,
      resolvedCount: 0,
      unchangedCount: 0,
      changedCount: 0,
      needsReviewCount: 0,
      warnings: currentScan.warnings || [],
      summary: {
        newCount: currentFindings.length,
        resolvedCount: 0,
        unchangedCount: 0,
        changedCount: 0,
        needsReviewCount: 0,
        totalCurrent: currentFindings.length,
        totalPrevious: 0,
      },
      diffs: initialDiffs,
    };
  }

  // Check fail-safe: Was current scan truncated or provider interrupted?
  const hasTruncation = (currentScan.warnings || []).some((w) =>
    w.toLowerCase().includes('truncat') ||
    w.toLowerCase().includes('limit') ||
    w.toLowerCase().includes('unavailable')
  );

  const prevFingerprintMap = new Map<string, Finding>();
  for (const pf of previousFindings) {
    const fp = computeFindingFingerprint(pf);
    prevFingerprintMap.set(fp, pf);
  }

  const currentFingerprintMap = new Map<string, Finding>();
  for (const cf of currentFindings) {
    const fp = computeFindingFingerprint(cf);
    currentFingerprintMap.set(fp, cf);
  }

  const diffs: FindingDiffItem[] = [];
  let newCount = 0;
  let unchangedCount = 0;
  let changedCount = 0;
  let resolvedCount = 0;

  // 1. Process current findings
  for (const cf of currentFindings) {
    const fp = computeFindingFingerprint(cf);
    const prevMatch = prevFingerprintMap.get(fp);

    if (!prevMatch) {
      newCount += 1;
      diffs.push({
        findingId: cf.id,
        fingerprint: fp,
        title: cf.title,
        file: cf.file || 'Repository Root',
        category: cf.category,
        severity: cf.severity,
        status: 'new',
        notes: 'New finding introduced since previous scan.',
      });
    } else {
      const prevSev = String(prevMatch.severity).toUpperCase();
      const currSev = String(cf.severity).toUpperCase();

      if (prevSev === currSev) {
        unchangedCount += 1;
        diffs.push({
          findingId: cf.id,
          fingerprint: fp,
          title: cf.title,
          file: cf.file || 'Repository Root',
          category: cf.category,
          severity: cf.severity,
          status: 'unchanged',
          notes: 'Persists from previous scan without change.',
        });
      } else {
        changedCount += 1;
        diffs.push({
          findingId: cf.id,
          fingerprint: fp,
          title: cf.title,
          file: cf.file || 'Repository Root',
          category: cf.category,
          severity: cf.severity,
          previousSeverity: prevMatch.severity,
          status: 'changed',
          notes: `Severity changed from ${prevSev} to ${currSev}.`,
        });
      }
    }
  }

  // 2. Identify resolved findings (in previous scan but absent from current scan)
  for (const pf of previousFindings) {
    const fp = computeFindingFingerprint(pf);
    if (!currentFingerprintMap.has(fp)) {
      if (hasTruncation) {
        // FAIL-SAFE INVARIANT: Do NOT mark resolved if current scan was truncated or degraded!
        diffs.push({
          findingId: pf.id,
          fingerprint: fp,
          title: pf.title,
          file: pf.file || 'Repository Root',
          category: pf.category,
          severity: pf.severity,
          status: 'needs-review',
          notes: 'Absent in current scan, but scan limits or warnings prevented definitive resolution verification.',
        });
      } else {
        resolvedCount += 1;
        diffs.push({
          findingId: pf.id,
          fingerprint: fp,
          title: pf.title,
          file: pf.file || 'Repository Root',
          category: pf.category,
          severity: pf.severity,
          status: 'resolved',
          notes: 'Remediated! Finding is no longer present in repository.',
        });
      }
    }
  }

  const needsReviewCount = diffs.filter((d) => d.status === 'needs-review').length;
  const warningsList = currentScan.warnings || [];

  return {
    currentScanId: currentScan.id,
    previousScanId: previousScan.id,
    previousLastScannedAt: previousScan.scannedAt,
    repoName: currentScan.repoName,
    branch: currentScan.branch,
    status: hasTruncation ? 'comparison_unavailable' : 'comparable',
    reason: hasTruncation
      ? 'Current scan completed with provider or truncation warnings; resolution verification is conservative.'
      : undefined,
    warnings: warningsList,
    newCount,
    resolvedCount,
    unchangedCount,
    changedCount,
    needsReviewCount,
    summary: {
      newCount,
      resolvedCount,
      unchangedCount,
      changedCount,
      needsReviewCount,
      totalCurrent: currentFindings.length,
      totalPrevious: previousFindings.length,
    },
    diffs,
  };
}
