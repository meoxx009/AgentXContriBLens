import { describe, it, expect, beforeEach } from "vitest";
import { POST as postDraft, GET as getDrafts, PATCH as patchDraft, DELETE as deleteDraft } from "../src/app/api/drafts/route";
import { GET as getDraftById, PATCH as patchDraftById, DELETE as deleteDraftById } from "../src/app/api/drafts/[draftId]/route";
import { GET as getProfile, PUT as putProfile, DELETE as deleteProfile } from "../src/app/api/profile/route";
import { db } from "../src/lib/db";
import { signSessionToken } from "../src/lib/auth";
import type { ScanSummary, FindingEvidence, ContributionRoute } from "../src/types";

const TEST_USER = {
  id: "test-user-p9",
  email: "p9-tester@example.com",
  name: "Phase 9 Tester",
  createdAt: new Date().toISOString(),
  settings: {
    theme: "dark" as const,
    fontSize: "normal" as const,
    reduceMotion: false,
    strictRedaction: true,
  },
};

const OTHER_USER = {
  id: "other-user-p9",
  email: "other9@example.com",
  name: "Other User 9",
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

describe("Phase 9 — Issue Drafts & Profile Safety", () => {
  const scanId = `scn_p9_${Date.now()}`;
  const workflowFinding: FindingEvidence = {
    id: "fnd_p9_workflow",
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
    learningResources: [],
    disclosureMode: "public-issue",
    redacted: false,
    evidenceHash: "hash_wf_p9_123",
    fingerprint: "GH-ACTIONS-UNPINNED:.github/workflows/ci.yml:12",
    createdAt: new Date().toISOString(),
  };

  const secretFinding: FindingEvidence = {
    id: "fnd_p9_secret",
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
    evidenceHash: "hash_sec_p9_456",
    fingerprint: "SECRET-AWS-KEY:.env:4",
    createdAt: new Date().toISOString(),
  };

  const mockScan: ScanSummary = {
    id: scanId,
    userId: TEST_USER.id,
    repoUrl: "https://github.com/owner/p9-repo",
    repoName: "owner/p9-repo",
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

  const workflowRoute: ContributionRoute = {
    id: `rt_wf_${Date.now()}`,
    scanId,
    findingId: workflowFinding.id,
    findingIds: [workflowFinding.id],
    title: "Pin GitHub Action to full commit SHA",
    summary: "Pin GitHub Action to full commit SHA",
    difficulty: "beginner",
    estimatedEffort: "20 minutes",
    estimatedMinutes: 20,
    skills: ["GitHub Actions"],
    files: [".github/workflows/ci.yml"],
    suggestedChange: "Pin to immutable 40-char SHA",
    testPlan: ["Run workflow on branch", "Check action integrity"],
    acceptanceCriteria: ["All third-party actions pinned to SHA"],
    readiness: { total: 90 },
    status: "not-started",
    createdAt: new Date().toISOString(),
  };

  const secretRoute: ContributionRoute = {
    id: `rt_sec_${Date.now()}`,
    scanId,
    findingId: secretFinding.id,
    findingIds: [secretFinding.id],
    title: "Rotate exposed AWS key",
    summary: "Rotate exposed AWS key",
    difficulty: "advanced",
    estimatedEffort: "90 minutes",
    estimatedMinutes: 90,
    skills: ["Secrets Management"],
    files: [".env"],
    suggestedChange: "Rotate credentials in AWS IAM",
    testPlan: ["Verify new credentials in dev"],
    acceptanceCriteria: ["Revoke old key and rotate IAM credentials"],
    readiness: { total: 30 },
    status: "not-started",
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    db.saveUser(OTHER_USER);
    db.saveScan(mockScan);
    db.saveFindings([workflowFinding, secretFinding]);
    db.saveRoute(workflowRoute);
    db.saveRoute(secretRoute);
  });

  it("rejects unauthenticated requests to drafts with 401", async () => {
    const res = await postDraft(unauthReq("http://localhost:3000/api/drafts", "POST", { routeId: workflowRoute.id }));
    expect(res.status).toBe(401);
  });

  it("generates maintainer-reviewable issue draft for safe workflow finding", async () => {
    const res = await postDraft(
      authReq("http://localhost:3000/api/drafts", "POST", { routeId: workflowRoute.id })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.draft).toBeDefined();
    expect(data.draft.id).toBeDefined();
    expect(data.draft.title).toContain("Unpinned");
    expect(data.draft.markdownContent).toContain("Problem Description");
    expect(data.draft.markdownContent).toContain("Evidence");
    expect(data.draft.markdownContent).toContain("Verification & Test Plan");
    expect(data.draft.markdownContent).toContain("Maintainer Notice");

    // Verify route was updated with draftId
    const updatedRoute = db.getRouteById(workflowRoute.id);
    expect(updatedRoute?.draftId).toBe(data.draft.id);

    // Verify persisted in DB
    const persistedDraft = db.getDraftById(data.draft.id);
    expect(persistedDraft).toBeDefined();
  });

  it("strictly blocks issue draft generation for secret findings (DISCLOSURE_BLOCKED)", async () => {
    const res = await postDraft(
      authReq("http://localhost:3000/api/drafts", "POST", { routeId: secretRoute.id })
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.errorCode).toBe("DISCLOSURE_BLOCKED");
    expect(data.guidance).toContain("SECURITY.md");
  });

  it("lists drafts, fetches by ID, patches title/status, and deletes draft", async () => {
    // Generate draft first
    const postRes = await postDraft(
      authReq("http://localhost:3000/api/drafts", "POST", { routeId: workflowRoute.id })
    );
    const { draft } = await postRes.json();

    // List drafts
    const listRes = await getDrafts(authReq(`http://localhost:3000/api/drafts?scanId=${scanId}`));
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(listData.drafts.some((d: any) => d.id === draft.id)).toBe(true);

    // Get by draftId
    const getRes = await getDraftById(
      authReq(`http://localhost:3000/api/drafts/${draft.id}`),
      { params: Promise.resolve({ draftId: draft.id }) }
    );
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.draft.id).toBe(draft.id);

    // Patch draft
    const patchRes = await patchDraftById(
      authReq(`http://localhost:3000/api/drafts/${draft.id}`, "PATCH", {
        title: "[Updated] Custom Issue Title",
        status: "reviewed",
      }),
      { params: Promise.resolve({ draftId: draft.id }) }
    );
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.draft.title).toBe("[Updated] Custom Issue Title");
    expect(patchData.draft.status).toBe("reviewed");

    // Delete draft
    const delRes = await deleteDraftById(
      authReq(`http://localhost:3000/api/drafts/${draft.id}`, "DELETE"),
      { params: Promise.resolve({ draftId: draft.id }) }
    );
    expect(delRes.status).toBe(200);
    expect(db.getDraftById(draft.id)).toBeUndefined();
  });

  it("handles profile retrieval and export", async () => {
    // Standard profile GET
    const res = await getProfile(authReq("http://localhost:3000/api/profile"));
    expect(res.status).toBe(200);
    const profileData = await res.json();
    expect(profileData.user.id).toBe(TEST_USER.id);
    expect(profileData.scans).toBeDefined();

    // Export GET with attachment header
    const exportRes = await getProfile(authReq("http://localhost:3000/api/profile?export=true"));
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get("Content-Disposition")).toContain("attachment; filename=");
  });

  it("updates and persists appearance settings across refreshes", async () => {
    const putRes = await putProfile(
      authReq("http://localhost:3000/api/profile", "PUT", {
        name: "Renamed Tester",
        settings: {
          theme: "linen",
          fontSize: "comfortable",
          reduceMotion: true,
          strictRedaction: true,
        },
      })
    );
    expect(putRes.status).toBe(200);
    const putData = await putRes.json();
    expect(putData.success).toBe(true);
    expect(putData.user.name).toBe("Renamed Tester");
    expect(putData.user.settings.theme).toBe("linen");
    expect(putData.user.settings.reduceMotion).toBe(true);

    // Verify persistence in DB (simulating refresh)
    const persisted = db.getUserById(TEST_USER.id);
    expect(persisted?.name).toBe("Renamed Tester");
    expect(persisted?.settings?.theme).toBe("linen");
    expect(persisted?.settings?.reduceMotion).toBe(true);
  });

  it("clears user data and deletes user account permanently", async () => {
    // Clear scans data
    const clearRes = await deleteProfile(authReq("http://localhost:3000/api/profile", "DELETE"));
    expect(clearRes.status).toBe(200);
    const clearData = await clearRes.json();
    expect(clearData.success).toBe(true);

    // Delete user account
    const delAccountRes = await deleteProfile(
      authReq("http://localhost:3000/api/profile?account=true", "DELETE")
    );
    expect(delAccountRes.status).toBe(200);
    expect(db.getUserById(TEST_USER.id)).toBeUndefined();
  });
});
