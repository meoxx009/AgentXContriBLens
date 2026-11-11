import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/db';
import { computeFindingFingerprint } from '../src/lib/scanner/diff';
import type { Finding, RepositoryMemory, ContributorProgress } from '../src/types';

describe('Durable Cross-Session Memory & Contributor Progress', () => {
  const USER_A_ID = 'user-alice-001';
  const USER_B_ID = 'user-bob-002';

  beforeEach(() => {
    // Reset user data for test isolation
    db.clearUserData(USER_A_ID);
    db.clearUserData(USER_B_ID);
  });

  describe('1. Owner Isolation Invariant', () => {
    it('guarantees User A cannot view User B’s repository memory', async () => {
      // User B saves repository memory for expressjs/express
      await db.saveRepositoryMemory({
        userId: USER_B_ID,
        ownerRepo: 'expressjs/express',
        lastScanId: 'scan-bob-1',
        lastScannedAt: new Date().toISOString(),
        ref: 'main',
        scope: 'partial',
        readinessScore: 85,
        summaryCounts: { total: 3, critical: 0, high: 1, medium: 2, low: 0, info: 0 },
        findingFingerprints: [
          {
            fingerprint: 'fp-bob-1',
            ruleId: 'ACTIONS_UNPINNED',
            filePath: '.github/workflows/ci.yml',
            severity: 'high',
            title: 'Unpinned action in CI',
          },
        ],
        safeWarnings: [],
        storageTier: 'durable_cloud',
      });

      // User A attempts to query repository memory for the same repository
      const aliceMemory = await db.getRepositoryMemory('expressjs/express', USER_A_ID);
      expect(aliceMemory).toBeNull();

      // User B can view their own memory
      const bobMemory = await db.getRepositoryMemory('expressjs/express', USER_B_ID);
      expect(bobMemory).not.toBeNull();
      expect(bobMemory?.lastScanId).toBe('scan-bob-1');
    });

    it('guarantees User A cannot overwrite User B’s contributor progress', async () => {
      await db.saveContributorProgress({
        userId: USER_B_ID,
        taskId: 'task-auth-hardening',
        taskTitle: 'Hardened GitHub Actions Workflows',
        status: 'completed',
        learnedSkills: ['sec-actions-pinning'],
        completedAt: new Date().toISOString(),
        storageTier: 'durable_cloud',
      });

      // User A creates their own task with same task ID
      await db.saveContributorProgress({
        userId: USER_A_ID,
        taskId: 'task-auth-hardening',
        taskTitle: 'Alice Route Work',
        status: 'in-progress',
        learnedSkills: ['docker-basics'],
        completedAt: null,
        storageTier: 'durable_cloud',
      });

      const bobProgress = await db.getContributorTaskProgress(USER_B_ID, 'task-auth-hardening');
      const aliceProgress = await db.getContributorTaskProgress(USER_A_ID, 'task-auth-hardening');

      expect(bobProgress?.status).toBe('completed');
      expect(bobProgress?.learnedSkills).toContain('sec-actions-pinning');

      expect(aliceProgress?.status).toBe('in-progress');
      expect(aliceProgress?.learnedSkills).toContain('docker-basics');
    });
  });

  describe('2. Repeated Scans Diff & Stable Fingerprint Memory', () => {
    it('correctly tracks new, unchanged, and resolved findings across simulated restarts', async () => {
      const finding1 = {
        id: 'f-1',
        scanId: 'scan-run-1',
        ruleId: 'SECRET_DETECTED',
        title: 'Hardcoded API Token in config.js',
        file: 'config.js',
        category: 'secret',
        severity: 'critical',
        evidence: 'api_key = "sk_live_REDACTED"',
        lineStart: 12,
        impact: 'Account compromise',
        fixHint: 'Move to environment variable',
        skills: ['env-secrets'],
      } as unknown as Finding;

      const finding2 = {
        id: 'f-2',
        scanId: 'scan-run-1',
        ruleId: 'ACTIONS_UNPINNED',
        title: 'Unpinned actions/checkout in CI',
        file: '.github/workflows/main.yml',
        category: 'github-actions',
        severity: 'medium',
        evidence: 'uses: actions/checkout@v3',
        lineStart: 5,
        impact: 'Supply chain risk',
        fixHint: 'Pin to commit hash',
        skills: ['actions-pinning'],
      } as unknown as Finding;

      const fp1 = computeFindingFingerprint(finding1);
      const fp2 = computeFindingFingerprint(finding2);

      expect(fp1).toBeTruthy();
      expect(fp2).toBeTruthy();
      expect(fp1).not.toBe(fp2);

      // Baseline scan 1 memory recorded
      await db.saveRepositoryMemory({
        userId: USER_A_ID,
        ownerRepo: 'acme/repo-sample',
        lastScanId: 'scan-run-1',
        lastScannedAt: new Date(Date.now() - 3600000).toISOString(),
        ref: 'main',
        scope: 'partial',
        readinessScore: 60,
        summaryCounts: { total: 2, critical: 1, high: 0, medium: 1, low: 0, info: 0 },
        findingFingerprints: [
          {
            fingerprint: fp1,
            ruleId: 'SECRET_DETECTED',
            filePath: 'config.js',
            severity: 'critical',
            title: finding1.title,
          },
          {
            fingerprint: fp2,
            ruleId: 'ACTIONS_UNPINNED',
            filePath: '.github/workflows/main.yml',
            severity: 'medium',
            title: finding2.title,
          },
        ],
        safeWarnings: [],
        storageTier: 'durable_cloud',
      });

      // Retrieve memory in a separate simulated instance
      const retrieved = await db.getRepositoryMemory('acme/repo-sample', USER_A_ID);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.findingFingerprints).toHaveLength(2);

      // Simulate Scan 2 where finding1 was REMEDIATED and a new finding3 was INTRODUCED
      const finding3 = {
        id: 'f-3',
        scanId: 'scan-run-2',
        ruleId: 'VULN_DEPENDENCY',
        title: 'Outdated vulnerable package lodash',
        file: 'package.json',
        category: 'dependency',
        severity: 'high',
        evidence: '"lodash": "4.17.15"',
        lineStart: 18,
        impact: 'RCE risk',
        fixHint: 'Upgrade to 4.17.21',
        skills: ['npm-audit'],
      } as unknown as Finding;
      const fp3 = computeFindingFingerprint(finding3);

      const scan2Findings = [finding2, finding3];
      const scan2Fingerprints = scan2Findings.map((f) => computeFindingFingerprint(f));

      // Compute diff against baseline memory
      const baselineFPs = retrieved!.findingFingerprints.map((fp) => fp.fingerprint);

      const unchanged = scan2Fingerprints.filter((fp) => baselineFPs.includes(fp));
      const newFindings = scan2Fingerprints.filter((fp) => !baselineFPs.includes(fp));
      const resolved = baselineFPs.filter((fp) => !scan2Fingerprints.includes(fp));

      expect(unchanged).toContain(fp2); // finding2 stayed
      expect(newFindings).toContain(fp3); // finding3 is newly detected
      expect(resolved).toContain(fp1); // finding1 was fixed
      expect(resolved).toHaveLength(1);
      expect(newFindings).toHaveLength(1);
      expect(unchanged).toHaveLength(1);
    });
  });

  describe('3. Contributor Progress Across Sessions', () => {
    it('persists completed tasks and learned skills across sessions', async () => {
      // Step 1: User starts task
      await db.saveContributorProgress({
        userId: USER_A_ID,
        taskId: 'route-dockerfile-sec',
        taskTitle: 'Remove root user from Dockerfile',
        status: 'in-progress',
        learnedSkills: ['docker-security'],
        storageTier: 'durable_cloud',
      });

      let progressList = await db.getContributorProgress(USER_A_ID);
      expect(progressList).toHaveLength(1);
      expect(progressList[0].status).toBe('in-progress');

      // Step 2: User completes task
      await db.saveContributorProgress({
        userId: USER_A_ID,
        taskId: 'route-dockerfile-sec',
        taskTitle: 'Remove root user from Dockerfile',
        status: 'completed',
        learnedSkills: ['docker-security', 'least-privilege'],
        completedAt: new Date().toISOString(),
        storageTier: 'durable_cloud',
      });

      // Step 3: Verify simulated fresh session query
      progressList = await db.getContributorProgress(USER_A_ID);
      expect(progressList).toHaveLength(1);
      expect(progressList[0].status).toBe('completed');
      expect(progressList[0].learnedSkills).toEqual(['docker-security', 'least-privilege']);
      expect(progressList[0].completedAt).toBeTruthy();
    });
  });

  describe('4. Storage Tier Status & Degraded Fallback', () => {
    it('truthfully reports storage tier capability without false durability claims', () => {
      const status = db.getStorageTierStatus();
      expect(['durable_cloud', 'local_ephemeral']).toContain(status.tier);
      expect(typeof status.isConfigured).toBe('boolean');
      expect(status.message).toBeTruthy();
    });
  });

  describe('5. Secret Redaction Before Memory Storage Invariant', () => {
    it('masks raw credentials, API keys, and secret values before persisting to memory', async () => {
      const rawSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890';
      const rawWarning = `GitHub Actions alert: token leaked: ${rawSecret}`;
      const rawTitle = `Found secret key: ${rawSecret} in test.env`;

      await db.saveRepositoryMemory({
        userId: USER_A_ID,
        ownerRepo: 'secure-org/app',
        lastScanId: 'scan-secret-test',
        lastScannedAt: new Date().toISOString(),
        ref: 'main',
        scope: 'partial',
        readinessScore: 90,
        summaryCounts: { total: 1, critical: 1, high: 0, medium: 0, low: 0, info: 0 },
        findingFingerprints: [
          {
            fingerprint: 'fp-sec-1',
            ruleId: 'SECRET_LEAK',
            filePath: 'test.env',
            severity: 'critical',
            title: rawTitle,
          },
        ],
        safeWarnings: [rawWarning],
        storageTier: 'durable_cloud',
      });

      const retrieved = await db.getRepositoryMemory('secure-org/app', USER_A_ID);
      expect(retrieved).not.toBeNull();

      // Invariant: Raw secret must NEVER exist in memory record
      const serialized = JSON.stringify(retrieved);
      expect(serialized).not.toContain(rawSecret);
      expect(serialized).toMatch(/(\*{6,}|\[REDACTED\])/);
    });
  });
});
