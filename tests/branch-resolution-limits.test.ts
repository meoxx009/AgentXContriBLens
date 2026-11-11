import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SCAN_MAX_TOTAL_BYTES,
  SCAN_MAX_TOTAL_MB,
  SCAN_MAX_FILES,
  SCAN_MAX_FILE_BYTES,
} from '@/lib/scanner/limits';
import {
  resolveAuthoritativeBranch,
  fetchBoundedRepositoryTree,
  GitHubBranchNotFoundError,
  GitHubAuthError,
  GitHubRateLimitError,
} from '@/lib/scanner/github';
import { executeRepositoryScan } from '@/lib/scanner/index';
import { executeGithubFetchTree, executeFetchFile } from '@/lib/agent/tools';
import { db } from '@/lib/db';

describe('Branch Resolution & 15 MB Scan Limit Verification', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('Task 1: Limit Values & Constants', () => {
    it('enforces cumulative content limit of exactly 15 MiB (15 * 1024 * 1024 bytes)', () => {
      expect(SCAN_MAX_TOTAL_BYTES).toBe(15 * 1024 * 1024);
      expect(SCAN_MAX_TOTAL_BYTES).toBe(15728640);
      expect(SCAN_MAX_TOTAL_MB).toBe(15);
    });

    it('retains file count of 60 and single file limit of 180 KB', () => {
      expect(SCAN_MAX_FILES).toBe(60);
      expect(SCAN_MAX_FILE_BYTES).toBe(180 * 1024);
      expect(SCAN_MAX_FILE_BYTES).toBe(184320);
    });
  });

  describe('Task 2: Authoritative Case-Insensitive Branch Resolution', () => {
    it('resolves "MAIN" to default branch "main" without extra API call', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      const resolved = await resolveAuthoritativeBranch('octocat', 'Hello-World', 'MAIN', 'main');
      expect(resolved).toBe('main');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolves empty or whitespace branch to default branch', async () => {
      const fetchMock = vi.fn();
      globalThis.fetch = fetchMock;

      expect(await resolveAuthoritativeBranch('octocat', 'Hello-World', '', 'main')).toBe('main');
      expect(await resolveAuthoritativeBranch('octocat', 'Hello-World', '   ', 'master')).toBe('master');
      expect(await resolveAuthoritativeBranch('octocat', 'Hello-World', undefined, 'main')).toBe('main');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('resolves case-differing remote branch from GitHub branch list', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/branches')) {
          return {
            ok: true,
            status: 200,
            json: async () => [
              { name: 'main' },
              { name: 'feature/login-v2' },
              { name: 'v1.0-release' },
            ],
            headers: new Headers(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const resolved = await resolveAuthoritativeBranch(
        'octocat',
        'Hello-World',
        'FEATURE/LOGIN-V2',
        'main'
      );
      expect(resolved).toBe('feature/login-v2');
      expect(fetchMock).toHaveBeenCalled();
    });

    it('preserves branch name when branch is not found in remote branch list', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/branches')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'main' }, { name: 'dev' }],
            headers: new Headers(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const resolved = await resolveAuthoritativeBranch(
        'octocat',
        'Hello-World',
        'non-existent-branch',
        'main'
      );
      expect(resolved).toBe('non-existent-branch');
    });
  });

  describe('Task 3: fetchBoundedRepositoryTree with Authoritative Branch & 15 MB Budget', () => {
    it('successfully fetches repository tree when supplied "MAIN" for default "main"', async () => {
      const mockTree = {
        tree: [
          { path: 'package.json', type: 'blob', size: 100 },
          { path: 'src/index.ts', type: 'blob', size: 200 },
        ],
      };

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/git/trees/main')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockTree,
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('raw.githubusercontent.com/octocat/Hello-World/main/package.json')) {
          return {
            ok: true,
            status: 200,
            text: async () => '{"name": "hello-world"}',
            headers: new Headers({ 'content-length': '23' }),
          } as Response;
        }
        if (url.includes('raw.githubusercontent.com/octocat/Hello-World/main/src/index.ts')) {
          return {
            ok: true,
            status: 200,
            text: async () => 'console.log("hello");',
            headers: new Headers({ 'content-length': '20' }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const result = await fetchBoundedRepositoryTree(
        'octocat',
        'Hello-World',
        'MAIN', // User provided uppercase MAIN
        'main'
      );

      expect(result.resolvedBranch).toBe('main');
      expect(result.files.length).toBe(2);
      expect(result.files[0].path).toBe('package.json');
      expect(result.files[1].path).toBe('src/index.ts');
    });

    it('throws GitHubBranchNotFoundError when a branch does not exist on remote', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/branches')) {
          return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'main' }],
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('/git/trees/')) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
            headers: new Headers(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      await expect(
        fetchBoundedRepositoryTree('octocat', 'Hello-World', 'fake-branch-404', 'main')
      ).rejects.toThrow(GitHubBranchNotFoundError);
    });

    it('strictly enforces 15 MB cumulative budget and produces size bounds warning', async () => {
      // Create 3 files where file 1 and file 2 fit, but file 3 exceeds 15 MB total
      const largeContent = 'x'.repeat(100 * 1024); // 100 KB
      const mockTree = {
        tree: Array.from({ length: 160 }, (_, i) => ({
          path: `file_${i}.json`,
          type: 'blob',
          size: 100 * 1024,
        })),
      };

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/git/trees/')) {
          return {
            ok: true,
            status: 200,
            json: async () => mockTree,
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('raw.githubusercontent.com')) {
          return {
            ok: true,
            status: 200,
            text: async () => largeContent,
            headers: new Headers({ 'content-length': String(100 * 1024) }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const result = await fetchBoundedRepositoryTree(
        'octocat',
        'Large-Repo',
        'main',
        'main',
        'deep'
      );

      // Total bytes must not exceed SCAN_MAX_TOTAL_BYTES
      expect(result.totalBytes).toBeLessThanOrEqual(SCAN_MAX_TOTAL_BYTES);
      expect(result.files.length).toBeLessThanOrEqual(SCAN_MAX_FILES);
      expect(result.warnings.some((w) => w.includes('files skipped (size bounds)'))).toBe(true);
    });
  });

  describe('Task 4: Agent Tools Integration (executeGithubFetchTree & executeFetchFile)', () => {
    it('executeGithubFetchTree resolves "MAIN" to "main"', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/repos/octocat/Hello-World')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              owner: { login: 'octocat' },
              name: 'Hello-World',
              default_branch: 'main',
            }),
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('/git/trees/main')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tree: [{ path: 'package.json', type: 'blob', size: 50 }],
            }),
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('raw.githubusercontent.com/octocat/Hello-World/main/package.json')) {
          return {
            ok: true,
            status: 200,
            text: async () => '{"name": "hello"}',
            headers: new Headers(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const toolRes = await executeGithubFetchTree({
        repoUrl: 'https://github.com/octocat/Hello-World',
        branch: 'MAIN',
        scope: 'partial',
      });

      expect(toolRes.ok).toBe(true);
      expect(toolRes.data).toBeDefined();
      expect(toolRes.data!.targetBranch).toBe('main');
      expect(toolRes.data!.defaultBranch).toBe('main');
    });

    it('executeFetchFile fetches file using authoritative branch', async () => {
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('raw.githubusercontent.com/octocat/Hello-World/main/README.md')) {
          return {
            ok: true,
            status: 200,
            text: async () => '# Hello World',
            headers: new Headers(),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const res = await executeFetchFile(
        {
          repoUrl: 'https://github.com/octocat/Hello-World',
          path: 'README.md',
          branch: 'MAIN',
        },
        { defaultBranch: 'main' }
      );

      expect(res.ok).toBe(true);
      expect(res.data).toBeDefined();
      expect(res.data!.content).toBe('# Hello World');
    });
  });

  describe('Task 5: End-to-End executeRepositoryScan Flow and Memory Sync', () => {
    it('executes full scan on "MAIN" and syncs authoritative branch "main" to memory', async () => {
      const userId = 'usr_branch_test_1';
      db.saveUser({
        id: userId,
        email: 'branch-test@example.com',
        name: 'Branch Tester',
        createdAt: new Date().toISOString(),
      });

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.endsWith('/repos/octocat/Hello-World')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              owner: { login: 'octocat' },
              name: 'Hello-World',
              default_branch: 'main',
              description: 'Sample repo',
              stargazers_count: 10,
              forks_count: 2,
              open_issues_count: 1,
            }),
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('/git/trees/main')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              tree: [
                {
                  path: 'package.json',
                  type: 'blob',
                  size: 150,
                },
              ],
            }),
            headers: new Headers(),
          } as Response;
        }
        if (url.includes('raw.githubusercontent.com/octocat/Hello-World/main/package.json')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ name: 'hello-world', dependencies: {} }),
            headers: new Headers({ 'content-length': '45' }),
          } as Response;
        }
        return { ok: false, status: 404 } as Response;
      });
      globalThis.fetch = fetchMock;

      const { scan } = await executeRepositoryScan(
        'https://github.com/octocat/Hello-World',
        userId,
        'MAIN'
      );

      expect(scan.branch).toBe('main');

      // Verify durable repository memory has authoritative branch
      const memory = await db.getRepositoryMemory('octocat/hello-world', userId);
      expect(memory).toBeDefined();
      expect(memory?.ref).toBe('main');
    });
  });
});
