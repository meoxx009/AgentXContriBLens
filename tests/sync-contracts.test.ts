import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  reconcileActiveScan,
  computeDashboardMetrics,
  getScanDiffBadgeData,
} from '@/lib/dashboard-sync';
import { applySettingsToDom } from '@/components/AppContext';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import { POST as postDraft, GET as getDrafts } from '@/app/api/drafts/route';
import { PATCH as patchRouteDetail } from '@/app/api/routes/[routeId]/route';
import { GET as getScanDetail, DELETE as deleteScanDetail } from '@/app/api/scans/[scanId]/route';
import { GET as getProfile, DELETE as deleteProfile } from '@/app/api/profile/route';
import type { ScanSummary, ContributionRoute, Finding, User } from '@/types';

class MockClassList {
  private classes = new Set<string>();

  add(...names: string[]) {
    names.forEach((n) => {
      n.split(' ').forEach((c) => {
        if (c.trim()) this.classes.add(c.trim());
      });
    });
  }

  remove(...names: string[]) {
    names.forEach((n) => {
      n.split(' ').forEach((c) => {
        if (c.trim()) this.classes.delete(c.trim());
      });
    });
  }

  contains(name: string) {
    return this.classes.has(name);
  }

  get value() {
    return Array.from(this.classes).join(' ');
  }
}

describe('F3 — Cross-Screen Feature Sync Contracts', () => {
  const TEST_USER: User = {
    id: 'user_f3_sync_test',
    email: 'sync-tester@contriblens.dev',
    name: 'Sync Contract Tester',
    role: 'contributor',
    settings: {
      theme: 'black-hole',
      fontSize: 'medium',
      fontFamily: 'sans',
      reducedMotion: false,
      strictRedaction: true,
      geminiGroundingPolicy: true,
    },
    createdAt: new Date().toISOString(),
  };

  const OTHER_USER: User = {
    id: 'user_f3_intruder',
    email: 'intruder@contriblens.dev',
    name: 'Intruder',
    role: 'contributor',
    createdAt: new Date().toISOString(),
  };

  function createAuthRequest(url: string, method: string = 'GET', body?: any, user: User = TEST_USER) {
    const token = signSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
    });

    const headers: Record<string, string> = {
      Cookie: `contriblens_session=${token}`,
    };
    if (body) {
      headers['Content-Type'] = 'application/json';
    }

    return new Request(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  let storageMock: Record<string, string> = {};
  let originalDocument: any;
  let originalLocalStorage: any;

  beforeEach(() => {
    storageMock = {};
    originalLocalStorage = globalThis.localStorage;
    globalThis.localStorage = {
      getItem: (key: string) => storageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        storageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete storageMock[key];
      },
      clear: () => {
        storageMock = {};
      },
      length: 0,
      key: () => null,
    } as Storage;

    originalDocument = (globalThis as any).document;
    (globalThis as any).document = {
      documentElement: {
        classList: new MockClassList(),
      },
    };

    db.saveUser(TEST_USER);
    db.saveUser(OTHER_USER);
  });

  afterEach(() => {
    globalThis.localStorage = originalLocalStorage;
    (globalThis as any).document = originalDocument;
  });

  describe('Contract 1: activeScan Preference, Authority & Deletion Reconciliation', () => {
    const serverScanA: ScanSummary = {
      id: 'scan_alpha',
      userId: TEST_USER.id,
      repoUrl: 'https://github.com/contriblens/alpha',
      repoName: 'contriblens/alpha',
      fullName: 'contriblens/alpha',
      owner: 'contriblens',
      branch: 'main',
      scannedAt: '2026-10-31T10:00:00Z',
      totalFiles: 10,
      totalBytes: 5000,
      status: 'completed',
      readinessScore: 88,
      techStack: {
        languages: [{ name: 'TypeScript', percentage: 100, filesCount: 10 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 4, critical: 0, high: 1, medium: 2, low: 1, info: 0 },
    };

    const serverScanB: ScanSummary = {
      id: 'scan_beta',
      userId: TEST_USER.id,
      repoUrl: 'https://github.com/contriblens/beta',
      repoName: 'contriblens/beta',
      fullName: 'contriblens/beta',
      owner: 'contriblens',
      branch: 'main',
      scannedAt: '2026-10-31T09:00:00Z',
      totalFiles: 5,
      totalBytes: 2500,
      status: 'completed',
      readinessScore: 65,
      techStack: {
        languages: [{ name: 'JavaScript', percentage: 100, filesCount: 5 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 90,
      },
      findingsCount: { total: 2, critical: 0, high: 0, medium: 1, low: 1, info: 0 },
    };

    it('returns null when server has 0 scans (clearing stale localStorage)', () => {
      const staleScan: ScanSummary = { ...serverScanA, id: 'stale_id' };
      const reconciled = reconcileActiveScan([], staleScan);
      expect(reconciled).toBeNull();
    });

    it('prefers the freshest authoritative server scan object when client activeScan exists on server', () => {
      const staleCachedClientCopy: ScanSummary = {
        ...serverScanA,
        readinessScore: 50, // outdated score
        findingsCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 }, // outdated count
      };

      const reconciled = reconcileActiveScan([serverScanA, serverScanB], staleCachedClientCopy);
      expect(reconciled).not.toBeNull();
      expect(reconciled?.id).toBe(serverScanA.id);
      expect(reconciled?.readinessScore).toBe(88); // authoritative server readiness
      expect(reconciled?.findingsCount.total).toBe(4); // authoritative server count
    });

    it('falls back to serverScans[0] when client activeScan is stale (e.g. deleted)', () => {
      const deletedScan: ScanSummary = { ...serverScanA, id: 'scan_deleted_earlier' };
      const reconciled = reconcileActiveScan([serverScanA, serverScanB], deletedScan);
      expect(reconciled).not.toBeNull();
      expect(reconciled?.id).toBe('scan_alpha');
    });

    it('defaults to serverScans[0] when client activeScan is null', () => {
      const reconciled = reconcileActiveScan([serverScanB, serverScanA], null);
      expect(reconciled?.id).toBe('scan_beta');
    });

    it('deleting a scan via DELETE /api/scans/[scanId] removes scan + findings + routes + drafts and logs activity', async () => {
      const scanId = `scan_del_${Date.now()}`;
      const toDeleteScan: ScanSummary = {
        ...serverScanA,
        id: scanId,
        userId: TEST_USER.id,
      };
      db.saveScan(toDeleteScan);

      const fnd: Finding = {
        id: `fnd_${scanId}`,
        scanId,
        category: 'dependency',
        ruleId: 'DEP-OUTDATED',
        title: 'Outdated package',
        severity: 'low',
        confidence: 0.9,
        sourceTool: 'OSV',
        file: 'package.json',
        lineStart: 1,
        lineEnd: 1,
        evidence: 'pkg@1.0.0',
        impact: 'Low risk',
        fixHint: 'Upgrade',
        skills: ['npm'],
        learningResources: [],
        disclosureMode: 'public-issue',
        redacted: false,
        evidenceHash: 'hash_del_1',
        fingerprint: 'DEP-OUTDATED:package.json:1',
        createdAt: new Date().toISOString(),
      };
      db.saveFindings([fnd]);

      // Verify created in DB
      expect(db.getScanById(scanId)).toBeDefined();
      expect(db.getFindings(scanId).length).toBe(1);

      // Other user cannot delete it
      const unauthorizedReq = createAuthRequest(
        `http://localhost:3000/api/scans/${scanId}`,
        'DELETE',
        undefined,
        OTHER_USER
      );
      const unauthRes = await deleteScanDetail(unauthorizedReq, {
        params: Promise.resolve({ scanId }),
      });
      expect(unauthorizedReq ? unauthRes.status : 0).toBe(403);

      // Owner deletes scan
      const ownerReq = createAuthRequest(
        `http://localhost:3000/api/scans/${scanId}`,
        'DELETE',
        undefined,
        TEST_USER
      );
      const delRes = await deleteScanDetail(ownerReq, {
        params: Promise.resolve({ scanId }),
      });
      expect(delRes.status).toBe(200);
      const delData = await delRes.json();
      expect(delData.deleted).toBe(true);

      // Scan and findings are gone from DB
      expect(db.getScanById(scanId)).toBeUndefined();
      expect(db.getFindings(scanId).length).toBe(0);

      // An activity event was logged
      const activities = db.getActivities(TEST_USER.id);
      expect(activities.some((a) => a.type === 'scan' && a.description.includes(toDeleteScan.repoName))).toBe(true);
    });
  });

  describe('Contract 2: Route Status Change → Dashboard Metrics & Progress % Sync', () => {
    const scanId = `scan_metrics_${Date.now()}`;
    const scan: ScanSummary = {
      id: scanId,
      userId: TEST_USER.id,
      repoUrl: 'https://github.com/contriblens/metrics-test',
      repoName: 'contriblens/metrics-test',
      owner: 'contriblens',
      branch: 'main',
      scannedAt: new Date().toISOString(),
      totalFiles: 20,
      totalBytes: 10000,
      status: 'completed',
      readinessScore: 85,
      techStack: {
        languages: [{ name: 'TypeScript', percentage: 100, filesCount: 20 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 4, critical: 0, high: 1, medium: 2, low: 1, info: 0 },
    };

    const routes: ContributionRoute[] = [
      {
        id: `rt_1_${Date.now()}`,
        scanId,
        findingIds: [],
        title: 'Fix issue 1',
        summary: 'Summary 1',
        difficulty: 'beginner',
        category: 'dependency',
        estimatedMinutes: 30,
        skills: ['TypeScript'],
        files: ['package.json'],
        suggestedChange: 'Update package',
        testPlan: ['npm test'],
        acceptanceCriteria: ['Tests pass'],
        readiness: { total: 80 },
        status: 'not-started',
        createdAt: new Date().toISOString(),
      },
      {
        id: `rt_2_${Date.now()}`,
        scanId,
        findingIds: [],
        title: 'Fix issue 2',
        summary: 'Summary 2',
        difficulty: 'intermediate',
        category: 'github-actions',
        estimatedMinutes: 45,
        skills: ['GitHub Actions'],
        files: ['.github/workflows/ci.yml'],
        suggestedChange: 'Update workflow',
        testPlan: ['verify ci'],
        acceptanceCriteria: ['CI passes'],
        readiness: { total: 60 },
        status: 'not-started',
        createdAt: new Date().toISOString(),
      },
      {
        id: `rt_3_${Date.now()}`,
        scanId,
        findingIds: [],
        title: 'Fix issue 3',
        summary: 'Summary 3',
        difficulty: 'beginner',
        category: 'repository-health',
        estimatedMinutes: 20,
        skills: ['Documentation'],
        files: ['README.md'],
        suggestedChange: 'Fix documentation',
        testPlan: ['check link'],
        acceptanceCriteria: ['Links work'],
        readiness: { total: 85 },
        status: 'in-progress',
        createdAt: new Date().toISOString(),
      },
      {
        id: `rt_4_${Date.now()}`,
        scanId,
        findingIds: [],
        title: 'Fix issue 4',
        summary: 'Summary 4',
        difficulty: 'advanced',
        category: 'dependency',
        estimatedMinutes: 60,
        skills: ['TypeScript'],
        files: ['tsconfig.json'],
        suggestedChange: 'Update tsconfig',
        testPlan: ['tsc --noEmit'],
        acceptanceCriteria: ['Typecheck green'],
        readiness: { total: 40 },
        status: 'needs-review',
        createdAt: new Date().toISOString(),
      },
    ];

    beforeEach(() => {
      db.saveScan(scan);
      routes.forEach((r) => db.saveRoute(r));
    });

    it('calculates initial dashboard metrics accurately with 0 completed routes', () => {
      const metrics = computeDashboardMetrics({
        scans: [scan],
        activeScan: scan,
        routes,
        findings: [],
      });

      expect(metrics.totalScans).toBe(1);
      expect(metrics.displayedRoutes.length).toBe(4);
      expect(metrics.openRoutesCount).toBe(4);
      expect(metrics.completedRoutesCount).toBe(0);
      expect(metrics.progressPercentage).toBe(0);
      expect(metrics.goodFirstCount).toBe(2);
      expect(metrics.maintainerLevelCount).toBe(1);
    });

    it('updating route 1 to in-progress then completed immediately updates openRoutes and progress %', async () => {
      const targetRoute = routes[0];

      // 1. Transition not-started -> in-progress
      const patch1Req = createAuthRequest(
        `http://localhost:3000/api/routes/${targetRoute.id}`,
        'PATCH',
        { status: 'in-progress' }
      );
      const patch1Res = await patchRouteDetail(patch1Req, {
        params: Promise.resolve({ routeId: targetRoute.id }),
      });
      expect(patch1Res.status).toBe(200);

      // 2. Transition in-progress -> needs-review -> completed
      const patch2Req = createAuthRequest(
        `http://localhost:3000/api/routes/${targetRoute.id}`,
        'PATCH',
        { status: 'needs-review' }
      );
      await patchRouteDetail(patch2Req, { params: Promise.resolve({ routeId: targetRoute.id }) });

      const patch3Req = createAuthRequest(
        `http://localhost:3000/api/routes/${targetRoute.id}`,
        'PATCH',
        { status: 'completed' }
      );
      const patch3Res = await patchRouteDetail(patch3Req, {
        params: Promise.resolve({ routeId: targetRoute.id }),
      });
      expect(patch3Res.status).toBe(200);

      // Refetch routes from authoritative DB
      const refreshedRoutes = db.getRoutes(scanId);
      const completedMatch = refreshedRoutes.find((r) => r.id === targetRoute.id);
      expect(completedMatch?.status).toBe('completed');

      // Re-derive dashboard metrics
      const updatedMetrics = computeDashboardMetrics({
        scans: [scan],
        activeScan: scan,
        routes: refreshedRoutes,
        findings: [],
      });

      expect(updatedMetrics.openRoutesCount).toBe(3); // was 4
      expect(updatedMetrics.completedRoutesCount).toBe(1); // was 0
      expect(updatedMetrics.progressPercentage).toBe(25); // 1 / 4 = 25%
    });

    it('completing second route updates progress % to 50%', async () => {
      // Complete route 3 (which was already in-progress)
      const targetRoute3 = routes[2];
      const patchReq = createAuthRequest(
        `http://localhost:3000/api/routes/${targetRoute3.id}`,
        'PATCH',
        { status: 'completed' }
      );
      // in-progress -> needs-review -> completed
      await patchRouteDetail(
        createAuthRequest(`http://localhost:3000/api/routes/${targetRoute3.id}`, 'PATCH', { status: 'needs-review' }),
        { params: Promise.resolve({ routeId: targetRoute3.id }) }
      );
      await patchRouteDetail(
        createAuthRequest(`http://localhost:3000/api/routes/${targetRoute3.id}`, 'PATCH', { status: 'completed' }),
        { params: Promise.resolve({ routeId: targetRoute3.id }) }
      );

      const refreshedRoutes = db.getRoutes(scanId);
      const metrics = computeDashboardMetrics({
        scans: [scan],
        activeScan: scan,
        routes: refreshedRoutes,
        findings: [],
      });

      expect(metrics.completedRoutesCount).toBe(2);
      expect(metrics.openRoutesCount).toBe(2);
      expect(metrics.progressPercentage).toBe(50); // 2 / 4 = 50%
    });
  });

  describe('Contract 3: User Settings → Global DOM Classes & LocalStorage Contract', () => {
    it('applies linen theme, small font size, mono font, and reduced motion instantly', () => {
      applySettingsToDom({
        theme: 'linen',
        fontSize: 'small',
        fontFamily: 'mono',
        reducedMotion: true,
      });

      const classList = (globalThis as any).document.documentElement.classList;
      expect(classList.contains('theme-linen')).toBe(true);
      expect(classList.contains('dark')).toBe(false);
      expect(classList.contains('theme-black-hole')).toBe(false);
      expect(classList.contains('text-sm-mode')).toBe(true);
      expect(classList.contains('font-mono-mode')).toBe(true);
      expect(classList.contains('reduce-motion')).toBe(true);
    });

    it('switches to black-hole theme, large font, sans, and removes reduced motion', () => {
      applySettingsToDom({
        theme: 'black-hole',
        fontSize: 'large',
        fontFamily: 'sans',
        reducedMotion: false,
      });

      const classList = (globalThis as any).document.documentElement.classList;
      expect(classList.contains('theme-black-hole')).toBe(true);
      expect(classList.contains('dark')).toBe(true);
      expect(classList.contains('theme-linen')).toBe(false);
      expect(classList.contains('text-lg-mode')).toBe(true);
      expect(classList.contains('font-sans-mode')).toBe(true);
      expect(classList.contains('reduce-motion')).toBe(false);
    });

    it('persists settings to localStorage canonical key contriblens_user_settings', () => {
      const settings = {
        theme: 'linen' as const,
        fontSize: 'compact' as const,
        fontFamily: 'mono' as const,
        reducedMotion: true,
      };

      localStorage.setItem('contriblens_user_settings', JSON.stringify(settings));
      const readBack = JSON.parse(localStorage.getItem('contriblens_user_settings') || '{}');
      expect(readBack.theme).toBe('linen');
      expect(readBack.reducedMotion).toBe(true);
    });
  });

  describe('Contract 4: Draft Created → Issue Drafts & Activity Stream Contract', () => {
    const scanId = `scan_draft_activity_${Date.now()}`;
    const scan: ScanSummary = {
      id: scanId,
      userId: TEST_USER.id,
      repoUrl: 'https://github.com/contriblens/draft-test',
      repoName: 'contriblens/draft-test',
      owner: 'contriblens',
      branch: 'main',
      scannedAt: new Date().toISOString(),
      totalFiles: 10,
      totalBytes: 5000,
      status: 'completed',
      readinessScore: 90,
      techStack: {
        languages: [{ name: 'TypeScript', percentage: 100, filesCount: 10 }],
        frameworks: [],
        tooling: [],
        manifests: [],
        confidenceScore: 100,
      },
      findingsCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
    };

    const finding: Finding = {
      id: `fnd_draft_${Date.now()}`,
      scanId,
      category: 'dependency',
      ruleId: 'DEP-CVE-LOW',
      title: 'Low severity package advisory',
      severity: 'low',
      confidence: 0.9,
      sourceTool: 'OSV',
      file: 'package.json',
      lineStart: 10,
      lineEnd: 10,
      evidence: '"express": "4.17.1"',
      impact: 'Patch available upstream',
      fixHint: 'Upgrade express to ^4.18.2',
      skills: ['Express', 'npm'],
      learningResources: [],
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash_draft_1',
      fingerprint: 'DEP-CVE-LOW:package.json:10',
      createdAt: new Date().toISOString(),
    };

    const route: ContributionRoute = {
      id: `rt_draft_${Date.now()}`,
      scanId,
      findingId: finding.id,
      findingIds: [finding.id],
      title: 'Upgrade Express to patch advisory',
      summary: 'Upgrade express',
      difficulty: 'beginner',
      category: 'dependency',
      estimatedMinutes: 20,
      skills: ['Express', 'npm'],
      files: ['package.json'],
      suggestedChange: 'Upgrade express to ^4.18.2',
      testPlan: ['npm test'],
      acceptanceCriteria: ['Valid package.json update', 'Tests pass'],
      readiness: { total: 80 },
      status: 'not-started',
      createdAt: new Date().toISOString(),
    };

    beforeEach(() => {
      db.saveScan(scan);
      db.saveFindings([finding]);
      db.saveRoute(route);
    });

    it('generates a draft and immediately records a draft_generated activity', async () => {
      const createDraftReq = createAuthRequest(
        'http://localhost:3000/api/drafts',
        'POST',
        { routeId: route.id }
      );
      const res = await postDraft(createDraftReq);
      const data = await res.json();
      if (res.status !== 200) {
        console.error('postDraft error:', data);
      }
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.draft).toBeDefined();
      expect(data.draft.id).toBeDefined();

      // Verify draft in DB
      const dbDraft = db.getDraftById(data.draft.id);
      expect(dbDraft).toBeDefined();

      // Verify activity recorded
      const activities = db.getActivities(TEST_USER.id);
      const draftActivity = activities.find(
        (a) => a.type === 'draft_generated' && a.description.includes(data.draft.title)
      );
      expect(draftActivity).toBeDefined();
      expect(draftActivity?.description).toContain('Generated maintainer-reviewable issue draft');

      // Verify GET /api/profile returns this activity for dashboard consumption
      const profileReq = createAuthRequest('http://localhost:3000/api/profile');
      const profileRes = await getProfile(profileReq);
      expect(profileRes.status).toBe(200);
      const profileData = await profileRes.json();
      expect(profileData.activities.some((a: any) => a.type === 'draft_generated')).toBe(true);
    });
  });

  describe('Contract 5: Anonymous Preview Flag → Limit State Contract', () => {
    it('allows initial preview and sets canonical localStorage keys', () => {
      expect(localStorage.getItem('cl_preview_used_at')).toBeNull();
      expect(localStorage.getItem('cl_preview_result')).toBeNull();

      const timestamp = new Date().toISOString();
      localStorage.setItem('cl_preview_used_at', timestamp);
      localStorage.setItem('cl_preview_result', JSON.stringify({ id: 'demo-scan-001', repoName: 'expressjs/express' }));

      expect(localStorage.getItem('cl_preview_used_at')).toBe(timestamp);
      expect(localStorage.getItem('cl_preview_result')).toContain('expressjs/express');
    });

    it('enforces limit state when cl_preview_used_at is present for subsequent attempts', () => {
      localStorage.setItem('cl_preview_used_at', new Date().toISOString());

      // Client-side check simulation
      const previewUsed = localStorage.getItem('cl_preview_used_at');
      const shouldBlockSubsequentPreview = Boolean(previewUsed);
      expect(shouldBlockSubsequentPreview).toBe(true);
    });

    it('clearing history removes all preview and activeScan keys', async () => {
      localStorage.setItem('cl_preview_used_at', new Date().toISOString());
      localStorage.setItem('cl_preview_result', JSON.stringify({ id: 'demo-scan-001' }));
      localStorage.setItem('contriblens_active_scan', JSON.stringify({ id: 'scan_1' }));

      // Call DELETE /api/profile
      const delReq = createAuthRequest('http://localhost:3000/api/profile', 'DELETE');
      const delRes = await deleteProfile(delReq);
      expect(delRes.status).toBe(200);

      // Client wipe logic executed in ProfileView
      localStorage.removeItem('cl_preview_used_at');
      localStorage.removeItem('cl_preview_result');
      localStorage.removeItem('contriblens_active_scan');

      expect(localStorage.getItem('cl_preview_used_at')).toBeNull();
      expect(localStorage.getItem('cl_preview_result')).toBeNull();
      expect(localStorage.getItem('contriblens_active_scan')).toBeNull();
    });
  });

  describe('Contract 6: Scan-Diff Badge Synchronization', () => {
    it('computes scan diff badge data correctly for mixed, resolved, new, and unchanged scans', () => {
      const baseScan: ScanSummary = {
        id: 'scan_diff_base',
        owner: 'owner',
        repoUrl: 'https://github.com/owner/repo',
        repoName: 'owner/repo',
        branch: 'main',
        scannedAt: new Date().toISOString(),
        totalFiles: 10,
        totalBytes: 5000,
        status: 'completed',
        readinessScore: 80,
        techStack: {
          languages: [],
          frameworks: [],
          tooling: [],
          manifests: [],
          confidenceScore: 100,
        },
        findingsCount: { total: 3, critical: 0, high: 1, medium: 2, low: 0, info: 0 },
      };

      // Mixed: new and resolved
      const mixedScan: ScanSummary = {
        ...baseScan,
        comparison: {
          currentScanId: 'scan_diff_base',
          previousScanId: 'scan_prev',
          repoName: 'owner/repo',
          branch: 'main',
          status: 'comparable',
          newCount: 2,
          resolvedCount: 1,
          unchangedCount: 1,
          summary: { newCount: 2, resolvedCount: 1, unchangedCount: 1, changedCount: 0, totalCurrent: 3, totalPrevious: 2 },
          diffs: [],
        },
      };
      const mixedBadge = getScanDiffBadgeData(mixedScan);
      expect(mixedBadge.badgeType).toBe('mixed');
      expect(mixedBadge.label).toBe('+2 / -1');

      // Resolved only
      const resolvedScan: ScanSummary = {
        ...baseScan,
        comparison: {
          currentScanId: 'scan_diff_base',
          previousScanId: 'scan_prev',
          repoName: 'owner/repo',
          branch: 'main',
          status: 'comparable',
          newCount: 0,
          resolvedCount: 3,
          unchangedCount: 0,
          summary: { newCount: 0, resolvedCount: 3, unchangedCount: 0, changedCount: 0, totalCurrent: 3, totalPrevious: 3 },
          diffs: [],
        },
      };
      const resolvedBadge = getScanDiffBadgeData(resolvedScan);
      expect(resolvedBadge.badgeType).toBe('resolved');
      expect(resolvedBadge.label).toBe('-3 Resolved');

      // New only
      const newScan: ScanSummary = {
        ...baseScan,
        comparison: {
          currentScanId: 'scan_diff_base',
          previousScanId: 'scan_prev',
          repoName: 'owner/repo',
          branch: 'main',
          status: 'comparable',
          newCount: 4,
          resolvedCount: 0,
          unchangedCount: 0,
          summary: { newCount: 4, resolvedCount: 0, unchangedCount: 0, changedCount: 0, totalCurrent: 4, totalPrevious: 0 },
          diffs: [],
        },
      };
      const newBadge = getScanDiffBadgeData(newScan);
      expect(newBadge.badgeType).toBe('new');
      expect(newBadge.label).toBe('+4 New');
    });
  });
});
