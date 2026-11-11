import { describe, it, expect, beforeEach } from 'vitest';
import { GET as getFindings } from '@/app/api/findings/route';
import { GET as getScans } from '@/app/api/scans/route';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import type { ScanSummary, FindingEvidence } from '@/types';

const TEST_USER = {
  id: 'test-user-filtering',
  email: 'filter-tester@example.com',
  name: 'Filter Tester',
  createdAt: new Date().toISOString(),
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

describe('List Filtering Upgrade — Findings and Scans', () => {
  const now = Date.now();
  const scanId1 = `scan_filter_1_${now}`;
  const scanId2 = `scan_filter_2_${now}`;
  const scanId3 = `scan_filter_3_${now}`;

  const scan1: ScanSummary = {
    id: scanId1,
    userId: TEST_USER.id,
    repoName: 'expressjs/express',
    repoUrl: 'https://github.com/expressjs/express',
    owner: 'expressjs',
    branch: 'main',
    scannedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago (today)
    totalFiles: 120,
    totalBytes: 50000,
    status: 'completed',
    readinessScore: 85,
    techStack: {
      languages: [{ name: 'JavaScript', percentage: 95 }],
      frameworks: [{ name: 'Express', version: '4.18' }],
      packageManagers: ['npm'],
      tooling: ['eslint'],
    } as any,
    findingsCount: {
      total: 3,
      critical: 1,
      high: 1,
      medium: 1,
      low: 0,
      info: 0,
    },
  };

  const scan2: ScanSummary = {
    id: scanId2,
    userId: TEST_USER.id,
    repoName: 'pallets/flask',
    repoUrl: 'https://github.com/pallets/flask',
    owner: 'pallets',
    branch: 'main',
    scannedAt: new Date(now - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago (within 7d)
    totalFiles: 80,
    totalBytes: 35000,
    status: 'complete_with_warnings',
    readinessScore: 78,
    techStack: {
      languages: [{ name: 'Python', percentage: 98 }],
      frameworks: [{ name: 'Flask', version: '3.0' }],
      packageManagers: ['pip'],
      tooling: ['pytest'],
    } as any,
    findingsCount: {
      total: 1,
      critical: 0,
      high: 0,
      medium: 1,
      low: 0,
      info: 0,
    },
  };

  const scan3: ScanSummary = {
    id: scanId3,
    userId: TEST_USER.id,
    repoName: 'facebook/react',
    repoUrl: 'https://github.com/facebook/react',
    owner: 'facebook',
    branch: 'main',
    scannedAt: new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString(), // 15 days ago (within 30d)
    totalFiles: 500,
    totalBytes: 250000,
    status: 'failed',
    readinessScore: 40,
    techStack: {
      languages: [{ name: 'TypeScript', percentage: 90 }],
      frameworks: [{ name: 'React', version: '19.0' }],
      packageManagers: ['yarn'],
      tooling: ['jest'],
    } as any,
    findingsCount: {
      total: 0,
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    },
  };

  const finding1: FindingEvidence = {
    id: `fnd_crit_secret_${now}`,
    scanId: scanId1,
    category: 'secret',
    ruleId: 'SEC-TOKEN-EXPOSED',
    title: 'Hardcoded API Token Found',
    severity: 'critical',
    confidence: 'HIGH',
    sourceTool: 'SecretDetector',
    file: 'src/config/keys.js',
    lineStart: 14,
    lineEnd: 14,
    evidence: 'REDACTED',
    impact: 'Exposed secret allows arbitrary access',
    fixHint: 'Move secret to environment variable',
    skills: ['Secret Management'],
    learningResources: [],
    disclosureMode: 'security-disclosure',
    redacted: true,
    evidenceHash: 'abc123hash',
    fingerprint: 'fp_1',
    createdAt: new Date(now - 10000).toISOString(),
    reviewed: true,
    reviewedBy: TEST_USER.id,
    reviewedAt: new Date(now - 5000).toISOString(),
  };

  const finding2: FindingEvidence = {
    id: `fnd_high_action_${now}`,
    scanId: scanId1,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-UNPINNED',
    title: 'Unpinned GitHub Action Tag in CI',
    severity: 'high',
    confidence: 'HIGH',
    sourceTool: 'WorkflowAuditor',
    file: '.github/workflows/ci.yml',
    lineStart: 18,
    lineEnd: 18,
    evidence: 'uses: actions/checkout@v3',
    impact: 'Mutable action tags risk supply-chain compromise',
    fixHint: 'Pin to full 40-character commit hash',
    skills: ['CI/CD'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'def456hash',
    fingerprint: 'fp_2',
    createdAt: new Date(now - 20000).toISOString(),
    reviewed: false,
  };

  const finding3: FindingEvidence = {
    id: `fnd_med_health_${now}`,
    scanId: scanId1,
    category: 'repository-health',
    ruleId: 'HEALTH-MISSING-SECURITY-MD',
    title: 'Missing SECURITY.md Policy',
    severity: 'medium',
    confidence: 'MEDIUM',
    sourceTool: 'HealthAuditor',
    file: null,
    impact: 'Security researchers lack clear disclosure contact info',
    fixHint: 'Create SECURITY.md in repository root',
    skills: ['Governance'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'ghi789hash',
    fingerprint: 'fp_3',
    createdAt: new Date(now - 30000).toISOString(),
    reviewed: false,
    status: 'resolved',
    diffStatus: 'resolved',
  };

  beforeEach(() => {
    db.clearUserData(TEST_USER.id);

    db.saveUser({
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      passwordHash: 'dummy',
      createdAt: TEST_USER.createdAt,
    });

    db.saveScan(scan1);
    db.saveScan(scan2);
    db.saveScan(scan3);

    db.saveFindings([finding1, finding2, finding3]);
  });

  describe('Findings API Filtering (/api/findings)', () => {
    it('filters findings by ruleId (rule type)', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&ruleId=GH-ACTIONS-UNPINNED`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].ruleId).toBe('GH-ACTIONS-UNPINNED');
    });

    it('filters findings by file path (contains)', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&file=workflows`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].file).toBe('.github/workflows/ci.yml');
    });

    it('filters findings by status: open (non-reviewed and non-resolved)', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&status=open`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe(finding2.id);
      expect(data.findings[0].reviewed).toBeFalsy();
    });

    it('filters findings by status: approved / reviewed', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&status=approved`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe(finding1.id);
      expect(data.findings[0].reviewed).toBe(true);
    });

    it('filters findings by status: dismissed / resolved', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&status=dismissed`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe(finding3.id);
    });

    it('combines multiple filters: severity + status + file', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&severity=HIGH&status=open&file=ci.yml`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(1);
      expect(data.findings[0].id).toBe(finding2.id);
    });

    it('returns empty array when filter criteria does not match any finding', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}&severity=LOW`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings).toHaveLength(0);
    });

    it('maintains deterministic sorting by severity rank then confidence', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${scanId1}`)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings.length).toBeGreaterThanOrEqual(3);
      expect(data.findings[0].severity.toUpperCase()).toBe('CRITICAL');
      expect(data.findings[1].severity.toUpperCase()).toBe('HIGH');
      expect(data.findings[2].severity.toUpperCase()).toBe('MEDIUM');
    });
  });

  describe('Scans API Filtering (/api/scans)', () => {
    it('filters scans by repository name or owner (substring match)', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?repo=express')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.repoName.includes('express'))).toBe(true);
      expect(data.scans.every((s: ScanSummary) => s.repoName.toLowerCase().includes('express') || s.repoUrl.toLowerCase().includes('express'))).toBe(true);
    });

    it('filters scans by dateRange: today (within 24h)', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?dateRange=today')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.id === scan1.id)).toBe(true);
      // scan2 was 3 days ago, should not appear in today's scans
      expect(data.scans.some((s: ScanSummary) => s.id === scan2.id)).toBe(false);
    });

    it('filters scans by dateRange: 7d (within 7 days)', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?dateRange=7d')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.id === scan1.id)).toBe(true);
      expect(data.scans.some((s: ScanSummary) => s.id === scan2.id)).toBe(true);
      // scan3 was 15 days ago, should not appear in 7d
      expect(data.scans.some((s: ScanSummary) => s.id === scan3.id)).toBe(false);
    });

    it('filters scans by dateRange: 30d (within 30 days)', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?dateRange=30d')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.id === scan3.id)).toBe(true);
    });

    it('filters scans by status: completed', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?status=completed')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.id === scan1.id)).toBe(true);
      expect(data.scans.some((s: ScanSummary) => s.id === scan2.id)).toBe(true); // complete_with_warnings is grouped with completed
      expect(data.scans.some((s: ScanSummary) => s.id === scan3.id)).toBe(false);
    });

    it('filters scans by status: failed', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?status=failed')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans.some((s: ScanSummary) => s.id === scan3.id)).toBe(true);
      expect(data.scans.some((s: ScanSummary) => s.id === scan1.id)).toBe(false);
    });

    it('combines scans filters: repo + dateRange + status', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans?repo=express&dateRange=today&status=completed')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.scans).toHaveLength(1);
      expect(data.scans[0].id).toBe(scan1.id);
    });

    it('maintains deterministic sort by scannedAt descending', async () => {
      const res = await getScans(
        authReq('http://localhost:3000/api/scans')
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      const returnedScans: ScanSummary[] = data.scans;
      for (let i = 0; i < returnedScans.length - 1; i++) {
        const timeA = new Date(returnedScans[i].scannedAt).getTime();
        const timeB = new Date(returnedScans[i + 1].scannedAt).getTime();
        expect(timeA).toBeGreaterThanOrEqual(timeB);
      }
    });
  });

  describe('UI Filtering Logic & State Contracts', () => {
    it('correctly calculates active filter count', () => {
      const computeActiveFilters = (filters: {
        severity?: string;
        category?: string;
        status?: string;
        ruleId?: string;
        file?: string;
        q?: string;
      }) => {
        let count = 0;
        if (filters.severity && filters.severity !== 'ALL') count++;
        if (filters.category && filters.category !== 'all') count++;
        if (filters.status && filters.status !== 'all') count++;
        if (filters.ruleId && filters.ruleId !== 'ALL') count++;
        if (filters.file && filters.file.trim()) count++;
        if (filters.q && filters.q.trim()) count++;
        return count;
      };

      expect(computeActiveFilters({})).toBe(0);
      expect(
        computeActiveFilters({
          severity: 'HIGH',
          file: 'src/',
          status: 'open',
        })
      ).toBe(3);
      expect(
        computeActiveFilters({
          severity: 'ALL',
          category: 'all',
          status: 'all',
          ruleId: 'ALL',
          file: '',
          q: '',
        })
      ).toBe(0);
    });

    it('distinguishes between empty scan and empty-after-filter states', () => {
      const totalFindingsCount: number = 5;
      const filteredFindingsCount: number = 0;
      const activeFilterCount: number = 2;

      const isEmptyAfterFilter =
        totalFindingsCount > 0 && filteredFindingsCount === 0 && activeFilterCount > 0;
      const isCompletelyEmpty = totalFindingsCount === 0;

      expect(isEmptyAfterFilter).toBe(true);
      expect(isCompletelyEmpty).toBe(false);
    });
  });
});
