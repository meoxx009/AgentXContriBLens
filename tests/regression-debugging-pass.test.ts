import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { reconcileActiveScan } from '@/lib/dashboard-sync';
import type { ScanSummary } from '@/types';

describe('Goal 13 — Pre-Deploy Dedicated Debugging Pass Regressions', () => {
  const readSource = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('Bug 1: ContributionsView Concurrent Fetch Race Condition Guard', () => {
    it('verifies ContributionsView has fetchSequenceRef counter and discards stale out-of-order responses', () => {
      const source = readSource('src/components/views/ContributionsView.tsx');

      // Sequence ref declaration and cleanup
      expect(source).toContain('const fetchSequenceRef = useRef<number>(0)');
      expect(source).toContain('seq.current++');

      // Sequence increment on fetch start
      expect(source).toContain('const currentSeq = ++fetchSequenceRef.current');

      // Stale response checks after async operations
      expect(source).toContain('if (currentSeq !== fetchSequenceRef.current) return');

      // Guard in finally block
      expect(source).toContain('if (currentSeq === fetchSequenceRef.current) {');
    });
  });

  describe('Bug 2: DraftsView Concurrent Fetch Race Condition Guard', () => {
    it('verifies DraftsView has fetchSequenceRef counter and ignores stale responses', () => {
      const source = readSource('src/components/views/DraftsView.tsx');

      // Sequence ref declaration and cleanup
      expect(source).toContain('const fetchSequenceRef = useRef<number>(0)');
      expect(source).toContain('seq.current++');

      // Sequence increment
      expect(source).toContain('const currentSeq = ++fetchSequenceRef.current');

      // Stale response check
      expect(source).toContain('if (currentSeq !== fetchSequenceRef.current) return');
      expect(source).toContain('if (currentSeq === fetchSequenceRef.current) {');
    });
  });

  describe('Bug 3: DashboardView Scan Refresh Race Condition Guard', () => {
    it('verifies DashboardView has scanSequenceRef to guard against rapid filter/refresh races', () => {
      const source = readSource('src/components/views/DashboardView.tsx');

      expect(source).toContain('const scanSequenceRef = React.useRef(0)');
      expect(source).toContain('const currentSeq = ++scanSequenceRef.current');
      expect(source).toContain('if (currentSeq !== scanSequenceRef.current) return');
      expect(source).toContain('if (currentSeq === scanSequenceRef.current) {');
    });
  });

  describe('Bug 4: DashboardView Safe techStack Property Access', () => {
    it('verifies DashboardView safely uses optional chaining and fallback empty arrays for techStack', () => {
      const source = readSource('src/components/views/DashboardView.tsx');

      // Safely access scan table language tech list
      expect(source).toContain('(s.techStack?.languages || []).map');

      // Safely access activeScan details
      expect(source).toContain('(activeScan.techStack?.languages || []).map');
      expect(source).toContain('(activeScan.techStack?.frameworks || []).length');
      expect(source).toContain('(activeScan.techStack?.tooling || []).length');
    });
  });

  describe('Bug 5: ContributionsView Safe techStack Array Fallbacks', () => {
    it('verifies ContributionsView safely falls back to empty arrays on partial techStack objects', () => {
      const source = readSource('src/components/views/ContributionsView.tsx');

      expect(source).toContain('(techStack.languages || []).length');
      expect(source).toContain('(techStack.frameworks || []).length');
      expect(source).toContain('(techStack.tooling || []).length');
      expect(source).toContain('(techStack.manifests || []).length');
    });
  });

  describe('Bug 6: DashboardView Hydration Warning Suppression on Dynamic Dates', () => {
    it('verifies DashboardView suppresses hydration warnings on locale-formatted dates', () => {
      const source = readSource('src/components/views/DashboardView.tsx');

      expect(source).toContain('suppressHydrationWarning className="text-platinumSilver">{scanDate}');
      expect(source).toContain('suppressHydrationWarning className="text-[10px] text-platinumSilver/60 block font-mono"');
    });
  });

  describe('End-to-End Invariant: Reconciled Active Scan Never Causes Findings 404', () => {
    it('reconciles stale client activeScan against authoritative server scans and guarantees fallback', () => {
      const serverScans: ScanSummary[] = [
        {
          id: 'scan-current-123',
          repoUrl: 'https://github.com/org/repo',
          repoName: 'repo',
          owner: 'org',
          branch: 'main',
          scannedAt: new Date().toISOString(),
          totalFiles: 10,
          totalBytes: 5000,
          status: 'completed',
          readinessScore: 85,
          techStack: {
            languages: [],
            frameworks: [],
            tooling: [],
            packageManagers: [],
            manifests: [],
            dependencies: [],
            confidenceScore: 90,
          },
          findingsCount: { total: 2, critical: 0, high: 0, medium: 2, low: 0, info: 0 },
        },
      ];

      // Case 1: Stale scan in localStorage that no longer exists on server
      const staleScan: ScanSummary = {
        id: 'scan-deleted-999',
        repoUrl: 'https://github.com/old/deleted',
        repoName: 'deleted',
        owner: 'old',
        branch: 'main',
        scannedAt: new Date(Date.now() - 100000).toISOString(),
        totalFiles: 5,
        totalBytes: 2000,
        status: 'completed',
        readinessScore: 70,
        techStack: {
          languages: [],
          frameworks: [],
          tooling: [],
          packageManagers: [],
          manifests: [],
          dependencies: [],
          confidenceScore: 80,
        },
        findingsCount: { total: 1, critical: 0, high: 0, medium: 1, low: 0, info: 0 },
      };

      const reconciled = reconcileActiveScan(serverScans, staleScan);
      // Reconciles to freshest valid server scan, preventing 404
      expect(reconciled?.id).toBe('scan-current-123');

      // Case 2: Server has zero scans
      const emptyReconciled = reconcileActiveScan([], staleScan);
      expect(emptyReconciled).toBeNull();
    });
  });
});
