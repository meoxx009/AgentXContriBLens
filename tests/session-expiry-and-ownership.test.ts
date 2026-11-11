import { describe, it, expect, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { POST as refreshHandler } from "@/app/api/auth/refresh/route";
import { GET as getScans } from "@/app/api/scans/route";
import { GET as getFindings } from "@/app/api/findings/route";
import { GET as getFindingById } from "@/app/api/findings/[findingId]/route";
import { GET as getRoutes } from "@/app/api/routes/route";
import { GET as getRouteById } from "@/app/api/routes/[routeId]/route";
import { GET as getDrafts } from "@/app/api/drafts/route";
import { db } from "@/lib/db";
import { signSessionToken, JWT_SECRET } from "@/lib/auth";
import type { ScanSummary, FindingEvidence, ContributionRoute, IssueDraft } from "@/types";

const USER_A = {
  id: "user-alpha-" + Date.now(),
  email: "alpha@example.com",
  name: "User Alpha",
  createdAt: new Date().toISOString(),
};

const USER_B = {
  id: "user-beta-" + Date.now(),
  email: "beta@example.com",
  name: "User Beta",
  createdAt: new Date().toISOString(),
};

function authReq(url: string, method: string = "GET", body?: any, user = USER_A) {
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

function expiredTokenReq(url: string, method: string = "GET", user = USER_A) {
  // Sign a token that expired 10 minutes ago
  const payload = {
    userId: user.id,
    id: user.id,
    email: user.email,
    name: user.name,
    iat: Math.floor(Date.now() / 1000) - 1200,
    exp: Math.floor(Date.now() / 1000) - 600,
  };
  const token = jwt.sign(payload, JWT_SECRET);

  return new Request(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: `contriblens_session=${token}`,
    },
  });
}

describe("Session Expiry, Auto-Refresh, and 404/403 Ownership Separation", () => {
  let scanA: ScanSummary;
  let findingA: FindingEvidence;
  let routeA: ContributionRoute;
  let draftA: IssueDraft;

  beforeEach(() => {
    db.createUser({
      id: USER_A.id,
      email: USER_A.email,
      name: USER_A.name,
      createdAt: USER_A.createdAt,
    });
    db.createUser({
      id: USER_B.id,
      email: USER_B.email,
      name: USER_B.name,
      createdAt: USER_B.createdAt,
    });

    const scanId = `scn_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    scanA = {
      id: scanId,
      userId: USER_A.id,
      repoUrl: "https://github.com/owner/repo-a",
      repoName: "owner/repo-a",
      owner: "owner",
      branch: "main",
      scannedAt: new Date().toISOString(),
      totalFiles: 10,
      totalBytes: 50000,
      status: "completed",
      readinessScore: 92,
      techStack: {
        languages: [],
        packageManagers: [],
        frameworks: [],
        ciWorkflows: [],
        containerization: [],
        manifestFiles: ["package.json"],
      },
      findingsCount: {
        total: 1,
        critical: 0,
        high: 1,
        medium: 0,
        low: 0,
        info: 0,
      },
    } as any;
    db.saveScan(scanA);

    findingA = {
      id: `fnd_test_${Date.now()}`,
      scanId: scanA.id,
      category: "dependency",
      ruleId: "DEP-OUTDATED",
      title: "Outdated vulnerable package",
      severity: "high",
      confidence: "HIGH",
      file: "package.json",
      line: 12,
      description: "High severity vulnerability detected in dependency.",
      remediation: "Upgrade dependency to latest secure version.",
      disclosureMode: "PUBLIC_ISSUE_ALLOWED",
      evidenceHash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
      cve: "CVE-2026-9999",
      targetPackage: "express",
      currentVersion: "4.17.1",
      patchedVersion: "4.21.0",
    } as any;
    db.saveFindings([findingA as any]);

    routeA = {
      id: `rt_test_${Date.now()}`,
      scanId: scanA.id,
      findingId: findingA.id,
      title: "Update express dependency",
      difficulty: "beginner",
      estimatedEffort: "30 mins",
      steps: ["Update package.json", "npm install", "run tests"],
      filesToTouch: ["package.json"],
      status: "not-started",
      createdAt: new Date().toISOString(),
    } as any;
    db.saveRoute(routeA);

    draftA = {
      id: `drf_test_${Date.now()}`,
      scanId: scanA.id,
      routeId: routeA.id,
      findingId: findingA.id,
      title: "Fix: bump express to secure version",
      body: "Security fix for CVE-2026-9999",
      status: "draft",
      userId: USER_A.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;
    db.saveDraft(draftA);
  });

  describe("1. Auto-Refresh Endpoint (POST /api/auth/refresh)", () => {
    it("refreshes an active session and returns 200 with new token and session cookie", async () => {
      const req = authReq("http://localhost:3000/api/auth/refresh", "POST", {}, USER_A);
      const res = await refreshHandler(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.user.id).toBe(USER_A.id);
      expect(body.user.email).toBe(USER_A.email);

      // Verify Set-Cookie header contains fresh contriblens_session
      const setCookie = res.headers.get("Set-Cookie");
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain("contriblens_session=");
      expect(setCookie).toContain("Max-Age=604800");
    });

    it("returns 401 when unauthenticated request calls refresh", async () => {
      const req = new Request("http://localhost:3000/api/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const res = await refreshHandler(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Session expired or invalid");
    });

    it("returns 401 when token is expired without Supabase session", async () => {
      const req = expiredTokenReq("http://localhost:3000/api/auth/refresh", "POST", USER_A);
      const res = await refreshHandler(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toContain("Session expired");
    });
  });

  describe("2. Honest Session Expiry Handling Across Routes", () => {
    it("returns 401 for expired session on GET /api/scans", async () => {
      const req = expiredTokenReq("http://localhost:3000/api/scans");
      const res = await getScans(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("returns 401 for expired session on GET /api/findings", async () => {
      const req = expiredTokenReq(`http://localhost:3000/api/findings?scanId=${scanA.id}`);
      const res = await getFindings(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("returns 401 for expired session on GET /api/routes", async () => {
      const req = expiredTokenReq(`http://localhost:3000/api/routes?scanId=${scanA.id}`);
      const res = await getRoutes(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });

    it("returns 401 for expired session on GET /api/drafts", async () => {
      const req = expiredTokenReq(`http://localhost:3000/api/drafts?scanId=${scanA.id}`);
      const res = await getDrafts(req);

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
    });
  });

  describe("3. Ownership Verification (404 vs 403 Separation)", () => {
    it("returns 404 when scanId does NOT exist (GET /api/findings)", async () => {
      const req = authReq("http://localhost:3000/api/findings?scanId=scn_non_existent", "GET", undefined, USER_A);
      const res = await getFindings(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Scan not found");
    });

    it("returns 403 when authenticated user does NOT own the scan (GET /api/findings)", async () => {
      // USER_B requests findings for scanA (owned by USER_A)
      const req = authReq(`http://localhost:3000/api/findings?scanId=${scanA.id}`, "GET", undefined, USER_B);
      const res = await getFindings(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 200 when authenticated owner accesses the scan (GET /api/findings)", async () => {
      const req = authReq(`http://localhost:3000/api/findings?scanId=${scanA.id}`, "GET", undefined, USER_A);
      const res = await getFindings(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.findings).toHaveLength(1);
      expect(body.findings[0].id).toBe(findingA.id);
    });

    it("returns 404 when scanId does NOT exist (GET /api/routes)", async () => {
      const req = authReq("http://localhost:3000/api/routes?scanId=scn_non_existent", "GET", undefined, USER_A);
      const res = await getRoutes(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Scan not found");
    });

    it("returns 403 when authenticated user does NOT own the scan (GET /api/routes)", async () => {
      const req = authReq(`http://localhost:3000/api/routes?scanId=${scanA.id}`, "GET", undefined, USER_B);
      const res = await getRoutes(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 200 when owner accesses routes (GET /api/routes)", async () => {
      const req = authReq(`http://localhost:3000/api/routes?scanId=${scanA.id}`, "GET", undefined, USER_A);
      const res = await getRoutes(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.routes).toHaveLength(1);
    });

    it("returns 404 when scanId does NOT exist (GET /api/drafts)", async () => {
      const req = authReq("http://localhost:3000/api/drafts?scanId=scn_non_existent", "GET", undefined, USER_A);
      const res = await getDrafts(req);

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Scan not found");
    });

    it("returns 403 when authenticated user does NOT own the scan (GET /api/drafts)", async () => {
      const req = authReq(`http://localhost:3000/api/drafts?scanId=${scanA.id}`, "GET", undefined, USER_B);
      const res = await getDrafts(req);

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 200 when owner accesses drafts (GET /api/drafts)", async () => {
      const req = authReq(`http://localhost:3000/api/drafts?scanId=${scanA.id}`, "GET", undefined, USER_A);
      const res = await getDrafts(req);

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.drafts).toHaveLength(1);
    });

    it("returns 404 for nonexistent finding ID (GET /api/findings/[findingId])", async () => {
      const params = Promise.resolve({ findingId: "fnd_missing_id" });
      const req = authReq("http://localhost:3000/api/findings/fnd_missing_id", "GET", undefined, USER_A);
      const res = await getFindingById(req, { params });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Finding not found");
    });

    it("returns 403 when non-owner requests a specific finding (GET /api/findings/[findingId])", async () => {
      const params = Promise.resolve({ findingId: findingA.id });
      const req = authReq(`http://localhost:3000/api/findings/${findingA.id}`, "GET", undefined, USER_B);
      const res = await getFindingById(req, { params });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 200 when owner requests their specific finding (GET /api/findings/[findingId])", async () => {
      const params = Promise.resolve({ findingId: findingA.id });
      const req = authReq(`http://localhost:3000/api/findings/${findingA.id}`, "GET", undefined, USER_A);
      const res = await getFindingById(req, { params });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.finding.id).toBe(findingA.id);
    });

    it("returns 404 for nonexistent route ID (GET /api/routes/[routeId])", async () => {
      const params = Promise.resolve({ routeId: "rt_missing_id" });
      const req = authReq("http://localhost:3000/api/routes/rt_missing_id", "GET", undefined, USER_A);
      const res = await getRouteById(req, { params });

      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toBe("Route not found");
    });

    it("returns 403 when non-owner requests a specific route (GET /api/routes/[routeId])", async () => {
      const params = Promise.resolve({ routeId: routeA.id });
      const req = authReq(`http://localhost:3000/api/routes/${routeA.id}`, "GET", undefined, USER_B);
      const res = await getRouteById(req, { params });

      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.errorCode).toBe("AUTH_INVALID_CREDENTIALS");
      expect(body.error).toContain("Unauthorized");
    });

    it("returns 200 when owner requests their specific route (GET /api/routes/[routeId])", async () => {
      const params = Promise.resolve({ routeId: routeA.id });
      const req = authReq(`http://localhost:3000/api/routes/${routeA.id}`, "GET", undefined, USER_A);
      const res = await getRouteById(req, { params });

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.route.id).toBe(routeA.id);
    });
  });

  describe("4. Database Concurrency & Retry Safety", () => {
    it("handles multiple rapid parallel writes without dropping data or crashing with unhandled persistence errors", async () => {
      const parallelWrites = Array.from({ length: 15 }, (_, i) => {
        return Promise.resolve().then(() => {
          const scan: ScanSummary = {
            id: `scn_parallel_${Date.now()}_${i}`,
            userId: USER_A.id,
            repoUrl: `https://github.com/org/repo-${i}`,
            repoName: `org/repo-${i}`,
            owner: "org",
            branch: "main",
            scannedAt: new Date().toISOString(),
            totalFiles: 5,
            totalBytes: 1000,
            status: "completed",
            readinessScore: 90,
            techStack: {
              languages: [],
              packageManagers: [],
              frameworks: [],
              manifestFiles: ["package.json"],
            } as any,
            findingsCount: {
              total: 0,
              critical: 0,
              high: 0,
              medium: 0,
              low: 0,
              info: 0,
            },
          } as any;
          return db.saveScan(scan);
        });
      });

      const results = await Promise.all(parallelWrites);
      expect(results).toHaveLength(15);

      // Verify that all 15 scans are accessible via db.getScans
      const allScans = db.getScans(USER_A.id);
      for (const res of results) {
        expect(allScans.some((s) => s.id === res.id)).toBe(true);
      }
    });
  });
});
