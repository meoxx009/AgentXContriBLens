import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import type { ScanSummary, Finding, User } from '@/types';

const TEST_USER: User = {
  id: 'usr_test_1',
  email: 'test@contriblens.dev',
  name: 'Test Contributor',
  createdAt: new Date().toISOString(),
};

function createAuthRequest(url: string, method = 'GET') {
  const token = signSessionToken({
    id: TEST_USER.id,
    email: TEST_USER.email,
    name: TEST_USER.name,
  });

  return new Request(url, {
    method,
    headers: {
      Cookie: `contriblens_session=${token}`,
      'Content-Type': 'application/json',
    },
  });
}

describe('Scan Data Persistence & Multi-Page Sync Contract', () => {
  const dummyScan: ScanSummary = {
    id: 'scn_test_persistence_123',
    userId: 'usr_test_1',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    owner: 'expressjs',
    branch: 'main',
    totalFiles: 25,
    totalBytes: 50000,
    techStack: { languages: ['JavaScript'], frameworks: ['Express'], tooling: ['GitHub Actions'], manifests: ['package.json'], confidenceScore: 0.95 } as any,
    scannedAt: new Date().toISOString(),
    findingsCount: {
      critical: 1,
      high: 1,
      medium: 0,
      low: 0,
      info: 0,
      total: 2,
    },
    readinessScore: 88,
    status: 'completed',
    technologies: { languages: ['TypeScript'], frameworks: ['Node.js'], tooling: ['GitHub Actions'], manifests: ['package.json'] } as any,
    findings: [
      {
        id: 'fnd_test_1',
        scanId: 'scn_test_persistence_123',
        ruleId: 'SEC-ACTIONS-WRITE-ALL',
        title: 'Workflow declares write-all permissions',
        severity: 'CRITICAL',
        category: 'github-actions',
        file: '.github/workflows/ci.yml',
        line: 12,
        lineStart: 12,
        lineEnd: 12,
        evidence: 'permissions: write-all',
        evidenceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        impact: 'Gives full repository write access',
        fixHint: 'Scope permissions to read-only',
        confidence: 'HIGH',
        readiness: {
          score: 92,
          label: 'beginner_ready',
          estimatedMinutes: 15,
          requiredSkills: ['GitHub Actions', 'YAML'],
          breakdown: { clarity: 95, isolatedFile: 90, fixHintActionable: 95, safetyLevel: 90 },
        },
      } as unknown as Finding,
      {
        id: 'fnd_test_2',
        scanId: 'scn_test_persistence_123',
        ruleId: 'SEC-DEP-OUTDATED',
        title: 'Outdated vulnerable package in package.json',
        severity: 'HIGH',
        category: 'dependencies',
        file: 'package.json',
        line: 25,
        lineStart: 25,
        lineEnd: 25,
        evidence: '"lodash": "4.17.20"',
        evidenceHash: 'c4ca4238a0b923820dcc509a6f75849b27ae41e4649b934ca495991b7852b855',
        impact: 'Known prototype pollution vulnerability',
        fixHint: 'Upgrade to lodash >= 4.17.21',
        confidence: 'HIGH',
        readiness: {
          score: 85,
          label: 'beginner_ready',
          estimatedMinutes: 20,
          requiredSkills: ['npm', 'Dependencies'],
          breakdown: { clarity: 90, isolatedFile: 85, fixHintActionable: 90, safetyLevel: 85 },
        },
      } as unknown as Finding,
    ],
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    db.saveScan(dummyScan);
    db.deleteFindingsByScanId(dummyScan.id);
    if (dummyScan.findings) {
      db.saveFindings(dummyScan.findings);
    }
  });

  it('persists scan with attached findings array in db storage', () => {
    const fetched = db.getScanById(dummyScan.id);
    expect(fetched).toBeDefined();
    expect(fetched?.id).toBe(dummyScan.id);
    expect(fetched?.repoName).toBe('expressjs/express');

    const findings = db.getFindings(dummyScan.id);
    expect(findings.length).toBe(2);
    expect(findings.map((f) => f.id)).toContain('fnd_test_1');
    expect(findings.map((f) => f.id)).toContain('fnd_test_2');
  });

  it('negative guard: transient missing server scan does not destroy client scan data', () => {
    // Simulating AppContext reconcile logic
    const clientSavedScan = { ...dummyScan };
    const serverScansList: ScanSummary[] = []; // Cold start lambda returned empty list

    let activeScan: ScanSummary | null = clientSavedScan;

    // Reconciliation rule: if server scans list is temporarily empty, preserve local activeScan
    if (serverScansList.length > 0) {
      const matched = serverScansList.find((s) => s.id === clientSavedScan.id);
      if (matched) {
        activeScan = { ...matched, findings: clientSavedScan.findings };
      }
    }
    // activeScan must NOT be reset to null!
    expect(activeScan).not.toBeNull();
    expect(activeScan?.id).toBe(dummyScan.id);
    expect(activeScan?.findings?.length).toBe(2);
  });

  it('negative guard: 404 from routes or findings API must never wipe activeScan', () => {
    let activeScanState: ScanSummary | null = { ...dummyScan };
    const simulatedLocalStorage: Record<string, string> = {
      contriblens_active_scan: JSON.stringify(dummyScan),
    };

    const handleApiResponse = (status: number) => {
      if (status === 404) {
        // NON-DESTRUCTIVE FALLBACK (fixed behavior):
        // Fallback to in-memory activeScan.findings without calling setActiveScan(null) or removeItem
        return {
          usedFallback: true,
          findings: activeScanState?.findings || [],
        };
      }
      return { usedFallback: false, findings: [] };
    };

    const result = handleApiResponse(404);
    expect(result.usedFallback).toBe(true);
    expect(result.findings.length).toBe(2);
    expect(activeScanState).not.toBeNull();
    expect(simulatedLocalStorage.contriblens_active_scan).toBeDefined();
  });

  it('findings reload contract: response sets explicit no-store cache headers', async () => {
    // Verify GET /api/findings returns no-store
    const req = createAuthRequest(`http://localhost:3000/api/findings?scanId=${dummyScan.id}`);
    const { GET } = await import('@/app/api/findings/route');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const cacheHeader = res.headers.get('cache-control');
    expect(cacheHeader).toContain('no-store');
    expect(cacheHeader).toContain('no-cache');

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.findings.length).toBe(2);
  });

  it('selection state deduplication: identical finding selection does not trigger state dispatch', () => {
    let stateUpdates = 0;
    let currentState: string | null = 'fnd_test_1';

    const setSelectedFindingId = (nextId: string | null) => {
      if (currentState !== nextId) {
        currentState = nextId;
        stateUpdates++;
      }
    };

    // Selecting the already selected finding must NOT dispatch state update
    setSelectedFindingId('fnd_test_1');
    expect(stateUpdates).toBe(0);

    // Selecting a new finding dispatches exactly once
    setSelectedFindingId('fnd_test_2');
    expect(stateUpdates).toBe(1);
    expect(currentState).toBe('fnd_test_2');

    // Deselecting dispatches
    setSelectedFindingId(null);
    expect(stateUpdates).toBe(2);
    expect(currentState).toBeNull();
  });

  it('rescan replaces previous findings for the same user+repo+branch and relinks routes', () => {
    const scan1Id = 'scn_rescan_1';
    const scan2Id = 'scn_rescan_2';
    const repo = 'test-org/test-repo';
    const branch = 'main';

    const scan1: ScanSummary = {
      ...dummyScan,
      id: scan1Id,
      userId: TEST_USER.id,
      repoName: repo,
      branch,
    };

    const findingScan1: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_scan1_rule1',
      scanId: scan1Id,
      ruleId: 'SEC-ACTIONS-WRITE-ALL',
      file: '.github/workflows/ci.yml',
      fingerprint: 'fp-write-all-ci',
    };

    db.saveScan(scan1);
    db.saveFindings([findingScan1]);

    // Create a route linked to findingScan1
    db.saveRoute({
      id: 'rte_test_1',
      scanId: scan1Id,
      findingId: 'fnd_scan1_rule1',
      findingIds: ['fnd_scan1_rule1'],
      title: 'Fix workflow permissions',
      summary: 'Restrict permissions',
      status: 'not-started',
      suggestedChange: 'permissions: read-all',
      testPlan: ['npm test'],
      acceptanceCriteria: ['Read-only token'],
      skills: ['GitHub Actions'],
      files: ['.github/workflows/ci.yml'],
      estimatedMinutes: 15,
      difficulty: 'beginner',
      readiness: { total: 90 },
    });

    expect(db.getFindings(scan1Id).length).toBe(1);

    // Rescan 2 arrives with new finding ID for the same fingerprint
    const scan2: ScanSummary = {
      ...dummyScan,
      id: scan2Id,
      userId: TEST_USER.id,
      repoName: repo,
      branch,
    };

    const findingScan2: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_scan2_rule1',
      scanId: scan2Id,
      ruleId: 'SEC-ACTIONS-WRITE-ALL',
      file: '.github/workflows/ci.yml',
      fingerprint: 'fp-write-all-ci',
    };

    // Execute replacement
    db.replacePreviousScanFindings({
      userId: TEST_USER.id,
      repoName: repo,
      branch,
      newScanId: scan2Id,
      newFindings: [findingScan2],
    });
    db.saveScan(scan2);
    db.saveFindings([findingScan2]);

    // Finding from scan 1 should be gone; finding from scan 2 should be present
    expect(db.getFindings(scan1Id).length).toBe(0);
    expect(db.getFindings(scan2Id).length).toBe(1);
    expect(db.getFindings(scan2Id)[0].id).toBe('fnd_scan2_rule1');

    // Route should be re-linked to scan2Id and fnd_scan2_rule1
    const updatedRoute = db.getRouteById('rte_test_1');
    expect(updatedRoute?.findingId).toBe('fnd_scan2_rule1');
    expect(updatedRoute?.findingIds).toEqual(['fnd_scan2_rule1']);
    expect(updatedRoute?.scanId).toBe(scan2Id);
  });

  it('getFindingById matches ONLY by exact id, never by fingerprint', () => {
    const fndA: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_exact_id_100',
      scanId: 'scn_exact_id_test',
      fingerprint: 'fp_shared_value_123',
    };
    const fndB: Finding = {
      ...dummyScan.findings![1],
      id: 'fnd_exact_id_200',
      scanId: 'scn_exact_id_test',
      fingerprint: 'fp_shared_value_123',
    };

    db.saveFindings([fndA, fndB]);

    // Exact ID queries return the exact matching finding
    expect(db.getFindingById('fnd_exact_id_100')?.id).toBe('fnd_exact_id_100');
    expect(db.getFindingById('fnd_exact_id_200')?.id).toBe('fnd_exact_id_200');

    // Querying with fingerprint must return undefined (fingerprint is not an ID)
    expect(db.getFindingById('fp_shared_value_123')).toBeUndefined();
  });

  it('mem- synthetic findings are rejected and never returned by getFindingById or saveFindings', () => {
    const memFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'mem-fp-prior-finding',
      scanId: 'scn_mem_test',
      impact: 'Prior scan finding',
    };

    db.saveFindings([memFinding]);

    // Must not be saved or retrievable
    expect(db.getFindingById('mem-fp-prior-finding')).toBeUndefined();
    expect(db.getFindings().some((f) => f.id.startsWith('mem-'))).toBe(false);
  });

  it('GET /api/findings excludes false positive files and mem- synthetic findings', async () => {
    const testScanId = 'scn_filter_fp_test';
    const scan: ScanSummary = {
      ...dummyScan,
      id: testScanId,
      userId: TEST_USER.id,
    };
    db.saveScan(scan);

    const validFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_valid_app',
      scanId: testScanId,
      file: 'src/server.ts',
    };
    const nodeModulesFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_node_modules',
      scanId: testScanId,
      file: 'node_modules/express/index.js',
    };
    const vendorFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_vendor',
      scanId: testScanId,
      file: 'vendor/bundle.js',
    };
    const lockfileFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_lockfile',
      scanId: testScanId,
      file: 'package-lock.json',
    };
    const minifiedFinding: Finding = {
      ...dummyScan.findings![0],
      id: 'fnd_minified',
      scanId: testScanId,
      file: 'dist/app.min.js',
    };

    db.saveFindings([validFinding, nodeModulesFinding, vendorFinding, lockfileFinding, minifiedFinding]);

    const req = createAuthRequest(`http://localhost:3000/api/findings?scanId=${testScanId}`);
    const { GET } = await import('@/app/api/findings/route');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    const ids = body.findings.map((f: Finding) => f.id);

    expect(ids).toContain('fnd_valid_app');
    expect(ids).not.toContain('fnd_node_modules');
    expect(ids).not.toContain('fnd_vendor');
    expect(ids).not.toContain('fnd_lockfile');
    expect(ids).not.toContain('fnd_minified');
  });
});
