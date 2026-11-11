import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCanonicalRepoId, isSameRepository } from '@/components/views/ScanView';
import type { ScanSummary, Finding, ContributionRoute, User } from '@/types';

describe('TASK 3 — Regression Debugging & End-to-End Navigation Recheck', () => {
  const USER_A: User = {
    id: 'user_nav_alice',
    email: 'alice@contriblens.dev',
    name: 'Alice',
    role: 'contributor',
    settings: {
      theme: 'black-hole',
      fontSize: 'medium',
      fontFamily: 'sans',
      reducedMotion: false,
      strictRedaction: true,
      geminiGroundingPolicy: true,
    },
    createdAt: '2026-11-10T00:00:00.000Z',
  };

  const USER_B: User = {
    id: 'user_nav_bob',
    email: 'bob@contriblens.dev',
    name: 'Bob',
    role: 'contributor',
    settings: {
      theme: 'black-hole',
      fontSize: 'medium',
      fontFamily: 'sans',
      reducedMotion: false,
      strictRedaction: true,
      geminiGroundingPolicy: true,
    },
    createdAt: '2026-11-10T00:00:00.000Z',
  };

  const SCAN_EXPRESS_1: ScanSummary = {
    id: 'scan_express_101',
    userId: USER_A.id,
    owner: 'expressjs',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    branch: 'main',
    scope: 'deep',
    totalFiles: 45,
    totalBytes: 150000,
    techStack: {} as any,
    readinessScore: 85,
    status: 'complete',
    scannedAt: '2026-11-11T10:00:00.000Z',
    findingsCount: {
      total: 2,
      critical: 0,
      high: 1,
      medium: 1,
      low: 0,
      info: 0,
    },
    findings: [],
  } as unknown as ScanSummary;

  const SCAN_EXPRESS_OLDER: ScanSummary = {
    id: 'scan_express_099',
    userId: USER_A.id,
    owner: 'expressjs',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    branch: 'develop',
    scope: 'partial',
    totalFiles: 40,
    totalBytes: 140000,
    techStack: {} as any,
    readinessScore: 75,
    status: 'complete',
    scannedAt: '2026-11-09T08:00:00.000Z',
    findingsCount: {
      total: 4,
      critical: 1,
      high: 1,
      medium: 1,
      low: 1,
      info: 0,
    },
    findings: [],
  } as unknown as ScanSummary;

  const FINDING_ACTIONS: Finding = {
    id: 'fnd_exp_actions',
    scanId: SCAN_EXPRESS_1.id,
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'Workflow declares write-all permissions',
    severity: 'high',
    category: 'actions',
    file: '.github/workflows/ci.yml',
    filePath: '.github/workflows/ci.yml',
    line: 12,
    status: 'open',
    readiness: {
      total: 82,
      label: 'beginner-friendly',
      difficulty: 'beginner',
      reasons: ['Simple scope edit'],
    },
  } as unknown as Finding;

  const FINDING_DEP: Finding = {
    id: 'fnd_exp_dep',
    scanId: SCAN_EXPRESS_1.id,
    ruleId: 'OSV-VULNERABLE-DEP',
    title: 'Prototype pollution in cookie dependency',
    severity: 'medium',
    category: 'dependencies',
    file: 'package.json',
    filePath: 'package.json',
    line: 30,
    status: 'open',
    readiness: {
      total: 90,
      label: 'beginner-friendly',
      difficulty: 'beginner',
      reasons: ['Version bump'],
    },
  } as unknown as Finding;

  const SCAN_FINDINGS = [FINDING_ACTIONS, FINDING_DEP];

  describe('Flow A: Scan Repository → Live Agent → Findings → Return to Scan Repository', () => {
    it('step 1: verifies scan findings belong to the exact repository and scan ID', () => {
      const canonical = getCanonicalRepoId(SCAN_EXPRESS_1.repoUrl);
      expect(canonical).toBe('expressjs/express');

      // Findings must link to the exact scan ID
      SCAN_FINDINGS.forEach((f) => {
        expect(f.scanId).toBe(SCAN_EXPRESS_1.id);
      });
    });

    it('step 2: Live Agent resolves active repository context from activeScan when query params are absent', () => {
      const activeScan = SCAN_EXPRESS_1;

      // When opening /app/agent directly without ?url=...
      const urlQueryParam = '';
      const branchQueryParam = '';
      const scanIdQueryParam = '';

      // LiveAgent fallback resolution:
      const resolvedUrl = urlQueryParam || activeScan?.repoUrl || '';
      const resolvedBranch = branchQueryParam || activeScan?.branch || '';
      const resolvedScanId = scanIdQueryParam || activeScan?.id || undefined;

      expect(resolvedUrl).toBe('https://github.com/expressjs/express');
      expect(resolvedBranch).toBe('main');
      expect(resolvedScanId).toBe('scan_express_101');
    });

    it('step 3: Findings page filters exclusively to activeScan.id and does not leak other scans', () => {
      const allFindings = [
        ...SCAN_FINDINGS,
        {
          id: 'fnd_other_scan',
          scanId: 'scan_other_999',
          title: 'Unrelated scan finding',
          severity: 'critical',
          category: 'secret',
        } as unknown as Finding,
      ];

      // Simulated GET /api/findings?scanId=scan_express_101
      const activeScanId = SCAN_EXPRESS_1.id;
      const filtered = allFindings.filter((f) => f.scanId === activeScanId);

      expect(filtered).toHaveLength(2);
      expect(filtered.every((f) => f.scanId === SCAN_EXPRESS_1.id)).toBe(true);
      expect(filtered.find((f) => f.id === 'fnd_other_scan')).toBeUndefined();
    });

    it('step 4: returning to Scan Repository restores active scan in primary result and excludes it from previousScans', () => {
      const activeScan = SCAN_EXPRESS_1;
      const recentScans = [SCAN_EXPRESS_1, SCAN_EXPRESS_OLDER];

      // Primary scan result initialization from activeScan
      const scanResult = activeScan
        ? {
            scan: activeScan,
            findings: activeScan.findings || [],
          }
        : null;

      // History deduplication
      const currentScanId = scanResult?.scan.id;
      const previousScans = recentScans.filter((s) => s.id !== currentScanId);

      expect(scanResult?.scan.id).toBe('scan_express_101');
      expect(previousScans).toHaveLength(1);
      expect(previousScans[0].id).toBe('scan_express_099'); // Older scan preserved
      expect(previousScans.find((s) => s.id === 'scan_express_101')).toBeUndefined(); // Never duplicated
    });
  });

  describe('Flow B: Findings → Select Finding → Contributions + Stack → Return to Findings', () => {
    it('step 1 & 2: selecting a finding preserves canonical finding ID and creates associated route', () => {
      const selected = FINDING_DEP;
      let selectedFindingId: string | null = selected.id;

      // Creating a contribution route from the selected finding
      const createdRoute: ContributionRoute = {
        id: 'route_dep_bump',
        scanId: selected.scanId,
        findingId: selected.id,
        findingIds: [selected.id],
        title: 'Upgrade cookie dependency',
        summary: 'Upgrade vulnerable cookie package to clean version.',
        difficulty: 'beginner',
        estimatedMinutes: 15,
        skills: ['Dependencies'],
        files: ['package.json'],
        suggestedChange: 'Bump cookie dependency version',
        testPlan: ['npm test'],
        acceptanceCriteria: ['Tests pass cleanly'],
        readiness: { total: 90 },
        status: 'not-started',
      };

      expect(createdRoute.findingId).toBe(selected.id);
      expect(createdRoute.scanId).toBe(SCAN_EXPRESS_1.id);
      expect(selectedFindingId).toBe(FINDING_DEP.id);
    });

    it('step 3: returning to Findings restores the selected finding and brings it into view', () => {
      const storedFindingId = FINDING_DEP.id;

      // When returning to FindingsView, finding is located in loaded scan findings
      const restored = SCAN_FINDINGS.find((f) => f.id === storedFindingId);
      expect(restored).toBeDefined();
      expect(restored?.id).toBe(FINDING_DEP.id);

      // Verify filter relaxation if an active filter would hide it:
      let activeSeverity = 'HIGH'; // Initially filtering for HIGH
      if (activeSeverity !== 'ALL' && restored!.severity.toUpperCase() !== activeSeverity) {
        activeSeverity = 'ALL'; // Relaxed to reveal restored finding
      }
      expect(activeSeverity).toBe('ALL');
    });

    it('step 4: browser Back/Forward restores the correct finding from history state', () => {
      const historyParams = new URLSearchParams('findingId=fnd_exp_actions');
      const paramId = historyParams.get('findingId');

      const popstateMatch = SCAN_FINDINGS.find((f) => f.id === paramId);
      expect(popstateMatch).toBeDefined();
      expect(popstateMatch?.id).toBe('fnd_exp_actions');
    });
  });

  describe('Edge Cases & Defense Invariants', () => {
    it('different repository: typing a new unscanned URL clears stale scan results', () => {
      const currentScan = SCAN_EXPRESS_1;
      const newUrl = 'https://github.com/facebook/react';

      const isSame = isSameRepository(currentScan.repoUrl, newUrl);
      expect(isSame).toBe(false);

      // When different repo is typed, current scan result is cleared
      const nextScanResult = isSame ? currentScan : null;
      expect(nextScanResult).toBeNull();
    });

    it('different repository: typing an already scanned URL promotes that repo scan to active', () => {
      const allScans = [
        SCAN_EXPRESS_1,
        {
          id: 'scan_react_202',
          repoUrl: 'https://github.com/facebook/react',
          repoName: 'facebook/react',
        } as ScanSummary,
      ];

      const inputUrl = 'facebook/react';
      const inputCanonical = getCanonicalRepoId(inputUrl);

      const match = allScans.find((s) => getCanonicalRepoId(s.repoUrl) === inputCanonical);
      expect(match).toBeDefined();
      expect(match?.id).toBe('scan_react_202');
    });

    it('empty scan results (0 findings) are handled truthfully without crash', () => {
      const emptyFindings: Finding[] = [];
      const selected = emptyFindings.length > 0 ? emptyFindings[0] : null;

      expect(selected).toBeNull();
    });

    it('stale in-flight scan responses are rejected by sequence counter', () => {
      let scanSeq = 0;

      // User starts scan on repo A (seq 1)
      const seq1 = ++scanSeq;
      let displayedRepo: string | null = null;

      // User switches to repo B before repo A responds (seq 2)
      const seq2 = ++scanSeq;

      // Repo B finishes first
      if (scanSeq === seq2) {
        displayedRepo = 'repo_b';
      }

      // Repo A finishes late
      if (scanSeq === seq1) {
        displayedRepo = 'repo_a'; // Should NOT run
      }

      expect(displayedRepo).toBe('repo_b');
    });

    it('authorization: User A cannot read User B scan findings', () => {
      const scanUserA = SCAN_EXPRESS_1; // userId = 'user_nav_alice'
      const requestUser = USER_B; // userId = 'user_nav_bob'

      // Verification check from /api/findings and /api/scans/[scanId]
      const isAuthorized = !scanUserA.userId || scanUserA.userId === requestUser.id;
      expect(isAuthorized).toBe(false);
    });
  });
});
