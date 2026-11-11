import { describe, it, expect, beforeEach } from 'vitest';
import { POST as postDraft, PATCH as patchDraft, GET as getDrafts } from '@/app/api/drafts/route';
import { PATCH as patchDraftById } from '@/app/api/drafts/[draftId]/route';
import { db } from '@/lib/db';
import { signSessionToken, AUTH_COOKIE_NAME } from '@/lib/auth';
import type { ContributionRoute, User, FindingEvidence, ScanSummary } from '@/types';

function createAuthRequest(url: string, method: string, user: User, body?: any): Request {
  const token = signSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `${AUTH_COOKIE_NAME}=${token}`,
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

describe('Human Approval & Review Step for Issue Drafts', () => {
  let userA: User;
  let userB: User;
  let scanA: ScanSummary;
  let safeFindingA: FindingEvidence;
  let secretFindingA: FindingEvidence;
  let critFindingA: FindingEvidence;
  let safeRouteA: ContributionRoute;
  let secretRouteA: ContributionRoute;
  let criticalRouteA: ContributionRoute;

  beforeEach(() => {
    // 1. Setup User A
    userA = db.createUser({
      id: 'test-user-human-a-' + Math.random().toString(36).substring(2, 7),
      email: 'contributor-a@example.com',
      name: 'Contributor A',
      createdAt: new Date().toISOString(),
    });

    // 2. Setup User B (unauthorized third-party)
    userB = db.createUser({
      id: 'test-user-human-b-' + Math.random().toString(36).substring(2, 7),
      email: 'contributor-b@example.com',
      name: 'Contributor B',
      createdAt: new Date().toISOString(),
    });

    const scanId = `scn_hr_${Date.now()}`;
    scanA = {
      id: scanId,
      userId: userA.id,
      repoUrl: 'https://github.com/expressjs/express',
      repoName: 'expressjs/express',
      owner: 'expressjs',
      branch: 'main',
      scannedAt: new Date().toISOString(),
      totalFiles: 14,
      totalBytes: 32000,
      status: 'completed',
      readinessScore: 85,
      techStack: {
        languages: [{ name: 'TypeScript', percentage: 100, filesCount: 14 }],
        frameworks: [],
        tooling: [],
        manifests: [{ path: 'package.json', type: 'npm', dependenciesCount: 10 }],
        dependencies: [],
        confidenceScore: 90,
      },
      findingsCount: { total: 3, critical: 1, high: 0, medium: 1, low: 0, info: 1 },
    };
    db.saveScan(scanA);

    safeFindingA = {
      id: 'f-safe-' + Math.random().toString(36).substring(2, 7),
      scanId,
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned GitHub Action',
      severity: 'medium',
      confidence: 0.95,
      sourceTool: 'CI Auditor',
      file: '.github/workflows/ci.yml',
      lineStart: 12,
      lineEnd: 12,
      evidence: 'uses: actions/checkout@v3',
      impact: 'Mutable action tags can introduce compromised code.',
      fixHint: 'Pin third-party GitHub Actions to immutable SHAs.',
      skills: ['GitHub Actions', 'YAML'],
      learningResources: [],
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash-safe-1',
      fingerprint: 'safe-fp-1',
      createdAt: new Date().toISOString(),
    };

    secretFindingA = {
      id: 'f-secret-' + Math.random().toString(36).substring(2, 7),
      scanId,
      category: 'secret',
      ruleId: 'EXPOSED-AWS-KEY',
      title: 'Exposed AWS Secret Access Key',
      severity: 'critical',
      confidence: 1.0,
      sourceTool: 'Secret Scanner',
      file: 'server.env',
      lineStart: 5,
      lineEnd: 5,
      evidence: 'AWS_SECRET_KEY=***',
      impact: 'Full compromise of AWS account.',
      fixHint: 'Revoke and rotate credentials immediately.',
      skills: ['Security'],
      learningResources: [],
      disclosureMode: 'security-disclosure',
      redacted: true,
      evidenceHash: 'hash-secret-1',
      fingerprint: 'secret-fp-1',
      createdAt: new Date().toISOString(),
    };

    critFindingA = {
      id: 'f-crit-' + Math.random().toString(36).substring(2, 7),
      scanId,
      category: 'dependency',
      ruleId: 'CVE-CRITICAL-RCE',
      title: 'Critical Remote Code Execution Vulnerability',
      severity: 'critical',
      confidence: 1.0,
      sourceTool: 'OSV Auditor',
      file: 'package.json',
      lineStart: 15,
      lineEnd: 15,
      evidence: '"vulnerable-pkg": "^1.0.0"',
      impact: 'Remote code execution possible.',
      fixHint: 'Upgrade immediately.',
      skills: ['Security'],
      learningResources: [],
      disclosureMode: 'security-disclosure',
      redacted: false,
      evidenceHash: 'hash-crit-1',
      fingerprint: 'crit-fp-1',
      createdAt: new Date().toISOString(),
    };

    db.saveFindings([safeFindingA, secretFindingA, critFindingA]);

    // 3. Setup Safe Route for User A
    safeRouteA = {
      id: 'route-safe-a-' + Math.random().toString(36).substring(2, 7),
      scanId,
      findingId: safeFindingA.id,
      findingIds: [safeFindingA.id],
      title: 'Pin actions/checkout to commit SHA',
      summary: 'Pin actions/checkout to commit SHA in CI workflow',
      difficulty: 'beginner',
      estimatedEffort: '20 minutes',
      estimatedMinutes: 20,
      skills: ['GitHub Actions', 'YAML'],
      files: ['.github/workflows/ci.yml'],
      suggestedChange: 'Replace uses: actions/checkout@v3 with full commit SHA',
      testPlan: ['Inspect CI run'],
      acceptanceCriteria: ['Action pinned to immutable SHA'],
      readiness: {
        documentationClarity: 18,
        testAvailability: 16,
        ciAutomation: 20,
        dependencyFreshness: 14,
        securityGovernance: 18,
        total: 86,
      },
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    };
    db.saveRoute(safeRouteA);

    // 4. Setup Secret Route for User A (Blocked by Disclosure Guard)
    secretRouteA = {
      id: 'route-secret-a-' + Math.random().toString(36).substring(2, 7),
      scanId,
      findingId: secretFindingA.id,
      findingIds: [secretFindingA.id],
      title: 'Revoke and rotate exposed AWS Secret Access Key',
      summary: 'Rotate credentials immediately',
      difficulty: 'advanced',
      estimatedEffort: '15 minutes',
      estimatedMinutes: 15,
      skills: ['Security'],
      files: ['server.env'],
      suggestedChange: 'Revoke key in AWS IAM console',
      testPlan: ['Verify key deactivated'],
      acceptanceCriteria: ['Secret revoked'],
      readiness: {
        documentationClarity: 15,
        testAvailability: 10,
        ciAutomation: 10,
        dependencyFreshness: 10,
        securityGovernance: 20,
        total: 65,
      },
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    };
    db.saveRoute(secretRouteA);

    // 5. Setup Critical Finding Route for User A (Blocked by Disclosure Guard)
    criticalRouteA = {
      id: 'route-crit-a-' + Math.random().toString(36).substring(2, 7),
      scanId,
      findingId: critFindingA.id,
      findingIds: [critFindingA.id],
      title: 'Upgrade vulnerable-pkg to patched version',
      summary: 'Neutralize RCE advisory',
      difficulty: 'intermediate',
      estimatedEffort: '30 minutes',
      estimatedMinutes: 30,
      skills: ['Security'],
      files: ['package.json'],
      suggestedChange: 'Update package.json',
      testPlan: ['Run test suite'],
      acceptanceCriteria: ['Package upgraded'],
      readiness: {
        documentationClarity: 15,
        testAvailability: 15,
        ciAutomation: 15,
        dependencyFreshness: 15,
        securityGovernance: 20,
        total: 80,
      },
      status: 'in-progress',
      createdAt: new Date().toISOString(),
    };
    db.saveRoute(criticalRouteA);
  });

  it('1. Generates draft in awaiting_review or draft state, awaiting explicit human approval', async () => {
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );

    expect(postRes.status).toBe(200);
    const postData = await postRes.json();
    expect(postData.ok).toBe(true);
    expect(postData.draft).toBeDefined();
    expect(['draft', 'awaiting_review']).toContain(postData.draft.status);
    expect(postData.draft.reviewDecision).toBeUndefined();
  });

  it('2. Human Approves draft via PATCH /api/drafts (action: "approve")', async () => {
    // Generate draft
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );
    const { draft } = await postRes.json();

    // Human approves draft
    const patchRes = await patchDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'PATCH', userA, {
        draftId: draft.id,
        action: 'approve',
      })
    );

    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.ok).toBe(true);
    expect(patchData.draft.status).toBe('approved');
    expect(patchData.draft.reviewDecision).toBe('approved');
    expect(patchData.draft.reviewedAt).toBeDefined();
    expect(new Date(patchData.draft.reviewedAt).getTime()).toBeGreaterThan(0);
    expect(patchData.storageTier).toBeDefined();
  });

  it('3. Human Rejects draft via PATCH /api/drafts with audit reason (action: "reject")', async () => {
    // Generate draft
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );
    const { draft } = await postRes.json();

    // Human rejects draft with reason
    const patchRes = await patchDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'PATCH', userA, {
        draftId: draft.id,
        action: 'reject',
        rejectedReason: 'Finding is a test fixture; maintainer does not want public issue.',
      })
    );

    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.ok).toBe(true);
    expect(patchData.draft.status).toBe('rejected');
    expect(patchData.draft.reviewDecision).toBe('rejected');
    expect(patchData.draft.rejectedReason).toBe(
      'Finding is a test fixture; maintainer does not want public issue.'
    );
    expect(patchData.draft.reviewedAt).toBeDefined();

    // Verify draft remains in history/audit log
    const getRes = await getDrafts(
      createAuthRequest('http://localhost:3000/api/drafts', 'GET', userA)
    );
    const getData = await getRes.json();
    const rejectedInList = getData.drafts.find((d: any) => d.id === draft.id);
    expect(rejectedInList).toBeDefined();
    expect(rejectedInList.status).toBe('rejected');
  });

  it('4. Approving and exporting draft via route [draftId] works identically and records exportedAt', async () => {
    // Generate draft
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );
    const { draft } = await postRes.json();

    // Approve via [draftId] route
    const approveRes = await patchDraftById(
      createAuthRequest(`http://localhost:3000/api/drafts/${draft.id}`, 'PATCH', userA, {
        action: 'approve',
      }),
      { params: Promise.resolve({ draftId: draft.id }) }
    );
    expect(approveRes.status).toBe(200);
    const approveData = await approveRes.json();
    expect(approveData.draft.status).toBe('approved');

    // Export via [draftId] route
    const exportRes = await patchDraftById(
      createAuthRequest(`http://localhost:3000/api/drafts/${draft.id}`, 'PATCH', userA, {
        action: 'export',
      }),
      { params: Promise.resolve({ draftId: draft.id }) }
    );
    expect(exportRes.status).toBe(200);
    const exportData = await exportRes.json();
    expect(exportData.draft.status).toBe('exported');
    expect(exportData.draft.exportedAt).toBeDefined();
  });

  it('5. User B CANNOT approve or reject User A draft (strict server-side ownership 403)', async () => {
    // User A generates draft
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );
    const { draft } = await postRes.json();

    // User B attempts to approve User A's draft
    const unauthorizedApprove = await patchDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'PATCH', userB, {
        draftId: draft.id,
        action: 'approve',
      })
    );
    expect(unauthorizedApprove.status).toBe(403);
    const approveErr = await unauthorizedApprove.json();
    expect(approveErr.errorCode).toBe('AUTH_INVALID_CREDENTIALS');

    // User B attempts to reject User A's draft
    const unauthorizedReject = await patchDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'PATCH', userB, {
        draftId: draft.id,
        action: 'reject',
        rejectedReason: 'Unauthorized tampering attempt',
      })
    );
    expect(unauthorizedReject.status).toBe(403);
    const rejectErr = await unauthorizedReject.json();
    expect(rejectErr.errorCode).toBe('AUTH_INVALID_CREDENTIALS');
  });

  it('6. Disclosure Guard authoritative check: secrets & critical findings strictly cannot become public drafts', async () => {
    // Secret route draft generation blocked
    const secretRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: secretRouteA.id,
      })
    );
    expect(secretRes.status).toBe(403);
    const secretData = await secretRes.json();
    expect(secretData.errorCode).toBe('DISCLOSURE_BLOCKED');

    // Critical route draft generation blocked
    const critRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: criticalRouteA.id,
      })
    );
    expect(critRes.status).toBe(403);
    const critData = await critRes.json();
    expect(critData.errorCode).toBe('DISCLOSURE_BLOCKED');
  });

  it('7. Zero Auto-Publish Verification: approval only marks local status and triggers zero external publication', async () => {
    const postRes = await postDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'POST', userA, {
        routeId: safeRouteA.id,
      })
    );
    const { draft } = await postRes.json();

    const patchRes = await patchDraft(
      createAuthRequest('http://localhost:3000/api/drafts', 'PATCH', userA, {
        draftId: draft.id,
        action: 'approve',
      })
    );
    expect(patchRes.status).toBe(200);

    // Verify activity stream logged draft_reviewed, and zero git/publish activity
    const activities = db.getActivities(userA.id);
    const reviewedActivity = activities.find(
      (a) => a.type === 'draft_reviewed'
    );
    expect(reviewedActivity).toBeDefined();

    // Verify zero GitHub published URLs or auto-PR fields exist on draft
    const updatedDraft = db.getDraftById(draft.id);
    expect((updatedDraft as any)?.publishedIssueUrl).toBeUndefined();
    expect((updatedDraft as any)?.publishedPrUrl).toBeUndefined();
  });
});
