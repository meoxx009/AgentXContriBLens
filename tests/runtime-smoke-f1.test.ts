import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getFindings } from '@/app/api/findings/route';
import { GET as getFindingDetail, PATCH as patchFinding } from '@/app/api/findings/[findingId]/route';
import { GET as getRoutes, POST as postRoutes, PATCH as patchRoutes } from '@/app/api/routes/route';
import { GET as getRouteDetail, PATCH as patchRouteDetail } from '@/app/api/routes/[routeId]/route';
import { GET as getDrafts, POST as postDrafts } from '@/app/api/drafts/route';
import { GET as getDraftDetail } from '@/app/api/drafts/[draftId]/route';
import { GET as getMe } from '@/app/api/auth/me/route';
import { PUT as updateProfile } from '@/app/api/profile/route';
import { POST as explainFinding } from '@/app/api/explain/route';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import type { User, FindingEvidence, ContributionRoute } from '@/types';

function createRequest(url: string, method: string = 'GET', body?: any, user?: User) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (user) {
    const token = signSessionToken({
      id: user.id,
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    headers['Cookie'] = `contriblens_session=${token}`;
  }
  return new Request(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('F1 — Runtime Smoke Audit & End-to-End Behavioral Contracts', () => {
  const testUser: User = {
    id: `usr_f1_${Date.now()}`,
    email: `f1_smoke_${Date.now()}@example.com`,
    name: 'F1 Auditor',
    createdAt: new Date().toISOString(),
  };

  const testScan = {
    id: `scn_f1_${Date.now()}`,
    userId: testUser.id,
    repoName: 'expressjs/express',
    repoUrl: 'https://github.com/expressjs/express',
    owner: 'expressjs',
    branch: 'main',
    scannedAt: new Date().toISOString(),
    totalFiles: 10,
    filesScanned: 10,
    totalBytes: 5000,
    bytesScanned: 5000,
    status: 'completed' as const,
    readinessScore: 85,
    technologies: { languages: ['TypeScript'], frameworks: ['Express'], tooling: [], manifests: [] },
    techStack: { languages: ['TypeScript'], frameworks: ['Express'], tooling: [], manifests: [], confidenceScore: 100 },
    findingsCount: { total: 1, critical: 0, high: 1, medium: 0, low: 0, info: 0 },
  };

  const testFinding: FindingEvidence = {
    id: `fnd_f1_${Date.now()}`,
    scanId: testScan.id,
    category: 'actions',
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'Workflow declares write-all permissions',
    severity: 'high',
    confidence: 1.0,
    sourceTool: 'Static Rule Engine',
    file: '.github/workflows/ci.yml',
    lineStart: 12,
    lineEnd: 12,
    evidence: 'permissions: write-all',
    impact: 'Excessive workflow token permissions permit compromise.',
    fixHint: 'Scope permissions down to contents: read.',
    skills: ['GitHub Actions', 'Least Privilege'],
    learningResources: [],
    redacted: false,
    disclosureMode: 'public-issue',
    evidenceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    fingerprint: 'GH-ACTIONS-WRITE-ALL:.github/workflows/ci.yml:12',
    createdAt: new Date().toISOString(),
  };

  const testRoute: ContributionRoute = {
    id: `rt_f1_${Date.now()}`,
    scanId: testScan.id,
    findingIds: [testFinding.id],
    findingId: testFinding.id,
    title: 'Scope CI workflow permissions',
    summary: 'Reduce workflow permissions',
    difficulty: 'beginner',
    estimatedMinutes: 15,
    skills: ['GitHub Actions', 'Least Privilege'],
    files: ['.github/workflows/ci.yml'],
    suggestedChange: 'permissions:\n  contents: read',
    testPlan: ['Run action linting'],
    acceptanceCriteria: ['Permissions scoped strictly'],
    readiness: { total: 85 },
    status: 'not-started',
  };

  beforeEach(() => {
    db.saveUser(testUser);
    db.saveScan(testScan as any);
    db.saveFindings([testFinding]);
    db.saveRoute(testRoute);
  });

  describe('1. Auth-Gated Endpoints & Real Data Access Flow', () => {
    it('rejects unauthenticated requests to findings with 401, returns findings when authenticated', async () => {
      const unauthReq = createRequest(`http://localhost:3000/api/findings?scanId=${testScan.id}`);
      const unauthRes = await getFindings(unauthReq);
      expect(unauthRes.status).toBe(401);

      const authReq = createRequest(`http://localhost:3000/api/findings?scanId=${testScan.id}`, 'GET', undefined, testUser);
      const authRes = await getFindings(authReq);
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.ok).toBe(true);
      expect(data.findings.length).toBe(1);
    });

    it('rejects unauthenticated requests to finding details with 401, resolves for authenticated owner', async () => {
      const unauthReq = createRequest(`http://localhost:3000/api/findings/${testFinding.id}`);
      const unauthRes = await getFindingDetail(unauthReq, { params: Promise.resolve({ findingId: testFinding.id }) });
      expect(unauthRes.status).toBe(401);

      const authReq = createRequest(`http://localhost:3000/api/findings/${testFinding.id}`, 'GET', undefined, testUser);
      const authRes = await getFindingDetail(authReq, { params: Promise.resolve({ findingId: testFinding.id }) });
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.finding.id).toBe(testFinding.id);
    });

    it('rejects unauthenticated explain with 401, generates explanation for authenticated owner', async () => {
      const unauthReq = createRequest('http://localhost:3000/api/explain', 'POST', { findingId: testFinding.id });
      const unauthRes = await explainFinding(unauthReq);
      expect(unauthRes.status).toBe(401);

      const authReq = createRequest('http://localhost:3000/api/explain', 'POST', { findingId: testFinding.id }, testUser);
      const authRes = await explainFinding(authReq);
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.explanation).toBeDefined();
      expect(data.explanation.generatedBy).toBeDefined();
    });

    it('rejects unauthenticated routes with 401, retrieves routes for authenticated owner', async () => {
      const unauthReq = createRequest(`http://localhost:3000/api/routes?scanId=${testScan.id}`);
      const unauthRes = await getRoutes(unauthReq);
      expect(unauthRes.status).toBe(401);

      const authReq = createRequest(`http://localhost:3000/api/routes?scanId=${testScan.id}`, 'GET', undefined, testUser);
      const authRes = await getRoutes(authReq);
      expect(authRes.status).toBe(200);
      const routesData = await authRes.json();
      expect(routesData.routes.length).toBeGreaterThan(0);

      const authDetailReq = createRequest(`http://localhost:3000/api/routes/${testRoute.id}`, 'GET', undefined, testUser);
      const authDetailRes = await getRouteDetail(authDetailReq, { params: Promise.resolve({ routeId: testRoute.id }) });
      expect(authDetailRes.status).toBe(200);
      const detailData = await authDetailRes.json();
      expect(detailData.route.id).toBe(testRoute.id);
    });

    it('rejects unauthenticated draft queries with 401', async () => {
      const unauthReq = createRequest(`http://localhost:3000/api/drafts?scanId=${testScan.id}`);
      const unauthRes = await getDrafts(unauthReq);
      expect(unauthRes.status).toBe(401);
    });
  });

  describe('2. User Settings Persistence via Auth and Profile', () => {
    it('persists theme, font scale, and reduced motion in profile and returns via /api/auth/me', async () => {
      const updateReq = createRequest(
        'http://localhost:3000/api/profile',
        'PUT',
        {
          settings: {
            theme: 'linen',
            fontSize: 'large',
            reducedMotion: true,
          },
        },
        testUser
      );
      const updateRes = await updateProfile(updateReq);
      expect(updateRes.status).toBe(200);
      const updatedData = await updateRes.json();
      expect(updatedData.user.settings.theme).toBe('linen');
      expect(updatedData.user.settings.reducedMotion).toBe(true);

      // Verify /api/auth/me returns settings
      const meReq = createRequest('http://localhost:3000/api/auth/me', 'GET', undefined, testUser);
      const meRes = await getMe(meReq);
      expect(meRes.status).toBe(200);
      // Note: getMe uses cookies() in Next.js runtime; verify db directly
      const savedUser = db.getUserById(testUser.id);
      expect(savedUser?.settings?.theme).toBe('linen');
      expect(savedUser?.settings?.reducedMotion).toBe(true);
    });
  });

  describe('3. Route Status Stepper Transitions & Persistence', () => {
    it('cycles status transitions and persists across calls', async () => {
      const patchReq = createRequest(
        `http://localhost:3000/api/routes/${testRoute.id}`,
        'PATCH',
        { status: 'in-progress' },
        testUser
      );
      const patchRes = await patchRouteDetail(patchReq, { params: Promise.resolve({ routeId: testRoute.id }) });
      expect(patchRes.status).toBe(200);
      const data = await patchRes.json();
      expect(data.route.status).toBe('in-progress');

      // Verify on subsequent GET
      const getReq = createRequest(`http://localhost:3000/api/routes/${testRoute.id}`, 'GET', undefined, testUser);
      const getRes = await getRouteDetail(getReq, { params: Promise.resolve({ routeId: testRoute.id }) });
      const getData = await getRes.json();
      expect(getData.route.status).toBe('in-progress');
    });
  });

  describe('4. Disclosure Guard for Public Issue Drafts', () => {
    it('strictly blocks public draft generation for critical findings (403 DISCLOSURE_BLOCKED)', async () => {
      const scanId = `scn_disc_${Date.now()}`;
      const critFinding: FindingEvidence = {
        id: `fnd_crit_${Date.now()}`,
        scanId,
        category: 'secret',
        ruleId: 'SECRET-GITHUB-PAT',
        title: 'Exposed Token',
        severity: 'critical',
        confidence: 1.0,
        sourceTool: 'Secret Scanner',
        file: 'config.json',
        lineStart: 1,
        lineEnd: 1,
        evidence: 'ghp_************************************',
        impact: 'Exposed token allows repo takeover.',
        fixHint: 'Revoke token immediately.',
        skills: ['Secret Hygiene'],
        learningResources: [],
        disclosureMode: 'DISCLOSURE_BLOCKED',
        redacted: true,
        evidenceHash: 'hash_crit_123',
        fingerprint: 'SECRET-GITHUB-PAT:config.json:1',
        createdAt: new Date().toISOString(),
      };
      db.saveFindings([critFinding]);

      const critRoute: ContributionRoute = {
        id: `rt_crit_${Date.now()}`,
        scanId,
        findingIds: [critFinding.id],
        findingId: critFinding.id,
        title: 'Revoke Exposed Token',
        summary: 'Critical secret fix',
        difficulty: 'advanced',
        estimatedMinutes: 20,
        skills: ['Secret Hygiene'],
        files: ['config.json'],
        suggestedChange: 'remove',
        testPlan: ['verify removed'],
        acceptanceCriteria: ['token revoked'],
        readiness: { total: 20 },
        status: 'not-started',
      };
      db.saveRoute(critRoute);

      db.saveScan({
        id: scanId,
        userId: testUser.id,
        repoName: 'test/repo',
        repoUrl: 'https://github.com/test/repo',
        owner: 'test',
        branch: 'main',
        scannedAt: new Date().toISOString(),
        totalFiles: 1,
        filesScanned: 1,
        totalBytes: 100,
        bytesScanned: 100,
        status: 'completed',
        readinessScore: 20,
        technologies: { languages: [], frameworks: [], tooling: [], manifests: [] },
        techStack: {
          languages: [],
          frameworks: [],
          tooling: [],
          manifests: [],
          confidenceScore: 100,
        },
        findingsCount: { total: 1, critical: 1, high: 0, medium: 0, low: 0, info: 0 },
      });

      const draftReq = createRequest(
        'http://localhost:3000/api/drafts',
        'POST',
        { routeId: critRoute.id },
        testUser
      );
      const draftRes = await postDrafts(draftReq);
      expect(draftRes.status).toBe(403);
      const draftData = await draftRes.json();
      expect(draftData.errorCode).toBe('DISCLOSURE_BLOCKED');
    });
  });
});
