import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { POST as signup } from '@/app/api/auth/signup/route';
import { POST as login } from '@/app/api/auth/login/route';
import { POST as logout } from '@/app/api/auth/logout/route';
import { GET as getMe } from '@/app/api/auth/me/route';
import { POST as githubOAuth } from '@/app/api/auth/oauth/github/route';
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route';
import { GET as getScans, POST as createScan } from '@/app/api/scans/route';
import { GET as getScanById } from '@/app/api/scans/[scanId]/route';
import { GET as getFindings } from '@/app/api/findings/route';
import { GET as getFindingById } from '@/app/api/findings/[findingId]/route';
import { GET as getRoutes, POST as createRoute, PATCH as patchRoute } from '@/app/api/routes/route';
import { GET as getRouteDetail, PATCH as patchRouteDetail } from '@/app/api/routes/[routeId]/route';
import { GET as getDrafts, POST as createDraft, PATCH as patchDraft } from '@/app/api/drafts/route';
import { GET as getDraftDetail, PATCH as patchDraftDetail, DELETE as deleteDraftDetail } from '@/app/api/drafts/[draftId]/route';
import { GET as getProfile, PUT as updateProfile } from '@/app/api/profile/route';
import { GET as getStats } from '@/app/api/stats/route';
import { GET as getHealth } from '@/app/api/health/route';
import { GET as getIntegrationsStatus } from '@/app/api/integrations/status/route';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import { redactSecrets, detectSecretsInText } from '@/lib/redaction';
import { createFindingEvidence } from '@/lib/scanner/evidence';
import type { User, ScanSummary, Finding } from '@/types';

function createRequest(
  url: string,
  method: string = 'GET',
  body?: any,
  user?: { id: string; email: string; name: string },
  customHeaders?: Record<string, string>
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  };
  if (user) {
    const token = signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
    });
    headers['Cookie'] = `contriblens_session=${token}`;
  }
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
  });
}

describe('F2 — Backend Hardening & Provider Failure Drill Suites', () => {
  const userA = {
    id: `usr_f2_a_${Date.now()}`,
    email: `f2_user_a_${Date.now()}@example.com`,
    name: 'User A',
  };

  const userB = {
    id: `usr_f2_b_${Date.now()}`,
    email: `f2_user_b_${Date.now()}@example.com`,
    name: 'User B',
  };

  beforeEach(() => {
    db.saveUser({
      id: userA.id,
      email: userA.email,
      name: userA.name,
      createdAt: new Date().toISOString(),
    });
    db.saveUser({
      id: userB.id,
      email: userB.email,
      name: userB.name,
      createdAt: new Date().toISOString(),
    });
  });

  describe('1. Authentication Endpoints', () => {
    it('POST /api/auth/signup enforces validation, password match, and terms', async () => {
      // Missing password confirmation
      const res1 = await signup(createRequest('http://localhost:3000/api/auth/signup', 'POST', {
        email: 'newuser@example.com',
        password: 'Password123!',
      }));
      expect(res1.status).toBe(400);

      // Password mismatch
      const res2 = await signup(createRequest('http://localhost:3000/api/auth/signup', 'POST', {
        email: 'newuser@example.com',
        password: 'Password123!',
        passwordConfirmation: 'Mismatch123!',
        acceptedTerms: true,
      }));
      expect(res2.status).toBe(400);

      // Missing acceptedTerms
      const res3 = await signup(createRequest('http://localhost:3000/api/auth/signup', 'POST', {
        email: 'newuser@example.com',
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
        acceptedTerms: false,
      }));
      expect(res3.status).toBe(400);

      // Valid signup
      const testEmail = `valid_signup_${Date.now()}@example.com`;
      const res4 = await signup(createRequest('http://localhost:3000/api/auth/signup', 'POST', {
        email: testEmail,
        password: 'Password123!',
        passwordConfirmation: 'Password123!',
        acceptedTerms: true,
      }));
      expect(res4.status).toBe(200);
      const data4 = await res4.json();
      expect(data4.ok).toBe(true);
      expect(data4.user.email).toBe(testEmail);
    });

    it('POST /api/auth/login returns safe generic error and sets session cookie on success', async () => {
      // Invalid credentials
      const badRes = await login(createRequest('http://localhost:3000/api/auth/login', 'POST', {
        email: 'nonexistent@example.com',
        password: 'WrongPassword123!',
      }));
      expect(badRes.status).toBe(401);
      const badData = await badRes.json();
      expect(badData.error).toContain('Invalid email or password');

      // Valid credentials
      const email = `login_test_${Date.now()}@example.com`;
      await signup(createRequest('http://localhost:3000/api/auth/signup', 'POST', {
        email,
        password: 'SecretPassword123!',
        passwordConfirmation: 'SecretPassword123!',
        acceptedTerms: true,
      }));

      const goodRes = await login(createRequest('http://localhost:3000/api/auth/login', 'POST', {
        email,
        password: 'SecretPassword123!',
      }));
      expect(goodRes.status).toBe(200);
      expect(goodRes.headers.get('set-cookie')).toContain('contriblens_session=');
    });

    it('POST /api/auth/logout destroys session cookie', async () => {
      const res = await logout();
      expect(res.status).toBe(200);
      const cookie = res.headers.get('set-cookie') || '';
      expect(cookie).toContain('contriblens_session=;');
    });

    it('GET /api/auth/me returns 401 when unauthenticated and profile when authenticated', async () => {
      const anonRes = await getMe(createRequest('http://localhost:3000/api/auth/me'));
      expect(anonRes.status).toBe(401);

      const authRes = await getMe(createRequest('http://localhost:3000/api/auth/me', 'GET', undefined, userA));
      expect(authRes.status).toBe(200);
      const data = await authRes.json();
      expect(data.user.id).toBe(userA.id);
    });

    it('POST /api/auth/oauth/github returns graceful typed error when unconfigured', async () => {
      // Missing code
      const resMissing = await githubOAuth(createRequest('http://localhost:3000/api/auth/oauth/github', 'POST', {}));
      expect(resMissing.status).toBe(400);
      const dataMissing = await resMissing.json();
      expect(dataMissing.errorCode).toBe('AUTH_INVALID_INPUT');

      // Unconfigured with arbitrary external code
      const resUnconf = await githubOAuth(createRequest('http://localhost:3000/api/auth/oauth/github', 'POST', { code: 'arbitrary_ext_code' }));
      expect(resUnconf.status).toBe(503);
      const dataUnconf = await resUnconf.json();
      expect(dataUnconf.errorCode).toBe('AUTH_PROVIDER_UNAVAILABLE');

      // Simulated / mock code
      const resMock = await githubOAuth(createRequest('http://localhost:3000/api/auth/oauth/github', 'POST', { code: 'mock_code' }));
      expect(resMock.status).toBe(200);
      const dataMock = await resMock.json();
      expect(dataMock.ok).toBe(true);
      expect(dataMock.user.githubUsername).toBe('contributor');
    });

    it('POST /api/auth/forgot-password validates email and never reveals account existence', async () => {
      const badRes = await forgotPassword(createRequest('http://localhost:3000/api/auth/forgot-password', 'POST', { email: 'not-an-email' }));
      expect(badRes.status).toBe(400);

      const goodRes = await forgotPassword(createRequest('http://localhost:3000/api/auth/forgot-password', 'POST', { email: 'unknown@example.com' }));
      expect(goodRes.status).toBe(200);
      const data = await goodRes.json();
      expect(data.ok).toBe(true);
      expect(data.message).toContain('password reset instructions');
    });
  });

  describe('2. Scans & Strict Ownership Enforcing', () => {
    it('POST /api/scans rejects invalid URLs with GITHUB_INVALID_URL', async () => {
      const res = await createScan(createRequest('http://localhost:3000/api/scans', 'POST', {
        repositoryUrl: 'not-a-valid-github-url',
      }, userA));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.errorCode).toBe('GITHUB_INVALID_URL');
    });

    it('GET /api/scans/[scanId] strictly enforces ownership (user A cannot view user B scan)', async () => {
      const scanB: ScanSummary = {
        id: `scn_b_${Date.now()}`,
        userId: userB.id,
        repoUrl: 'https://github.com/private-org/repo-b',
        repoName: 'private-org/repo-b',
        owner: 'private-org',
        fullName: 'private-org/repo-b',
        branch: 'main',
        scannedAt: new Date().toISOString(),
        totalFiles: 10,
        filesSkipped: 0,
        totalBytes: 5000,
        status: 'completed',
        readinessScore: 85,
        findingsCount: { critical: 0, high: 1, medium: 1, low: 0, info: 0, total: 2 },
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 100 },
      };
      db.saveScan(scanB);

      // User A attempts to access User B's scan
      const unauthorizedRes = await getScanById(
        createRequest(`http://localhost:3000/api/scans/${scanB.id}`, 'GET', undefined, userA),
        { params: Promise.resolve({ scanId: scanB.id }) }
      );
      expect(unauthorizedRes.status).toBe(403);

      // User B accesses their own scan
      const authorizedRes = await getScanById(
        createRequest(`http://localhost:3000/api/scans/${scanB.id}`, 'GET', undefined, userB),
        { params: Promise.resolve({ scanId: scanB.id }) }
      );
      expect(authorizedRes.status).toBe(200);
      const data = await authorizedRes.json();
      expect(data.scanId).toBe(scanB.id);

      // Unauthenticated access is rejected with 401
      const unauthenticatedRes = await getScanById(
        createRequest(`http://localhost:3000/api/scans/${scanB.id}`),
        { params: Promise.resolve({ scanId: scanB.id }) }
      );
      expect(unauthenticatedRes.status).toBe(401);
    });
  });

  describe('3. Contribution Routes & State Machine Transitions', () => {
    it('enforces status progression: not-started → in-progress → needs-review → completed', async () => {
      const scan: ScanSummary = {
        id: `scn_test_${Date.now()}`,
        userId: userA.id,
        repoUrl: 'https://github.com/test-org/test-repo',
        repoName: 'test-org/test-repo',
        owner: 'test-org',
        branch: 'main',
        scannedAt: new Date().toISOString(),
        totalFiles: 5,
        filesSkipped: 0,
        totalBytes: 1000,
        status: 'completed' as const,
        readinessScore: 90,
        findingsCount: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 100 },
      };
      db.saveScan(scan);

      const finding = createFindingEvidence({
        scanId: scan.id,
        category: 'github-actions',
        ruleId: 'GH-ACTIONS-UNPINNED',
        title: 'Unpinned Actions Version',
        severity: 'MEDIUM',
        confidence: 'HIGH',
        sourceTool: 'Test Scanner',
        file: '.github/workflows/ci.yml',
        lineStart: 12,
        evidence: 'uses: actions/checkout@v3',
        impact: 'Actions can mutate if tag is moved',
        fixHint: 'Pin to SHA',
      });
      db.saveFindings([finding]);

      // Create Route
      const createRes = await createRoute(
        createRequest('http://localhost:3000/api/routes', 'POST', { findingId: finding.id }, userA)
      );
      expect(createRes.status).toBe(200);
      const { route } = await createRes.json();
      expect(route.status).toBe('not-started');

      const params = { params: Promise.resolve({ routeId: route.id }) };

      // Illegal transition: not-started → completed (direct jump)
      const badJumpRes = await patchRouteDetail(
        createRequest(`http://localhost:3000/api/routes/${route.id}`, 'PATCH', { status: 'completed' }, userA),
        params
      );
      expect(badJumpRes.status).toBe(400);
      const badJumpData = await badJumpRes.json();
      expect(badJumpData.error).toContain('Invalid status transition');

      // Invalid status value
      const badValRes = await patchRouteDetail(
        createRequest(`http://localhost:3000/api/routes/${route.id}`, 'PATCH', { status: 'done_finished' }, userA),
        params
      );
      expect(badValRes.status).toBe(400);

      // Step 1: not-started → in-progress (valid)
      const step1Res = await patchRouteDetail(
        createRequest(`http://localhost:3000/api/routes/${route.id}`, 'PATCH', { status: 'in-progress' }, userA),
        params
      );
      expect(step1Res.status).toBe(200);
      expect((await step1Res.json()).route.status).toBe('in-progress');

      // Step 2: in-progress → needs-review (valid)
      const step2Res = await patchRouteDetail(
        createRequest(`http://localhost:3000/api/routes/${route.id}`, 'PATCH', { status: 'needs-review' }, userA),
        params
      );
      expect(step2Res.status).toBe(200);
      expect((await step2Res.json()).route.status).toBe('needs-review');

      // Step 3: needs-review → completed (valid)
      const step3Res = await patchRouteDetail(
        createRequest(`http://localhost:3000/api/routes/${route.id}`, 'PATCH', { status: 'completed' }, userA),
        params
      );
      expect(step3Res.status).toBe(200);
      expect((await step3Res.json()).route.status).toBe('completed');
    });
  });

  describe('4. Issue Drafts, Ownership & Disclosure Guard', () => {
    it('Disclosure Guard blocks public issue drafts for critical / secret findings', async () => {
      const scan: ScanSummary = {
        id: `scn_sec_${Date.now()}`,
        userId: userA.id,
        repoUrl: 'https://github.com/test-org/secret-repo',
        repoName: 'test-org/secret-repo',
        owner: 'test-org',
        branch: 'main',
        scannedAt: new Date().toISOString(),
        totalFiles: 1,
        filesSkipped: 0,
        totalBytes: 500,
        status: 'completed' as const,
        readinessScore: 30,
        findingsCount: { critical: 1, high: 0, medium: 0, low: 0, info: 0, total: 1 },
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 100 },
      };
      db.saveScan(scan);

      const secretFinding = createFindingEvidence({
        scanId: scan.id,
        category: 'secret',
        ruleId: 'SEC-AWS_ACCESS_KEY',
        title: 'Exposed AWS Key',
        severity: 'CRITICAL',
        confidence: 'HIGH',
        sourceTool: 'Secret Scanner',
        file: '.env',
        lineStart: 1,
        evidence: 'AWS_ACCESS_KEY_ID=AKIA************MPLE',
        impact: 'Credential leakage',
        fixHint: 'Revoke and rotate immediately',
        disclosureMode: 'security-disclosure',
      });
      db.saveFindings([secretFinding]);

      const routeRes = await createRoute(
        createRequest('http://localhost:3000/api/routes', 'POST', { findingId: secretFinding.id }, userA)
      );
      const { route } = await routeRes.json();

      // Attempt draft creation on secret finding
      const draftRes = await createDraft(
        createRequest('http://localhost:3000/api/drafts', 'POST', { routeId: route.id }, userA)
      );
      expect(draftRes.status).toBe(403);
      const draftData = await draftRes.json();
      expect(draftData.errorCode).toBe('DISCLOSURE_BLOCKED');
      expect(draftData.guidance).toContain('maintainer privately');
    });

    it('enforces draft ownership on GET and PATCH', async () => {
      const draftA = {
        id: `dft_a_${Date.now()}`,
        userId: userA.id,
        scanId: 'scn_test',
        routeId: 'rte_test',
        repoName: 'test-org/test-repo',
        title: 'Safe Issue Draft',
        body: 'Safe draft body',
        markdownContent: 'Safe draft body',
        status: 'draft' as const,
        labels: ['documentation'],
        generatedBy: 'deterministic' as const,
        fallback: true,
        createdAt: new Date().toISOString(),
      };
      db.saveDraft(draftA);

      const params = { params: Promise.resolve({ draftId: draftA.id }) };

      // User B tries to view User A's draft
      const getRes = await getDraftDetail(
        createRequest(`http://localhost:3000/api/drafts/${draftA.id}`, 'GET', undefined, userB),
        params
      );
      expect(getRes.status).toBe(403);

      // User B tries to patch User A's draft
      const patchRes = await patchDraftDetail(
        createRequest(`http://localhost:3000/api/drafts/${draftA.id}`, 'PATCH', { title: 'Hacked' }, userB),
        params
      );
      expect(patchRes.status).toBe(403);

      // User A can access and patch
      const goodPatchRes = await patchDraftDetail(
        createRequest(`http://localhost:3000/api/drafts/${draftA.id}`, 'PATCH', { title: 'Updated Title' }, userA),
        params
      );
      expect(goodPatchRes.status).toBe(200);
    });
  });

  describe('5. Profile Preferences & Persistence', () => {
    it('GET /api/profile returns preferences and PUT updates them', async () => {
      const getRes = await getProfile(
        createRequest('http://localhost:3000/api/profile', 'GET', undefined, userA)
      );
      expect(getRes.status).toBe(200);

      const updateRes = await updateProfile(
        createRequest('http://localhost:3000/api/profile', 'PUT', {
          settings: {
            theme: 'rosewood',
            fontSize: 'large',
            reducedMotion: true,
          },
        }, userA)
      );
      expect(updateRes.status).toBe(200);
      const updateData = await updateRes.json();
      expect(updateData.user.settings.theme).toBe('rosewood');
      expect(updateData.user.settings.reducedMotion).toBe(true);
    });
  });

  describe('6. Public Endpoints & Anonymous Preview', () => {
    it('GET /api/stats returns aggregate counters and zero user data', async () => {
      const res = await getStats();
      expect(res.status).toBe(200);
      const stats = await res.json();
      expect(stats.ok).toBe(true);
      expect(typeof stats.total_repositories).toBe('number');
      expect(stats.users).toBeUndefined();
      expect(stats.email).toBeUndefined();
    });

    it('GET /api/health returns healthy status and 2.0.0 version', async () => {
      const res = await getHealth();
      expect(res.status).toBe(200);
      const health = await res.json();
      expect(health.status).toBe('healthy');
      expect(health.version).toBe('2.0.0');
    });

    it('GET /api/integrations/status contains zero secret values', async () => {
      const res = await getIntegrationsStatus();
      expect(res.status).toBe(200);
      const data = await res.json();
      const stringified = JSON.stringify(data);
      expect(stringified).not.toContain('ghp_');
      expect(stringified).not.toContain('AKIA');
      expect(stringified).not.toContain('AIza');
    });
  });

  describe('7. Secrets Redaction & Storage Verification', () => {
    it('redacts all secrets from fake-secrets.env before saving to DB and guarantees zero raw secrets in .data/', async () => {
      const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'secrets', 'fake-secrets.env');
      const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');

      const rawSecrets = [
        'ghp_ABCDEF0123456789abcdef0123456789ABCD',
        'AKIAIOSFODNN7EXAMPLE',
        'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
        'https://example.com/test-fixture/slack-webhook',
        'key_test_abcdef1234567890abcdef1234567890',
      ];

      // Redact fixture text
      const redactedContent = redactSecrets(fixtureContent);
      for (const secret of rawSecrets) {
        expect(redactedContent).not.toContain(secret);
      }

      // Detect and create findings
      const detected = detectSecretsInText('.env', fixtureContent);
      expect(detected.length).toBe(5);

      const findings = detected.map((sec) =>
        createFindingEvidence({
          scanId: 'scn_fixture_test',
          category: 'secret',
          ruleId: sec.ruleId,
          title: sec.title,
          severity: sec.severity,
          confidence: sec.confidence,
          sourceTool: 'Secret Pattern Redaction Scanner',
          file: '.env',
          lineStart: sec.line,
          evidence: sec.redactedEvidence,
          impact: 'Exposed secret credentials',
          fixHint: 'Revoke and rotate immediately',
          disclosureMode: 'security-disclosure',
          redacted: true,
        })
      );

      // Save to database
      db.saveFindings(findings);

      // Inspect persisted DB file
      const dbPath = path.join(process.cwd(), '.data', 'db.json');
      if (fs.existsSync(dbPath)) {
        const storedDbText = fs.readFileSync(dbPath, 'utf-8');
        for (const secret of rawSecrets) {
          expect(storedDbText).not.toContain(secret);
        }
      }
    });
  });
});
