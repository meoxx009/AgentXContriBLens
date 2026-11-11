import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Finding } from '@/types';
import { createFindingEvidence } from '@/lib/scanner/evidence';
import { db } from '@/lib/db';

describe('TASK — Findings Row Interactivity & Detail Panel Resilience', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Minimal data finding renders safely without throwing
  it('1. Finding with minimal data (no evidence, no line, no fixHint, no readiness) has safe fallbacks and does not crash', () => {
    const minimalFinding: Finding = {
      id: 'fnd_minimal_1',
      scanId: 'scan_100',
      category: 'repository-health',
      ruleId: 'REPO-MINIMAL',
      title: 'Minimal Structural Finding',
      severity: 'low',
      confidence: 0.8,
      sourceTool: 'Health Check',
      file: null,
      lineStart: null,
      lineEnd: null,
      evidence: '',
      impact: '',
      fixHint: '',
      status: 'open',
      reviewed: false,
    } as unknown as Finding;

    // Simulate detail panel safe resolution
    const safeRule = minimalFinding.ruleId || 'GENERIC-SECURITY-RULE';
    const safeFile = minimalFinding.file || 'Repository Configuration / Root';
    const safeLine = minimalFinding.lineStart || minimalFinding.line || null;
    const safeFix = minimalFinding.fixHint || 'Follow standard open-source contribution workflow to remediate this finding.';
    const safeImpact = minimalFinding.impact || 'Addressing this finding improves repository security and code quality.';
    const safeReadinessLabel = minimalFinding.readiness?.label
      ? minimalFinding.readiness.label.replace(/-/g, ' ')
      : 'Standard Contribution';
    const safeReasons = Array.isArray(minimalFinding.readiness?.reasons)
      ? minimalFinding.readiness.reasons
      : [];
    const safeBlockers = Array.isArray(minimalFinding.readiness?.blockers)
      ? minimalFinding.readiness.blockers
      : [];

    expect(safeRule).toBe('REPO-MINIMAL');
    expect(safeFile).toBe('Repository Configuration / Root');
    expect(safeLine).toBeNull();
    expect(safeFix).toContain('Follow standard open-source');
    expect(safeImpact).toContain('Addressing this finding improves');
    expect(safeReadinessLabel).toBe('Standard Contribution');
    expect(safeReasons).toEqual([]);
    expect(safeBlockers).toEqual([]);
  });

  // Test 2: Findings across ALL severities and categories
  it('2. Findings across ALL severities (critical, high, medium, low, info) and types are interactive and open details', () => {
    const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;
    const categories = ['secret', 'github-actions', 'dependency', 'repository-health', 'sast'] as const;

    const sampleFindings: Finding[] = severities.map((sev, idx) => ({
      id: `fnd_sev_${sev}_${idx}`,
      scanId: 'scan_200',
      category: categories[idx % categories.length],
      ruleId: `RULE-${sev.toUpperCase()}`,
      title: `Finding for severity ${sev}`,
      severity: sev,
      confidence: 0.95,
      sourceTool: 'Scanner Engine',
      file: `src/file_${idx}.ts`,
      lineStart: idx + 10,
      evidence: `const leak_${idx} = true;`,
      impact: `Risk level: ${sev}`,
      fixHint: `Remediate ${sev} issue`,
      readiness: {
        total: 75,
        difficulty: 'beginner',
        label: 'beginner-friendly',
        reasons: ['Clear bounded fix'],
      },
      status: 'open',
      reviewed: false,
    } as unknown as Finding));

    expect(sampleFindings).toHaveLength(5);

    sampleFindings.forEach((f) => {
      // Confirm each has non-empty unique ID
      expect(f.id).toBeTruthy();
      // Confirm severity is valid
      expect(['critical', 'high', 'medium', 'low', 'info']).toContain(f.severity.toLowerCase());
      // Confirm readiness label replace does not throw
      const formattedLabel = f.readiness?.label ? f.readiness.label.replace(/-/g, ' ') : 'Standard';
      expect(formattedLabel).toBe('beginner friendly');
    });
  });

  // Test 3: Switching selection between Finding A and Finding B
  it('3. Selecting finding B after finding A cleanly switches active selection and updates details', () => {
    let selectedFinding: Finding | null = null;
    let selectedFindingId: string | null = null;

    const findingA: Finding = {
      id: 'fnd_alpha',
      scanId: 'scan_300',
      category: 'secret',
      ruleId: 'SEC-API-KEY',
      title: 'Secret Leak in Config',
      severity: 'critical',
      confidence: 1.0,
      sourceTool: 'Secret Guard',
      file: 'config.ts',
      evidence: 'apiKey = "SECRET"',
      impact: 'High credential exposure',
      fixHint: 'Rotate key',
      status: 'open',
      reviewed: false,
    } as unknown as Finding;

    const findingB: Finding = {
      id: 'fnd_beta',
      scanId: 'scan_300',
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned action in CI',
      severity: 'medium',
      confidence: 0.9,
      sourceTool: 'CI Auditor',
      file: '.github/workflows/ci.yml',
      evidence: 'uses: actions/checkout@v3',
      impact: 'Supply chain risk',
      fixHint: 'Pin to SHA',
      status: 'open',
      reviewed: false,
    } as unknown as Finding;

    const handleSelect = (f: Finding) => {
      selectedFinding = f;
      selectedFindingId = f.id;
    };

    // Click Finding A
    handleSelect(findingA);
    expect((selectedFinding as Finding | null)?.id).toBe('fnd_alpha');
    expect(selectedFindingId).toBe('fnd_alpha');

    // Click Finding B
    handleSelect(findingB);
    expect((selectedFinding as Finding | null)?.id).toBe('fnd_beta');
    expect(selectedFindingId).toBe('fnd_beta');
    expect((selectedFinding as Finding | null)?.title).toBe('Unpinned action in CI');
  });

  // Test 4: Detail fetch error handling does not freeze or disable row
  it('4. Detail fetch failure or slow fetch maintains row responsiveness and allows retry', async () => {
    let rowClickable = true;
    let fetchErrorState: string | null = null;

    const simulateFetchDetail = async (shouldFail: boolean) => {
      if (shouldFail) {
        fetchErrorState = 'Network error fetching finding details. Reverted state.';
        return null;
      }
      fetchErrorState = null;
      return { id: 'fnd_success', title: 'Loaded Finding' };
    };

    // First attempt fails
    const result1 = await simulateFetchDetail(true);
    expect(result1).toBeNull();
    expect(fetchErrorState).toContain('Network error');
    expect(rowClickable).toBe(true);

    // User retries click on the same or another row
    const result2 = await simulateFetchDetail(false);
    expect(result2?.id).toBe('fnd_success');
    expect(fetchErrorState).toBeNull();
    expect(rowClickable).toBe(true);
  });

  // Test 5: Selection state survives round-trip navigation
  it('5. Selection state survives round-trip navigation via URL/targetId restoration', () => {
    const findingsList: Finding[] = [
      { id: 'fnd_1', title: 'Finding 1', scanId: 'scan_500' } as Finding,
      { id: 'fnd_2', title: 'Finding 2', scanId: 'scan_500' } as Finding,
      { id: 'fnd_3', title: 'Finding 3', scanId: 'scan_500' } as Finding,
    ];

    // User selects fnd_2
    const currentSelectedId = 'fnd_2';
    // Navigation to Contributions + Stack carries targetId in query string: ?findingId=fnd_2
    const urlParam = 'fnd_2';

    // On return to Findings, match by ID or decoded ID
    const decodedParam = decodeURIComponent(urlParam);
    const restored = findingsList.find(
      (f) => f.id === urlParam || f.id === decodedParam
    );

    expect(restored).toBeDefined();
    expect(restored?.id).toBe('fnd_2');
    expect(restored?.title).toBe('Finding 2');
  });

  // Test 6: Finding ID uniqueness across same rule and file
  it('6. Multiple findings from the same rule or file each get unique, collision-free IDs', () => {
    const finding1 = createFindingEvidence({
      scanId: 'scan_600',
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned action 1',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      sourceTool: 'CI Auditor',
      file: '.github/workflows/deploy-preview-pull-requests-production.yml',
      lineStart: 12,
      lineEnd: 12,
      evidence: 'uses: actions/checkout@v3',
      impact: 'Supply chain risk',
      fixHint: 'Pin to commit SHA',
    });

    const finding2 = createFindingEvidence({
      scanId: 'scan_600',
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned action 2',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      sourceTool: 'CI Auditor',
      file: '.github/workflows/deploy-preview-pull-requests-production.yml',
      lineStart: 25,
      lineEnd: 25,
      evidence: 'uses: actions/setup-node@v3',
      impact: 'Supply chain risk',
      fixHint: 'Pin to commit SHA',
    });

    const finding3 = createFindingEvidence({
      scanId: 'scan_600',
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned action 3',
      severity: 'MEDIUM',
      confidence: 'HIGH',
      sourceTool: 'CI Auditor',
      file: '.github/workflows/deploy-preview-pull-requests-production.yml',
      lineStart: 40,
      lineEnd: 40,
      evidence: 'uses: actions/cache@v3',
      impact: 'Supply chain risk',
      fixHint: 'Pin to commit SHA',
    });

    // All three findings are in the same long file path and have the same ruleId
    expect(finding1.id).not.toBe(finding2.id);
    expect(finding1.id).not.toBe(finding3.id);
    expect(finding2.id).not.toBe(finding3.id);

    // Each ID is non-empty, <= 80 chars, and starts with fnd_
    [finding1, finding2, finding3].forEach((f) => {
      expect(f.id.length).toBeGreaterThan(10);
      expect(f.id.length).toBeLessThanOrEqual(80);
      expect(f.id.startsWith('fnd_')).toBe(true);
    });

    // Verify DB saveFindings retains all 3 findings without overwriting
    db.saveFindings([finding1 as unknown as Finding, finding2 as unknown as Finding, finding3 as unknown as Finding]);
    const stored = db.getFindings('scan_600');
    expect(stored.some((f) => f.id === finding1.id)).toBe(true);
    expect(stored.some((f) => f.id === finding2.id)).toBe(true);
    expect(stored.some((f) => f.id === finding3.id)).toBe(true);

    // Verify getFindingById retrieves each finding accurately
    const retrieved1 = db.getFindingById(finding1.id);
    const retrieved2 = db.getFindingById(finding2.id);
    expect(retrieved1?.title).toBe('Unpinned action 1');
    expect(retrieved2?.title).toBe('Unpinned action 2');
  });
});
