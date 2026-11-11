/**
 * ContribLens Deterministic Contribution Readiness & Finding Triage Engine
 * 
 * Invariants:
 * 1. Pure, independently testable scoring service (no React/Next/browser/DB/Gemini dependencies).
 * 2. Risk/Urgency and Contribution Readiness are separate values.
 * 3. A high-severity finding can have low contribution readiness (e.g. Critical Auth/RCE).
 * 4. Deterministic and explainable (clamped to 0..100, NaN/Infinity safe).
 * 5. 5 weighted factors: evidenceClarity (25), scopeSimplicity (20), testability (20),
 *    skillAccessibility (20), contextCompleteness (15).
 */

import type {
  Finding,
  ContributionReadiness,
  ReadinessLabel,
  UrgencyLabel,
  FindingTriage,
} from '../../types.ts';

export const CALCULATOR_VERSION = 'v2.0.0';

export interface ReadinessContext {
  filesCount?: number;
  hasTestFiles?: boolean;
  repoTech?: string[];
}

/**
 * Derives the Risk / Urgency score and label from finding severity and security impact.
 * Urgency reflects what must be fixed first; Readiness reflects whether a beginner can fix it.
 */
export function calculateUrgency(finding: Finding): {
  urgencyScore: number;
  urgencyLabel: UrgencyLabel;
} {
  const sev = String(finding.severity || 'MEDIUM').toUpperCase();

  if (sev === 'CRITICAL') {
    return { urgencyScore: 95, urgencyLabel: 'critical' };
  }
  if (sev === 'HIGH') {
    return { urgencyScore: 75, urgencyLabel: 'high' };
  }
  if (sev === 'MEDIUM') {
    return { urgencyScore: 50, urgencyLabel: 'medium' };
  }
  if (sev === 'LOW') {
    return { urgencyScore: 25, urgencyLabel: 'low' };
  }
  return { urgencyScore: 10, urgencyLabel: 'informational' };
}

/**
 * Calculates deterministic Contribution Readiness for an eligible finding.
 */
export function calculateContributionReadiness(
  finding: Finding,
  context?: ReadinessContext
): ContributionReadiness {
  const reasons: string[] = [];
  const blockers: string[] = [];

  // ==========================================
  // 1. Evidence Clarity (0..25)
  // ==========================================
  let evidenceClarity = 0;

  const hasFile = Boolean(finding.file && finding.file.trim().length > 0);
  const hasLine = typeof finding.lineStart === 'number' || typeof finding.line === 'number';
  const hasRuleOrAdvisory = Boolean(finding.ruleId && finding.ruleId.trim().length > 0);
  const hasEvidenceText = Boolean(
    (finding.evidence && finding.evidence.trim().length > 5) ||
    (finding.redactedEvidence && finding.redactedEvidence.trim().length > 5)
  );
  const isAbsenceFinding =
    finding.category === 'repository-health' ||
    (finding.ruleId && finding.ruleId.includes('MISSING'));

  if (hasFile) {
    evidenceClarity += 8;
  }

  if (hasLine) {
    evidenceClarity += 7;
    reasons.push('The evidence points to one specific file with an exact line location.');
  } else if (isAbsenceFinding) {
    // Absence of a file (e.g. missing LICENSE or SECURITY.md) is clear even without a line number
    evidenceClarity += 4;
    reasons.push('The finding identifies a missing repository governance file.');
  }

  if (hasRuleOrAdvisory) {
    evidenceClarity += 5;
  }

  if (hasEvidenceText) {
    evidenceClarity += 5;
  }

  evidenceClarity = Math.min(25, Math.max(0, evidenceClarity));

  // ==========================================
  // 2. Scope Simplicity (0..20)
  // ==========================================
  let scopeSimplicity = 0;
  const cat = String(finding.category || 'health').toLowerCase();

  // File count footprint
  const filesCount = context?.filesCount ?? 1;
  if (filesCount <= 1) {
    scopeSimplicity += 10;
    reasons.push('The expected change is bounded to a single file.');
  } else if (filesCount <= 3) {
    scopeSimplicity += 5;
  } else {
    blockers.push('Fix spans across multiple files requiring synchronized changes.');
  }

  // Type of change
  if (cat === 'repository-health' || cat === 'health') {
    scopeSimplicity += 10;
    reasons.push('Adding or refining documentation/governance is a low-blast-radius contribution.');
  } else if (cat === 'actions' || cat === 'github-actions') {
    scopeSimplicity += 8;
    reasons.push('The change involves workflow YAML configuration without altering application runtime.');
  } else if (cat === 'dependency') {
    scopeSimplicity += 7;
    reasons.push('The change is a dependency version bump in package manifests.');
  } else if (cat === 'secret') {
    scopeSimplicity += 2;
    blockers.push('Secret rotation requires production infrastructure privileges and Git history sanitization.');
  } else {
    scopeSimplicity += 5;
  }

  scopeSimplicity = Math.min(20, Math.max(0, scopeSimplicity));

  // ==========================================
  // 3. Testability (0..20)
  // ==========================================
  let testability = 0;

  if (cat === 'repository-health' || cat === 'health') {
    testability += 20; // Verified by file presence / markdown lint
    reasons.push('The fix can be checked immediately by verifying file creation and syntax.');
  } else if (cat === 'actions' || cat === 'github-actions') {
    testability += 16; // Verified by action-lint or dry-run workflow check
    reasons.push('Workflow YAML syntax can be validated locally with standard linters.');
  } else if (cat === 'dependency') {
    testability += 15; // Verified by npm test / audit / pip check
    reasons.push('Dependency updates can be verified with local build and test commands.');
  } else if (cat === 'secret') {
    testability += 4;
    blockers.push('Credential revocation cannot be verified locally without production secrets.');
  } else {
    testability += 10;
  }

  if (context?.hasTestFiles === false) {
    testability = Math.max(4, testability - 4);
    blockers.push('No reliable automated test suite was detected in the repository.');
  }

  testability = Math.min(20, Math.max(0, testability));

  // ==========================================
  // 4. Skill Accessibility (0..20)
  // ==========================================
  let skillAccessibility = 0;

  if (cat === 'repository-health' || cat === 'health') {
    skillAccessibility = 20;
    reasons.push('Requires accessible skills: Markdown, open-source governance, and git commit hygiene.');
  } else if (cat === 'dependency') {
    skillAccessibility = 17;
    reasons.push('Requires package management skills (npm/pip) and understanding semantic versioning.');
  } else if (cat === 'actions' || cat === 'github-actions') {
    if (finding.ruleId?.includes('UNPINNED')) {
      skillAccessibility = 16; // Pinning SHA is beginner-friendly
      reasons.push('Pinning actions to commit SHAs is well-documented and beginner-friendly.');
    } else {
      skillAccessibility = 11;
      reasons.push('Requires intermediate understanding of GitHub Actions permission scopes.');
    }
  } else if (cat === 'secret') {
    skillAccessibility = 4;
    reasons.push('The task requires advanced knowledge of secret rotation and git filter-repo.');
  } else {
    skillAccessibility = 10;
  }

  skillAccessibility = Math.min(20, Math.max(0, skillAccessibility));

  // ==========================================
  // 5. Context Completeness (0..15)
  // ==========================================
  let contextCompleteness = 0;

  if (finding.fixHint && finding.fixHint.trim().length > 10) {
    contextCompleteness += 5;
    reasons.push('Actionable remediation guidance is available in the finding context.');
  }

  if (hasFile) {
    contextCompleteness += 4;
  }

  if (finding.impact && finding.impact.trim().length > 10) {
    contextCompleteness += 3;
  }

  if (finding.confidence && (finding.confidence === 'HIGH' || (typeof finding.confidence === 'number' && finding.confidence >= 0.8))) {
    contextCompleteness += 3;
  }

  // Strict Disclosure Guard Penalty:
  // Secret and security-disclosure findings cannot follow standard public contribution routes!
  if (
    finding.disclosureMode === 'security-disclosure' ||
    finding.disclosureMode === 'DISCLOSURE_BLOCKED' ||
    cat === 'secret' ||
    (String(finding.severity).toUpperCase() === 'CRITICAL' && (finding.impact?.toLowerCase().includes('rce') || finding.impact?.toLowerCase().includes('secret')))
  ) {
    contextCompleteness = Math.max(0, contextCompleteness - 10);
    blockers.push('Public contribution route blocked under Safe Disclosure Policy (private maintainer notification required).');
  }

  contextCompleteness = Math.min(15, Math.max(0, contextCompleteness));

  // ==========================================
  // Total Score Calculation (Clamped 0..100)
  // ==========================================
  let rawTotal = evidenceClarity + scopeSimplicity + testability + skillAccessibility + contextCompleteness;

  // Penalize secret findings so they NEVER masquerade as beginner-friendly
  if (cat === 'secret' || finding.disclosureMode === 'security-disclosure' || finding.disclosureMode === 'DISCLOSURE_BLOCKED') {
    rawTotal = Math.min(35, rawTotal); // Capped at maintainer-assistance
  }

  // Defensive clamping against NaN, Infinity, negative values
  if (Number.isNaN(rawTotal) || !Number.isFinite(rawTotal)) {
    rawTotal = 30;
  }
  const total = Math.max(0, Math.min(100, Math.round(rawTotal)));

  // Determine Label & Difficulty
  let label: ReadinessLabel;
  let difficulty: 'beginner' | 'intermediate' | 'advanced';
  let estimatedMinutes: number | null;

  if (total >= 80) {
    label = 'good-first-contribution';
    difficulty = 'beginner';
    estimatedMinutes = 20;
  } else if (total >= 60) {
    label = 'beginner-friendly';
    difficulty = 'beginner';
    estimatedMinutes = 30;
  } else if (total >= 40) {
    label = 'intermediate';
    difficulty = 'intermediate';
    estimatedMinutes = 45;
  } else {
    label = 'maintainer-assistance';
    difficulty = 'advanced';
    estimatedMinutes = 90;
  }

  const docClarity = Math.min(20, Math.round((evidenceClarity / 25) * 20));
  const testAvail = Math.min(20, testability);
  const ciAuto = Math.min(20, Math.round((contextCompleteness / 15) * 20));
  const depFresh = Math.min(20, scopeSimplicity);
  const secGov = Math.min(20, skillAccessibility);

  return {
    total,
    label,
    evidenceClarity,
    scopeSimplicity,
    testability,
    skillAccessibility,
    contextCompleteness,
    documentationClarity: docClarity,
    testAvailability: testAvail,
    ciAutomation: ciAuto,
    dependencyFreshness: depFresh,
    securityGovernance: secGov,
    reasons: Array.from(new Set(reasons)),
    blockers: Array.from(new Set(blockers)),
    estimatedMinutes,
    difficulty,
    calculatedBy: 'deterministic-rule-engine',
    calculatorVersion: CALCULATOR_VERSION,
  };
}

/**
 * Triages a finding into separate Urgency and Contribution Readiness values.
 */
export function triageFinding(
  finding: Finding,
  context?: ReadinessContext
): FindingTriage {
  const { urgencyScore, urgencyLabel } = calculateUrgency(finding);
  const readiness = calculateContributionReadiness(finding, context);

  return {
    findingId: finding.id,
    urgencyScore,
    urgencyLabel,
    readiness,
  };
}
