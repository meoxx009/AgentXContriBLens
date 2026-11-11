import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import { GET as getProfile, PUT as putProfile, DELETE as deleteProfile } from '../src/app/api/profile/route';
import { GET as getIntegrationsStatus } from '../src/app/api/integrations/status/route';
import { GET as getPublicStats } from '../src/app/api/stats/route';
import type { User, ScanSummary, FindingEvidence, ContributionRoute, IssueDraft } from '../src/types';

const TEST_USER: User = {
  id: 'usr_p10_test',
  email: 'p10_tester@contriblens.org',
  name: 'Phase 10 Tester',
  githubUsername: 'contriblens-tester',
  githubId: 'gh_12345678',
  createdAt: new Date().toISOString(),
  settings: {
    theme: 'black-hole',
    fontSize: 'medium',
    fontFamily: 'sans',
    reducedMotion: false,
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

function unauthReq(url: string, method: string = 'GET', body?: any) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Phase 10 — Profile Persistence, Diagnostics, Export/Clear & Public Stats', () => {
  const scanId = `scn_p10_${Date.now()}`;

  const mockScan: ScanSummary = {
    id: scanId,
    userId: TEST_USER.id,
    repoUrl: 'https://github.com/contriblens/profile-test',
    repoName: 'contriblens/profile-test',
    owner: 'contriblens',
    branch: 'main',
    scannedAt: new Date().toISOString(),
    totalFiles: 8,
    totalBytes: 15000,
    status: 'completed',
    readinessScore: 85,
    techStack: {
      languages: [{ name: 'TypeScript', percentage: 100, filesCount: 8 }],
      frameworks: [],
      tooling: [],
      manifests: [],
      confidenceScore: 90,
    },
    findingsCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
  };

  const mockFinding: FindingEvidence = {
    id: 'fnd_p10_test',
    scanId,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-UNPINNED',
    title: 'Unpinned Action in CI',
    severity: 'medium',
    confidence: 0.95,
    sourceTool: 'CI Auditor',
    file: '.github/workflows/ci.yml',
    lineStart: 10,
    lineEnd: 10,
    evidence: 'uses: actions/checkout@v3',
    impact: 'Tag can be mutated upstream',
    fixHint: 'Pin to SHA',
    skills: ['CI/CD'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'hash_p10_123',
    fingerprint: 'GH-ACTIONS-UNPINNED:10',
    createdAt: new Date().toISOString(),
  };

  const mockRoute: ContributionRoute = {
    id: `rt_p10_${Date.now()}`,
    scanId,
    findingId: mockFinding.id,
    findingIds: [mockFinding.id],
    title: 'Pin action to SHA',
    summary: 'Pin action to commit SHA',
    difficulty: 'beginner',
    estimatedEffort: '15 mins',
    estimatedMinutes: 15,
    skills: ['CI/CD'],
    files: ['.github/workflows/ci.yml'],
    suggestedChange: 'Pin to SHA',
    testPlan: ['Verify workflow'],
    acceptanceCriteria: ['Action pinned'],
    readiness: { total: 85 },
    status: 'not-started',
    createdAt: new Date().toISOString(),
  };

  const mockDraft: IssueDraft = {
    id: `drf_p10_${Date.now()}`,
    userId: TEST_USER.id,
    routeId: mockRoute.id,
    findingId: mockFinding.id,
    scanId,
    repoUrl: mockScan.repoUrl,
    repoName: mockScan.repoName,
    title: '[ContribLens] Fix Unpinned Action',
    body: 'Draft body',
    markdownContent: '# [ContribLens] Fix: Unpinned Action\n\n### 8. Maintainer Review Notice\nMaintainer review required',
    labels: ['security', 'good-first-issue'],
    generatedBy: 'deterministic',
    fallback: false,
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(() => {
    db.saveUser({ ...TEST_USER });
    db.saveScan(mockScan);
    db.saveFindings([mockFinding]);
    db.saveRoute(mockRoute);
    db.saveDraft(mockDraft);
  });

  // Task 1: Profile Persistence (Account, Appearance: theme, font scale, font family, reduced motion)
  it('1. Rejects unauthenticated requests to /api/profile with 401', async () => {
    const res = await getProfile(unauthReq('http://localhost:3000/api/profile'));
    expect(res.status).toBe(401);
  });

  it('1. Persists appearance settings (theme black-hole/linen/system, font scale, font family, reduce motion)', async () => {
    // 1. Update theme to linen, font to large, font family to mono, reduce motion to true
    const putRes = await putProfile(
      authReq('http://localhost:3000/api/profile', 'PUT', {
        name: 'Updated Name P10',
        settings: {
          theme: 'linen',
          fontSize: 'large',
          fontFamily: 'mono',
          reducedMotion: true,
          reduceMotion: true,
        },
      })
    );

    expect(putRes.status).toBe(200);
    const data = await putRes.json();
    expect(data.success).toBe(true);
    expect(data.user.name).toBe('Updated Name P10');
    expect(data.user.githubUsername).toBe('contriblens-tester');
    expect(data.user.settings.theme).toBe('linen');
    expect(data.user.settings.fontSize).toBe('large');
    expect(data.user.settings.fontFamily).toBe('mono');
    expect(data.user.settings.reducedMotion).toBe(true);

    // 2. Verify settings persist across GET /api/profile
    const getRes = await getProfile(authReq('http://localhost:3000/api/profile'));
    expect(getRes.status).toBe(200);
    const retrieved = await getRes.json();
    expect(retrieved.user.settings.theme).toBe('linen');
    expect(retrieved.user.settings.fontSize).toBe('large');
    expect(retrieved.user.settings.fontFamily).toBe('mono');
    expect(retrieved.user.settings.reducedMotion).toBe(true);

    // 3. Update theme to system and font to small
    const putRes2 = await putProfile(
      authReq('http://localhost:3000/api/profile', 'PUT', {
        settings: {
          theme: 'system',
          fontSize: 'small',
          fontFamily: 'system',
          reducedMotion: false,
          reduceMotion: false,
        },
      })
    );
    const data2 = await putRes2.json();
    expect(data2.user.settings.theme).toBe('system');
    expect(data2.user.settings.fontSize).toBe('small');
    expect(data2.user.settings.fontFamily).toBe('system');
    expect(data2.user.settings.reducedMotion).toBe(false);
  });

  // Task 2: Integration Diagnostics (/api/integrations/status) — zero secrets in payload
  it('2. Returns live integration diagnostics with zero secrets in payload', async () => {
    const res = await getIntegrationsStatus();
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBeDefined();

    // Verify all 5 integrations are reported as clean status enums
    expect(['configured', 'not configured', 'connection failed']).toContain(data.status.supabase);
    expect(['token configured', 'public-only mode']).toContain(data.status.github);
    expect(['reachable', 'unavailable']).toContain(data.status.osv);
    expect(['configured', 'fallback mode']).toContain(data.status.gemini);
    expect(['reachable', 'unavailable']).toContain(data.status.database);

    // Strictly verify no raw tokens, passwords, or keys exist in payload
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain('ghp_');
    expect(serialized).not.toContain('AKIA');
    expect(serialized).not.toContain('AIza');
    expect(serialized).not.toContain('Bearer');
    expect(serialized).not.toContain('password');
  });

  // Task 3: Safety Center — Export All Data (Botticelli) & Clear History (Rosewood)
  it('3. Exports sanitized full user data bundle via GET /api/profile?export=true', async () => {
    const res = await getProfile(authReq('http://localhost:3000/api/profile?export=true'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(res.headers.get('Content-Disposition')).toContain('attachment; filename=');

    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.id).toBe(TEST_USER.id);
    expect(data.user.email).toBe(TEST_USER.email);
    expect(data.scans.length).toBeGreaterThanOrEqual(1);
    expect(data.findings.length).toBeGreaterThanOrEqual(1);
    expect(data.routes.length).toBeGreaterThanOrEqual(1);
    expect(data.drafts.length).toBeGreaterThanOrEqual(1);

    // Verify no password hash or secret material in exported bundle
    const exportedJson = JSON.stringify(data);
    expect(exportedJson).not.toContain('passwordHash');
  });

  it('3. Clears user history (scans, findings, routes, drafts) via DELETE /api/profile', async () => {
    // 1. Clear user data
    const res = await deleteProfile(authReq('http://localhost:3000/api/profile', 'DELETE'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.message).toContain('cleared');

    // 2. Verify user still exists but scans & drafts are wiped
    const userScans = db.getScans(TEST_USER.id);
    expect(userScans.length).toBe(0);
    const userDrafts = db.getDrafts().filter((d) => d.userId === TEST_USER.id);
    expect(userDrafts.length).toBe(0);
    const user = db.getUserById(TEST_USER.id);
    expect(user).toBeDefined();
  });

  it('3. Permanently deletes account via DELETE /api/profile?account=true', async () => {
    const res = await deleteProfile(authReq('http://localhost:3000/api/profile?account=true', 'DELETE'));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    // Verify user removed from db
    const user = db.getUserById(TEST_USER.id);
    expect(user).toBeUndefined();
  });

  // Task 4: /api/stats (Cached ~5 min, public aggregates only, no user-private data)
  it('4. Returns public aggregates cached for ~5 min with zero user-private data', async () => {
    const res = await getPublicStats();
    expect(res.status).toBe(200);

    // Verify cache header ~5 minutes (s-maxage=300)
    const cacheControl = res.headers.get('Cache-Control');
    expect(cacheControl).toContain('s-maxage=300');

    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.reposScanned).toBeGreaterThan(0);
    expect(data.findingsVerified).toBeGreaterThan(0);
    expect(data.routesGenerated).toBeGreaterThan(0);
    expect(data.contributorsGuided).toBeGreaterThan(0);

    // Verify zero user-private information in stats payload
    const serialized = JSON.stringify(data);
    expect(serialized).not.toContain(TEST_USER.email);
    expect(serialized).not.toContain(TEST_USER.id);
    expect(serialized).not.toContain(TEST_USER.name);
    expect(serialized).not.toContain('gh_12345678');
  });

  // Task 5: Appearance & Accessibility UI — No theme-switching UI, preserved accessibility controls
  describe('5. Appearance & Accessibility UI Contract', () => {
    it('confirms theme switching UI is removed from ProfileView', () => {
      const profileSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/ProfileView.tsx'),
        'utf-8'
      );

      // Verify theme switching UI is completely removed
      expect(profileSource).not.toContain('Theme Mode');
      expect(profileSource).not.toContain('Black Hole');
      expect(profileSource).not.toContain('Sustainable Linen');
      expect(profileSource).not.toContain('System Match');
      expect(profileSource).not.toContain('updateSettings({ theme:');
    });

    it('preserves independent accessibility controls in ProfileView', () => {
      const profileSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/ProfileView.tsx'),
        'utf-8'
      );

      // Verify accessibility section and remaining controls remain intact
      expect(profileSource).toContain('Appearance &amp; Accessibility');
      expect(profileSource).toContain('Font scale, typography stack, and reduced motion');
      expect(profileSource).toContain('Font Scale');
      expect(profileSource).toContain('Typography Stack');
      expect(profileSource).toContain('Enable Reduced Motion');
      expect(profileSource).toContain('updateSettings({ fontSize:');
      expect(profileSource).toContain('updateSettings({ fontFamily:');
      expect(profileSource).toContain('updateSettings({ reducedMotion:');
      expect(profileSource).toContain('min-h-[44px]');
    });
  });
});
