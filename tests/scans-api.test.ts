import { describe, it, expect, beforeEach } from "vitest";
import { POST as scanPost, GET as scanGet } from "../src/app/api/scans/route";
import { GET as scanDetailGet } from "../src/app/api/scans/[scanId]/route";
import { db } from "../src/lib/db";
import { signSessionToken } from "../src/lib/auth";
import type { ScanSummary, FindingEvidence } from "../src/types";

const TEST_USER = {
  id: "test-user-scan-api",
  email: "scanner@example.com",
  name: "Scanner Tester",
  createdAt: new Date().toISOString(),
};

function createAuthRequest(url: string, method: string, body?: any, user = TEST_USER) {
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

function createUnauthRequest(url: string, method: string, body?: any) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("Phase 6 — Scan API & Persistence (/api/scans)", () => {
  beforeEach(() => {
    db.saveUser(TEST_USER);
  });

  it("rejects unauthenticated POST /api/scans with 401", async () => {
    const req = createUnauthRequest("http://localhost:3000/api/scans", "POST", {
      repositoryUrl: "https://github.com/expressjs/express",
    });

    const res = await scanPost(req);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("rejects invalid repository URL with 400 and GITHUB_INVALID_URL", async () => {
    const req = createAuthRequest("http://localhost:3000/api/scans", "POST", {
      repositoryUrl: "https://gitlab.com/not/github",
    });

    const res = await scanPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorCode).toBe("GITHUB_INVALID_URL");
  });

  it("rejects empty repository URL with 400", async () => {
    const req = createAuthRequest("http://localhost:3000/api/scans", "POST", {
      repositoryUrl: "",
    });

    const res = await scanPost(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errorCode).toBe("GITHUB_INVALID_URL");
  });

  it("returns cached scan when identical repository was scanned recently", async () => {
    const scanId = `scn_cached_${Date.now()}`;
    const mockScan: ScanSummary = {
      id: scanId,
      userId: TEST_USER.id,
      repoUrl: "https://github.com/expressjs/express",
      repoName: "expressjs/express",
      owner: "expressjs",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 25,
      totalBytes: 50000,
      status: "completed",
      readinessScore: 85,
      techStack: {
        languages: [{ name: "JavaScript", percentage: 100, filesCount: 25 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 2, critical: 0, high: 1, medium: 1, low: 0, info: 0 },
    };

    const mockFinding: FindingEvidence = {
      id: "fnd_mock_1",
      scanId,
      category: "github-actions",
      ruleId: "GH-ACTIONS-UNPINNED",
      title: "Unpinned Action",
      severity: "medium",
      confidence: 0.9,
      sourceTool: "tool",
      file: ".github/workflows/ci.yml",
      evidence: "uses: actions/checkout@v3",
      impact: "impact",
      fixHint: "fix",
      skills: ["GitHub Actions"],
      learningResources: [],
      disclosureMode: "public-issue",
      redacted: false,
      evidenceHash: "hash123",
      fingerprint: "fp123",
      createdAt: new Date().toISOString(),
    };

    db.saveScan(mockScan);
    db.saveFindings([mockFinding]);

    const req = createAuthRequest("http://localhost:3000/api/scans", "POST", {
      repositoryUrl: "https://github.com/expressjs/express",
      ref: "main",
    });

    const res = await scanPost(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.cached).toBe(true);
    expect(data.scanId).toBe(scanId);
    expect(data.repository.fullName).toBe("expressjs/express");
    expect(data.scope).toBeDefined();
    expect(data.technologies).toBeDefined();
    expect(data.diff).toBeDefined();
    expect(data.summary.findings).toBe(2);
  });

  it("returns list of user scans on authenticated GET /api/scans", async () => {
    const req = createAuthRequest("http://localhost:3000/api/scans", "GET");
    const res = await scanGet(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.scans)).toBe(true);
  });

  it("returns scan details on GET /api/scans/[scanId]", async () => {
    const scanId = `scn_detail_${Date.now()}`;
    const mockScan: ScanSummary = {
      id: scanId,
      userId: TEST_USER.id,
      repoUrl: "https://github.com/owner/repo",
      repoName: "owner/repo",
      owner: "owner",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 10,
      totalBytes: 20000,
      status: "completed",
      readinessScore: 90,
      techStack: {
        languages: [{ name: "TypeScript", percentage: 100, filesCount: 10 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    };

    db.saveScan(mockScan);

    const req = createAuthRequest(`http://localhost:3000/api/scans/${scanId}`, "GET");
    const res = await scanDetailGet(req, { params: Promise.resolve({ scanId }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.scanId).toBe(scanId);
    expect(data.repository.fullName).toBe("owner/repo");
  });

  it("returns 404 for non-existent scan ID on GET /api/scans/[scanId]", async () => {
    const nonExistentId = "scn_does_not_exist";
    const req = createAuthRequest(`http://localhost:3000/api/scans/${nonExistentId}`, "GET");
    const res = await scanDetailGet(req, { params: Promise.resolve({ scanId: nonExistentId }) });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
  });

  it("returns 403 when user attempts to access another user's scan", async () => {
    const otherUserScanId = `scn_other_${Date.now()}`;
    const otherUserScan: ScanSummary = {
      id: otherUserScanId,
      userId: "some-other-user-id",
      repoUrl: "https://github.com/secret/repo",
      repoName: "secret/repo",
      owner: "secret",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 5,
      totalBytes: 10000,
      status: "completed",
      readinessScore: 75,
      techStack: {
        languages: [],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 0, critical: 0, high: 0, medium: 0, low: 0, info: 0 },
    };

    db.saveScan(otherUserScan);

    const req = createAuthRequest(`http://localhost:3000/api/scans/${otherUserScanId}`, "GET");
    const res = await scanDetailGet(req, { params: Promise.resolve({ scanId: otherUserScanId }) });
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.ok).toBe(false);
  });
});
