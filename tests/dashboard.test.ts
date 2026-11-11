import { describe, it, expect } from "vitest";
import {
  reconcileActiveScan,
  computeDashboardMetrics,
  getScanDiffBadgeData,
} from "@/lib/dashboard-sync";
import type { ScanSummary, ContributionRoute, Finding } from "@/types";

const MOCK_SCAN_RESULT: ScanSummary = {
  id: "test-scan-001",
  userId: "user-1",
  repositoryId: "repo-1",
  repoUrl: "https://github.com/expressjs/express",
  repoName: "expressjs/express",
  fullName: "expressjs/express",
  owner: "expressjs",
  branch: "main",
  scope: "partial",
  status: "complete",
  readinessScore: 82,
  findingsCount: { total: 4, critical: 0, high: 1, medium: 2, low: 1, info: 0 },
  scannedAt: "2026-10-31T00:00:00.000Z",
  totalFiles: 30,
  filesScanned: 18,
  totalBytes: 150000,
  bytesScanned: 95400,
  filesSkipped: 12,
  techStack: {
    languages: [{ name: "JavaScript", percentage: 100, filesCount: 18 }],
    frameworks: [{ name: "Express", category: "backend" }],
    tooling: [],
    manifests: [],
    confidenceScore: 100,
  },
  findings: [
    { id: "f-1" } as any,
    { id: "f-2" } as any,
    { id: "f-3" } as any,
    { id: "f-4" } as any,
  ],
  comparison: {
    currentScanId: "test-scan-001",
    previousScanId: null,
    repoName: "expressjs/express",
    branch: "main",
    status: "comparable",
    diffs: [],
    newCount: 1,
    resolvedCount: 0,
    unchangedCount: 3,
    summary: {
      newCount: 1,
      resolvedCount: 0,
      unchangedCount: 3,
      changedCount: 0,
      totalCurrent: 4,
      totalPrevious: 3,
    },
  },
};

const MOCK_ROUTES: ContributionRoute[] = [
  {
    id: "route-1",
    scanId: "test-scan-001",
    findingIds: ["f-1"],
    title: "Scope CI workflow token permissions",
    summary: "Restrict permissions to contents: read",
    difficulty: "beginner",
    estimatedMinutes: 15,
    estimatedEffort: "15 mins",
    status: "not-started",
    skills: ["GitHub Actions", "YAML"],
    createdAt: "2026-10-31T00:00:00.000Z",
    acceptanceCriteria: [],
    testPlan: [],
    files: [],
    suggestedChange: "",
    readiness: { total: 80 },
  },
  {
    id: "route-2",
    scanId: "test-scan-001",
    findingIds: ["f-2"],
    title: "Pin action to SHA",
    summary: "Pin action to immutable commit hash",
    difficulty: "intermediate",
    estimatedMinutes: 20,
    estimatedEffort: "20 mins",
    status: "in-progress",
    skills: ["Security"],
    createdAt: "2026-10-31T00:00:00.000Z",
    acceptanceCriteria: [],
    testPlan: [],
    files: [],
    suggestedChange: "",
    readiness: { total: 80 },
  },
];

describe("Phase 4 & P6 — App Shell & Dashboard Sync Logic", () => {
  it("calculates workspace summary metrics correctly", () => {
    const scans = [MOCK_SCAN_RESULT];
    const routes = MOCK_ROUTES;

    const totalScans = scans.length;
    expect(totalScans).toBe(1);

    const totalFindings = scans.reduce((acc, s) => acc + (s.findings?.length || 0), 0);
    expect(totalFindings).toBe(4);

    const openRoutes = routes.filter((r) => r.status !== "completed");
    expect(openRoutes.length).toBe(2);
  });

  it("selects the optimal beginner next-task", () => {
    const beginnerTask = MOCK_ROUTES.find(
      (r) => r.difficulty === "beginner" && r.status !== "completed"
    );
    expect(beginnerTask).toBeDefined();
    expect(beginnerTask?.difficulty).toBe("beginner");
    expect(beginnerTask?.estimatedMinutes).toBeLessThanOrEqual(30);
  });

  it("validates scan diff representations", () => {
    const diff = { new: 1, resolved: 0, unchanged: 3 };
    expect(diff.new).toBe(1);
    expect(diff.unchanged).toBe(3);
    const badgeText = `+${diff.new} New · ${diff.unchanged} unchanged`;
    expect(badgeText).toBe("+1 New · 3 unchanged");
  });

  describe("P6: Server activeScan reconciliation with localStorage", () => {
    const serverScans: ScanSummary[] = [
      {
        ...MOCK_SCAN_RESULT,
        id: "scan-server-1",
        repoName: "facebook/react",
        readinessScore: 88,
      },
      {
        ...MOCK_SCAN_RESULT,
        id: "scan-server-2",
        repoName: "pallets/flask",
        readinessScore: 75,
      },
    ];

    it("clears activeScan to null when server has no scans (clears stale local storage)", () => {
      const staleLocalScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        id: "stale-deleted-scan",
      };
      const result = reconcileActiveScan([], staleLocalScan);
      expect(result).toBeNull();
    });

    it("prefers freshest server scan when local activeScan exists on server", () => {
      const localCachedScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        id: "scan-server-2",
        readinessScore: 50, // outdated client cache
      };

      const result = reconcileActiveScan(serverScans, localCachedScan);
      expect(result).toBeDefined();
      expect(result?.id).toBe("scan-server-2");
      expect(result?.readinessScore).toBe(75); // authoritative server score
    });

    it("falls back to freshest server scan when local activeScan is stale or absent", () => {
      const staleScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        id: "non-existent-scan",
      };

      const resultWithStale = reconcileActiveScan(serverScans, staleScan);
      expect(resultWithStale?.id).toBe("scan-server-1");

      const resultWithNull = reconcileActiveScan(serverScans, null);
      expect(resultWithNull?.id).toBe("scan-server-1");
    });
  });

  describe("P6: Derived metric cards calculation (4 GlassMetricCards)", () => {
    const scanA: ScanSummary = {
      ...MOCK_SCAN_RESULT,
      id: "scan-a",
      readinessScore: 80,
      findingsCount: { total: 5, critical: 1, high: 2, medium: 2, low: 0, info: 0 },
    };
    const scanB: ScanSummary = {
      ...MOCK_SCAN_RESULT,
      id: "scan-b",
      readinessScore: 90,
      findingsCount: { total: 3, critical: 0, high: 1, medium: 2, low: 0, info: 0 },
    };

    const routes: ContributionRoute[] = [
      {
        ...MOCK_ROUTES[0],
        id: "route-1",
        scanId: "scan-a",
        difficulty: "beginner",
        status: "completed",
      },
      {
        ...MOCK_ROUTES[1],
        id: "route-2",
        scanId: "scan-a",
        difficulty: "beginner",
        status: "in-progress",
      },
      {
        ...MOCK_ROUTES[0],
        id: "route-3",
        scanId: "scan-b",
        difficulty: "advanced",
        status: "not-started",
      },
    ];

    it("calculates Repositories Scanned, Active Findings, Open Routes, and Avg Readiness accurately", () => {
      const metrics = computeDashboardMetrics({
        scans: [scanA, scanB],
        activeScan: scanA,
        routes,
        findings: [] as Finding[],
      });

      // 1. Repositories Scanned
      expect(metrics.totalScans).toBe(2);

      // 2. Active Findings (scoped to activeScan)
      expect(metrics.activeFindingsCount).toBe(5);

      // 3. Open Routes (scoped to activeScan: route-1 is completed, route-2 is in-progress)
      expect(metrics.openRoutesCount).toBe(1);
      expect(metrics.completedRoutesCount).toBe(1);
      expect(metrics.progressPercentage).toBe(50);

      // 4. Avg Readiness ((80 + 90) / 2 = 85)
      expect(metrics.avgReadiness).toBe(85);

      // Recommended Route should pick the first non-completed beginner route: route-2
      expect(metrics.recommendedRoute?.id).toBe("route-2");
    });

    it("updates open routes and progress bar when a route is completed", () => {
      const updatedRoutes: ContributionRoute[] = routes.map((r) =>
        r.id === "route-2" ? { ...r, status: "completed" as const } : r
      );

      const metrics = computeDashboardMetrics({
        scans: [scanA, scanB],
        activeScan: scanA,
        routes: updatedRoutes,
        findings: [] as Finding[],
      });

      expect(metrics.openRoutesCount).toBe(0);
      expect(metrics.completedRoutesCount).toBe(2);
      expect(metrics.progressPercentage).toBe(100);
    });

    it("handles zero scans gracefully without division by zero", () => {
      const metrics = computeDashboardMetrics({
        scans: [],
        activeScan: null,
        routes: [],
        findings: [],
      });

      expect(metrics.totalScans).toBe(0);
      expect(metrics.activeFindingsCount).toBe(0);
      expect(metrics.openRoutesCount).toBe(0);
      expect(metrics.avgReadiness).toBe(0);
      expect(metrics.progressPercentage).toBe(0);
      expect(metrics.recommendedRoute).toBeNull();
    });
  });

  describe("P6: Scan diff badge categorization", () => {
    it("identifies initial scans as New findings", () => {
      const initialScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        findingsCount: { total: 4, critical: 1, high: 1, medium: 2, low: 0, info: 0 },
        comparison: undefined,
      };

      const diff = getScanDiffBadgeData(initialScan);
      expect(diff.badgeType).toBe("new");
      expect(diff.label).toBe("+4 New");
    });

    it("identifies resolved findings badge", () => {
      const resolvedScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        comparison: {
          currentScanId: "scan-2",
          previousScanId: "scan-1",
          repoName: "expressjs/express",
          branch: "main",
          status: "comparable",
          diffs: [],
          resolvedCount: 3,
          newCount: 0,
          unchangedCount: 2,
          changedCount: 0,
          needsReviewCount: 0,
          summary: {
            newCount: 0,
            resolvedCount: 3,
            unchangedCount: 2,
            changedCount: 0,
            needsReviewCount: 0,
            totalCurrent: 2,
            totalPrevious: 5,
          },
        },
      };

      const diff = getScanDiffBadgeData(resolvedScan);
      expect(diff.badgeType).toBe("resolved");
      expect(diff.label).toBe("-3 Resolved");
    });

    it("identifies mixed new and resolved findings badge", () => {
      const mixedScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        comparison: {
          currentScanId: "scan-2",
          previousScanId: "scan-1",
          repoName: "expressjs/express",
          branch: "main",
          status: "comparable",
          diffs: [],
          resolvedCount: 2,
          newCount: 1,
          unchangedCount: 2,
          changedCount: 0,
          needsReviewCount: 0,
          summary: {
            newCount: 1,
            resolvedCount: 2,
            unchangedCount: 2,
            changedCount: 0,
            needsReviewCount: 0,
            totalCurrent: 3,
            totalPrevious: 4,
          },
        },
      };

      const diff = getScanDiffBadgeData(mixedScan);
      expect(diff.badgeType).toBe("mixed");
      expect(diff.label).toBe("+1 / -2");
    });

    it("identifies unchanged findings badge", () => {
      const unchangedScan: ScanSummary = {
        ...MOCK_SCAN_RESULT,
        comparison: {
          currentScanId: "scan-2",
          previousScanId: "scan-1",
          repoName: "expressjs/express",
          branch: "main",
          status: "comparable",
          diffs: [],
          resolvedCount: 0,
          newCount: 0,
          unchangedCount: 4,
          changedCount: 0,
          needsReviewCount: 0,
          summary: {
            newCount: 0,
            resolvedCount: 0,
            unchangedCount: 4,
            changedCount: 0,
            needsReviewCount: 0,
            totalCurrent: 4,
            totalPrevious: 4,
          },
        },
      };

      const diff = getScanDiffBadgeData(unchangedScan);
      expect(diff.badgeType).toBe("unchanged");
      expect(diff.label).toBe("Unchanged");
    });
  });
});
