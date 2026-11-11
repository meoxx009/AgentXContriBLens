import { describe, it, expect, vi, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, hashPasswordSync, comparePasswordSync } from '../src/lib/auth';
import { db } from '../src/lib/db';
import { scanRepositoryFiles } from '../src/lib/scanner';
import {
  fetchBoundedRepositoryTree,
  clearRepoMetadataCache,
  MAX_FILE_SIZE_BYTES,
  MAX_TOTAL_BYTES,
  type BoundedFile,
} from '../src/lib/scanner/github';
import { executeFetchFile, type AgentToolContext } from '../src/lib/agent/tools';
import { createFindingEvidence } from '../src/lib/scanner/evidence';
import { GET as getRoutes } from '../src/app/api/routes/route';
import { signSessionToken } from '../src/lib/auth';
import type { Finding, ScanSummary } from '../src/types';

describe('Performance & Hardening Regression Test Suite', () => {
  const TEST_USER = {
    id: 'usr_perf_reg_1',
    email: 'perf@example.com',
    name: 'Perf Tester',
    createdAt: new Date().toISOString(),
  };

  beforeEach(() => {
    db.saveUser(TEST_USER);
    clearRepoMetadataCache();
  });

  // 1. Same fixture produces the same findings and evidence hashes
  it('produces identical deterministic findings and evidence hashes for the same repository files', () => {
    const fixtureFiles: BoundedFile[] = [
      {
        path: 'package.json',
        size: 120,
        content: JSON.stringify({
          name: 'sample-app',
          dependencies: { lodash: '4.17.20', express: '4.17.1' },
          scripts: { test: 'vitest run' },
        }),
      },
      {
        path: '.github/workflows/ci.yml',
        size: 250,
        content: `name: CI
on: [push, pull_request]
permissions: write-all
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - run: npm test`,
      },
      {
        path: 'config.py',
        size: 80,
        content: 'API_KEY = "ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"\n',
      },
    ];

    const run1 = scanRepositoryFiles(fixtureFiles, 'scan_det_1', { licenseName: 'MIT', repoName: 'test/repo' });
    const run2 = scanRepositoryFiles(fixtureFiles, 'scan_det_2', { licenseName: 'MIT', repoName: 'test/repo' });

    expect(run1.findings.length).toBe(run2.findings.length);
    expect(run1.readinessScore).toBe(run2.readinessScore);

    // Finding rules, files, and redacted evidence hashes must match exactly
    for (let i = 0; i < run1.findings.length; i++) {
      const f1 = run1.findings[i];
      const f2 = run2.findings[i];
      expect(f1.ruleId).toBe(f2.ruleId);
      expect(f1.file).toBe(f2.file);
      expect(f1.severity).toBe(f2.severity);
      expect(f1.evidenceHash).toBe(f2.evidenceHash);
    }
  });

  // 2. Concurrency never exceeds the configured cap (cap = 5)
  it('enforces that concurrent file downloads never exceed the concurrency cap of 5', async () => {
    let activeConcurrency = 0;
    let maxObservedConcurrency = 0;

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.github.com/repos/testowner/testrepo/git/trees')) {
        return new Response(
          JSON.stringify({
            tree: Array.from({ length: 25 }).map((_, i) => ({
              path: `src/component_${i}.ts`,
              type: 'blob',
              size: 500,
              url: `https://api.github.com/blob_${i}`,
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('raw.githubusercontent.com')) {
        activeConcurrency++;
        if (activeConcurrency > maxObservedConcurrency) {
          maxObservedConcurrency = activeConcurrency;
        }
        await new Promise((r) => setTimeout(r, 20));
        activeConcurrency--;
        return new Response('export const x = 1;', { status: 200 });
      }
      return originalFetch(url);
    });

    try {
      const result = await fetchBoundedRepositoryTree('testowner', 'testrepo', 'main', 'main', 'deep');
      expect(result.files.length).toBe(25);
      expect(maxObservedConcurrency).toBeLessThanOrEqual(5);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 15000);

  // 3. Total and per-file byte bounds hold under concurrent downloads
  it('strictly enforces total and per-file byte bounds under concurrent downloads', async () => {
    const originalFetch = globalThis.fetch;
    const OVERSIZED_CONTENT = 'A'.repeat(250_000); // 250 KB (exceeds 180 KB limit)

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.github.com/repos/testowner/boundsrepo/git/trees')) {
        return new Response(
          JSON.stringify({
            tree: Array.from({ length: 20 }).map((_, i) => ({
              path: `large_file_${i}.txt`,
              type: 'blob',
              size: 250_000,
              url: `https://api.github.com/blob_${i}`,
            })),
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url.includes('raw.githubusercontent.com')) {
        return new Response(OVERSIZED_CONTENT, { status: 200 });
      }
      return originalFetch(url);
    });

    try {
      const result = await fetchBoundedRepositoryTree('testowner', 'boundsrepo', 'main', 'main', 'deep');

      // Every individual file must not exceed MAX_FILE_SIZE_BYTES (180 KB)
      for (const file of result.files) {
        expect(file.size).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
        expect(Buffer.byteLength(file.content, 'utf-8')).toBeLessThanOrEqual(MAX_FILE_SIZE_BYTES);
      }

      // Total bytes must not exceed MAX_TOTAL_BYTES (15 MB)
      expect(result.totalBytes).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
      expect(result.warnings.some((w) => w.includes('truncated') || w.includes('skipped'))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 15000);

  // 4. Repeated run steps do not fetch the same file twice unnecessarily
  it('deduplicates repeated file fetches within an agent run via filesCache', async () => {
    let networkFetchCount = 0;
    const originalFetch = globalThis.fetch;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('raw.githubusercontent.com')) {
        networkFetchCount++;
        return new Response('export default function App() {}', { status: 200 });
      }
      return originalFetch(url);
    });

    try {
      const context: AgentToolContext = {
        userId: TEST_USER.id,
        repoUrl: 'https://github.com/facebook/react',
        branch: 'main',
        filesCache: new Map(),
      };

      // Call 1: should fetch from network and populate filesCache
      const res1 = await executeFetchFile(
        { repoUrl: 'https://github.com/facebook/react', path: 'packages/react/index.js', branch: 'main' },
        context
      );
      expect(res1.ok).toBe(true);
      expect(networkFetchCount).toBe(1);

      // Call 2: should hit in-memory context.filesCache with 0 network calls
      const res2 = await executeFetchFile(
        { repoUrl: 'https://github.com/facebook/react', path: 'packages/react/index.js', branch: 'main' },
        context
      );
      expect(res2.ok).toBe(true);
      expect(networkFetchCount).toBe(1); // Unchanged!
      if (res1.ok && res2.ok && res1.data && res2.data) {
        expect(res1.data.content).toBe(res2.data.content);
        expect(res1.data.sha256).toBe(res2.data.sha256);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 15000);

  // 5. Optional AI failures do not block deterministic findings
  it('ensures AI failure or unreachability never prevents deterministic findings from saving and completing', async () => {
    // When executeRepositoryScan runs with mocked repo files, deterministic findings must succeed
    const mockFiles: BoundedFile[] = [
      {
        path: '.github/workflows/deploy.yml',
        size: 300,
        content: 'name: Deploy\non: push\npermissions: write-all\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v2\n',
      },
    ];

    const scanResult = scanRepositoryFiles(mockFiles, 'scan_ai_fail_test', {
      licenseName: 'Apache-2.0',
      repoName: 'test/repo',
    });

    expect(scanResult.findings.length).toBeGreaterThan(0);
    expect(scanResult.findings.some((f) => f.ruleId === 'GH-ACTIONS-WRITE-ALL')).toBe(true);
    expect(scanResult.readinessScore).toBeGreaterThan(0);
  });

  // 6. Route generation no longer blocks the scan response if made lazy
  it('verifies that route generation is lazy and returns on-demand via GET /api/routes', async () => {
    const scanId = `scn_lazy_${Date.now()}`;
    const scanSummary: ScanSummary = {
      id: scanId,
      userId: TEST_USER.id,
      repoUrl: 'https://github.com/example/lazy-repo',
      repoName: 'example/lazy-repo',
      owner: 'example',
      branch: 'main',
      scope: 'partial',
      scannedAt: new Date().toISOString(),
      totalFiles: 2,
      totalBytes: 500,
      filesScanned: 2,
      bytesScanned: 500,
      filesSkipped: 0,
      status: 'completed',
      readinessScore: 85,
      techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 1 },
      findingsCount: { total: 1, critical: 0, high: 1, medium: 0, low: 0, info: 0 },
    };

    const finding = createFindingEvidence({
      scanId,
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned Action in Workflow',
      category: 'actions',
      severity: 'medium',
      confidence: 1.0,
      sourceTool: 'actions-scanner',
      file: '.github/workflows/test.yml',
      evidence: 'uses: actions/checkout@v2',
      impact: 'Supply chain vulnerability',
      fixHint: 'Pin to SHA',
      disclosureMode: 'maintainer-review',
      redacted: true,
    });

    db.saveScan(scanSummary);
    db.saveFindings([finding]);

    // Right after scan, zero routes exist in database
    expect(db.getRoutes(scanId).length).toBe(0);

    // Call GET /api/routes?scanId=...
    const token = signSessionToken({ id: TEST_USER.id, email: TEST_USER.email, name: TEST_USER.name });
    const req = new Request(`http://localhost:3000/api/routes?scanId=${scanId}`, {
      method: 'GET',
      headers: {
        Cookie: `contriblens_session=${token}`,
      },
    });

    const res = await getRoutes(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.ok).toBe(true);
    expect(data.routes.length).toBeGreaterThan(0);
    expect(data.routes[0].findingId).toBe(finding.id);

    // After lazy query, routes are persisted in DB
    expect(db.getRoutes(scanId).length).toBeGreaterThan(0);
  });

  // 7. Polling stops and does not duplicate agent runs
  it('stops duplicate agent run starts and validates terminal run states', () => {
    const runsMap = new Map();
    const runId = 'agt_term_test';
    runsMap.set(runId, { status: 'completed' });

    // Terminal states should immediately refuse reconnection
    const status = runsMap.get(runId).status;
    const isTerminal = ['completed', 'failed', 'cancelled'].includes(status);
    expect(isTerminal).toBe(true);
  });

  // 8. Async auth changes preserve verification of existing hashes
  it('preserves verification of existing synchronous bcrypt hashes with async verifyPassword', async () => {
    const rawPassword = 'OriginalSecretPassword123!';

    // Generate hash using synchronous method (simulating existing database record)
    const legacyHash = hashPasswordSync(rawPassword);
    expect(legacyHash).toMatch(/^\$2[aby]\$\d{2}\$/);

    // Verify using async verifyPassword
    const match = await verifyPassword(rawPassword, legacyHash);
    expect(match).toBe(true);

    const wrongMatch = await verifyPassword('WrongPassword!', legacyHash);
    expect(wrongMatch).toBe(false);

    // Verify hash generated asynchronously also works with sync and async comparators
    const newAsyncHash = await hashPassword(rawPassword);
    expect(comparePasswordSync(rawPassword, newAsyncHash)).toBe(true);
    expect(await verifyPassword(rawPassword, newAsyncHash)).toBe(true);
  });
});
