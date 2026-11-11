import { describe, it, expect, beforeEach } from 'vitest';
import {
  explainFinding,
  generateGroundedPlan,
  buildContributionRoute,
  validateGeminiResponse,
  buildGeminiPlanRequest,
  RULE_CONCRETE_EXPLANATIONS,
  getDeterministicExplanationParts,
} from '../src/lib/gemini';
import { ENGINE_BADGE_TOOLTIP } from '../src/components/ui/EngineBadge';
import { db } from '../src/lib/db';
import type { FindingEvidence, ScanSummary } from '../src/types';

describe('F4 — Best AI Explanations + Simple Understandable Output', () => {
  const scanId = `scn_f4_${Date.now()}`;

  const unpinnedFinding: FindingEvidence = {
    id: 'fnd_unpinned_f4',
    scanId,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-UNPINNED',
    title: 'Unpinned GitHub Action in CI workflow',
    severity: 'medium',
    confidence: 0.95,
    sourceTool: 'CI Auditor',
    file: '.github/workflows/ci.yml',
    lineStart: 14,
    lineEnd: 14,
    evidence: 'uses: actions/checkout@v3',
    impact: 'Mutable tags can be hijacked by upstream maintainers or attackers.',
    fixHint: 'Pin to immutable full 40-character commit SHA.',
    skills: ['GitHub Actions', 'Supply Chain Security'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'hash_unpinned_f4_abc',
    fingerprint: 'GH-ACTIONS-UNPINNED:.github/workflows/ci.yml:14',
    createdAt: new Date().toISOString(),
  };

  const writeAllFinding: FindingEvidence = {
    id: 'fnd_writeall_f4',
    scanId,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'GitHub Actions workflow with write-all permissions',
    severity: 'high',
    confidence: 1.0,
    sourceTool: 'Permissions Auditor',
    file: '.github/workflows/deploy.yml',
    lineStart: 5,
    lineEnd: 5,
    evidence: 'permissions: write-all',
    impact: 'Elevated permissions grant full write access across all repository assets.',
    fixHint: 'Restrict permissions to minimum scopes (e.g. contents: read).',
    skills: ['GitHub Actions', 'YAML Security'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'hash_writeall_f4_def',
    fingerprint: 'GH-ACTIONS-WRITE-ALL:.github/workflows/deploy.yml:5',
    createdAt: new Date().toISOString(),
  };

  const mockScan: ScanSummary = {
    id: scanId,
    userId: 'user_f4_test',
    repoUrl: 'https://github.com/test-org/f4-repo',
    repoName: 'test-org/f4-repo',
    owner: 'test-org',
    branch: 'main',
    scannedAt: new Date().toISOString(),
    totalFiles: 20,
    totalBytes: 50000,
    status: 'completed',
    readinessScore: 85,
    techStack: {
      languages: [{ name: 'TypeScript', percentage: 100, filesCount: 20 }],
      frameworks: [],
      tooling: [],
      manifests: [],
      confidenceScore: 100,
    },
    findingsCount: { total: 2, critical: 0, high: 1, medium: 1, low: 0, info: 0 },
  };

  beforeEach(() => {
    db.saveScan(mockScan);
    db.saveFindings([unpinnedFinding, writeAllFinding]);
  });

  describe('1. Deterministic Engine Parity (Three-Part Structure)', () => {
    it('produces whatHappened, whyItMatters, and howToFix for unpinned action', async () => {
      const explanation = await explainFinding(unpinnedFinding, mockScan);

      expect(explanation).toBeDefined();
      expect(explanation.whatHappened).toBeDefined();
      expect(explanation.whyItMatters).toBeDefined();
      expect(explanation.howToFix).toBeDefined();

      // Check beginner-first content quality
      expect(explanation.whatHappened).toContain('commit hash');
      expect(explanation.whyItMatters).toMatch(/compromised|malicious|pipeline/i);
      expect(explanation.howToFix).toMatch(/Pin the action/i);

      // Verify generatedBy and fallback
      expect(explanation.generatedBy).toBe('deterministic');
      expect(explanation.fallback).toBe(true);
    });

    it('produces whatHappened, whyItMatters, and howToFix for write-all permissions', async () => {
      const explanation = await explainFinding(writeAllFinding, mockScan);

      expect(explanation.whatHappened).toContain('write-all');
      expect(explanation.whyItMatters).toMatch(/privileges|permissions|modify/i);
      expect(explanation.howToFix).toMatch(/Replace "write-all" with least-privilege/i);
    });

    it('provides concrete dictionary entries for major scanner rules', () => {
      const rulesToCheck = [
        'GH-ACTIONS-WRITE-ALL',
        'GH-ACTIONS-UNPINNED',
        'GH-ACTIONS-CURL-PIPE-SHELL',
        'GH-ACTIONS-SCRIPT-INJECTION',
        'GH-ACTIONS-PULL-REQUEST-TARGET',
        'GH-ACTIONS-MISSING-PERMISSIONS',
        'SECRET-GITHUB-PAT',
        'SECRET-AWS-KEY',
        'REPO-MISSING-SECURITY',
        'REPO-NO-TEST-SIGNAL',
        'REPO-MISSING-LICENSE',
        'REPO-MISSING-CONTRIBUTING',
        'REPO-WEAK-README',
      ];

      for (const rule of rulesToCheck) {
        const parts = getDeterministicExplanationParts(
          rule,
          'health',
          'Title',
          'Impact',
          'Fix Hint',
          'file.txt'
        );
        expect(parts.whatHappened.length).toBeGreaterThan(15);
        expect(parts.whyItMatters.length).toBeGreaterThan(15);
        expect(parts.howToFix.length).toBeGreaterThan(15);
      }
    });

    it('emits structured three-part explanations for dependency and secret fallbacks', () => {
      const depParts = getDeterministicExplanationParts(
        'GHSA-xxxx-yyyy',
        'dependency',
        'Vulnerable package',
        '',
        'Upgrade to 2.0.0',
        'package.json'
      );
      expect(depParts.whatHappened).toContain('dependency package');
      expect(depParts.whyItMatters).toContain('vulnerable dependencies');
      expect(depParts.howToFix).toContain('Upgrade to 2.0.0');

      const secParts = getDeterministicExplanationParts(
        'SEC-STRIPE_API_KEY',
        'secret',
        'Stripe API Key',
        '',
        'Revoke key',
        '.env'
      );
      expect(secParts.whatHappened).toContain('credential');
      expect(secParts.whyItMatters).toContain('automated scanners');
      expect(secParts.howToFix).toContain('Revoke key');
    });
  });

  describe('2. Grounded Plan Generation with Three-Part Output', () => {
    it('generates a deterministic plan with whatHappened, whyItMatters, and howToFix', async () => {
      const request = buildGeminiPlanRequest(
        mockScan.id,
        [unpinnedFinding.id],
        [unpinnedFinding],
        { languages: [], frameworks: [], tooling: [], manifests: [] },
        'explain'
      );

      const plan = await generateGroundedPlan(request);
      expect(plan.whatHappened).toBeDefined();
      expect(plan.whyItMatters).toBeDefined();
      expect(plan.howToFix).toBeDefined();
      expect(plan.explanation).toContain(plan.whatHappened);
      expect(plan.generatedBy).toBe('deterministic');
    });

    it('builds a contribution route propagating the three-part explanation fields', async () => {
      const route = await buildContributionRoute(unpinnedFinding, mockScan);

      expect(route).toBeDefined();
      expect(route.whatHappened).toBeDefined();
      expect(route.whyItMatters).toBeDefined();
      expect(route.howToFix).toBeDefined();
      expect(route.title).toContain('Unpinned');
      expect(route.difficulty).toBeDefined();
      expect(route.estimatedEffort).toBeDefined();
    });
  });

  describe('3. Schema Validator Compatibility', () => {
    it('accepts grounded AI responses with whatHappened, whyItMatters, and howToFix', () => {
      const fullResponse = {
        findingIds: [unpinnedFinding.id],
        whatHappened: 'This workflow uses a mutable version tag instead of a commit hash.',
        whyItMatters: 'If the action tag is modified, malicious code could run in your pipeline.',
        howToFix: 'Pin the action to its full 40-character commit hash.',
        explanation: 'This action is not pinned to a commit SHA, which creates a supply chain risk.',
        priorityReason: 'Third party code could change without review.',
        taskTitle: 'Pin GitHub Action to immutable SHA',
        taskSummary: 'Update .github/workflows/ci.yml to use full commit SHA.',
        difficulty: 'beginner',
        skills: ['GitHub Actions', 'Git'],
        files: ['.github/workflows/ci.yml'],
        testPlan: ['Run workflow locally or trigger in test branch.'],
        acceptanceCriteria: ['Action is pinned to 40-character SHA.'],
        unsupportedClaims: [],
        issueMarkdown: null,
      };

      const validated = validateGeminiResponse(
        fullResponse,
        [unpinnedFinding.id],
        ['.github/workflows/ci.yml'],
        'medium'
      );

      expect(validated.valid).toBe(true);
      expect(validated.reason).toBeUndefined();
    });

    it('still rejects missing required fields while supporting added fields', () => {
      const missingRequired = {
        findingIds: [unpinnedFinding.id],
        whatHappened: 'Only added fields present without required fields.',
        // missing explanation, difficulty, skills, files, testPlan, acceptanceCriteria
      };

      const validated = validateGeminiResponse(
        missingRequired,
        [unpinnedFinding.id],
        ['.github/workflows/ci.yml'],
        'medium'
      );

      expect(validated.valid).toBe(false);
      expect(validated.reason).toContain('Missing required field');
    });
  });

  describe('4. Engine Badge & Tooltip Standard', () => {
    it('defines the exact required tooltip contract', () => {
      const expectedTooltip =
        'ContribLens verifies findings with deterministic code. AI explains them. When AI is unavailable, the built-in deterministic engine explains instead — same facts, simpler wording.';
      expect(ENGINE_BADGE_TOOLTIP).toBe(expectedTooltip);
    });

    it('enforces EngineBadge rendering on finding detail, route detail, and drafts', () => {
      const fs = require('fs');
      const path = require('path');

      const findingDetail = fs.readFileSync(
        path.join(process.cwd(), 'src/components/views/FindingDetailsView.tsx'),
        'utf-8'
      );
      expect(findingDetail).toContain('EngineBadge');
      expect(findingDetail).toContain('data-testid="plain-english-summary-card"');
      expect(findingDetail).toContain('Plain-English Summary');
      expect(findingDetail).toContain('What happened');
      expect(findingDetail).toContain('Why it matters');
      expect(findingDetail).toContain('How to fix');

      const routeDetail = fs.readFileSync(
        path.join(process.cwd(), 'src/components/views/RouteDetailsView.tsx'),
        'utf-8'
      );
      expect(routeDetail).toContain('EngineBadge');
      expect(routeDetail).toContain('What happened');
      expect(routeDetail).toContain('Why it matters');
      expect(routeDetail).toContain('How to fix');

      const drafts = fs.readFileSync(
        path.join(process.cwd(), 'src/components/views/DraftsView.tsx'),
        'utf-8'
      );
      expect(drafts).toContain('EngineBadge');

      const engineBadge = fs.readFileSync(
        path.join(process.cwd(), 'src/components/ui/EngineBadge.tsx'),
        'utf-8'
      );
      expect(engineBadge).toContain('✦ Gemma explanation');
      expect(engineBadge).toContain('Gemini explanation');
      expect(engineBadge).toContain('Deterministic explanation');
      expect(engineBadge).toContain('ENGINE_BADGE_TOOLTIP');
    });
  });
});
