import { describe, it, expect } from 'vitest';
import {
  getSeverityWeight,
  generateRecommendationReason,
  scoreRecommendationItem,
  getRecommendations,
  getScanNextSteps,
} from '../src/lib/recommendations.ts';
import type { Finding, ContributionRoute } from '../src/types.ts';

describe('F5 — Deterministic Recommendation Engine', () => {
  describe('1. Severity Weight Mapping', () => {
    it('maps severities to expected weights', () => {
      expect(getSeverityWeight('critical')).toBe(40);
      expect(getSeverityWeight('CRITICAL')).toBe(40);
      expect(getSeverityWeight('high')).toBe(30);
      expect(getSeverityWeight('HIGH')).toBe(30);
      expect(getSeverityWeight('medium')).toBe(20);
      expect(getSeverityWeight('low')).toBe(10);
      expect(getSeverityWeight('info')).toBe(5);
      expect(getSeverityWeight(undefined)).toBe(10);
    });
  });

  describe('2. Scoring Logic & Ordering', () => {
    const mockFindingCritBeginner: Finding = {
      id: 'f-crit-beg',
      scanId: 'scan-1',
      category: 'actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Action unpinned SHA',
      severity: 'critical',
      confidence: 1,
      sourceTool: 'test',
      file: '.github/workflows/ci.yml',
      impact: 'Supply-chain tampering',
      fixHint: 'Pin commit SHA',
      skills: ['GitHub Actions'],
      learningResources: [],
      readiness: {
        total: 80, // -> 24 / 30
        label: 'good-first-contribution',
        evidenceClarity: 20,
        scopeSimplicity: 20,
        testability: 20,
        skillAccessibility: 20,
        contextCompleteness: 0,
        documentationClarity: 20,
        testAvailability: 20,
        ciAutomation: 20,
        dependencyFreshness: 20,
        securityGovernance: 20,
        reasons: [],
        blockers: [],
        estimatedMinutes: 20,
        difficulty: 'beginner',
        calculatedBy: 'deterministic-rule-engine',
        calculatorVersion: 'v2.0.0',
      },
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash-1',
      fingerprint: 'fp-1',
      createdAt: '2026-10-31T00:00:00Z',
    };

    const mockFindingHighAdvanced: Finding = {
      id: 'f-high-adv',
      scanId: 'scan-1',
      category: 'actions',
      ruleId: 'GH-ACTIONS-COMPLEX',
      title: 'Complex Workflow Rewrite',
      severity: 'high',
      confidence: 1,
      sourceTool: 'test',
      file: '.github/workflows/deploy.yml',
      impact: 'Infrastructure privilege issue',
      fixHint: 'Restructure entire deployment pipeline',
      skills: ['DevOps'],
      learningResources: [],
      readiness: {
        total: 30, // -> 9 / 30
        label: 'maintainer-assistance',
        evidenceClarity: 10,
        scopeSimplicity: 5,
        testability: 5,
        skillAccessibility: 5,
        contextCompleteness: 5,
        documentationClarity: 10,
        testAvailability: 5,
        ciAutomation: 5,
        dependencyFreshness: 5,
        securityGovernance: 5,
        reasons: [],
        blockers: [],
        estimatedMinutes: 90,
        difficulty: 'advanced',
        calculatedBy: 'deterministic-rule-engine',
        calculatorVersion: 'v2.0.0',
      },
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash-2',
      fingerprint: 'fp-2',
      createdAt: '2026-10-31T00:00:00Z',
    };

    const mockFindingHighBeginner: Finding = {
      id: 'f-high-beg',
      scanId: 'scan-1',
      category: 'actions',
      ruleId: 'GH-ACTIONS-WRITE-ALL',
      title: 'Action write-all permission',
      severity: 'high',
      confidence: 1,
      sourceTool: 'test',
      file: '.github/workflows/ci.yml',
      impact: 'Broad write permission',
      fixHint: 'Scope to contents: read',
      skills: ['GitHub Actions'],
      learningResources: [],
      readiness: {
        total: 80, // -> 24 / 30
        label: 'good-first-contribution',
        evidenceClarity: 20,
        scopeSimplicity: 20,
        testability: 20,
        skillAccessibility: 20,
        contextCompleteness: 0,
        documentationClarity: 20,
        testAvailability: 20,
        ciAutomation: 20,
        dependencyFreshness: 20,
        securityGovernance: 20,
        reasons: [],
        blockers: [],
        estimatedMinutes: 20,
        difficulty: 'beginner',
        calculatedBy: 'deterministic-rule-engine',
        calculatorVersion: 'v2.0.0',
      },
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash-3',
      fingerprint: 'fp-3',
      createdAt: '2026-10-31T00:00:00Z',
    };

    const mockFindingCritAdvanced: Finding = {
      id: 'f-crit-adv',
      scanId: 'scan-1',
      category: 'secret',
      ruleId: 'SECRET-AWS-KEY',
      title: 'Hardcoded AWS secret token',
      severity: 'critical',
      confidence: 1,
      sourceTool: 'test',
      file: 'src/config.ts',
      impact: 'Credential compromise',
      fixHint: 'Revoke key and scrub git history',
      skills: ['Secrets hygiene'],
      learningResources: [],
      readiness: {
        total: 20, // -> 6 / 30
        label: 'maintainer-assistance',
        evidenceClarity: 5,
        scopeSimplicity: 5,
        testability: 5,
        skillAccessibility: 5,
        contextCompleteness: 0,
        documentationClarity: 5,
        testAvailability: 5,
        ciAutomation: 5,
        dependencyFreshness: 5,
        securityGovernance: 5,
        reasons: [],
        blockers: [],
        estimatedMinutes: 90,
        difficulty: 'advanced',
        calculatedBy: 'deterministic-rule-engine',
        calculatorVersion: 'v2.0.0',
      },
      disclosureMode: 'security-disclosure',
      redacted: true,
      evidenceHash: 'hash-4',
      fingerprint: 'fp-4',
      createdAt: '2026-10-31T00:00:00Z',
    };

    it('ranks critical+beginner higher than high+advanced', () => {
      const recCritBeg = scoreRecommendationItem(mockFindingCritBeginner);
      const recHighAdv = scoreRecommendationItem(mockFindingHighAdvanced);

      // Crit + Beg: 40 + 24 + 15 + 10 = 89
      expect(recCritBeg.score).toBe(89);
      // High + Adv: 30 + 9 + 0 + 0 = 39
      expect(recHighAdv.score).toBe(39);

      expect(recCritBeg.score).toBeGreaterThan(recHighAdv.score);
    });

    it('ranks high+beginner higher than critical+advanced for contributor win', () => {
      const recHighBeg = scoreRecommendationItem(mockFindingHighBeginner);
      const recCritAdv = scoreRecommendationItem(mockFindingCritAdvanced);

      // High + Beg: 30 + 24 + 15 + 10 = 79
      expect(recHighBeg.score).toBe(79);
      // Crit + Adv: 40 + 6 = 46 (secret capped at 55 max)
      expect(recCritAdv.score).toBeLessThanOrEqual(55);

      expect(recHighBeg.score).toBeGreaterThan(recCritAdv.score);
    });

    it('correctly sets priority labels based on score thresholds', () => {
      const recHighBeg = scoreRecommendationItem(mockFindingHighBeginner);
      expect(recHighBeg.score).toBeGreaterThanOrEqual(65);
      expect(recHighBeg.priorityLabel).toBe('Fix this now');

      const recCritAdv = scoreRecommendationItem(mockFindingCritAdvanced);
      expect(recCritAdv.priorityLabel).toBe('Good next step');

      const lowFinding: Finding = {
        ...mockFindingHighAdvanced,
        severity: 'low',
        readiness: {
          ...mockFindingHighAdvanced.readiness!,
          total: 10,
        },
      };
      const recLow = scoreRecommendationItem(lowFinding);
      expect(recLow.score).toBeLessThan(40);
      expect(recLow.priorityLabel).toBe('Lower priority');
    });

    it('getRecommendations orders items descending by score', () => {
      const recs = getRecommendations({
        findings: [mockFindingHighAdvanced, mockFindingCritBeginner, mockFindingHighBeginner],
      });

      expect(recs.length).toBe(3);
      expect(recs[0].id).toBe('f-crit-beg');
      expect(recs[1].id).toBe('f-high-beg');
      expect(recs[2].id).toBe('f-high-adv');
    });
  });

  describe('3. Reason Generation Rules', () => {
    it('generates exactly one plain-English sentence for unpinned action', () => {
      const reason = generateRecommendationReason({
        ruleId: 'GH-ACTIONS-UNPINNED',
        category: 'actions',
        severity: 'high',
        difficulty: 'beginner',
        estimatedMinutes: 30,
        isPrivateDisclosure: false,
        title: 'Action is not pinned to commit SHA',
      });

      expect(reason).toBe(
        'Highest impact and easiest win — pin this CI action to a commit SHA, about 30 minutes.'
      );
      // Invariant: Exactly one sentence (one terminal period)
      expect(reason.split('.').filter(Boolean).length).toBe(1);
      // Invariant: Never mentions "secure"
      expect(reason.toLowerCase()).not.toContain('secure');
    });

    it('generates plain-English reason for write-all permissions', () => {
      const reason = generateRecommendationReason({
        ruleId: 'GH-ACTIONS-WRITE-ALL',
        category: 'actions',
        severity: 'high',
        difficulty: 'beginner',
        estimatedMinutes: 20,
        isPrivateDisclosure: false,
        title: 'Broad write-all permissions declared',
      });

      expect(reason).toBe(
        'Highest impact and easiest win — scope CI workflow permissions to minimum read privileges, about 20 minutes.'
      );
      expect(reason.toLowerCase()).not.toContain('secure');
    });

    it('generates plain-English reason for missing security policy', () => {
      const reason = generateRecommendationReason({
        ruleId: 'REPO-MISSING-SECURITY',
        category: 'repository-health',
        severity: 'low',
        difficulty: 'beginner',
        estimatedMinutes: 15,
        isPrivateDisclosure: false,
        title: 'Repository lacks a published SECURITY.md policy',
      });

      expect(reason).toBe(
        'Quick hygiene improvement — add a responsible disclosure policy to SECURITY.md, about 15 minutes.'
      );
      expect(reason.toLowerCase()).not.toContain('secure');
    });

    it('generates maintainer warning reason for private secrets', () => {
      const reason = generateRecommendationReason({
        ruleId: 'SECRET-GITHUB-PAT',
        category: 'secret',
        severity: 'critical',
        difficulty: 'advanced',
        estimatedMinutes: 60,
        isPrivateDisclosure: true,
        title: 'Hardcoded Personal Access Token',
      });

      expect(reason).toBe(
        'Critical urgency requiring maintainer review — revoke this exposed token and sanitize commit history, about 60 minutes.'
      );
      expect(reason.toLowerCase()).not.toContain('secure');
    });
  });

  describe('4. Empty and Defensive Handling', () => {
    it('returns empty array when no findings or routes are provided', () => {
      expect(getRecommendations({})).toEqual([]);
      expect(getRecommendations({ findings: [] })).toEqual([]);
      expect(getRecommendations({ routes: [] })).toEqual([]);
      expect(getRecommendations({ findings: [], routes: [] })).toEqual([]);
    });

    it('filters out completed routes and resolved findings', () => {
      const completedRoute: ContributionRoute = {
        id: 'r-done',
        scanId: 's-1',
        findingIds: ['f-1'],
        title: 'Completed task',
        summary: 'Done',
        difficulty: 'beginner',
        estimatedMinutes: 15,
        estimatedEffort: '15m',
        skills: ['Git'],
        contributorLevelImpact: 10,
        files: ['file.txt'],
        suggestedChange: 'none',
        status: 'completed',
        testPlan: [],
        acceptanceCriteria: [],
        readinessScore: 80,
        readiness: {
          total: 80,
        },
      };

      const resolvedFinding: Finding = {
        id: 'f-resolved',
        scanId: 's-1',
        category: 'actions',
        ruleId: 'GH-ACTIONS-UNPINNED',
        title: 'Resolved finding',
        severity: 'medium',
        confidence: 1,
        sourceTool: 'test',
        file: 'ci.yml',
        impact: 'None',
        fixHint: 'None',
        skills: ['Git'],
        learningResources: [],
        disclosureMode: 'public-issue',
        status: 'resolved',
        redacted: false,
        evidenceHash: 'h',
        fingerprint: 'fp',
        createdAt: '2026-10-31T00:00:00Z',
      };

      const recs = getRecommendations({
        findings: [resolvedFinding],
        routes: [completedRoute],
      });

      expect(recs).toEqual([]);
    });
  });

  describe('5. getScanNextSteps for Scan Result View', () => {
    it('returns 3 structured bullets: fix first, learn, draft', () => {
      const finding: Finding = {
        id: 'f-next-1',
        scanId: 's-1',
        category: 'actions',
        ruleId: 'GH-ACTIONS-UNPINNED',
        title: 'Third-party GitHub Action is not pinned to a commit SHA',
        severity: 'high',
        confidence: 0.95,
        sourceTool: 'contriblens-actions-scanner',
        file: '.github/workflows/ci.yml',
        impact: 'Supply-chain mutation risk',
        fixHint: 'Pin to commit SHA',
        skills: ['GitHub Actions', 'Supply-chain security'],
        learningResources: [],
        disclosureMode: 'public-issue',
        redacted: false,
        evidenceHash: 'evidence-hash',
        fingerprint: 'fp-unpinned',
        createdAt: '2026-10-31T00:00:00Z',
      };

      const nextSteps = getScanNextSteps([finding]);
      expect(nextSteps).not.toBeNull();
      expect(nextSteps?.fixFirst.title).toBe(finding.title);
      expect(nextSteps?.fixFirst.reason).toContain('pin this CI action to a commit SHA');
      expect(nextSteps?.fixFirst.targetUrl).toBe('/app/findings/f-next-1');
      expect(nextSteps?.learn.skill).toBe('GitHub Actions');
      expect(nextSteps?.learn.url).toContain('docs.github.com');
      expect(nextSteps?.draft.title).toBe('Maintainer Pull Request Draft');
    });

    it('returns null when there are no findings', () => {
      expect(getScanNextSteps([])).toBeNull();
    });
  });
});
