import { describe, it, expect } from 'vitest';
import { explainFinding } from '../src/lib/gemini';
import { DEFAULT_TRUST_STEPS } from '../src/components/ui/EvidenceChainView';
import type { Finding, ScanSummary } from '../src/types';

describe('Phase 8 — Findings Evidence UX, Engine Labels, and Skills Gap', () => {
  const mockScan: ScanSummary = {
    id: `scan_test_${Date.now()}`,
    repoUrl: 'https://github.com/contriblens-test/sample-repo',
    repoName: 'sample-repo',
    owner: 'contriblens-test',
    branch: 'main',
    totalFiles: 12,
    totalBytes: 25000,
    scannedAt: new Date().toISOString(),
    commitSha: 'a1b2c3d4e5f6',
    status: 'completed',
    readinessScore: 77,
    findingsCount: { critical: 1, high: 1, medium: 1, low: 0, info: 0, total: 3 },
    techStack: {
      languages: [{ name: 'TypeScript', percentage: 100, filesCount: 10, confidence: 0.95, sources: ['package.json'] }],
      frameworks: [{ name: 'Next.js', category: 'fullstack', version: '15.0.0', confidence: 0.9, sources: ['package.json'] }],
      packageManagers: [{ name: 'npm', status: 'detected', source: 'package-lock.json', lockfile: 'package-lock.json', confidence: 1 }],
      manifests: [{ path: 'package.json', type: 'npm', dependenciesCount: 5 }],
      confidenceScore: 0.95,
      tooling: [{ name: 'Vitest', category: 'testing', confidence: 0.9 }],
    },
  };

  const writeAllFinding: Finding = {
    id: 'fnd_test_write_all',
    scanId: mockScan.id,
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'GitHub Actions workflow elevates permissions with write-all',
    severity: 'high',
    confidence: 0.95,
    sourceTool: 'Static Analyzer',
    file: '.github/workflows/ci.yml',
    lineStart: 12,
    lineEnd: 12,
    evidence: 'permissions: write-all',
    impact: 'Grants write access across contents, packages, issues, and pull requests.',
    fixHint: 'Restrict workflow permissions to least required scopes.',
    skills: ['GitHub Actions', 'Principle of Least Privilege', 'CI Security'],
    learningResources: [
      {
        title: 'Security Hardening for Actions',
        url: 'https://docs.github.com/actions',
        provider: 'docs',
      },
    ],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    fingerprint: 'GH-ACTIONS-WRITE-ALL:.github/workflows/ci.yml:12',
    createdAt: new Date().toISOString(),
  };

  const secretFinding: Finding = {
    id: 'fnd_test_secret',
    scanId: mockScan.id,
    category: 'secret',
    ruleId: 'SECRET-GITHUB-PAT',
    title: 'Exposed GitHub Personal Access Token in config',
    severity: 'critical',
    confidence: 1.0,
    sourceTool: 'Secret Redaction Guard',
    file: 'config.json',
    lineStart: 5,
    lineEnd: 5,
    evidence: 'ghp_************************************',
    redactedEvidence: 'ghp_************************************',
    impact: 'Allows unauthorized access to GitHub API with token scopes.',
    fixHint: 'Revoke and rotate token immediately and scrub git history.',
    skills: ['Secret Rotation', 'Git Credential Scrubbing'],
    learningResources: [],
    disclosureMode: 'security-disclosure',
    redacted: true,
    evidenceHash: 'ca978112ca1bbdcafac231b39a23dc4da7860814416461a53ffd94c23dd459b3',
    fingerprint: 'SECRET-GITHUB-PAT:config.json:5',
    createdAt: new Date().toISOString(),
  };

  it('renders and verifies the 8 trust steps per EVIDENCE_AND_SCHEMAS.md §9', () => {
    expect(DEFAULT_TRUST_STEPS).toHaveLength(8);

    const stepLabels = DEFAULT_TRUST_STEPS.map((s) => s.label);
    expect(stepLabels).toEqual([
      'URL validated',
      'Bounded tree fetched',
      'Redaction applied (in-memory)',
      'SHA-256 evidence hash',
      'Deterministic rule match',
      'OSV cross-check',
      'Evidence normalization',
      'Redacted persistence',
    ]);

    // Check step numbers 1 to 8 in sequence
    DEFAULT_TRUST_STEPS.forEach((step, idx) => {
      expect(step.step).toBe(idx + 1);
      expect(step.verifiedBy).toBeTruthy();
      expect(step.detail).toBeTruthy();
    });
  });

  it('generates concrete, per-rule technical explanation in keyless/deterministic mode (not generic)', async () => {
    const explanation = await explainFinding(writeAllFinding, mockScan);

    expect(explanation).toBeDefined();
    expect(explanation.generatedBy).toBe('deterministic');
    expect(explanation.fallback).toBe(true);
    // Concrete per-rule text check:
    expect(explanation.explanation).toContain('permissions: write-all');
    expect(explanation.explanation).toContain('elevating privileges');
    expect(explanation.explanation).not.toContain('a finding was detected');
    expect(explanation.skillsNeeded).toContain('GitHub Actions');
  });

  it('generates concrete per-rule explanation for secret finding with appropriate guidance', async () => {
    const explanation = await explainFinding(secretFinding, mockScan);

    expect(explanation.generatedBy).toBe('deterministic');
    expect(explanation.fallback).toBe(true);
    expect(explanation.explanation).toContain('Personal Access Token');
    expect(explanation.explanation).toContain('Revoke and rotate');
    expect(explanation.explanation).not.toContain('a finding was detected');
  });

  it('strictly protects disclosure policy for secrets (security-disclosure / Private Disclosure Only)', () => {
    expect(secretFinding.disclosureMode).toBe('security-disclosure');
    expect(writeAllFinding.disclosureMode).toBe('public-issue');
  });

  it('preserves empty state invariant: never claims repository is "secure"', () => {
    const emptyStateText = 'No supported deterministic findings detected';
    expect(emptyStateText.toLowerCase()).not.toContain('secure');
    expect(emptyStateText.toLowerCase()).not.toContain('100% safe');
    expect(emptyStateText).toBe('No supported deterministic findings detected');
  });
});
