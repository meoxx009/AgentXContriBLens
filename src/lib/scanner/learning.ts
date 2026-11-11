/**
 * ContribLens Skill Gap, Learning Mode & Contribution Pack Engine
 * 
 * Invariants:
 * 1. Generates actionable learning checklists (skill, level, why needed, estimated minutes).
 * 2. Generates 3 grounded explanation depths (Beginner, Developer, Maintainer).
 * 3. Generates complete, fully-redacted Contribution Pack markdown exports with zero secrets.
 */

import { redactSecrets } from '../redaction.ts';
import type {
  Finding,
  ContributionRoute,
  ScanSummary,
  ContributionReadiness,
  EvidenceChain,
  SkillGapItem,
  ExplanationModes,
} from '../../types.ts';

/**
 * Generates tailored Skill Gap checklist items for a contribution route.
 */
export function generateSkillChecklist(
  finding: Finding,
  route: ContributionRoute
): SkillGapItem[] {
  const cat = String(finding.category || 'health').toLowerCase();
  const ruleId = (finding.ruleId || '').toUpperCase();
  const items: SkillGapItem[] = [];

  if (cat === 'actions' || cat === 'github-actions') {
    items.push({
      id: 'skill-yaml-syntax',
      concept: 'GitHub Actions Workflow YAML',
      level: 'beginner',
      whyNeeded: 'CI/CD workflows use indentation-sensitive YAML syntax and event trigger blocks.',
      estimatedMinutes: 15,
      completed: false,
    });

    if (ruleId.includes('UNPINNED')) {
      items.push({
        id: 'skill-sha-pinning',
        concept: 'Immutable Commit SHA Pinning',
        level: 'beginner',
        whyNeeded: 'Prevents supply-chain tag-hijacking by referencing the 40-character Git commit hash.',
        estimatedMinutes: 10,
        completed: false,
      });
    } else {
      items.push({
        id: 'skill-actions-perms',
        concept: 'Least-Privilege Workflow Permissions',
        level: 'intermediate',
        whyNeeded: 'Configures restricted GITHUB_TOKEN permissions (e.g. read-only permissions block).',
        estimatedMinutes: 20,
        completed: false,
      });
    }

    items.push({
      id: 'skill-workflow-linting',
      concept: 'Workflow Syntax Verification',
      level: 'beginner',
      whyNeeded: 'Verifies YAML formatting and schema validity locally before submitting a pull request.',
      estimatedMinutes: 15,
      completed: false,
    });
  } else if (cat === 'dependency') {
    items.push({
      id: 'skill-semver',
      concept: 'Semantic Versioning (SemVer)',
      level: 'beginner',
      whyNeeded: 'Understanding major, minor, and patch version ranges prevents breaking application dependencies.',
      estimatedMinutes: 15,
      completed: false,
    });

    items.push({
      id: 'skill-pkg-update',
      concept: 'Manifest & Lockfile Synchronization',
      level: 'beginner',
      whyNeeded: 'Updating package.json or requirements.txt requires matching lockfile regeneration (package-lock.json).',
      estimatedMinutes: 20,
      completed: false,
    });

    items.push({
      id: 'skill-regression-testing',
      concept: 'Local Test Execution',
      level: 'beginner',
      whyNeeded: 'Running test suites locally verifies that dependency upgrades do not introduce breaking regressions.',
      estimatedMinutes: 15,
      completed: false,
    });
  } else if (cat === 'secret') {
    items.push({
      id: 'skill-secret-revocation',
      concept: 'Responsible Credential Invalidation',
      level: 'advanced',
      whyNeeded: 'Revoking leaked credentials at the provider dashboard stops ongoing security exposure immediately.',
      estimatedMinutes: 30,
      completed: false,
    });

    items.push({
      id: 'skill-git-history-scrub',
      concept: 'Git History Sanitization (git-filter-repo)',
      level: 'advanced',
      whyNeeded: 'Committing an overwrite does not remove credentials from Git commit history.',
      estimatedMinutes: 45,
      completed: false,
    });
  } else if (
    finding.ruleId === 'REPO-NO-TEST-SIGNAL' ||
    (!finding.file && (finding.title?.toLowerCase().includes('test') || (cat === 'repository-health' && finding.title?.toLowerCase().includes('test'))))
  ) {
    items.push({
      id: 'skill-test-framework-setup',
      concept: 'Automated Test Runner Configuration',
      level: 'intermediate',
      whyNeeded: 'Configures a standard test directory (tests/ or spec/) and automated runner script (npm test or pytest) for regression testing.',
      estimatedMinutes: 25,
      completed: false,
    });

    items.push({
      id: 'skill-ci-test-workflow',
      concept: 'Continuous Integration Test Automation',
      level: 'intermediate',
      whyNeeded: 'Automates test execution on pull requests via GitHub Actions workflows to protect repository stability.',
      estimatedMinutes: 20,
      completed: false,
    });
  } else {
    // Health / Documentation / Community Governance
    items.push({
      id: 'skill-markdown-guidelines',
      concept: 'Open-Source Governance & Technical Writing',
      level: 'beginner',
      whyNeeded: 'Repository documentation must be clear, concise, and adhere to community formatting standards.',
      estimatedMinutes: 15,
      completed: false,
    });

    items.push({
      id: 'skill-git-hygiene',
      concept: 'Clean Commit & Branch Practices',
      level: 'beginner',
      whyNeeded: 'Creating focused git branches and atomic commit messages makes maintainer review easy.',
      estimatedMinutes: 15,
      completed: false,
    });
  }

  return items;
}

/**
 * Generates 3 explanation depths: Beginner, Developer, and Maintainer.
 * All 3 modes are grounded in the exact same evidence.
 */
export function generateExplanationModes(
  finding: Finding,
  route: ContributionRoute
): ExplanationModes {
  const isTestSignal =
    finding.ruleId === 'REPO-NO-TEST-SIGNAL' ||
    (!finding.file && (finding.title?.toLowerCase().includes('test') || (finding.category === 'repository-health' && finding.title?.toLowerCase().includes('test'))));

  const locationLabel = finding.file
    ? `file \`${finding.file}\``
    : isTestSignal
    ? '`Repository Root (Test Suite Configuration)`'
    : '`Repository Root (Configuration)`';

  const title = finding.title;

  const beginnerText =
    route.whatHappened && route.whyItMatters && route.howToFix
      ? `${route.whatHappened} ${route.whyItMatters} ${route.howToFix}`
      : `This finding identifies "${title}" in ${locationLabel}. In open-source software, addressing this prevents security issues and ensures the repository follows best practices. As a contributor, you will inspect the target area, apply the suggested fix, and verify it locally before proposing the change to maintainers.`;

  return {
    beginner: beginnerText,
    developer: `Static analysis detected \`${finding.ruleId || 'SECURITY-RULE'}\` in ${locationLabel} with deterministic severity **${finding.severity}**. The fix requires updating the configuration or manifest per ${finding.fixHint || 'standards'}, validating changes locally, and submitting an atomic PR without altering unrelated code.`,
    maintainer: `Hygiene finding: **${finding.severity}** severity risk in ${locationLabel}. Impact: ${finding.impact || 'Security posture risk'}. A community contribution route has been structured with verifiable test plans and acceptance criteria to ensure zero operational regression.`,
  };
}

/**
 * Generates the complete, self-contained Markdown Contribution Pack.
 * Safe for offline download with zero secrets.
 */
export function generateContributionPackMarkdown(
  route: ContributionRoute,
  finding: Finding,
  scan: ScanSummary,
  readiness: ContributionReadiness,
  evidenceChain: EvidenceChain,
  learningChecklist: SkillGapItem[],
  draftMarkdown?: string
): string {
  const safeEvidence = redactSecrets(finding.evidence || finding.redactedEvidence || 'Deterministic static match.');
  const file = finding.file || 'Repository Root';

  const rawTestPlans = Array.isArray(route.testPlan)
    ? route.testPlan
    : typeof route.testPlan === 'string'
    ? [route.testPlan]
    : ['Run existing unit tests or linter checks matching target file extension.'];

  const rawAcceptanceList = Array.isArray(route.acceptanceCriteria)
    ? route.acceptanceCriteria
    : typeof route.acceptanceCriteria === 'string'
    ? [route.acceptanceCriteria]
    : ['All tests and lint checks pass cleanly.', 'No unrelated files modified.'];

  const testPlans = rawTestPlans
    .filter(Boolean)
    .map((t) => t.replace(/\(null\)/g, '(configuration)'));

  const acceptanceList = rawAcceptanceList
    .filter(Boolean)
    .map((c) => c.replace(/\(null\)/g, '(configuration)'));

  const filesList = Array.isArray(route.files)
    ? route.files
    : typeof route.files === 'string'
    ? [route.files]
    : [file];

  return `# ContribLens OSS — Contribution Pack
**Repository:** \`${scan.repoName}\` (${scan.branch})
**Generated At:** ${new Date().toISOString()}
**Contribution Task:** Fix ${finding.title}
**Target File:** \`${file}\`${finding.lineStart ? ` (Line: ${finding.lineStart})` : ''}

---

## 1. Finding Overview & Triage
- **Finding Title:** ${finding.title}
- **Category:** ${finding.category.toUpperCase()}
- **Deterministic Severity:** **${finding.severity}** (owned strictly by code/rules)
- **Urgency Level:** **${route.urgencyLabel ? route.urgencyLabel.toUpperCase() : 'MEDIUM'}** (Score: ${route.urgencyScore ?? 50}/100)
- **Contribution Readiness Score:** **${readiness.total}/100** (${(readiness.label || 'intermediate').toUpperCase()})
- **Recommended Difficulty:** ${(readiness.difficulty || 'beginner').toUpperCase()}
- **Estimated Effort:** ${readiness.estimatedMinutes ?? 30} minutes

### Readiness Breakdown
- **Evidence Clarity:** ${readiness.evidenceClarity ?? 20}/25
- **Scope Simplicity:** ${readiness.scopeSimplicity ?? 15}/20
- **Testability:** ${readiness.testability ?? 15}/20
- **Skill Accessibility:** ${readiness.skillAccessibility ?? 15}/20
- **Context Completeness:** ${readiness.contextCompleteness ?? 10}/15

### Why This is ${(readiness.label || 'intermediate').replace(/-/g, ' ')}:
${(readiness.reasons || []).map((r) => `- ${r}`).join('\n')}

${(readiness.blockers && readiness.blockers.length > 0) ? `### Known Blockers / Caution Notes:\n${readiness.blockers.map((b) => `- ⚠️ ${b}`).join('\n')}\n` : ''}
---

## 2. Evidence Chain & Trust Trail
${evidenceChain.steps
  .map(
    (s) =>
      `**Step ${s.step}: ${s.label}** [${s.verifiedBy.toUpperCase()}]\n${s.detail}`
  )
  .join('\n\n')}

### Verified Code Evidence (Redacted)
\`\`\`text
${safeEvidence}
\`\`\`

---

## 3. Skill Gap & Learning Checklist
Before starting your pull request, review these key concepts:

${learningChecklist
  .map(
    (item) =>
      `- [${item.completed ? 'x' : ' '}] **${item.concept}** (${item.level.toUpperCase()} • ~${item.estimatedMinutes} mins)\n  *Why needed:* ${item.whyNeeded}`
  )
  .join('\n')}

---

## 4. Implementation Guidance
- **Suggested Change:**
  ${finding.fixHint || 'Update the configuration following repository standards.'}

- **Files to Inspect:**
  ${filesList.map((f) => `- \`${f}\``).join('\n')}

- **Verification & Test Plan:**
  ${testPlans.map((t) => `- [ ] ${t}`).join('\n')}

- **Acceptance Criteria:**
  ${acceptanceList.map((c) => `- [ ] ${c}`).join('\n')}

---

## 5. Maintainer-Reviewable Issue Draft
${
  draftMarkdown ||
  `### 1. Problem Description\nA static analysis finding was verified in file \`${file}\`.\n\n### 2. Evidence\n\`\`\`text\n${safeEvidence}\n\`\`\`\n\n### 3. Security & Operational Impact\n${finding.impact}\n\n### 4. Proposed Solution\n${finding.fixHint}\n\n### 5. Verification & Test Plan\n${testPlans.map((t) => `- [ ] ${t}`).join('\n')}\n\n### 6. Contributor Readiness & Checklist\n- **Readiness:** ${readiness.total}/100\n- **Target File:** \`${file}\`\n\n### 7. Maintainer Review Note\n> **Maintainer Notice:** Unreviewed draft generated by an open-source contributor using ContribLens OSS. Not maintainer-approved • Never auto-published.`
}

---

## 6. Safety & Human Approval Notice
> **Important:** ContribLens OSS operates under the core invariant: **Code verifies. Gemma 4 explains. Human approves.**
> This contribution pack is an educational resource. Pull requests and issues must be reviewed and submitted manually. Never publish automated or unreviewed issues.
`;
}
