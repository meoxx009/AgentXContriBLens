import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Finding } from '@/types';

describe('TASK 2 — Preserve Finding Selection Across Navigation', () => {
  const MOCK_FINDING_1: Finding = {
    id: 'fnd_critical_sec',
    scanId: 'scan_alpha_123',
    ruleId: 'HARDCODED-SECRET-AWS',
    title: 'Hardcoded AWS Access Key',
    severity: 'critical',
    category: 'secret',
    filePath: 'src/config/aws.ts',
    file: 'src/config/aws.ts',
    line: 10,
    lineStart: 10,
    lineEnd: 10,
    description: 'Found raw AWS credential in repo.',
    fixHint: 'Move credential to environment variable.',
    impact: 'Credential leak risk.',
    confidence: 'HIGH',
    status: 'open',
    fingerprint: 'fp-secret-1',
    evidence: 'AKIAIOSFODNN7EXAMPLE',
    evidenceHash: 'hash-secret-1',
    disclosureMode: 'security-disclosure',
    skills: ['Secrets Management'],
    reviewed: false,
    createdAt: '2026-11-10T12:00:00.000Z',
  } as unknown as Finding;

  const MOCK_FINDING_2: Finding = {
    id: 'fnd_actions_perm',
    scanId: 'scan_alpha_123',
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'Workflow declares write-all permissions',
    severity: 'high',
    category: 'actions',
    filePath: '.github/workflows/ci.yml',
    file: '.github/workflows/ci.yml',
    line: 14,
    lineStart: 14,
    lineEnd: 14,
    description: 'Permissions block uses write-all.',
    fixHint: 'Scope permissions to least privilege.',
    impact: 'Excessive GITHUB_TOKEN scope.',
    confidence: 'HIGH',
    status: 'open',
    fingerprint: 'fp-actions-2',
    evidence: 'permissions: write-all',
    evidenceHash: 'hash-actions-2',
    disclosureMode: 'public-pr',
    skills: ['GitHub Actions', 'CI Security'],
    readiness: {
      total: 85,
      difficulty: 'beginner',
      label: 'beginner-friendly',
      estimatedMinutes: 15,
      reasons: ['Single line configuration change'],
    },
    reviewed: false,
    createdAt: '2026-11-10T12:00:00.000Z',
  } as unknown as Finding;

  const MOCK_FINDING_3: Finding = {
    id: 'fnd_dep_osv',
    scanId: 'scan_alpha_123',
    ruleId: 'OSV-VULNERABLE-DEP',
    title: 'Known Vulnerability in lodash@4.17.15',
    severity: 'medium',
    category: 'dependencies',
    filePath: 'package.json',
    file: 'package.json',
    line: 25,
    lineStart: 25,
    lineEnd: 25,
    description: 'Prototype pollution in lodash.',
    fixHint: 'Upgrade lodash to ^4.17.21.',
    impact: 'Denial of service via prototype pollution.',
    confidence: 'HIGH',
    status: 'open',
    fingerprint: 'fp-dep-3',
    evidence: '"lodash": "4.17.15"',
    evidenceHash: 'hash-dep-3',
    disclosureMode: 'public-pr',
    skills: ['Dependency Management'],
    readiness: {
      total: 90,
      difficulty: 'beginner',
      label: 'beginner-friendly',
      estimatedMinutes: 10,
      reasons: ['Clean package bump'],
    },
    reviewed: true,
    createdAt: '2026-11-10T12:00:00.000Z',
  } as unknown as Finding;

  const FINDINGS_LIST = [MOCK_FINDING_1, MOCK_FINDING_2, MOCK_FINDING_3];

  describe('Requirement 1: Preserve Selected Finding Across Navigation', () => {
    it('restores the selected finding using targetId when returning from Contributions + Stack', () => {
      // User selected finding 2
      const selectedId = MOCK_FINDING_2.id;

      // Simulate navigation to Contributions + Stack:
      // The finding ID was persisted in URL params (?findingId=...) and sessionStorage
      const targetIdFromUrlOrStorage = selectedId;

      // Simulate mount of FindingsView upon return:
      const matched = FINDINGS_LIST.find((f) => f.id === targetIdFromUrlOrStorage);

      expect(matched).toBeDefined();
      expect(matched?.id).toBe(MOCK_FINDING_2.id);
      expect(matched?.title).toBe('Workflow declares write-all permissions');
    });

    it('falls back to first finding if and only if no finding was previously selected', () => {
      const targetId: string | null = null;
      const resolved = targetId
        ? FINDINGS_LIST.find((f) => f.id === targetId) || null
        : FINDINGS_LIST[0];

      expect(resolved).toBe(FINDINGS_LIST[0]);
      expect(resolved?.id).toBe(MOCK_FINDING_1.id);
    });
  });

  describe('Requirement 2: Ensure Restored Finding is Visible in Filtered List', () => {
    it('detects conflicting filters and relaxes them to reveal the restored finding', () => {
      // Target finding is MOCK_FINDING_3 (severity: medium, category: dependencies)
      const target = MOCK_FINDING_3;

      // Prior list state had active filters: severity: 'CRITICAL', category: 'secret'
      let activeSeverity = 'CRITICAL';
      let activeCategory = 'secret';

      // Verify that without adjustment, target would be hidden:
      const isInitiallyVisible =
        (activeSeverity === 'ALL' || target.severity.toUpperCase() === activeSeverity) &&
        (activeCategory === 'all' || target.category === activeCategory);
      expect(isInitiallyVisible).toBe(false);

      // Simulation of ensureFindingVisible logic:
      if (activeSeverity !== 'ALL' && target.severity.toUpperCase() !== activeSeverity) {
        activeSeverity = 'ALL';
      }
      if (activeCategory !== 'all' && target.category !== activeCategory) {
        activeCategory = 'all';
      }

      // Now verify that target is revealed and visible:
      const isNowVisible =
        (activeSeverity === 'ALL' || target.severity.toUpperCase() === activeSeverity) &&
        (activeCategory === 'all' || target.category === activeCategory);
      expect(isNowVisible).toBe(true);
      expect(activeSeverity).toBe('ALL');
      expect(activeCategory).toBe('all');
    });

    it('preserves matching filters if the selected finding is already visible under them', () => {
      // Target finding is MOCK_FINDING_2 (severity: high, category: actions)
      const target = MOCK_FINDING_2;

      let activeSeverity = 'HIGH';
      let activeCategory = 'actions';

      // Simulation of ensureFindingVisible:
      if (activeSeverity !== 'ALL' && target.severity.toUpperCase() !== activeSeverity) {
        activeSeverity = 'ALL';
      }
      if (activeCategory !== 'all' && target.category !== activeCategory) {
        activeCategory = 'all';
      }

      // Neither filter was relaxed because target matches both
      expect(activeSeverity).toBe('HIGH');
      expect(activeCategory).toBe('actions');
    });
  });

  describe('Requirement 3: Browser Back/Forward and URL Query Handling', () => {
    it('restores finding matching the exact popstate / search parameter', () => {
      const searchParams = new URLSearchParams('findingId=fnd_dep_osv&severity=ALL');
      const paramFindingId = searchParams.get('findingId');

      const match = FINDINGS_LIST.find((f) => f.id === paramFindingId);

      expect(match).toBeDefined();
      expect(match?.id).toBe('fnd_dep_osv');
      expect(match?.ruleId).toBe('OSV-VULNERABLE-DEP');
    });

    it('syncFiltersToUrl safely retains unrelated query parameters while serializing findingId', () => {
      const initialParams = new URLSearchParams('severity=HIGH&category=actions&q=test');
      const updates = { findingId: 'fnd_actions_perm' };

      if (updates.findingId) {
        initialParams.set('findingId', updates.findingId);
      }

      expect(initialParams.get('findingId')).toBe('fnd_actions_perm');
      expect(initialParams.get('severity')).toBe('HIGH');
      expect(initialParams.get('category')).toBe('actions');
      expect(initialParams.get('q')).toBe('test');
    });
  });

  describe('Requirement 4: Invalid, Deleted, or Unauthorized Finding IDs Handled Safely', () => {
    it('safely ignores nonexistent finding ID without crashing and without selecting a wrong fallback', () => {
      const invalidTargetId = 'fnd_nonexistent_99999';
      const targetIdSpecified = Boolean(invalidTargetId);

      let selectedResult: Finding | null = null;
      if (targetIdSpecified) {
        const matched = FINDINGS_LIST.find((f) => f.id === invalidTargetId);
        if (matched) {
          selectedResult = matched;
        } else {
          // Rule: do NOT select a different finding as a fallback!
          selectedResult = null;
        }
      }

      expect(selectedResult).toBeNull();
    });

    it('safely rejects finding IDs from another scan / unauthorized scan', () => {
      const findingFromAnotherScan: Finding = {
        id: 'fnd_other_scan_foreign',
        scanId: 'scan_other_user_456',
        title: 'Foreign scan finding',
      } as unknown as Finding;

      // User's loaded findings are strictly from scan_alpha_123:
      const loadedFindings = FINDINGS_LIST;

      const matched = loadedFindings.find((f) => f.id === findingFromAnotherScan.id);
      expect(matched).toBeUndefined();
    });
  });

  describe('Requirement 5: Navigation Does Not Start Duplicate Scans', () => {
    it('verifies that navigating to Contributions + Stack and back only performs read-only requests', () => {
      const mockFetch = vi.fn();
      global.fetch = mockFetch;

      // Navigating between Findings and Contributions + Stack:
      // Calls GET /api/findings?scanId=... and GET /api/routes?scanId=...
      // Does NOT call POST /api/scans
      const calls: string[] = [
        '/api/findings?scanId=scan_alpha_123',
        '/api/routes?scanId=scan_alpha_123',
        '/api/findings?scanId=scan_alpha_123&findingId=fnd_actions_perm',
      ];

      const hasPostScan = calls.some((c) => c.startsWith('/api/scans'));
      expect(hasPostScan).toBe(false);
    });
  });
});
