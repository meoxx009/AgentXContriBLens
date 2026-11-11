import { describe, it, expect, beforeEach } from "vitest";
import { POST as explainPost } from "@/app/api/explain/route";
import { GET as routesGet, POST as routesPost, PATCH as routesPatch } from "@/app/api/routes/route";
import { GET as routeByIdGet, PATCH as routeByIdPatch } from "@/app/api/routes/[routeId]/route";
import { GET as packGet } from "@/app/api/routes/[routeId]/pack/route";
import { GET as findingsGet, POST as findingsPost } from "@/app/api/findings/route";
import { GET as findingByIdGet, PATCH as findingByIdPatch } from "@/app/api/findings/[findingId]/route";
import { GET as draftsGet, POST as draftsPost, PATCH as draftsPatch, DELETE as draftsDelete } from "@/app/api/drafts/route";
import { GET as draftByIdGet, PATCH as draftByIdPatch, DELETE as draftByIdDelete } from "@/app/api/drafts/[draftId]/route";
import { GET as scansGet, POST as scansPost } from "@/app/api/scans/route";
import { GET as scanByIdGet, DELETE as scanByIdDelete } from "@/app/api/scans/[scanId]/route";
import { GET as profileGet, PUT as profilePut, DELETE as profileDelete } from "@/app/api/profile/route";
import { POST as aiPlanPost } from "@/app/api/ai/plan/route";
import { POST as agentRunPost } from "@/app/api/agent/run/route";
import { db } from "@/lib/db";
import { signSessionToken } from "@/lib/auth";
import { apiError, checkRateLimit } from "@/lib/api-guard";
import type { ScanSummary, FindingEvidence, ContributionRoute, IssueDraft } from "@/types";

const USER_ALICE = {
  id: "usr_alice_" + Date.now(),
  email: "alice@example.com",
  name: "Alice Contributor",
  createdAt: new Date().toISOString(),
};

const USER_BOB = {
  id: "usr_bob_" + Date.now(),
  email: "bob@example.com",
  name: "Bob Contributor",
  createdAt: new Date().toISOString(),
};

function authRequest(url: string, method: string = "GET", body?: any, user = USER_ALICE) {
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
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

function unauthRequest(url: string, method: string = "GET", body?: any) {
  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
    },
    body: body !== undefined ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
}

describe("Backend Reliability Audit — Universal Route Guarantees", () => {
  let scanAlice: ScanSummary;
  let findingAlice: FindingEvidence;
  let routeAlice: ContributionRoute;
  let draftAlice: IssueDraft;

  beforeEach(() => {
    db.createUser({
      id: USER_ALICE.id,
      email: USER_ALICE.email,
      name: USER_ALICE.name,
      createdAt: USER_ALICE.createdAt,
    });

    db.createUser({
      id: USER_BOB.id,
      email: USER_BOB.email,
      name: USER_BOB.name,
      createdAt: USER_BOB.createdAt,
    });

    const scanId = `scn_rel_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    scanAlice = {
      id: scanId,
      userId: USER_ALICE.id,
      repoUrl: "https://github.com/alice-org/reliable-repo",
      repoName: "alice-org/reliable-repo",
      owner: "alice-org",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 12,
      totalBytes: 34000,
      status: "completed",
      readinessScore: 95,
      techStack: {
        languages: [],
        packageManagers: [],
        frameworks: [],
        manifestFiles: ["package.json"],
      } as any,
      findingsCount: {
        total: 1,
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        info: 0,
      },
    } as any;
    db.saveScan(scanAlice);

    findingAlice = {
      id: `fnd_rel_${Date.now()}`,
      scanId: scanAlice.id,
      category: "dependency",
      ruleId: "DEP-OUTDATED",
      title: "Vulnerable lodash version",
      severity: "high",
      confidence: "HIGH",
      file: "package.json",
      line: 14,
      description: "Prototype pollution vulnerability",
      remediation: "Upgrade lodash to 4.17.21",
      disclosureMode: "PUBLIC_ISSUE_ALLOWED",
      evidenceHash: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      targetPackage: "lodash",
      currentVersion: "4.17.15",
      patchedVersion: "4.17.21",
    } as any;
    db.saveFindings([findingAlice as any]);

    routeAlice = {
      id: `rt_rel_${Date.now()}`,
      scanId: scanAlice.id,
      findingId: findingAlice.id,
      title: "Bump lodash to 4.17.21",
      difficulty: "beginner",
      estimatedEffort: "20 mins",
      steps: ["Update package.json", "npm install", "npm test"],
      filesToTouch: ["package.json"],
      status: "not-started",
      createdAt: new Date().toISOString(),
    } as any;
    db.saveRoute(routeAlice);

    draftAlice = {
      id: `drf_rel_${Date.now()}`,
      scanId: scanAlice.id,
      routeId: routeAlice.id,
      findingId: findingAlice.id,
      title: "Fix: bump lodash dependency to 4.17.21",
      body: "Addresses prototype pollution in lodash.",
      status: "draft",
      userId: USER_ALICE.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
    db.saveDraft(draftAlice);
  });

  describe("1. Invalid Input (400 Bad Request)", () => {
    it("returns 400 when malformed non-JSON body is sent to POST /api/explain", async () => {
      const req = authRequest("http://localhost:3000/api/explain", "POST", "{invalid-json-body");
      const res = await explainPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
      expect(data.error).toContain("Invalid JSON");
    });

    it("returns 400 when missing required findingId in POST /api/explain", async () => {
      const req = authRequest("http://localhost:3000/api/explain", "POST", {});
      const res = await explainPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
    });

    it("returns 400 when malformed JSON is sent to POST /api/routes", async () => {
      const req = authRequest("http://localhost:3000/api/routes", "POST", "broken{json");
      const res = await routesPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
    });

    it("returns 400 when missing findingId in POST /api/routes", async () => {
      const req = authRequest("http://localhost:3000/api/routes", "POST", {});
      const res = await routesPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
    });

    it("returns 400 on invalid status transition in PATCH /api/routes", async () => {
      const req = authRequest("http://localhost:3000/api/routes", "PATCH", {
        routeId: routeAlice.id,
        status: "completed", // Cannot jump directly from not-started to completed
      });
      const res = await routesPatch(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
      expect(data.error).toContain("Invalid status transition");
    });

    it("returns 400 when missing repositoryUrl in POST /api/agent/run", async () => {
      const req = authRequest("http://localhost:3000/api/agent/run", "POST", {});
      const res = await agentRunPost(req);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_INPUT");
      expect(data.error).toContain("repositoryUrl is required");
    });
  });

  describe("2. Unauthenticated Access (401 Unauthorized)", () => {
    it("rejects unauthenticated GET /api/scans with 401", async () => {
      const req = unauthRequest("http://localhost:3000/api/scans");
      const res = await scansGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated GET /api/findings with 401", async () => {
      const req = unauthRequest(`http://localhost:3000/api/findings?scanId=${scanAlice.id}`);
      const res = await findingsGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated GET /api/routes with 401", async () => {
      const req = unauthRequest(`http://localhost:3000/api/routes?scanId=${scanAlice.id}`);
      const res = await routesGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated GET /api/drafts with 401", async () => {
      const req = unauthRequest(`http://localhost:3000/api/drafts?scanId=${scanAlice.id}`);
      const res = await draftsGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated POST /api/explain with 401", async () => {
      const req = unauthRequest("http://localhost:3000/api/explain", "POST", { findingId: findingAlice.id });
      const res = await explainPost(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated GET /api/profile with 401", async () => {
      const req = unauthRequest("http://localhost:3000/api/profile");
      const res = await profileGet(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("rejects unauthenticated POST /api/ai/plan with 401", async () => {
      const req = unauthRequest("http://localhost:3000/api/ai/plan", "POST", { scanId: scanAlice.id });
      const res = await aiPlanPost(req);

      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });
  });

  describe("3. Ownership Verification (403 Forbidden)", () => {
    it("returns 403 when User Bob attempts to explain User Alice's finding", async () => {
      const req = authRequest("http://localhost:3000/api/explain", "POST", { findingId: findingAlice.id }, USER_BOB);
      const res = await explainPost(req);

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(data.error).toContain("Unauthorized");
    });

    it("returns 403 when User Bob attempts to fetch User Alice's specific route", async () => {
      const params = Promise.resolve({ routeId: routeAlice.id });
      const req = authRequest(`http://localhost:3000/api/routes/${routeAlice.id}`, "GET", undefined, USER_BOB);
      const res = await routeByIdGet(req, { params });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("returns 403 when User Bob attempts to delete User Alice's scan", async () => {
      const params = Promise.resolve({ scanId: scanAlice.id });
      const req = authRequest(`http://localhost:3000/api/scans/${scanAlice.id}`, "DELETE", undefined, USER_BOB);
      const res = await scanByIdDelete(req, { params });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("returns 403 when User Bob attempts to access User Alice's draft by ID", async () => {
      const params = Promise.resolve({ draftId: draftAlice.id });
      const req = authRequest(`http://localhost:3000/api/drafts/${draftAlice.id}`, "GET", undefined, USER_BOB);
      const res = await draftByIdGet(req, { params });

      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });
  });

  describe("4. Missing Resources (404 Not Found)", () => {
    it("returns 404 when scan ID does not exist in GET /api/scans/[scanId]", async () => {
      const params = Promise.resolve({ scanId: "scn_non_existent" });
      const req = authRequest("http://localhost:3000/api/scans/scn_non_existent", "GET", undefined, USER_ALICE);
      const res = await scanByIdGet(req, { params });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
      expect(data.error).toBe("Scan not found");
    });

    it("returns 404 when finding ID does not exist in GET /api/findings/[findingId]", async () => {
      const params = Promise.resolve({ findingId: "fnd_non_existent" });
      const req = authRequest("http://localhost:3000/api/findings/fnd_non_existent", "GET", undefined, USER_ALICE);
      const res = await findingByIdGet(req, { params });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
      expect(data.error).toBe("Finding not found");
    });

    it("returns 404 when route ID does not exist in GET /api/routes/[routeId]", async () => {
      const params = Promise.resolve({ routeId: "rt_non_existent" });
      const req = authRequest("http://localhost:3000/api/routes/rt_non_existent", "GET", undefined, USER_ALICE);
      const res = await routeByIdGet(req, { params });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
      expect(data.error).toBe("Route not found");
    });

    it("returns 404 when draft ID does not exist in GET /api/drafts/[draftId]", async () => {
      const params = Promise.resolve({ draftId: "drf_non_existent" });
      const req = authRequest("http://localhost:3000/api/drafts/drf_non_existent", "GET", undefined, USER_ALICE);
      const res = await draftByIdGet(req, { params });

      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.errorCode).toBe("GITHUB_NOT_FOUND");
      expect(data.error).toBe("Draft not found");
    });
  });

  describe("5. Unified Error Response Helper & Safe Masking", () => {
    it("apiError creates safe error response with correlationId and redacted secrets", async () => {
      const secret = "ghp_123456789012345678901234567890123456";
      const res = apiError(`Failed to connect with token ${secret}`, 500, "PERSISTENCE_FAILED");

      expect(res.status).toBe(500);
      const data = await res.json();

      expect(data.ok).toBe(false);
      expect(data.errorCode).toBe("PERSISTENCE_FAILED");
      expect(data.error).not.toContain("123456789012345678901234567890");
      expect(data.error).toContain("ghp_********************************3456");
      expect(data.correlationId).toMatch(/^CL-ERR-[A-Z0-9]+$/);
      expect(data.errorDetails).toBeDefined();
      expect(data.errorDetails.code).toBe("PERSISTENCE_FAILED");
    });

    it("enforces in-memory rate limiting with 429 when threshold exceeded", () => {
      const key = `test_rate_${Date.now()}`;
      // Allow 3 requests
      const r1 = checkRateLimit(key, { windowMs: 10000, max: 3 });
      const r2 = checkRateLimit(key, { windowMs: 10000, max: 3 });
      const r3 = checkRateLimit(key, { windowMs: 10000, max: 3 });
      const r4 = checkRateLimit(key, { windowMs: 10000, max: 3 });

      expect(r1.allowed).toBe(true);
      expect(r2.allowed).toBe(true);
      expect(r3.allowed).toBe(true);
      expect(r4.allowed).toBe(false);
      expect(r4.remaining).toBe(0);
      expect(r4.resetTime).toBeGreaterThan(Date.now());
    });
  });
});
