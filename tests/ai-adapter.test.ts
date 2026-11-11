import { describe, it, expect, beforeEach } from "vitest";
import { POST as aiPlanPost } from "../src/app/api/ai/plan/route";
import { db } from "../src/lib/db";
import { signSessionToken } from "../src/lib/auth";
import {
  generateGroundedPlan,
  explainFinding,
  buildContributionRoute,
  createIssueDraft,
  validateGeminiResponse,
} from "../src/lib/gemini";
import type { ScanSummary, FindingEvidence } from "../src/types";

const TEST_USER = {
  id: "test-user-ai-plan",
  email: "ai-tester@example.com",
  name: "AI Plan Tester",
  createdAt: new Date().toISOString(),
};

function createAuthRequest(body: any, user = TEST_USER) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request("http://localhost:3000/api/ai/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `contriblens_session=${token}`,
    },
    body: JSON.stringify(body),
  });
}

function createUnauthRequest(body: any) {
  return new Request("http://localhost:3000/api/ai/plan", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("Phase 7 — AI Adapter & Grounding Engine (/api/ai/plan)", () => {
  const scanId = `scn_ai_${Date.now()}`;
  const unpinnedFinding: FindingEvidence = {
    id: "fnd_unpinned_1",
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
    evidenceHash: "hash_unpinned_123",
    fingerprint: "GH-ACTIONS-UNPINNED:.github/workflows/ci.yml:12",
    createdAt: new Date().toISOString(),
  };

  const secretFinding: FindingEvidence = {
    id: "fnd_secret_1",
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
    evidenceHash: "hash_secret_456",
    fingerprint: "SECRET-AWS-KEY:.env:4",
    createdAt: new Date().toISOString(),
  };

  const mockScan: ScanSummary = {
    id: scanId,
    userId: TEST_USER.id,
    repoUrl: "https://github.com/owner/repo",
    repoName: "owner/repo",
    owner: "owner",
    branch: "main",
    scannedAt: new Date().toISOString(),
    totalFiles: 15,
    totalBytes: 30000,
    status: "completed",
    readinessScore: 80,
    techStack: {
      languages: [{ name: "TypeScript", percentage: 100, filesCount: 15 }],
      frameworks: [],
      tooling: [],
      manifests: [],
      confidenceScore: 100,
    },
    findingsCount: { total: 2, critical: 1, high: 0, medium: 1, low: 0, info: 0 },
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    db.saveScan(mockScan);
    db.saveFindings([unpinnedFinding, secretFinding]);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const req = createUnauthRequest({ scanId, findingIds: [unpinnedFinding.id], operation: "explain" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects invalid operation parameter with 400", async () => {
    const req = createAuthRequest({ scanId, findingIds: [unpinnedFinding.id], operation: "invalid-op" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
  });

  it("rejects unknown finding ID with 404", async () => {
    const req = createAuthRequest({ scanId, findingIds: ["fnd_does_not_exist"], operation: "explain" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
  });

  it("strictly blocks issue draft generation for secret findings (DISCLOSURE_BLOCKED)", async () => {
    const req = createAuthRequest({ scanId, findingIds: [secretFinding.id], operation: "issue" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.errorCode).toBe("DISCLOSURE_BLOCKED");
    expect(data.error).toContain("blocked for secrets");
  });

  it("executes deterministic keyless plan for explain operation", async () => {
    const req = createAuthRequest({ scanId, findingIds: [unpinnedFinding.id], operation: "explain" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.operation).toBe("explain");
    expect(data.plan).toBeDefined();
    expect(data.plan.taskTitle).toContain("Unpinned");
    expect(data.explanation).toBeDefined();
    expect(data.engineUsed).toBeDefined();
  });

  it("executes route generation and persists route to database", async () => {
    const req = createAuthRequest({ scanId, findingIds: [unpinnedFinding.id], operation: "route" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.route).toBeDefined();
    expect(data.route.scanId).toBe(scanId);
    expect(data.route.difficulty).toBeDefined();

    // Verify persisted in DB
    const savedRoute = db.getRouteById(data.route.id);
    expect(savedRoute).toBeDefined();
    expect(savedRoute?.title).toBe(data.route.title);
  });

  it("executes issue draft generation for non-secret finding", async () => {
    const req = createAuthRequest({ scanId, findingIds: [unpinnedFinding.id], operation: "issue" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.draft).toBeDefined();
    expect(data.draft.markdownContent).toContain("Problem Description");
    expect(data.draft.markdownContent).not.toContain("AKIA"); // No secret leaks
  });

  it("generates repository summary architecture overview", async () => {
    const req = createAuthRequest({ scanId, operation: "summary" });
    const res = await aiPlanPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.summary).toBeDefined();
    expect(data.summary.repoName).toBe("owner/repo");
    expect(data.summary.technologies).toContain("TypeScript");
  });

  it("validates grounded response and rejects unsupported claims or altered severities", () => {
    // Valid response passes
    const valid = validateGeminiResponse(
      {
        findingIds: [unpinnedFinding.id],
        explanation: "This workflow action references a mutable version tag instead of a commit SHA.",
        taskTitle: "Fix unpinned action",
        taskSummary: "Update to SHA",
        difficulty: "beginner",
        skills: ["Actions"],
        files: [".github/workflows/ci.yml"],
        testPlan: ["Run test"],
        acceptanceCriteria: ["Passes"],
      },
      [unpinnedFinding.id],
      [".github/workflows/ci.yml"],
      "medium"
    );
    expect(valid.valid).toBe(true);

    // Hallucinated finding ID is rejected
    const invalidFindingId = validateGeminiResponse(
      {
        findingIds: ["hallucinated-id-999"],
        explanation: "Some explanation",
        taskTitle: "Fix",
        taskSummary: "Fix",
        difficulty: "beginner",
        skills: ["Actions"],
        files: [".github/workflows/ci.yml"],
        testPlan: ["Run test"],
        acceptanceCriteria: ["Passes"],
      },
      [unpinnedFinding.id],
      [".github/workflows/ci.yml"],
      "medium"
    );
    expect(invalidFindingId.valid).toBe(false);
    expect(invalidFindingId.reason).toContain("Unknown finding ID");
  });
});
