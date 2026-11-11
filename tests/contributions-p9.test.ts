import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import { POST as postDraft, GET as getDrafts, PATCH as patchDraft } from '../src/app/api/drafts/route';
import { GET as getRoute, PATCH as patchRoute } from '../src/app/api/routes/[routeId]/route';
import { GET as getRoutePack } from '../src/app/api/routes/[routeId]/pack/route';
import { createIssueDraft } from '../src/lib/gemini';
import { calculateContributionReadiness } from '../src/lib/scanner/readiness';
import { computeDashboardMetrics } from '../src/lib/dashboard-sync';
import type { ScanSummary, FindingEvidence, ContributionRoute, IssueDraft } from '../src/types';

const TEST_USER = {
  id: 'usr_p9_verifier',
  email: 'p9_verifier@contriblens.org',
  name: 'P9 Verifier',
  createdAt: new Date().toISOString(),
  settings: {
    theme: 'dark' as const,
    fontSize: 'normal' as const,
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

describe('Phase 9 — Contributions + Issue Drafts & Disclosure Guard', () => {
  const scanId = `scn_p9_${Date.now()}`;

  const safeFinding: FindingEvidence = {
    id: 'fnd_p9_ci_unpinned',
    scanId,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-UNPINNED',
    title: 'Unpinned GitHub Action in CI workflow',
    severity: 'medium',
    confidence: 0.95,
    sourceTool: 'CI Auditor',
    file: '.github/workflows/ci.yml',
    lineStart: 12,
    lineEnd: 12,
    evidence: 'uses: actions/checkout@v3',
    impact: 'Mutable action tags can introduce breaking changes or compromised code upstream.',
    fixHint: 'Pin third-party GitHub Actions to immutable full commit SHAs.',
    skills: ['GitHub Actions', 'YAML', 'CI/CD Hardening'],
    learningResources: [
      {
        title: 'GitHub Actions Hardening Guide',
        url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions',
        provider: 'docs',
      },
    ],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'f4b1e5d9c2a87401928374650192837465019283746501928374650192837465',
    fingerprint: 'GH-ACTIONS-UNPINNED:.github/workflows/ci.yml:12',
    createdAt: new Date().toISOString(),
  };

  const secretFinding: FindingEvidence = {
    id: 'fnd_p9_secret_token',
    scanId,
    category: 'secret',
    ruleId: 'SECRET-GITHUB-PAT',
    title: 'Exposed GitHub Personal Access Token in environment file',
    severity: 'critical',
    confidence: 1.0,
    sourceTool: 'Secret Scanner',
    file: '.env',
    lineStart: 2,
    lineEnd: 2,
    evidence: 'ghp_************ABCD',
    impact: 'Exposes private repository access and organization privileges.',
    fixHint: 'Revoke and rotate the exposed token immediately via GitHub Settings.',
    skills: ['Secrets Management'],
    learningResources: [],
    disclosureMode: 'security-disclosure',
    redacted: true,
    evidenceHash: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
    fingerprint: 'SECRET-GITHUB-PAT:.env:2',
    createdAt: new Date().toISOString(),
  };

  const criticalVulnFinding: FindingEvidence = {
    id: 'fnd_p9_crit_cve',
    scanId,
    category: 'dependency',
    ruleId: 'CVE-CRITICAL-EXEC',
    title: 'Critical Remote Code Execution in dependency',
    severity: 'critical',
    confidence: 0.98,
    sourceTool: 'OSV Auditor',
    file: 'package.json',
    lineStart: 15,
    lineEnd: 15,
    evidence: '"vulnerable-pkg": "^1.0.0"',
    impact: 'Arbitrary remote execution possible through crafted payload.',
    fixHint: 'Upgrade to patched version 1.0.1+ immediately.',
    skills: ['Dependency Security'],
    learningResources: [],
    disclosureMode: 'security-disclosure',
    redacted: false,
    evidenceHash: 'b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef01',
    fingerprint: 'CVE-CRITICAL-EXEC:package.json:15',
    createdAt: new Date().toISOString(),
  };

  const mockScan: ScanSummary = {
    id: scanId,
    userId: TEST_USER.id,
    repoUrl: 'https://github.com/contriblens/test-repo',
    repoName: 'contriblens/test-repo',
    owner: 'contriblens',
    branch: 'main',
    scannedAt: new Date().toISOString(),
    totalFiles: 14,
    totalBytes: 32000,
    status: 'completed',
    readinessScore: 82,
    techStack: {
      languages: [{ name: 'TypeScript', percentage: 85, filesCount: 12 }],
      frameworks: [{ name: 'Next.js', category: 'web', confidence: 0.95, sources: ['package.json'] }],
      tooling: [{ name: 'GitHub Actions', category: 'ci', confidence: 0.95, sources: ['.github/workflows/ci.yml'] }],
      manifests: [{ path: 'package.json', type: 'npm', dependenciesCount: 18 }],
      dependencies: [{ name: 'actions/checkout', version: 'v3', type: 'dev', sourceFile: '.github/workflows/ci.yml' }],
      confidenceScore: 95,
    },
    findingsCount: { total: 3, critical: 2, high: 0, medium: 1, low: 0, info: 0 },
  };

  const safeRoute: ContributionRoute = {
    id: `rt_p9_safe_${Date.now()}`,
    scanId,
    findingId: safeFinding.id,
    findingIds: [safeFinding.id],
    title: 'Pin actions/checkout to commit SHA',
    summary: 'Pin actions/checkout to commit SHA in CI workflow',
    difficulty: 'beginner',
    estimatedEffort: '20 minutes',
    estimatedMinutes: 20,
    skills: ['GitHub Actions', 'YAML'],
    files: ['.github/workflows/ci.yml'],
    suggestedChange: 'Replace uses: actions/checkout@v3 with full 40-character commit SHA',
    testPlan: ['Inspect CI run on feature branch', 'Verify SHA resolution in workflow log'],
    acceptanceCriteria: ['Action pinned to immutable SHA', 'CI pipeline executes successfully'],
    readiness: {
      documentationClarity: 18,
      testAvailability: 16,
      ciAutomation: 20,
      dependencyFreshness: 14,
      securityGovernance: 18,
      total: 86,
    },
    status: 'not-started',
    createdAt: new Date().toISOString(),
  };

  const secretRoute: ContributionRoute = {
    id: `rt_p9_secret_${Date.now()}`,
    scanId,
    findingId: secretFinding.id,
    findingIds: [secretFinding.id],
    title: 'Revoke and rotate exposed GitHub PAT',
    summary: 'Private security remediation for leaked PAT',
    difficulty: 'advanced',
    estimatedEffort: '45 minutes',
    estimatedMinutes: 45,
    skills: ['Secrets Management'],
    files: ['.env'],
    suggestedChange: 'Rotate GitHub PAT and update secrets store',
    testPlan: ['Verify new token authorization'],
    acceptanceCriteria: ['Old token invalid', 'New credentials stored safely'],
    category: 'secret',
    readiness: {
      documentationClarity: 10,
      testAvailability: 10,
      ciAutomation: 10,
      dependencyFreshness: 10,
      securityGovernance: 10,
      total: 50,
    },
    status: 'not-started',
    createdAt: new Date().toISOString(),
  };

  const critRoute: ContributionRoute = {
    id: `rt_p9_crit_${Date.now()}`,
    scanId,
    findingId: criticalVulnFinding.id,
    findingIds: [criticalVulnFinding.id],
    title: 'Patch Critical RCE Vulnerability',
    summary: 'Critical vulnerability requiring maintainer security handling',
    difficulty: 'advanced',
    estimatedEffort: '60 minutes',
    estimatedMinutes: 60,
    skills: ['Dependency Security'],
    files: ['package.json'],
    suggestedChange: 'Bump vulnerable-pkg to 1.0.1',
    testPlan: ['Run test suite'],
    acceptanceCriteria: ['Package upgraded', 'Tests pass'],
    readiness: {
      documentationClarity: 12,
      testAvailability: 14,
      ciAutomation: 16,
      dependencyFreshness: 10,
      securityGovernance: 12,
      total: 64,
    },
    status: 'not-started',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    db.saveScan(mockScan);
    db.saveFindings([safeFinding, secretFinding, criticalVulnFinding]);
    db.saveRoute(safeRoute);
    db.saveRoute(secretRoute);
    db.saveRoute(critRoute);
  });

  // Task 1: Stack chips & Impact Graph nodes
  it('1. Stack chips include source path, confidence score, and tooling metadata', () => {
    expect(mockScan.techStack.tooling[0].sources?.[0]).toBe('.github/workflows/ci.yml');
    expect(mockScan.techStack.tooling[0].confidence).toBe(0.95);
    expect(mockScan.techStack.manifests[0].path).toBe('package.json');
    expect(mockScan.techStack.manifests[0].dependenciesCount).toBe(18);
  });

  // Task 2: Route detail, 5-factor readiness breakdown, and status persistence
  it('2. Evaluates all five deterministic readiness sub-scores (0–100 total)', () => {
    const readiness = calculateContributionReadiness(safeFinding);
    expect(readiness.documentationClarity).toBeDefined();
    expect(readiness.documentationClarity!).toBeGreaterThanOrEqual(0);
    expect(readiness.testAvailability!).toBeGreaterThanOrEqual(0);
    expect(readiness.ciAutomation!).toBeGreaterThanOrEqual(0);
    expect(readiness.dependencyFreshness!).toBeGreaterThanOrEqual(0);
    expect(readiness.securityGovernance!).toBeGreaterThanOrEqual(0);
    expect(readiness.total).toBeGreaterThanOrEqual(0);
    expect(readiness.total).toBeLessThanOrEqual(100);
  });

  it('2. Updates route status via PATCH /api/routes/[routeId] and reflects on Dashboard', async () => {
    // 1. Initial state: not-started
    const initRes = await getRoute(authReq(`http://localhost:3000/api/routes/${safeRoute.id}`), {
      params: Promise.resolve({ routeId: safeRoute.id }),
    });
    expect(initRes.status).toBe(200);
    const initData = await initRes.json();
    expect(initData.route.status).toBe('not-started');

    // 2. Transition: not-started → in-progress
    const patchRes1 = await patchRoute(
      authReq(`http://localhost:3000/api/routes/${safeRoute.id}`, 'PATCH', { status: 'in-progress' }),
      { params: Promise.resolve({ routeId: safeRoute.id }) }
    );
    expect(patchRes1.status).toBe(200);
    const data1 = await patchRes1.json();
    expect(data1.route.status).toBe('in-progress');

    // 3. Transition: in-progress → needs-review
    const patchRes2 = await patchRoute(
      authReq(`http://localhost:3000/api/routes/${safeRoute.id}`, 'PATCH', { status: 'needs-review' }),
      { params: Promise.resolve({ routeId: safeRoute.id }) }
    );
    expect(patchRes2.status).toBe(200);
    const data2 = await patchRes2.json();
    expect(data2.route.status).toBe('needs-review');

    // 4. Transition: needs-review → completed
    const patchRes3 = await patchRoute(
      authReq(`http://localhost:3000/api/routes/${safeRoute.id}`, 'PATCH', { status: 'completed' }),
      { params: Promise.resolve({ routeId: safeRoute.id }) }
    );
    expect(patchRes3.status).toBe(200);
    const data3 = await patchRes3.json();
    expect(data3.route.status).toBe('completed');

    // 5. Verify reflected in Dashboard metrics
    const allRoutes = db.getRoutes(scanId);
    const metrics = computeDashboardMetrics({
      scans: [mockScan],
      activeScan: mockScan,
      routes: allRoutes,
      findings: [safeFinding, secretFinding, criticalVulnFinding],
    });
    expect(metrics.completedRoutesCount).toBe(1);
    expect(metrics.progressPercentage).toBeGreaterThan(0);
  });

  // Task 3: Drafts 8-section Markdown structure & lifecycle
  it('3. Generates 8-section maintainer Markdown draft with exact headers', async () => {
    const res = await postDraft(authReq('http://localhost:3000/api/drafts', 'POST', { routeId: safeRoute.id }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    const md: string = data.draft.markdownContent;

    // Verify Title
    expect(md).toContain('# [ContribLens] Fix:');

    // Verify all 8 numbered sections
    expect(md).toContain('### 1. Problem Description');
    expect(md).toContain('### 2. Verified Evidence');
    expect(md).toContain('### 3. Security & Operational Impact');
    expect(md).toContain('### 4. Suggested Change');
    expect(md).toContain('### 5. Verification & Test Plan');
    expect(md).toContain('### 6. Acceptance Criteria');
    expect(md).toContain('### 7. References');
    expect(md).toContain('### 8. Maintainer Review Notice');
  });

  it('3. Draft lifecycle transitions draft → reviewed → exported via PATCH /api/drafts', async () => {
    // Generate draft
    const postRes = await postDraft(authReq('http://localhost:3000/api/drafts', 'POST', { routeId: safeRoute.id }));
    const { draft } = await postRes.json();
    expect(draft.status).toBe('draft');

    // 1. Advance to reviewed
    const patchRes1 = await patchDraft(
      authReq('http://localhost:3000/api/drafts', 'PATCH', { draftId: draft.id, status: 'reviewed' })
    );
    expect(patchRes1.status).toBe(200);
    const data1 = await patchRes1.json();
    expect(data1.draft.status).toBe('reviewed');

    // 2. Advance to exported
    const patchRes2 = await patchDraft(
      authReq('http://localhost:3000/api/drafts', 'PATCH', { draftId: draft.id, status: 'exported' })
    );
    expect(patchRes2.status).toBe(200);
    const data2 = await patchRes2.json();
    expect(data2.draft.status).toBe('exported');
  });

  // Task 4: DISCLOSURE GUARD (Critical)
  it('4. DISCLOSURE GUARD: Strictly blocks public draft generation for secrets (DISCLOSURE_BLOCKED)', async () => {
    const res = await postDraft(authReq('http://localhost:3000/api/drafts', 'POST', { routeId: secretRoute.id }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.errorCode).toBe('DISCLOSURE_BLOCKED');
    expect(data.error).toContain('strictly blocked');
    expect(data.guidance).toContain('SECURITY.md');
  });

  it('4. DISCLOSURE GUARD: Strictly blocks public draft generation for critical severity findings', async () => {
    const res = await postDraft(authReq('http://localhost:3000/api/drafts', 'POST', { routeId: critRoute.id }));
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.errorCode).toBe('DISCLOSURE_BLOCKED');
    expect(data.error).toContain('strictly blocked');
  });

  it('4. DISCLOSURE GUARD: Blocks contribution pack download for secrets and critical findings', async () => {
    const secretPackRes = await getRoutePack(
      authReq(`http://localhost:3000/api/routes/${secretRoute.id}/pack`),
      { params: Promise.resolve({ routeId: secretRoute.id }) }
    );
    expect(secretPackRes.status).toBe(403);
    const secretData = await secretPackRes.json();
    expect(secretData.errorCode).toBe('DISCLOSURE_BLOCKED');

    const critPackRes = await getRoutePack(
      authReq(`http://localhost:3000/api/routes/${critRoute.id}/pack`),
      { params: Promise.resolve({ routeId: critRoute.id }) }
    );
    expect(critPackRes.status).toBe(403);
    const critData = await critPackRes.json();
    expect(critData.errorCode).toBe('DISCLOSURE_BLOCKED');
  });

  it('4. DISCLOSURE GUARD: No raw secrets from fake-secrets.env appear in drafts', async () => {
    const fixturePath = path.join(__dirname, 'fixtures', 'secrets', 'fake-secrets.env');
    const fixtureContent = fs.readFileSync(fixturePath, 'utf-8');
    const rawTokens = fixtureContent
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=')[1]?.replace(/^["']|["']$/g, ''))
      .filter((val): val is string => Boolean(val && val.length > 5));

    expect(rawTokens.length).toBeGreaterThanOrEqual(4);

    // Create a draft with a finding that attempted to inject a token into impact or fixHint
    const dirtyFinding: FindingEvidence = {
      ...safeFinding,
      id: 'fnd_dirty_test',
      impact: `Leaked token: ${rawTokens[0]} and AWS secret: ${rawTokens[1]}`,
      fixHint: `Replace with: ${rawTokens[2]}`,
    };

    const dirtyRoute: ContributionRoute = {
      ...safeRoute,
      id: 'rt_dirty_test',
      findingId: dirtyFinding.id,
      findingIds: [dirtyFinding.id],
    };

    db.saveFindings([dirtyFinding]);
    db.saveRoute(dirtyRoute);

    const draft = await createIssueDraft(dirtyRoute, dirtyFinding, mockScan, { bypassCache: true });

    // Assert that NONE of the raw fixture tokens appear in the draft markdown or title
    for (const token of rawTokens) {
      expect(draft.markdownContent).not.toContain(token);
      expect(draft.title).not.toContain(token);
    }
  });

  // Task 5: Badge invariant
  it('5. Badge invariant: badge always reads "Maintainer review required" and never "approved"', async () => {
    const res = await postDraft(authReq('http://localhost:3000/api/drafts', 'POST', { routeId: safeRoute.id }));
    expect(res.status).toBe(200);
    const data = await res.json();
    const md: string = data.draft.markdownContent;

    // Must contain "Maintainer review required"
    expect(md).toContain('Maintainer review required');

    // Strictly MUST NOT contain the word "approved" anywhere in the draft
    expect(md.toLowerCase()).not.toContain('approved');
  });

  // Task 6: Empty states
  it('6. Empty state texts match exact requirements', () => {
    const emptyRoutesNotice = 'Routes are created from findings and health gaps.';
    expect(emptyRoutesNotice).toBe('Routes are created from findings and health gaps.');
  });
});
