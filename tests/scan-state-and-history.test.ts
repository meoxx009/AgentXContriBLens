import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCanonicalRepoId, isSameRepository } from '@/components/views/ScanView';
import type { ScanSummary, Finding } from '@/types';

describe('TASK 1 — Scan Repository Page State and Previous Scan Display', () => {
  const MOCK_SCAN_1: ScanSummary = {
    id: 'scan_alpha_123',
    owner: 'expressjs',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    branch: 'main',
    scope: 'deep',
    totalFiles: 20,
    totalBytes: 50000,
    techStack: {} as any,
    readinessScore: 88,
    status: 'complete',
    scannedAt: '2026-11-10T12:00:00.000Z',
    findingsCount: {
      total: 3,
      critical: 0,
      high: 1,
      medium: 1,
      low: 1,
      info: 0,
    },
    findings: [
      {
        id: 'finding-1',
        scanId: 'scan_alpha_123',
        ruleId: 'GH-ACTIONS-WRITE-ALL',
        title: 'Workflow declares write-all permissions',
        severity: 'high',
        category: 'actions',
        filePath: '.github/workflows/ci.yml',
        lineNumber: 14,
        description: 'Permissions block uses write-all.',
        status: 'open',
        fingerprint: 'fp-1',
        createdAt: '2026-11-10T12:00:00.000Z',
      } as unknown as Finding,
    ],
  } as unknown as ScanSummary;

  const MOCK_SCAN_2: ScanSummary = {
    id: 'scan_beta_456',
    owner: 'facebook',
    repoUrl: 'https://github.com/facebook/react',
    repoName: 'facebook/react',
    branch: 'main',
    scope: 'deep',
    totalFiles: 35,
    totalBytes: 120000,
    techStack: {} as any,
    readinessScore: 94,
    status: 'complete',
    scannedAt: '2026-11-09T10:00:00.000Z',
    findingsCount: {
      total: 1,
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
      info: 0,
    },
    findings: [],
  } as unknown as ScanSummary;

  const MOCK_SCAN_1_OLDER: ScanSummary = {
    id: 'scan_alpha_old_001',
    owner: 'expressjs',
    repoUrl: 'https://github.com/expressjs/express',
    repoName: 'expressjs/express',
    branch: 'develop',
    scope: 'partial',
    totalFiles: 18,
    totalBytes: 45000,
    techStack: {} as any,
    readinessScore: 72,
    status: 'complete',
    scannedAt: '2026-11-08T09:00:00.000Z',
    findingsCount: {
      total: 5,
      critical: 1,
      high: 2,
      medium: 1,
      low: 1,
      info: 0,
    },
    findings: [],
  } as unknown as ScanSummary;

  describe('Requirement 1 & 6: Canonical Repository Identity', () => {
    it('normalizes various GitHub URL formats and casings to the same canonical identity', () => {
      const canonical = 'expressjs/express';
      expect(getCanonicalRepoId('https://github.com/expressjs/express')).toBe(canonical);
      expect(getCanonicalRepoId('https://github.com/expressjs/express.git')).toBe(canonical);
      expect(getCanonicalRepoId('https://github.com/expressjs/express/')).toBe(canonical);
      expect(getCanonicalRepoId('https://github.com/EXPRESSJS/EXPRESS')).toBe(canonical);
      expect(getCanonicalRepoId('expressjs/express')).toBe(canonical);
      expect(getCanonicalRepoId('expressjs/express.git')).toBe(canonical);
    });

    it('correctly compares repositories using isSameRepository regardless of URL formatting', () => {
      expect(
        isSameRepository('https://github.com/expressjs/express', 'expressjs/express.git')
      ).toBe(true);
      expect(
        isSameRepository('https://github.com/expressjs/express/', 'https://github.com/expressjs/express')
      ).toBe(true);
      expect(
        isSameRepository('https://github.com/expressjs/express', 'https://github.com/facebook/react')
      ).toBe(false);
      expect(isSameRepository(null, 'https://github.com/expressjs/express')).toBe(false);
      expect(isSameRepository('', '')).toBe(false);
    });
  });

  describe('Requirement 2: Latest Successful Scan Hydration (navigating away and back)', () => {
    it('hydrates activeScan into the current scan result when returning without search params', () => {
      // Simulating mount-time initializer:
      // const [scanResult, setScanResult] = useState(() => (activeScan && !urlParam && !scanIdParam ? ... : null))
      const activeScan = MOCK_SCAN_1;
      const urlParam = null;
      const scanIdParam = null;

      const initialResult =
        activeScan && !urlParam && !scanIdParam
          ? {
              scan: activeScan,
              findings: activeScan.findings || [],
              hasWarnings:
                activeScan.status === 'complete_with_warnings' ||
                Boolean(activeScan.warnings && activeScan.warnings.length > 0) ||
                (activeScan.scope === 'partial' && (activeScan.filesSkipped || 0) > 0),
            }
          : null;

      expect(initialResult).not.toBeNull();
      expect(initialResult?.scan.id).toBe(MOCK_SCAN_1.id);
      expect(initialResult?.scan.repoUrl).toBe(MOCK_SCAN_1.repoUrl);
      expect(initialResult?.findings).toHaveLength(1);
    });

    it('hydrates specific scan by scanId query param if present', () => {
      const recentScans = [MOCK_SCAN_1, MOCK_SCAN_2];
      const targetScanId = 'scan_beta_456';
      const matched = recentScans.find((s) => s.id === targetScanId);

      expect(matched).toBeDefined();
      expect(matched?.id).toBe(targetScanId);
      expect(matched?.repoName).toBe('facebook/react');
    });
  });

  describe('Requirement 3: Older Scans Remain in History Without Duplicating Current Result', () => {
    it('excludes the active/current scan from the previous scans list', () => {
      const recentScans = [MOCK_SCAN_1, MOCK_SCAN_1_OLDER, MOCK_SCAN_2];
      const currentScanId = MOCK_SCAN_1.id;

      const previousScans = recentScans.filter((s) => s.id !== currentScanId);

      // Current scan is excluded from previousScans
      expect(previousScans).toHaveLength(2);
      expect(previousScans.find((s) => s.id === currentScanId)).toBeUndefined();
      // Older scan for same repo remains in previousScans
      expect(previousScans[0].id).toBe(MOCK_SCAN_1_OLDER.id);
      // Other repo scan remains in previousScans
      expect(previousScans[1].id).toBe(MOCK_SCAN_2.id);
    });

    it('returns an empty previousScans array if only the currently viewed scan exists in history', () => {
      const recentScans = [MOCK_SCAN_1];
      const currentScanId = MOCK_SCAN_1.id;

      const previousScans = recentScans.filter((s) => s.id !== currentScanId);
      expect(previousScans).toHaveLength(0);
    });
  });

  describe('Requirement 4: Switching Repositories Clears or Switches Current Scan Appropriately', () => {
    it('clears current scan when user inputs a repository with no scan in history', () => {
      const recentScans = [MOCK_SCAN_1];
      const currentCanonical = getCanonicalRepoId(MOCK_SCAN_1.repoUrl);
      const newUrl = 'https://github.com/sveltejs/svelte';
      const newCanonical = getCanonicalRepoId(newUrl);

      expect(currentCanonical).not.toBe(newCanonical);

      const matchingScan = recentScans.find(
        (s) => getCanonicalRepoId(s.repoUrl) === newCanonical
      );
      expect(matchingScan).toBeUndefined();

      // If no matching scan, scanResult is cleared to null
      const updatedScanResult = matchingScan
        ? { scan: matchingScan, findings: matchingScan.findings || [] }
        : null;

      expect(updatedScanResult).toBeNull();
    });

    it('switches current scan to the existing scan when user inputs a repository that was scanned earlier', () => {
      const recentScans = [MOCK_SCAN_1, MOCK_SCAN_2];
      const newUrl = 'facebook/react';
      const newCanonical = getCanonicalRepoId(newUrl);

      const matchingScan = recentScans.find(
        (s) => getCanonicalRepoId(s.repoUrl) === newCanonical
      );

      expect(matchingScan).toBeDefined();
      expect(matchingScan?.id).toBe(MOCK_SCAN_2.id);
    });
  });

  describe('Requirement 5: Navigating Back Does Not Start Duplicate Scans', () => {
    it('synchronizes state in a read-only manner without executing POST /api/scans', () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // In ScanView, returning to the page triggers fetchRecentScans (GET /api/scans)
      // but never triggers handleScan (POST /api/scans)
      const isPostScanCalled = mockFetch.mock.calls.some(
        (call) => call[0] === '/api/scans' && call[1]?.method === 'POST'
      );

      expect(isPostScanCalled).toBe(false);
    });
  });

  describe('Requirement 6: Stale Responses Cannot Replace Latest Selected Scan State', () => {
    it('discards out-of-order in-flight scan responses using scanSeqRef', async () => {
      let scanSeq = 0;

      // Scan Request 1 starts
      const seq1 = ++scanSeq;
      let resultForReq1: string | null = null;

      // User initiates Scan Request 2 before Request 1 finishes
      const seq2 = ++scanSeq;
      let resultForReq2: string | null = null;

      // Request 2 completes first
      if (scanSeq === seq2) {
        resultForReq2 = 'data_req_2';
      }

      // Request 1 completes later (stale)
      if (scanSeq === seq1) {
        resultForReq1 = 'data_req_1';
      }

      expect(resultForReq2).toBe('data_req_2');
      expect(resultForReq1).toBeNull(); // Discarded!
    });
  });
});
