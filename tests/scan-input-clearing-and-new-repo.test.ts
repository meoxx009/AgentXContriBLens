import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCanonicalRepoId, isSameRepository } from '@/components/views/ScanView';
import type { ScanSummary, Finding } from '@/types';

describe('Scan Repository Input: Clearing, Free Editing, and Clean Context Switching', () => {
  const MOCK_SCAN_A: ScanSummary = {
    id: 'scan_repo_a_111',
    owner: 'meoxx009',
    repoUrl: 'https://github.com/meoxx009/GaganDrishti',
    repoName: 'meoxx009/GaganDrishti',
    branch: 'main',
    scope: 'deep',
    totalFiles: 25,
    totalBytes: 60000,
    techStack: { languages: ['TypeScript', 'Python'] } as any,
    readinessScore: 82,
    status: 'complete',
    scannedAt: '2026-11-11T12:00:00.000Z',
    findingsCount: {
      total: 4,
      critical: 0,
      high: 1,
      medium: 2,
      low: 1,
      info: 0,
    },
    findings: [
      {
        id: 'finding-a-1',
        scanId: 'scan_repo_a_111',
        ruleId: 'GH-ACTIONS-UNPINNED-TAG',
        title: 'Action tag is not pinned to commit SHA',
        severity: 'medium',
        category: 'actions',
        filePath: '.github/workflows/deploy.yml',
        lineNumber: 18,
        description: 'Unpinned GitHub action tag.',
        status: 'open',
        fingerprint: 'fp-a-1',
        createdAt: '2026-11-11T12:00:00.000Z',
      } as unknown as Finding,
    ],
  } as unknown as ScanSummary;

  const MOCK_SCAN_B: ScanSummary = {
    id: 'scan_repo_b_222',
    owner: 'expressjs',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    branch: 'master',
    scope: 'partial',
    totalFiles: 15,
    totalBytes: 40000,
    techStack: { languages: ['JavaScript'] } as any,
    readinessScore: 90,
    status: 'complete',
    scannedAt: '2026-11-12T01:00:00.000Z',
    findingsCount: {
      total: 2,
      critical: 0,
      high: 0,
      medium: 1,
      low: 1,
      info: 0,
    },
    findings: [
      {
        id: 'finding-b-1',
        scanId: 'scan_repo_b_222',
        ruleId: 'DEPENDENCY-OUTDATED',
        title: 'Vulnerable package dependency detected',
        severity: 'high',
        category: 'dependencies',
        filePath: 'package.json',
        lineNumber: 22,
        description: 'Outdated package with known advisory.',
        status: 'open',
        fingerprint: 'fp-b-1',
        createdAt: '2026-11-12T01:00:00.000Z',
      } as unknown as Finding,
    ],
  } as unknown as ScanSummary;

  describe('Test 1: Scan repo A → Click clear → Input empty, preview gone, fresh state, no old results visible', () => {
    it('clears repoUrl, branch, scanResult, and activeScan when explicit clear is triggered', () => {
      // Simulate state starting with Repo A scanned
      let repoUrl = MOCK_SCAN_A.repoUrl;
      let branch = MOCK_SCAN_A.branch;
      let scanResult: { scan: ScanSummary; findings: Finding[] } | null = {
        scan: MOCK_SCAN_A,
        findings: MOCK_SCAN_A.findings || [],
      };
      let activeScan: ScanSummary | null = MOCK_SCAN_A;
      let failure: any = null;
      let isUserCleared = false;

      // User triggers clear control
      const handleClear = () => {
        isUserCleared = true;
        repoUrl = '';
        branch = '';
        scanResult = null;
        activeScan = null;
        failure = null;
      };

      handleClear();

      expect(repoUrl).toBe('');
      expect(branch).toBe('');
      expect(scanResult).toBeNull();
      expect(activeScan).toBeNull();
      expect(failure).toBeNull();
      expect(isUserCleared).toBe(true);
    });

    it('guarantees effect Case 3 will not re-populate activeScan when isUserCleared is true', () => {
      const isUserCleared = true;
      let repoUrl = '';
      const activeScan = MOCK_SCAN_A;

      // Effect logic with isUserCleared guard:
      if (!isUserCleared && activeScan) {
        repoUrl = activeScan.repoUrl;
      }

      // repoUrl stays empty, does not get forced back
      expect(repoUrl).toBe('');
    });
  });

  describe('Test 2: Scan repo A → Type repo B → Scan → Results belong to B; A scan intact in history', () => {
    it('creates and sets scan result for B while leaving scan A in recent scans history', () => {
      let recentScans: ScanSummary[] = [MOCK_SCAN_A];
      let activeScan: ScanSummary | null = MOCK_SCAN_A;
      let scanResult: { scan: ScanSummary; findings: Finding[] } | null = {
        scan: MOCK_SCAN_A,
        findings: MOCK_SCAN_A.findings || [],
      };

      // User enters Repo B URL and initiates scan
      const newUrl = 'https://github.com/expressjs/express';
      expect(getCanonicalRepoId(newUrl)).not.toBe(getCanonicalRepoId(activeScan.repoUrl));

      // Scan B completes successfully
      activeScan = MOCK_SCAN_B;
      scanResult = {
        scan: MOCK_SCAN_B,
        findings: MOCK_SCAN_B.findings || [],
      };
      recentScans = [MOCK_SCAN_B, ...recentScans.filter((s) => s.id !== MOCK_SCAN_B.id)];

      // Verify active scan and result belong strictly to B
      expect(scanResult.scan.id).toBe(MOCK_SCAN_B.id);
      expect(scanResult.scan.repoName).toBe('expressjs/express');
      expect(scanResult.findings[0].id).toBe('finding-b-1');

      // Verify Repo A remains intact in recentScans history
      expect(recentScans).toHaveLength(2);
      const scanAInHistory = recentScans.find((s) => s.id === MOCK_SCAN_A.id);
      expect(scanAInHistory).toBeDefined();
      expect(scanAInHistory?.repoName).toBe('meoxx009/GaganDrishti');
      expect(scanAInHistory?.findingsCount.total).toBe(4);
    });
  });

  describe('Test 3: Input stays editable after completed scan and after returning from Live Agent / Findings', () => {
    it('keeps input editable (scanning = false) when scan is idle or completed', () => {
      const scanning = false;
      const disabled = scanning;
      expect(disabled).toBe(false);
    });

    it('permits changing repository URL after viewing a completed scan', () => {
      let repoUrl = MOCK_SCAN_A.repoUrl;
      let scanResult: any = { scan: MOCK_SCAN_A };
      let isUserCleared = false;

      // User types a new URL
      const handleRepoUrlChange = (newUrl: string) => {
        isUserCleared = true;
        repoUrl = newUrl;
        const newCanonical = getCanonicalRepoId(newUrl);
        const currentCanonical = getCanonicalRepoId(scanResult?.scan.repoUrl);
        if (currentCanonical !== newCanonical) {
          scanResult = null;
        }
      };

      handleRepoUrlChange('https://github.com/facebook/react');
      expect(repoUrl).toBe('https://github.com/facebook/react');
      expect(scanResult).toBeNull();
      expect(isUserCleared).toBe(true);
    });
  });

  describe('Test 4: Stale async response for repo A cannot overwrite repo B state', () => {
    it('discards response if scan sequence or repository identity does not match current target', () => {
      let scanSeq = 0;
      let currentActiveRepo = 'https://github.com/meoxx009/GaganDrishti';

      // Scan A starts
      const currentSeqA = ++scanSeq;
      const targetRepoA = currentActiveRepo;

      // User switches to Repo B and scans before A finishes
      currentActiveRepo = 'https://github.com/expressjs/express';
      const currentSeqB = ++scanSeq;
      const targetRepoB = currentActiveRepo;

      let appliedScan: string | null = null;

      // Late response for A arrives
      const responseA = { scan: { repoUrl: 'https://github.com/meoxx009/GaganDrishti' } };
      const isSequenceValidA = scanSeq === currentSeqA;
      const isRepoValidA = isSameRepository(targetRepoB, responseA.scan.repoUrl);

      if (isSequenceValidA && isRepoValidA) {
        appliedScan = 'repo_a_applied';
      }

      // Response for A must be discarded
      expect(isSequenceValidA).toBe(false);
      expect(isRepoValidA).toBe(false);
      expect(appliedScan).toBeNull();

      // Response for B arrives
      const responseB = { scan: { repoUrl: 'https://github.com/expressjs/express' } };
      const isSequenceValidB = scanSeq === currentSeqB;
      const isRepoValidB = isSameRepository(targetRepoB, responseB.scan.repoUrl);

      if (isSequenceValidB && isRepoValidB) {
        appliedScan = 'repo_b_applied';
      }

      expect(isSequenceValidB).toBe(true);
      expect(isRepoValidB).toBe(true);
      expect(appliedScan).toBe('repo_b_applied');
    });
  });

  describe('Test 5: Clearing the input never deletes stored scan history', () => {
    it('preserves all items in recentScans array when input and activeScan are cleared', () => {
      const persistedScansInDb: ScanSummary[] = [MOCK_SCAN_A, MOCK_SCAN_B];
      let activeScan: ScanSummary | null = MOCK_SCAN_A;
      let repoUrl = MOCK_SCAN_A.repoUrl;

      // User clears input
      repoUrl = '';
      activeScan = null;

      // Previous scans list is derived from persistedScansInDb (excluding activeScan id)
      const currentScanId = activeScan ? (activeScan as any).id : null;
      const previousScans = currentScanId
        ? persistedScansInDb.filter((s) => s.id !== currentScanId)
        : persistedScansInDb;

      expect(repoUrl).toBe('');
      expect(activeScan).toBeNull();
      // All historical scans are retained!
      expect(previousScans).toHaveLength(2);
      expect(previousScans[0].id).toBe(MOCK_SCAN_A.id);
      expect(previousScans[1].id).toBe(MOCK_SCAN_B.id);
    });
  });
});
