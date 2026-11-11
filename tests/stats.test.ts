import { describe, it, expect } from "vitest";
import { GET as getStats } from "../src/app/api/stats/route";
import { db } from "../src/lib/db";

describe("Phase 9.5 — Public /stats API", () => {
  it("returns live aggregate stats with cache headers and zero private data", async () => {
    const res = await getStats();
    expect(res.status).toBe(200);

    const cacheHeader = res.headers.get("Cache-Control");
    expect(cacheHeader).toContain("public");
    expect(cacheHeader).toContain("s-maxage=300");

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reposScanned).toBeGreaterThanOrEqual(1248);
    expect(data.findingsVerified).toBeGreaterThanOrEqual(4912);
    expect(data.routesGenerated).toBeGreaterThanOrEqual(894);
    expect(data.contributorsGuided).toBeGreaterThanOrEqual(612);
    expect(data.total_repositories).toBeGreaterThanOrEqual(1248);
    expect(data.total_findings_verified).toBeGreaterThanOrEqual(4912);
    expect(data.total_routes_generated).toBeGreaterThanOrEqual(894);
    expect(data.lastUpdated).toBeDefined();

    // Verify zero user-private fields
    expect((data as any).email).toBeUndefined();
    expect((data as any).password).toBeUndefined();
    expect((data as any).users).toBeUndefined();
    expect((data as any).scans).toBeUndefined();
    expect((data as any).tokens).toBeUndefined();
  });

  it("dynamically increases aggregate counts as records are added", () => {
    const before = db.getPublicStats();

    // Add a new scan
    const testScanId = `scn_stat_test_${Date.now()}`;
    db.saveScan({
      id: testScanId,
      userId: "stat-user-1",
      repoUrl: `https://github.com/stat-owner/repo-${Date.now()}`,
      repoName: `stat-owner/repo-${Date.now()}`,
      owner: "stat-owner",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 5,
      totalBytes: 5000,
      status: "completed",
      readinessScore: 80,
      findingsCount: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      techStack: {
        languages: [],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
    });

    const after = db.getPublicStats();
    expect(after.reposScanned).toBeGreaterThan(before.reposScanned);
  });
});
