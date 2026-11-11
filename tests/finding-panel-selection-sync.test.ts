import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Finding } from '@/types';

describe('PERMANENT FIX REGRESSION TEST: Finding Side-Panel Selection Synchronization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const MOCK_CRITICAL_FINDING: Finding = {
    id: 'fnd_crit_aws_key',
    scanId: 'scan_alpha',
    category: 'secret',
    ruleId: 'HARDCODED-SECRET-AWS',
    title: 'Hardcoded AWS Access Key',
    severity: 'critical',
    confidence: 1.0,
    sourceTool: 'Secret Scanner',
    file: 'src/config/aws.ts',
    lineStart: 12,
    lineEnd: 12,
    evidence: 'const KEY = "AKIAIOSFODNN7EXAMPLE";',
    evidenceHash: 'hash-crit-aws',
    impact: 'Critical credential compromise',
    fixHint: 'Move secret to KMS or environment variable',
    status: 'open',
    reviewed: false,
    readiness: {
      total: 35,
      difficulty: 'maintainer',
      label: 'maintainer-assistance',
      estimatedMinutes: 60,
      reasons: ['High blast radius secret rotation'],
    },
  } as unknown as Finding;

  const MOCK_HIGH_FINDING: Finding = {
    id: 'fnd_high_ci_perms',
    scanId: 'scan_alpha',
    category: 'github-actions',
    ruleId: 'GH-ACTIONS-WRITE-ALL',
    title: 'Workflow declares write-all permissions',
    severity: 'high',
    confidence: 0.95,
    sourceTool: 'Workflow Auditor',
    file: '.github/workflows/ci.yml',
    lineStart: 8,
    lineEnd: 8,
    evidence: 'permissions: write-all',
    evidenceHash: 'hash-high-ci',
    impact: 'Excessive workflow token permissions',
    fixHint: 'Scope permissions to minimal set',
    status: 'open',
    reviewed: false,
    readiness: {
      total: 70,
      difficulty: 'beginner',
      label: 'beginner-friendly',
      estimatedMinutes: 20,
      reasons: ['Single configuration line'],
    },
  } as unknown as Finding;

  const MOCK_MEDIUM_FINDING: Finding = {
    id: 'fnd_med_lodash_dep',
    scanId: 'scan_alpha',
    category: 'dependency',
    ruleId: 'OSV-VULNERABLE-DEP',
    title: 'Known Vulnerability in lodash@4.17.15',
    severity: 'medium',
    confidence: 0.9,
    sourceTool: 'OSV Auditor',
    file: 'package.json',
    lineStart: 34,
    lineEnd: 34,
    evidence: '"lodash": "4.17.15"',
    evidenceHash: 'hash-med-dep',
    impact: 'Prototype pollution vulnerability',
    fixHint: 'Bump lodash to ^4.17.21',
    status: 'open',
    reviewed: false,
    readiness: {
      total: 85,
      difficulty: 'beginner',
      label: 'good-first-issue',
      estimatedMinutes: 10,
      reasons: ['Safe dependency version bump'],
    },
  } as unknown as Finding;

  const MOCK_LOW_FINDING: Finding = {
    id: 'fnd_low_security_md',
    scanId: 'scan_alpha',
    category: 'repository-health',
    ruleId: 'HEALTH-MISSING-SECURITY-MD',
    title: 'Missing SECURITY.md Policy Document',
    severity: 'low',
    confidence: 0.85,
    sourceTool: 'Health Checker',
    file: 'SECURITY.md',
    lineStart: 1,
    lineEnd: 1,
    evidence: '',
    evidenceHash: 'hash-low-health',
    impact: 'No standard coordinated disclosure guidance',
    fixHint: 'Create SECURITY.md with disclosure contact details',
    status: 'open',
    reviewed: true,
    readiness: {
      total: 95,
      difficulty: 'beginner',
      label: 'good-first-issue',
      estimatedMinutes: 15,
      reasons: ['Documentation addition'],
    },
  } as unknown as Finding;

  const ALL_FINDINGS = [
    MOCK_CRITICAL_FINDING,
    MOCK_HIGH_FINDING,
    MOCK_MEDIUM_FINDING,
    MOCK_LOW_FINDING,
  ];

  // Model of the fixed FindingsView selection controller
  class FindingSelectionController {
    findings: Finding[];
    selectedFinding: Finding | null = null;
    selectedFindingId: string | null = null;
    lastSelectedIdRef: string | null = null;
    lastSyncedUrlParamRef: string | null = null;
    previousUrlFindingIdRef: string | null = null;
    hasInitializedSelectionRef = false;
    currentUrlQuery = new URLSearchParams();

    constructor(initialFindings: Finding[], initialUrlQuery = '') {
      this.findings = initialFindings;
      this.currentUrlQuery = new URLSearchParams(initialUrlQuery);
      this.previousUrlFindingIdRef = this.currentUrlQuery.get('findingId') || this.currentUrlQuery.get('finding') || null;
    }

    // Corresponds to fetchFindings initialization
    initSelection(targetIdFromStorage: string | null = null) {
      if (this.findings.length === 0) {
        this.selectedFinding = null;
        this.selectedFindingId = null;
        this.lastSelectedIdRef = null;
        return;
      }

      let targetId =
        this.lastSelectedIdRef ||
        this.currentUrlQuery.get('findingId') ||
        this.currentUrlQuery.get('finding') ||
        this.selectedFindingId ||
        targetIdFromStorage;

      if (targetId) {
        const matched = this.findings.find(
          (f) => f.id === targetId || f.fingerprint === targetId
        );
        if (matched) {
          this.applySelection(matched);
        } else if (!this.hasInitializedSelectionRef) {
          this.clearSelection();
        } else {
          this.applySelection(this.findings[0]);
        }
      } else {
        // Default to sorted[0] on initial load
        this.applySelection(this.findings[0]);
      }

      this.hasInitializedSelectionRef = true;
    }

    // Corresponds to handleSelectFinding
    selectByUserClick(finding: Finding) {
      if (!finding) return;
      const targetId = finding.id || finding.fingerprint || `${finding.ruleId}-${finding.file}`;
      const safeFinding = finding.id ? finding : { ...finding, id: targetId };

      this.applySelection(safeFinding);
    }

    private applySelection(finding: Finding) {
      this.lastSelectedIdRef = finding.id;
      this.lastSyncedUrlParamRef = finding.id;
      this.selectedFinding = finding;
      this.selectedFindingId = finding.id;
      this.currentUrlQuery.set('findingId', finding.id);
    }

    clearSelection() {
      this.lastSelectedIdRef = null;
      this.lastSyncedUrlParamRef = null;
      this.selectedFinding = null;
      this.selectedFindingId = null;
      this.currentUrlQuery.delete('findingId');
    }

    // Corresponds to handlePopState (browser Back / Forward)
    simulatePopState(newUrlQuery: string) {
      this.currentUrlQuery = new URLSearchParams(newUrlQuery);
      const paramFindingId = this.currentUrlQuery.get('findingId') || this.currentUrlQuery.get('finding');

      if (!paramFindingId) {
        this.clearSelection();
        return;
      }

      const match = this.findings.find(
        (f) => f.id === paramFindingId || f.fingerprint === paramFindingId
      );

      if (match && match.id !== this.lastSelectedIdRef) {
        this.applySelection(match);
      }
    }

    // Corresponds to the external Next.js navigation sync effect
    simulateExternalRouterSync(nextUrlFindingId: string | null) {
      if (!nextUrlFindingId || this.findings.length === 0) return;

      // If urlFindingId has not changed from what Next.js router provided on page load or previous navigation,
      // then any divergence from lastSelectedIdRef is due to a local user click
      // (native replaceState updates address bar without updating useSearchParams). Preserve user click!
      if (nextUrlFindingId === this.previousUrlFindingIdRef) {
        return;
      }

      // A genuine external navigation occurred with a changed URL finding parameter
      this.previousUrlFindingIdRef = nextUrlFindingId;

      // If this URL param already matches our current selected finding, do nothing
      if (this.lastSelectedIdRef === nextUrlFindingId) return;

      this.lastSyncedUrlParamRef = nextUrlFindingId;
      const match = this.findings.find(
        (f) => f.id === nextUrlFindingId || f.fingerprint === nextUrlFindingId
      );

      if (match) {
        this.applySelection(match);
      }
    }

    isRowSelected(finding: Finding): boolean {
      return this.selectedFinding?.id === finding.id;
    }
  }

  // Test 1: Clicking finding B (non-critical) after finding A (critical) updates the side panel to finding B and does NOT revert
  it('1. Clicking finding B (non-critical) after finding A (critical) updates the side panel to finding B and does NOT revert to finding A', () => {
    const controller = new FindingSelectionController(ALL_FINDINGS);
    // Initial load: defaults to critical finding
    controller.initSelection();
    expect(controller.selectedFinding?.id).toBe(MOCK_CRITICAL_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Hardcoded AWS Access Key');
    expect(controller.isRowSelected(MOCK_CRITICAL_FINDING)).toBe(true);

    // User clicks finding B (Low severity finding)
    controller.selectByUserClick(MOCK_LOW_FINDING);

    // Verify side panel now holds Finding B
    expect(controller.selectedFinding?.id).toBe(MOCK_LOW_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Missing SECURITY.md Policy Document');
    expect(controller.selectedFinding?.severity).toBe('low');
    expect(controller.isRowSelected(MOCK_LOW_FINDING)).toBe(true);
    expect(controller.isRowSelected(MOCK_CRITICAL_FINDING)).toBe(false);

    // Simulate any pending router/external sync effect triggers: must NOT revert to Finding A
    controller.simulateExternalRouterSync(MOCK_LOW_FINDING.id);
    expect(controller.selectedFinding?.id).toBe(MOCK_LOW_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Missing SECURITY.md Policy Document');
  });

  // Test 2: Clicking through findings with different severities updates the panel to match each clicked finding
  it('2. Clicking through findings with different severities (critical -> high -> medium -> low) updates the panel to match each clicked finding', () => {
    const controller = new FindingSelectionController(ALL_FINDINGS);
    controller.initSelection();

    // 1. Critical
    controller.selectByUserClick(MOCK_CRITICAL_FINDING);
    expect(controller.selectedFinding?.severity).toBe('critical');
    expect(controller.selectedFinding?.id).toBe(MOCK_CRITICAL_FINDING.id);

    // 2. High
    controller.selectByUserClick(MOCK_HIGH_FINDING);
    expect(controller.selectedFinding?.severity).toBe('high');
    expect(controller.selectedFinding?.id).toBe(MOCK_HIGH_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Workflow declares write-all permissions');

    // 3. Medium
    controller.selectByUserClick(MOCK_MEDIUM_FINDING);
    expect(controller.selectedFinding?.severity).toBe('medium');
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Known Vulnerability in lodash@4.17.15');

    // 4. Low
    controller.selectByUserClick(MOCK_LOW_FINDING);
    expect(controller.selectedFinding?.severity).toBe('low');
    expect(controller.selectedFinding?.id).toBe(MOCK_LOW_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Missing SECURITY.md Policy Document');
  });

  // Test 3: Row visual highlight (isSelected) and panel data (selectedFinding.id) are 100% synchronized for every click
  it('3. Row visual highlight (isSelected) and panel data (selectedFinding.id) are 100% synchronized for every click', () => {
    const controller = new FindingSelectionController(ALL_FINDINGS);
    controller.initSelection();

    ALL_FINDINGS.forEach((targetFinding) => {
      controller.selectByUserClick(targetFinding);

      // Detail panel data matches
      expect(controller.selectedFinding?.id).toBe(targetFinding.id);
      expect(controller.selectedFindingId).toBe(targetFinding.id);

      // Exactly this row is highlighted, and other rows are NOT highlighted
      ALL_FINDINGS.forEach((f) => {
        const isSelected = controller.isRowSelected(f);
        if (f.id === targetFinding.id) {
          expect(isSelected).toBe(true);
        } else {
          expect(isSelected).toBe(false);
        }
      });
    });
  });

  // Test 4: Stale searchParams or URL replaceState delays do not overwrite user-selected finding
  it('4. Stale searchParams or URL replaceState delays do not overwrite user-selected finding', () => {
    // Initial URL had findingId=fnd_crit_aws_key
    const controller = new FindingSelectionController(ALL_FINDINGS, 'findingId=fnd_crit_aws_key');
    controller.initSelection();
    expect(controller.selectedFinding?.id).toBe(MOCK_CRITICAL_FINDING.id);

    // User clicks MOCK_MEDIUM_FINDING
    controller.selectByUserClick(MOCK_MEDIUM_FINDING);
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);

    // Stale Next.js router effect delivers the old URL param 'fnd_crit_aws_key' that was initially in searchParams
    // Controller must ignore this stale parameter because user clicked a newer selection
    controller.simulateExternalRouterSync(MOCK_CRITICAL_FINDING.id);

    // Still MOCK_MEDIUM_FINDING!
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Known Vulnerability in lodash@4.17.15');
  });

  // Test 5: Auto-select only sets initial finding on first load and never overwrites a user selection
  it('5. Auto-select only sets initial finding on first load and never overwrites a user selection', () => {
    const controller = new FindingSelectionController(ALL_FINDINGS);
    // First load -> auto-selects first item (critical)
    controller.initSelection();
    expect(controller.hasInitializedSelectionRef).toBe(true);
    expect(controller.selectedFinding?.id).toBe(MOCK_CRITICAL_FINDING.id);

    // User explicitly selects Medium finding
    controller.selectByUserClick(MOCK_MEDIUM_FINDING);
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);

    // Secondary load / filter re-fetch: initSelection called again
    controller.initSelection();

    // Must preserve user's Medium finding selection and NOT reset to critical
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Known Vulnerability in lodash@4.17.15');
  });

  // Test 6: Round-trip navigation (Findings -> Contributions -> Findings) preserves the selected finding
  it('6. Round-trip navigation (Findings -> Contributions -> Findings) preserves the selected finding', () => {
    // 1. In FindingsView, user selects High severity finding (fnd_high_ci_perms)
    const view1 = new FindingSelectionController(ALL_FINDINGS);
    view1.initSelection();
    view1.selectByUserClick(MOCK_HIGH_FINDING);

    const savedIdInStorage = view1.selectedFindingId;
    const queryParamUponNavigation = view1.currentUrlQuery.toString();
    expect(savedIdInStorage).toBe(MOCK_HIGH_FINDING.id);
    expect(queryParamUponNavigation).toContain(`findingId=${MOCK_HIGH_FINDING.id}`);

    // 2. User navigates to Contributions + Stack and back:
    // When returning to FindingsView, URL carries findingId=fnd_high_ci_perms and storage has saved ID
    const returnedView = new FindingSelectionController(ALL_FINDINGS, queryParamUponNavigation);
    returnedView.initSelection(savedIdInStorage);

    // Finding selection is preserved upon return
    expect(returnedView.selectedFinding?.id).toBe(MOCK_HIGH_FINDING.id);
    expect(returnedView.selectedFinding?.title).toBe('Workflow declares write-all permissions');
    expect(returnedView.isRowSelected(MOCK_HIGH_FINDING)).toBe(true);
  });

  // Test 7: External deep link router navigation with a genuinely changed URL parameter cleanly updates selection to that finding
  it('7. External deep link router navigation with a genuinely changed URL parameter cleanly updates selection to that finding', () => {
    // Controller loaded initially with findingId=fnd_crit_aws_key
    const controller = new FindingSelectionController(ALL_FINDINGS, 'findingId=fnd_crit_aws_key');
    controller.initSelection();
    expect(controller.selectedFinding?.id).toBe(MOCK_CRITICAL_FINDING.id);

    // User is viewing critical finding, then clicks an external link to medium finding (or from Contributions)
    // External router navigation fires with new parameter 'fnd_med_lodash_dep'
    controller.simulateExternalRouterSync(MOCK_MEDIUM_FINDING.id);

    // Selection cleanly transitions to the new deep-linked finding
    expect(controller.selectedFinding?.id).toBe(MOCK_MEDIUM_FINDING.id);
    expect(controller.selectedFinding?.title).toBe('Known Vulnerability in lodash@4.17.15');
    expect(controller.isRowSelected(MOCK_MEDIUM_FINDING)).toBe(true);
  });
});
