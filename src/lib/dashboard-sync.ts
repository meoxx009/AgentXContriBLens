import { ScanSummary, ContributionRoute, Finding } from '@/types';

/**
 * Reconciles client-side activeScan (e.g. from localStorage) with authoritative server scans.
 * Rules:
 * 1. If server has no scans, activeScan MUST be null (clears stale local storage).
 * 2. If client has an activeScan that exists on the server, prefer the freshest server scan object.
 * 3. If client activeScan is stale (not in serverScans) or null, default to the freshest server scan (serverScans[0]).
 */
export function reconcileActiveScan(
  serverScans: ScanSummary[],
  currentActive: ScanSummary | null
): ScanSummary | null {
  if (!serverScans || serverScans.length === 0) {
    return null;
  }

  if (!currentActive) {
    return serverScans[0];
  }

  const matchingServerScan = serverScans.find((s) => s.id === currentActive.id);
  if (matchingServerScan) {
    return matchingServerScan;
  }

  // Stale local entry (e.g. deleted scan or switched user) — fallback to freshest server scan
  return serverScans[0];
}

/**
 * Derives all dashboard metrics deterministically from real API collections.
 * No placeholder numbers anywhere.
 */
export function computeDashboardMetrics({
  scans,
  activeScan,
  routes,
  findings,
}: {
  scans: ScanSummary[];
  activeScan: ScanSummary | null;
  routes: ContributionRoute[];
  findings: Finding[];
}) {
  const validScans = (scans || []).filter(Boolean);
  const totalScans = validScans.length;

  const displayedRoutes = activeScan
    ? routes.filter((r) => r.scanId === activeScan.id)
    : routes;

  const openRoutes = displayedRoutes.filter((r) => r.status !== 'completed');
  const completedRoutes = displayedRoutes.filter((r) => r.status === 'completed');

  const progressPercentage =
    displayedRoutes.length > 0
      ? Math.round((completedRoutes.length / displayedRoutes.length) * 100)
      : 0;

  const activeFindingsCount = activeScan
    ? (activeScan.findingsCount?.total ?? 0)
    : findings.length;

  const avgReadiness =
    validScans.length > 0
      ? Math.round(
          validScans.reduce((acc, s) => acc + (s?.readinessScore || 0), 0) / validScans.length
        )
      : 0;

  // Recommended next task: First non-completed beginner route, or any non-completed route, or first route
  const recommendedRoute =
    displayedRoutes.find((r) => r.difficulty === 'beginner' && r.status !== 'completed') ||
    displayedRoutes.find((r) => r.status !== 'completed') ||
    (displayedRoutes.length > 0 ? displayedRoutes[0] : null);

  const goodFirstCount = displayedRoutes.filter((r) => r.difficulty === 'beginner').length;
  const maintainerLevelCount = displayedRoutes.filter((r) => r.difficulty === 'advanced').length;
  const resolvedCount = completedRoutes.length;

  return {
    totalScans,
    activeFindingsCount,
    displayedRoutes,
    openRoutes,
    openRoutesCount: openRoutes.length,
    completedRoutes,
    completedRoutesCount: completedRoutes.length,
    progressPercentage,
    avgReadiness,
    recommendedRoute,
    goodFirstCount,
    maintainerLevelCount,
    resolvedCount,
  };
}

export interface ScanDiffBadgeData {
  newCount: number;
  resolvedCount: number;
  unchangedCount: number;
  badgeType: 'new' | 'resolved' | 'mixed' | 'unchanged';
  label: string;
}

/**
 * Extracts and categorizes scan-diff information from a ScanSummary object.
 */
export function getScanDiffBadgeData(scan: ScanSummary): ScanDiffBadgeData {
  const comp = scan.comparison;
  const summary = comp?.summary;

  const newCount = comp?.newCount ?? summary?.newCount ?? (comp ? 0 : (scan.findingsCount?.total ?? 0));
  const resolvedCount = comp?.resolvedCount ?? summary?.resolvedCount ?? 0;
  const unchangedCount = comp?.unchangedCount ?? summary?.unchangedCount ?? (comp ? (scan.findingsCount?.total ?? 0) : 0);

  if (resolvedCount > 0 && newCount > 0) {
    return {
      newCount,
      resolvedCount,
      unchangedCount,
      badgeType: 'mixed',
      label: `+${newCount} / -${resolvedCount}`,
    };
  }

  if (resolvedCount > 0) {
    return {
      newCount,
      resolvedCount,
      unchangedCount,
      badgeType: 'resolved',
      label: `-${resolvedCount} Resolved`,
    };
  }

  if (newCount > 0) {
    return {
      newCount,
      resolvedCount,
      unchangedCount,
      badgeType: 'new',
      label: `+${newCount} New`,
    };
  }

  return {
    newCount,
    resolvedCount,
    unchangedCount,
    badgeType: 'unchanged',
    label: 'Unchanged',
  };
}
