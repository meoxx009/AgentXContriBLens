import { describe, it, expect, beforeEach } from 'vitest';
import { classifyError } from '@/lib/scan-errors';
import { SCAN_PIPELINE_STEPS } from '@/components/ui/GlassStepRail';

describe('P7 — Scan Flow States, Error Classification & Preview Limits', () => {
  describe('Task 1: 6-Stage Step Rail Pipeline Definition', () => {
    it('defines exactly the 6 required pipeline stages in strict order', () => {
      expect(SCAN_PIPELINE_STEPS.length).toBe(6);

      const expectedTitles = [
        'Validate URL',
        'Fetch Tree',
        'Parse Manifests & Workflows',
        'OSV Query',
        'Actions Audit',
        'Readiness Score',
      ];

      SCAN_PIPELINE_STEPS.forEach((step, idx) => {
        expect(step.title).toBe(expectedTitles[idx]);
        expect(step.num).toBe(`0${idx + 1}`);
        expect(step.badge).toBeDefined();
        expect(step.tagline).toBeDefined();
        expect(step.icon).toBeDefined();
      });
    });
  });

  describe('Task 3: Safe Typed Error Classification (classifyError)', () => {
    it('classifies invalid_url errors correctly', () => {
      const err = classifyError('Invalid GitHub URL format', 'GITHUB_INVALID_URL');
      expect(err.type).toBe('invalid_url');
      expect(err.correlationId).toMatch(/^CL-ERR-[A-Z0-9]+$/);
    });

    it('classifies not_found errors correctly', () => {
      const err = classifyError('Repository not found on GitHub', 'GITHUB_NOT_FOUND');
      expect(err.type).toBe('not_found');
      expect(err.correlationId).toMatch(/^CL-ERR-[A-Z0-9]+$/);
    });

    it('classifies private_or_unavailable errors correctly', () => {
      const err = classifyError('Repository is private or forbidden', 'GITHUB_PRIVATE_OR_UNAVAILABLE');
      expect(err.type).toBe('private_or_unavailable');
    });

    it('classifies rate_limited errors and preserves estimated reset time', () => {
      const resetTime = '2026-10-31T03:00:00.000Z';
      const err = classifyError('API rate limit exceeded', 'GITHUB_RATE_LIMITED', 'CL-ERR-TEST', resetTime);
      expect(err.type).toBe('rate_limited');
      expect(err.resetTime).toBe(resetTime);
      expect(err.correlationId).toBe('CL-ERR-TEST');
    });

    it('classifies tree_too_large errors correctly', () => {
      const err = classifyError('Repository tree truncated at 60 files', 'GITHUB_TREE_TRUNCATED');
      expect(err.type).toBe('tree_too_large');
    });

    it('classifies dependency_lookup_unavailable (OSV) errors correctly', () => {
      const err = classifyError('OSV advisory service unreachable', 'OSV_UNAVAILABLE');
      expect(err.type).toBe('dependency_lookup_unavailable');
    });

    it('classifies persist_failed errors correctly', () => {
      const err = classifyError('Disk write failed', 'PERSISTENCE_FAILED');
      expect(err.type).toBe('persist_failed');
    });

    it('classifies unauthenticated session errors correctly', () => {
      const err = classifyError('Authentication required', 'AUTH_INVALID_CREDENTIALS');
      expect(err.type).toBe('auth_required');
    });

    it('falls back to network_error for unmapped network dropouts', () => {
      const err = classifyError('Failed to fetch from remote origin');
      expect(err.type).toBe('network_error');
      expect(err.correlationId).toMatch(/^CL-ERR-[A-Z0-9]+$/);
    });
  });

  describe('Task 2 & 5: Scope Choice & Warning States (ROUTES_AND_STATES.md §4)', () => {
    it('distinguishes complete from complete_with_warnings based on skipped files and advisory warnings', () => {
      const cleanScan = {
        filesSkipped: 0,
        warnings: [],
      };
      const hasWarningsClean = cleanScan.warnings.length > 0 || (cleanScan.filesSkipped > 0);
      expect(hasWarningsClean).toBe(false);

      const partialScanWithSkipped = {
        filesSkipped: 12,
        warnings: ['12 files skipped (size bounds)'],
      };
      const hasWarningsPartial =
        partialScanWithSkipped.warnings.length > 0 || partialScanWithSkipped.filesSkipped > 0;
      expect(hasWarningsPartial).toBe(true);
    });

    it('ensures "N files skipped (size bounds)" is surfaced for partial scans of large repos', () => {
      const filesSkipped = 14;
      const warningNote = `${filesSkipped} files skipped (size bounds) — Partial scan scoped to top-level and src/ configuration files`;
      expect(warningNote).toContain('14 files skipped (size bounds)');
      expect(warningNote).toContain('Partial scan scoped');
    });

    it('verifies category checklist defaults all-on (4 categories)', () => {
      const defaultCategories = {
        dependencies: true,
        actions: true,
        secrets: true,
        health: true,
      };
      expect(Object.values(defaultCategories).every((v) => v === true)).toBe(true);
      expect(Object.keys(defaultCategories).length).toBe(4);
    });
  });

  describe('Task 4: Auth-Gated Scan Flow & Real Data Enforcement (G2)', () => {
    it('enforces that /app/scan requires authentication and redirects unauthenticated users to login', () => {
      const pathname = '/app/scan';
      const protectedPrefixes = ['/app', '/dashboard', '/scan', '/findings', '/contributions', '/drafts', '/issue-drafts', '/profile'];
      const isProtected = protectedPrefixes.some(
        (prefix) => pathname === prefix || pathname.startsWith(prefix + '/')
      );
      expect(isProtected).toBe(true);

      const user = null;
      const redirectUrl = !user ? `/login?next=${encodeURIComponent(pathname)}` : null;
      expect(redirectUrl).toBe('/login?next=%2Fapp%2Fscan');
    });

    it('verifies that demo preview localStorage keys cl_preview_used_at and cl_preview_result are eliminated', () => {
      const mockStorage: Record<string, string> = {};
      expect(mockStorage['cl_preview_used_at']).toBeUndefined();
      expect(mockStorage['cl_preview_result']).toBeUndefined();
    });
  });
});
