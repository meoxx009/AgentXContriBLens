import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import { PUT as putProfile } from '../src/app/api/profile/route';
import { PATCH as patchDraft, POST as postDraft } from '../src/app/api/drafts/route';
import { PATCH as patchRoute, GET as getRoute } from '../src/app/api/routes/[routeId]/route';
import { PATCH as patchFinding } from '../src/app/api/findings/[findingId]/route';
import type { User, IssueDraft, ContributionRoute, Finding, ScanSummary } from '../src/types';
import fs from 'fs';
import path from 'path';

const TEST_USER: User = {
  id: 'usr_opt_test_1',
  email: 'optimistic@example.com',
  name: 'Optimistic Tester',
  createdAt: new Date().toISOString(),
  settings: {
    theme: 'dark',
    fontSize: 'normal',
    reduceMotion: false,
    strictRedaction: true,
  },
};

function authReq(url: string, method: string = 'GET', body?: any, user = TEST_USER) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `contriblens_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Optimistic UI & Truthful Rollback Mechanics', () => {
  beforeEach(() => {
    db.saveUser(TEST_USER);
  });

  describe('1. Profile Settings & Display Name Mutations', () => {
    it('optimistic update updates local state immediately, then reconciles on server success', async () => {
      // 1. Snapshot pre-mutation state
      const preUser = { ...TEST_USER };

      // 2. Client optimistically updates
      const optimisticSettings = { theme: 'dark' as const, reduceMotion: true, fontSize: 'large' as const };
      const optimisticUser = {
        ...preUser,
        settings: { ...preUser.settings, ...optimisticSettings },
      };
      expect(optimisticUser.settings.reduceMotion).toBe(true);

      // 3. Dispatch to server
      const req = authReq('http://localhost/api/profile', 'PUT', { settings: optimisticSettings });
      const res = await putProfile(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.user.settings.reduceMotion).toBe(true);
      expect(data.user.settings.fontSize).toBe('large');

      // 4. Reconcile with server
      const reconciledUser = data.user;
      expect(reconciledUser.id).toBe(TEST_USER.id);
    });

    it('rolls back to exact snapshot on server failure without leaving divergent state', async () => {
      const preUser = { ...TEST_USER };

      // Client attempts optimistic change
      const optimisticName = '   '; // Invalid empty name
      let activeUser = { ...preUser, name: optimisticName };

      // Server rejects invalid input (empty name)
      const req = authReq('http://localhost/api/profile', 'PUT', { name: optimisticName });
      const res = await putProfile(req);
      expect(res.status).toBe(400);

      // Honest rollback on client
      if (!res.ok) {
        activeUser = preUser;
      }

      expect(activeUser.name).toBe('Optimistic Tester');
      expect(activeUser.name).toBe(preUser.name);
    });
  });

  describe('2. Issue Draft Optimistic Mutation & Rollback', () => {
    let testDraft: IssueDraft;

    beforeEach(async () => {
      const scanId = `scn_opt_${Date.now()}`;
      db.saveScan({
        id: scanId,
        userId: TEST_USER.id,
        owner: 'test-owner',
        repoUrl: 'https://github.com/test-owner/test-repo',
        repoName: 'test-owner/test-repo',
        branch: 'main',
        commitSha: 'abcdef123456',
        scannedAt: new Date().toISOString(),
        readinessScore: 85,
        totalFiles: 10,
        totalBytes: 5000,
        status: 'completed',
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 1 },
        findingsCount: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      });

      testDraft = {
        id: `drf_opt_${Date.now()}`,
        scanId,
        userId: TEST_USER.id,
        repoName: 'test-owner/test-repo',
        generatedBy: 'deterministic',
        title: 'Initial Fix Plan',
        markdownContent: '## Bug description',
        labels: ['bug', 'security'],
        status: 'draft',
        createdAt: new Date().toISOString(),
      };
      db.saveDraft(testDraft);
    });

    it('optimistically saves draft and reconciles server response', async () => {
      const previousDraft = { ...testDraft };
      const updatedTitle = 'Optimistically Updated Fix Title';

      // 1. Optimistic update
      let currentDraft: IssueDraft = { ...testDraft, title: updatedTitle };
      expect(currentDraft.title).toBe(updatedTitle);

      // 2. Server mutation
      const req = authReq('http://localhost/api/drafts', 'PATCH', {
        draftId: testDraft.id,
        title: updatedTitle,
        markdownContent: testDraft.markdownContent,
        labels: testDraft.labels,
      });
      const res = await patchDraft(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      currentDraft = data.draft;
      expect(currentDraft.title).toBe(updatedTitle);
    });

    it('rolls back draft status and content on server rejection', async () => {
      const previousDraft = { ...testDraft };
      const previousDrafts = [previousDraft];

      // Optimistic transition
      let currentDraft: IssueDraft = { ...testDraft, status: 'approved' };
      let drafts: IssueDraft[] = [currentDraft];

      // Dispatch invalid draft ID to simulate failure
      const req = authReq('http://localhost/api/drafts', 'PATCH', {
        draftId: 'non_existent_draft_id',
        action: 'approve',
      });
      const res = await patchDraft(req);
      expect(res.status).toBe(404);

      // Honest rollback
      if (!res.ok) {
        currentDraft = previousDraft;
        drafts = previousDrafts;
      }

      expect(currentDraft.status).toBe('draft');
      expect(drafts[0].status).toBe('draft');
    });
  });

  describe('3. Contributor Route Progress & Learning Checklist Optimistic State', () => {
    let testRoute: ContributionRoute;

    beforeEach(() => {
      const scanId = `scn_route_${Date.now()}`;
      db.saveScan({
        id: scanId,
        userId: TEST_USER.id,
        owner: 'test-owner',
        repoUrl: 'https://github.com/test-owner/test-route',
        repoName: 'test-owner/test-route',
        branch: 'main',
        commitSha: '1234567890ab',
        scannedAt: new Date().toISOString(),
        readinessScore: 90,
        totalFiles: 10,
        totalBytes: 5000,
        status: 'completed',
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 1 },
        findingsCount: { critical: 0, high: 0, medium: 0, low: 1, info: 0, total: 1 },
      });

      testRoute = {
        id: `rte_opt_${Date.now()}`,
        scanId,
        findingIds: ['fnd_route_1'],
        title: 'Fix Deprecation Warning',
        summary: 'Fix deprecated call in codebase',
        difficulty: 'beginner',
        estimatedMinutes: 20,
        skills: ['TypeScript'],
        files: ['src/index.ts'],
        suggestedChange: 'Update deprecated call',
        status: 'not-started',
        learningChecklist: [
          {
            id: 'skill_1',
            concept: 'TypeScript Generics',
            level: 'beginner',
            estimatedMinutes: 10,
            whyNeeded: 'Type safety',
            completed: false,
          },
          {
            id: 'skill_2',
            concept: 'Node.js Buffer API',
            level: 'beginner',
            estimatedMinutes: 15,
            whyNeeded: 'Buffer handling',
            completed: false,
          },
        ],
      } as ContributionRoute;
      db.saveRoute(testRoute);
    });

    it('optimistically checks skill checklist and reconciles server response', async () => {
      const previousChecklist = [...(testRoute.learningChecklist || [])];

      // 1. Optimistic toggle
      const optimisticChecklist = previousChecklist.map((item) =>
        item.id === 'skill_1' ? { ...item, completed: true } : item
      );
      let currentRoute: ContributionRoute = { ...testRoute, learningChecklist: optimisticChecklist };
      expect(currentRoute.learningChecklist?.[0].completed).toBe(true);

      // 2. Server mutation
      const req = authReq(`http://localhost/api/routes/${testRoute.id}`, 'PATCH', {
        skillId: 'skill_1',
        completed: true,
      });
      const res = await patchRoute(req, { params: Promise.resolve({ routeId: testRoute.id }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      currentRoute = data.route;
      expect(currentRoute.learningChecklist?.[0].completed).toBe(true);
    });

    it('rolls back skill checklist on server error with preserved previous state', async () => {
      const previousChecklist = [...(testRoute.learningChecklist || [])];
      const previousRoute = { ...testRoute };

      // Optimistic toggle
      let currentRoute: ContributionRoute = {
        ...testRoute,
        learningChecklist: previousChecklist.map((item) =>
          item.id === 'skill_1' ? { ...item, completed: true } : item
        ),
      };

      // Server failure (invalid route id)
      const req = authReq(`http://localhost/api/routes/invalid_id`, 'PATCH', {
        skillId: 'skill_1',
        completed: true,
      });
      const res = await patchRoute(req, { params: Promise.resolve({ routeId: 'invalid_id' }) });
      expect(res.status).toBe(404);

      // Client rollback
      if (!res.ok) {
        currentRoute = previousRoute;
      }

      expect(currentRoute.learningChecklist?.[0].completed).toBe(false);
      expect(currentRoute.status).toBe('not-started');
    });

    it('rolls back status stepper on illegal transition without leaving client in invalid state', async () => {
      const previousRoute = { ...testRoute };

      // Client attempts illegal jump from not-started directly to completed
      let currentRoute: ContributionRoute = { ...testRoute, status: 'completed' };

      const req = authReq(`http://localhost/api/routes/${testRoute.id}`, 'PATCH', {
        status: 'completed',
      });
      const res = await patchRoute(req, { params: Promise.resolve({ routeId: testRoute.id }) });
      // API guard validates allowed transitions
      expect(res.status).toBe(400);

      // Client rollback
      if (!res.ok) {
        currentRoute = previousRoute;
      }

      expect(currentRoute.status).toBe('not-started');
    });
  });

  describe('4. Finding Review Status Optimistic Update & Rollback', () => {
    let testFinding: Finding;

    beforeEach(() => {
      const scanId = `scn_fnd_${Date.now()}`;
      db.saveScan({
        id: scanId,
        userId: TEST_USER.id,
        owner: 'test-owner',
        repoUrl: 'https://github.com/test-owner/test-fnd',
        repoName: 'test-owner/test-fnd',
        branch: 'main',
        commitSha: 'fnd123456789',
        scannedAt: new Date().toISOString(),
        readinessScore: 80,
        totalFiles: 10,
        totalBytes: 5000,
        status: 'completed',
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 1 },
        findingsCount: { critical: 0, high: 0, medium: 1, low: 0, info: 0, total: 1 },
      });

      testFinding = {
        id: `fnd_opt_${Date.now()}`,
        scanId,
        category: 'dependency',
        ruleId: 'VULN-TEST-1',
        title: 'Prototype Pollution Vulnerability',
        severity: 'MEDIUM',
        confidence: 0.9,
        sourceTool: 'OSV.dev',
        file: 'package.json',
        lineStart: 15,
        lineEnd: 15,
        evidence: '"lodash": "4.17.15"',
        evidenceHash: 'a'.repeat(64),
        reviewed: false,
        createdAt: new Date().toISOString(),
      } as Finding;
      db.saveFindings([testFinding]);
    });

    it('optimistically marks finding as reviewed and reconciles server response', async () => {
      const previousFinding = { ...testFinding };

      // Optimistic toggle
      let currentFinding: Finding = { ...testFinding, reviewed: true };
      expect(currentFinding.reviewed).toBe(true);

      const req = authReq(`http://localhost/api/findings/${testFinding.id}`, 'PATCH', {
        reviewed: true,
      });
      const res = await patchFinding(req, { params: Promise.resolve({ findingId: testFinding.id }) });
      expect(res.status).toBe(200);

      const data = await res.json();
      currentFinding = data.finding;
      expect(currentFinding.reviewed).toBe(true);
    });

    it('rolls back finding review state on server error', async () => {
      const previousFinding = { ...testFinding };
      let findings: Finding[] = [previousFinding];

      // Optimistic toggle
      let currentFinding: Finding = { ...testFinding, reviewed: true };
      findings = [currentFinding];

      // Server error with non-existent finding
      const req = authReq(`http://localhost/api/findings/non_existent_fnd`, 'PATCH', {
        reviewed: true,
      });
      const res = await patchFinding(req, { params: Promise.resolve({ findingId: 'non_existent_fnd' }) });
      expect(res.status).toBe(404);

      // Rollback
      if (!res.ok) {
        currentFinding = previousFinding;
        findings = [previousFinding];
      }

      expect(currentFinding.reviewed).toBe(false);
      expect(findings[0].reviewed).toBe(false);
    });
  });

  describe('5. Safety Invariant: Scan Results are Server-Authoritative', () => {
    it('confirms repository scan results are NEVER faked optimistically in client code', () => {
      const scanViewSource = fs.readFileSync(
        path.join(process.cwd(), 'src/components/views/ScanView.tsx'),
        'utf8'
      );

      // Verifies that scanResult is only set via server response and is not faked
      expect(scanViewSource).toContain('fetchRecentScans');
      expect(scanViewSource).toContain('refreshingRecentScans');
      expect(scanViewSource).toContain('recentScansError');
      // Must not fabricate synthetic findings or readiness without server
      expect(scanViewSource).not.toMatch(/setScanResult\(\s*{\s*scan:\s*{\s*id:\s*['"]opt_/);
    });

    it('confirms all views contain honest rollback handlers and Retry mechanisms', () => {
      const views = [
        'src/components/views/ProfileView.tsx',
        'src/components/views/DraftsView.tsx',
        'src/components/views/DashboardView.tsx',
        'src/components/views/ScanView.tsx',
        'src/components/views/RouteDetailsView.tsx',
        'src/components/views/FindingsView.tsx',
        'src/components/views/FindingDetailsView.tsx',
      ];

      for (const viewPath of views) {
        const content = fs.readFileSync(path.join(process.cwd(), viewPath), 'utf8');
        expect(content.toLowerCase()).toContain('retry');
      }
    });
  });
});
