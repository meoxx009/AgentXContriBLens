import { describe, it, expect, beforeEach } from "vitest";
import { GET as getFindings, POST as postFindings } from "../src/app/api/findings/route";
import { GET as getFindingById, PATCH as patchFindingById } from "../src/app/api/findings/[findingId]/route";
import { GET as getRoutes, POST as postRoutes, PATCH as patchRoutes } from "../src/app/api/routes/route";
import { GET as getRouteById, PATCH as patchRouteById } from "../src/app/api/routes/[routeId]/route";
import { GET as getRoutePack } from "../src/app/api/routes/[routeId]/pack/route";
import { db } from "../src/lib/db";
import { signSessionToken } from "../src/lib/auth";
import type { ScanSummary, FindingEvidence } from "../src/types";

const TEST_USER = {
  id: "test-user-p8",
  email: "p8-tester@example.com",
  name: "Phase 8 Tester",
  createdAt: new Date().toISOString(),
};

const OTHER_USER = {
  id: "other-user-p8",
  email: "other@example.com",
  name: "Other User",
  createdAt: new Date().toISOString(),
};

function authReq(url: string, method: string = "GET", body?: any, user = TEST_USER) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `contriblens_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function unauthReq(url: string, method: string = "GET", body?: any) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Phase 8 — Findings, Contributions + Stack, Skills Gap", () => {
  const scanId = `scn_p8_${Date.now()}`;
  const unpinnedFinding: FindingEvidence = {
    id: "fnd_p8_unpinned",
    scanId,
    category: "github-actions",
    ruleId: "GH-ACTIONS-UNPINNED",
    title: "Unpinned GitHub Action in CI workflow",
    severity: "medium",
    confidence: 0.95,
    sourceTool: "CI Auditor",
    file: ".github/workflows/ci.yml",
    lineStart: 12,
    lineEnd: 12,
    evidence: "uses: actions/checkout@v3",
    impact: "Mutable tags can be hijacked by upstream maintainers or attackers.",
    fixHint: "Pin to immutable full 40-character commit SHA.",
    skills: ["GitHub Actions", "Supply Chain Security"],
    learningResources: [
      {
        title: "Security Hardening for Actions",
        url: "https://docs.github.com/actions",
        provider: "docs",
      },
    ],
    disclosureMode: "public-issue",
    redacted: false,
    evidenceHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    fingerprint: "GH-ACTIONS-UNPINNED:.github/workflows/ci.yml:12",
    createdAt: new Date().toISOString(),
  };

  const secretFinding: FindingEvidence = {
    id: "fnd_p8_secret",
    scanId,
    category: "secret",
    ruleId: "SECRET-AWS-KEY",
    title: "Exposed AWS Access Key in environment file",
    severity: "critical",
    confidence: 1.0,
    sourceTool: "Secret Scanner",
    file: ".env",
    lineStart: 4,
    lineEnd: 4,
    evidence: "AKIA************MPLE",
    impact: "Exposes production AWS infrastructure.",
    fixHint: "Revoke and rotate credentials immediately.",
    skills: ["Secrets Management"],
    learningResources: [],
    disclosureMode: "security-disclosure",
    redacted: true,
    evidenceHash: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
    fingerprint: "SECRET-AWS-KEY:.env:4",
    createdAt: new Date().toISOString(),
  };

  const mockScan: ScanSummary = {
    id: scanId,
    userId: TEST_USER.id,
    repoUrl: "https://github.com/owner/p8-repo",
    repoName: "owner/p8-repo",
    owner: "owner",
    branch: "main",
    scannedAt: new Date().toISOString(),
    totalFiles: 10,
    totalBytes: 25000,
    status: "completed",
    readinessScore: 75,
    techStack: {
      languages: [{ name: "TypeScript", percentage: 100, filesCount: 10 }],
      frameworks: [],
      tooling: [],
      manifests: [],
      confidenceScore: 100,
    },
    findingsCount: { total: 2, critical: 1, high: 0, medium: 1, low: 0, info: 0 },
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    db.saveUser(OTHER_USER);
    db.saveScan(mockScan);
    db.saveFindings([unpinnedFinding, secretFinding]);
  });

  it("rejects unauthenticated requests to findings and routes with 401", async () => {
    const resFindings = await getFindings(unauthReq("http://localhost:3000/api/findings"));
    expect(resFindings.status).toBe(401);

    const resRoutes = await getRoutes(unauthReq("http://localhost:3000/api/routes"));
    expect(resRoutes.status).toBe(401);

    const resPostRoute = await postRoutes(unauthReq("http://localhost:3000/api/routes", "POST", { findingId: unpinnedFinding.id }));
    expect(resPostRoute.status).toBe(401);
  });

  it("lists findings with filter support (severity, category, search)", async () => {
    // All findings for scan
    const res = await getFindings(authReq(`http://localhost:3000/api/findings?scanId=${scanId}`));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.findings).toHaveLength(2);
    expect(data.findings[0].readiness).toBeDefined();
    expect(data.findings[0].readiness.label).toBeDefined();
    expect(data.findings[0].evidenceChain).toBeDefined();

    // Filter by severity: critical
    const critRes = await getFindings(authReq(`http://localhost:3000/api/findings?scanId=${scanId}&severity=CRITICAL`));
    const critData = await critRes.json();
    expect(critData.findings).toHaveLength(1);
    expect(critData.findings[0].id).toBe(secretFinding.id);

    // Filter by category: actions
    const actRes = await getFindings(authReq(`http://localhost:3000/api/findings?scanId=${scanId}&category=actions`));
    const actData = await actRes.json();
    expect(actData.findings).toHaveLength(1);
    expect(actData.findings[0].id).toBe(unpinnedFinding.id);

    // Search query
    const searchRes = await getFindings(authReq(`http://localhost:3000/api/findings?scanId=${scanId}&search=checkout`));
    const searchData = await searchRes.json();
    expect(searchData.findings).toHaveLength(1);
    expect(searchData.findings[0].id).toBe(unpinnedFinding.id);
  });

  it("retrieves finding details by ID and patches review status", async () => {
    const params = Promise.resolve({ findingId: unpinnedFinding.id });
    const res = await getFindingById(
      authReq(`http://localhost:3000/api/findings/${unpinnedFinding.id}`),
      { params }
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.finding.id).toBe(unpinnedFinding.id);
    expect(data.finding.evidenceHash).toBe(unpinnedFinding.evidenceHash);
    expect(data.finding.readiness).toBeDefined();

    // Patch review status
    const patchRes = await patchFindingById(
      authReq(`http://localhost:3000/api/findings/${unpinnedFinding.id}`, "PATCH", { reviewed: true }),
      { params }
    );
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.finding.reviewed).toBe(true);
    expect(patchData.finding.reviewedBy).toBe(TEST_USER.id);
    expect(patchData.finding.reviewedAt).toBeDefined();

    // Verify persisted
    const persisted = db.getFindingById(unpinnedFinding.id);
    expect(persisted?.reviewed).toBe(true);
  });

  it("rejects unauthorized access to finding belonging to another user", async () => {
    const params = Promise.resolve({ findingId: unpinnedFinding.id });
    const res = await getFindingById(
      authReq(`http://localhost:3000/api/findings/${unpinnedFinding.id}`, "GET", undefined, OTHER_USER),
      { params }
    );
    expect(res.status).toBe(403);
  });

  it("creates a contribution route referencing existing evidence and lists routes", async () => {
    const postRes = await postRoutes(
      authReq("http://localhost:3000/api/routes", "POST", { findingId: unpinnedFinding.id })
    );
    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.success).toBe(true);
    expect(postData.route).toBeDefined();
    expect(postData.route.scanId).toBe(scanId);
    expect(postData.route.findingId).toBe(unpinnedFinding.id);
    expect(postData.route.difficulty).toBeDefined();
    expect(postData.route.testPlan.length).toBeGreaterThan(0);
    expect(postData.route.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(postData.route.learningResources).toBeDefined();
    expect(postData.route.contributorLevelImpact).toBeDefined();
    expect(postData.route.readiness.documentationClarity).toBeDefined();
    expect(postData.route.readiness.testAvailability).toBeDefined();
    expect(postData.route.readiness.ciAutomation).toBeDefined();
    expect(postData.route.readiness.dependencyFreshness).toBeDefined();
    expect(postData.route.readiness.securityGovernance).toBeDefined();
    expect(postData.route.readiness.total).toBeDefined();

    // Verify finding was updated with routeId
    const updatedFinding = db.getFindingById(unpinnedFinding.id);
    expect(updatedFinding?.routeCreated).toBe(true);
    expect(updatedFinding?.routeId).toBe(postData.route.id);

    // List routes
    const listRes = await getRoutes(authReq(`http://localhost:3000/api/routes?scanId=${scanId}`));
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.routes.length).toBeGreaterThanOrEqual(1);
    expect(listData.routes.some((r: any) => r.id === postData.route.id)).toBe(true);
  });

  it("retrieves route details with skills gap, updates status and skill progress", async () => {
    // First create the route
    const postRes = await postRoutes(
      authReq("http://localhost:3000/api/routes", "POST", { findingId: unpinnedFinding.id })
    );
    const { route } = await postRes.json();

    const params = Promise.resolve({ routeId: route.id });
    const getRes = await getRouteById(
      authReq(`http://localhost:3000/api/routes/${route.id}`),
      { params }
    );
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.ok).toBe(true);
    expect(getData.route.id).toBe(route.id);
    expect(getData.route.learningChecklist).toBeDefined();
    expect(getData.route.learningChecklist.length).toBeGreaterThan(0);
    expect(getData.route.explanationModes).toBeDefined();

    // Toggle skill progress
    const firstSkill = getData.route.learningChecklist[0];
    const patchSkillRes = await patchRouteById(
      authReq(`http://localhost:3000/api/routes/${route.id}`, "PATCH", {
        skillId: firstSkill.id,
        completed: true,
      }),
      { params }
    );
    expect(patchSkillRes.status).toBe(200);
    const patchedSkillData = await patchSkillRes.json();
    const updatedSkill = patchedSkillData.route.learningChecklist.find((s: any) => s.id === firstSkill.id);
    expect(updatedSkill.completed).toBe(true);

    // Update route status to in-progress
    const patchStatusRes = await patchRouteById(
      authReq(`http://localhost:3000/api/routes/${route.id}`, "PATCH", {
        status: "in-progress",
      }),
      { params }
    );
    expect(patchStatusRes.status).toBe(200);
    const patchedStatusData = await patchStatusRes.json();
    expect(patchedStatusData.route.status).toBe("in-progress");
  });

  it("generates markdown contribution pack for safe finding", async () => {
    const postRes = await postRoutes(
      authReq("http://localhost:3000/api/routes", "POST", { findingId: unpinnedFinding.id })
    );
    const { route } = await postRes.json();

    const params = Promise.resolve({ routeId: route.id });
    const packRes = await getRoutePack(
      authReq(`http://localhost:3000/api/routes/${route.id}/pack`),
      { params }
    );
    expect(packRes.status).toBe(200);
    const packData = await packRes.json();
    expect(packData.ok).toBe(true);
    expect(packData.filename).toContain("contribution-pack");
    expect(packData.markdown).toContain("Contribution Pack");
    expect(packData.markdown).toContain("Skill Gap & Learning Checklist");
    expect(packData.markdown).toContain("Evidence Chain & Trust Trail");
  });

  it("strictly blocks contribution pack export for secret finding (DISCLOSURE_BLOCKED)", async () => {
    // Manually save route for secret finding
    const secretRoute = {
      id: `rt_sec_${Date.now()}`,
      scanId,
      findingId: secretFinding.id,
      title: "Rotate exposed AWS key",
      difficulty: "advanced" as const,
      estimatedEffort: "90 mins",
      steps: ["Revoke key", "Rotate IAM credentials"],
      filesToTouch: [".env"],
      status: "not-started" as const,
      createdAt: new Date().toISOString(),
    };
    db.saveRoute(secretRoute as any);

    const params = Promise.resolve({ routeId: secretRoute.id });
    const packRes = await getRoutePack(
      authReq(`http://localhost:3000/api/routes/${secretRoute.id}/pack`),
      { params }
    );
    expect(packRes.status).toBe(403);
    const packData = await packRes.json();
    expect(packData.errorCode).toBe("DISCLOSURE_BLOCKED");
    expect(packData.error).toContain("strictly blocked");
  });
});
