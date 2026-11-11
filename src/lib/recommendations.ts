/**
 * ContribLens Deterministic Recommendation Engine
 * 
 * Invariants:
 * 1. Pure, deterministic recommendation scoring (no AI, no network, no paid dependencies).
 * 2. Recommendations are explainable: Score = severity weight + readiness contribution + beginner-effort bonus.
 * 3. Never call anything "secure" and never invent facts — reasons derive only from rule metadata.
 * 4. Safe Disclosure Guard: secret/private-disclosure findings require maintainer assistance.
 */

import type { Finding, ContributionRoute, ScanSummary, Severity } from '../types.ts';
import { calculateContributionReadiness } from './scanner/readiness.ts';

export type RecommendationPriority = 'Fix this now' | 'Good next step' | 'Lower priority';

export interface RecommendationBreakdown {
  severityWeight: number;       // critical 40 / high 30 / medium 20 / low 10 / info 5
  readinessContribution: number; // 0..30
  beginnerBonus: number;        // beginner +15 / other 0
  effortBonus: number;          // short duration (<= 30 mins) +10 / other 0
}

export interface RecommendationItem {
  id: string;
  findingId?: string;
  routeId?: string;
  title: string;
  category: string;
  ruleId?: string;
  severity: Severity | string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  score: number;
  breakdown: RecommendationBreakdown;
  priorityLabel: RecommendationPriority;
  reason: string;               // ONE plain-English sentence
  learnSkill: string;           // Top skill
  learnUrl: string;             // First learning link
  targetUrl: string;            // Direct link to route or finding
  targetType: 'route' | 'finding';
  isPrivateDisclosure: boolean;
  targetFile?: string;
}

export interface NextStepsSummary {
  fixFirst: {
    title: string;
    reason: string;
    targetUrl: string;
    priorityLabel: RecommendationPriority;
  };
  learn: {
    skill: string;
    url: string;
    concept: string;
  };
  draft: {
    title: string;
    suggestion: string;
    targetUrl: string;
  };
}

/**
 * Maps finding severity to deterministic weight:
 * critical 40 / high 30 / medium 20 / low 10 / info 5
 */
export function getSeverityWeight(severity?: Severity | string): number {
  const sev = String(severity || 'LOW').toUpperCase();
  switch (sev) {
    case 'CRITICAL':
      return 40;
    case 'HIGH':
      return 30;
    case 'MEDIUM':
      return 20;
    case 'LOW':
      return 10;
    default:
      return 5;
  }
}

/**
 * Curated reference documentation links for top skills and categories.
 */
const SKILL_LEARNING_LINKS: Record<string, { url: string; concept: string }> = {
  'github actions': {
    url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions',
    concept: 'Hardening GitHub Actions workflows with least-privilege tokens and immutable commit SHA references',
  },
  'supply-chain security': {
    url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions',
    concept: 'Pinning third-party actions to immutable 40-character commit SHAs',
  },
  'principle of least privilege': {
    url: 'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
    concept: 'Restricting GITHUB_TOKEN permissions to read-only defaults',
  },
  'open-source governance': {
    url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
    concept: 'Adding community governance policies and coordinated vulnerability disclosure channels',
  },
  'vulnerability management': {
    url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
    concept: 'Managing responsible security disclosure via repository policies',
  },
  'secrets hygiene': {
    url: 'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning',
    concept: 'Revoking exposed credentials and sanitizing Git commit history',
  },
  'package management': {
    url: 'https://docs.github.com/en/code-security/dependabot',
    concept: 'Auditing and synchronizing package manifests and lockfiles to remediate known vulnerabilities',
  },
  'git & github': {
    url: 'https://docs.github.com/en/get-started',
    concept: 'Clean branching, atomic commits, and pull request workflows',
  },
};

/**
 * Returns the primary skill and learning documentation link for an item.
 */
export function getTopSkillAndLink(
  finding?: Finding,
  route?: ContributionRoute
): { skill: string; url: string; concept: string } {
  // 1. Check existing learningResources
  const customResource =
    route?.learningResources?.[0] || finding?.learningResources?.[0];
  const customSkill = route?.skills?.[0] || finding?.skills?.[0];

  if (customResource?.url && customSkill) {
    return {
      skill: customSkill,
      url: customResource.url,
      concept: customResource.title || `Learning ${customSkill}`,
    };
  }

  // 2. Derive from skill name
  if (customSkill) {
    const key = customSkill.toLowerCase();
    for (const [knownKey, data] of Object.entries(SKILL_LEARNING_LINKS)) {
      if (key.includes(knownKey) || knownKey.includes(key)) {
        return { skill: customSkill, url: data.url, concept: data.concept };
      }
    }
  }

  // 3. Fallback based on category & rule
  const cat = String(finding?.category || 'health').toLowerCase();
  const ruleId = (finding?.ruleId || '').toUpperCase();

  if (cat === 'actions' || cat === 'github-actions') {
    if (ruleId.includes('UNPINNED')) {
      return {
        skill: 'Supply-chain security',
        url: SKILL_LEARNING_LINKS['supply-chain security'].url,
        concept: SKILL_LEARNING_LINKS['supply-chain security'].concept,
      };
    }
    return {
      skill: 'GitHub Actions',
      url: SKILL_LEARNING_LINKS['github actions'].url,
      concept: SKILL_LEARNING_LINKS['github actions'].concept,
    };
  }

  if (cat === 'secret') {
    return {
      skill: 'Secrets hygiene',
      url: SKILL_LEARNING_LINKS['secrets hygiene'].url,
      concept: SKILL_LEARNING_LINKS['secrets hygiene'].concept,
    };
  }

  if (cat === 'dependency') {
    return {
      skill: 'Package management',
      url: SKILL_LEARNING_LINKS['package management'].url,
      concept: SKILL_LEARNING_LINKS['package management'].concept,
    };
  }

  return {
    skill: 'Open-source governance',
    url: SKILL_LEARNING_LINKS['open-source governance'].url,
    concept: SKILL_LEARNING_LINKS['open-source governance'].concept,
  };
}

/**
 * Synthesizes ONE plain-English reason sentence derived strictly from rule metadata.
 * Never calls anything "secure" and never invents facts.
 */
export function generateRecommendationReason(params: {
  ruleId?: string;
  category?: string;
  severity: Severity | string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
  isPrivateDisclosure: boolean;
  title: string;
}): string {
  const { ruleId = '', category = '', severity, difficulty, estimatedMinutes, isPrivateDisclosure } = params;
  const sev = String(severity).toUpperCase();
  const rule = ruleId.toUpperCase();
  const cat = category.toLowerCase();

  // Prefix based on impact & difficulty
  let prefix = '';
  if (isPrivateDisclosure || cat === 'secret') {
    prefix = 'Critical urgency requiring maintainer review — ';
  } else if ((sev === 'CRITICAL' || sev === 'HIGH') && difficulty === 'beginner') {
    prefix = 'Highest impact and easiest win — ';
  } else if (sev === 'HIGH') {
    prefix = 'High-impact contributor task — ';
  } else if (sev === 'MEDIUM' && difficulty === 'beginner') {
    prefix = 'Great first contribution — ';
  } else if (sev === 'LOW' && difficulty === 'beginner') {
    prefix = 'Quick hygiene improvement — ';
  } else if (difficulty === 'intermediate') {
    prefix = 'Solid next step — ';
  } else {
    prefix = 'Strategic maintenance item — ';
  }

  // Core action derived strictly from rule metadata
  let action = '';
  if (rule.includes('UNPINNED')) {
    action = 'pin this CI action to a commit SHA';
  } else if (rule.includes('WRITE-ALL') || rule.includes('PERMISSIONS')) {
    action = 'scope CI workflow permissions to minimum read privileges';
  } else if (rule.includes('MISSING-SECURITY') || (cat.includes('health') && params.title.includes('SECURITY.md'))) {
    action = 'add a responsible disclosure policy to SECURITY.md';
  } else if (rule.includes('MISSING-LICENSE') || (cat.includes('health') && params.title.includes('LICENSE'))) {
    action = 'add a standard open-source license file';
  } else if (rule.includes('NO-TEST-SIGNAL') || params.title.toLowerCase().includes('test')) {
    action = 'set up automated test scripts and CI verification';
  } else if (cat === 'secret' || rule.startsWith('SECRET-')) {
    action = 'revoke this exposed token and sanitize commit history';
  } else if (cat === 'dependency' || rule.startsWith('DEP-')) {
    action = 'update vulnerable dependency to a patched version';
  } else {
    action = `address ${params.title.toLowerCase().replace(/^repository lacks a\s*/i, 'missing ')}`;
  }

  const durationClause = estimatedMinutes > 0 ? `, about ${estimatedMinutes} minutes.` : '.';
  return `${prefix}${action}${durationClause}`;
}

/**
 * Evaluates and scores an open item (finding or route) deterministically:
 * Score = severity weight (40/30/20/10/5)
 *       + readiness total (0–30)
 *       + beginner-effort bonus (beginner +15, short duration <=30m +10).
 */
export function scoreRecommendationItem(
  finding: Finding,
  route?: ContributionRoute | null
): RecommendationItem {
  const isPrivateDisclosure =
    finding.disclosureMode === 'security-disclosure' ||
    finding.disclosureMode === 'DISCLOSURE_BLOCKED' ||
    finding.category === 'secret';

  // 1. Severity weight
  const severityWeight = getSeverityWeight(finding.severity);

  // 2. Readiness total (scaled 0..30)
  let rawReadinessTotal = 50;
  if (typeof route?.readinessScore === 'number') {
    rawReadinessTotal = route.readinessScore;
  } else if (finding.readiness?.total !== undefined) {
    rawReadinessTotal = finding.readiness.total;
  } else {
    const computed = calculateContributionReadiness(finding);
    rawReadinessTotal = computed.total;
  }
  const readinessContribution = Math.max(0, Math.min(30, Math.round((rawReadinessTotal / 100) * 30)));

  // 3. Difficulty and estimated minutes
  const difficulty: 'beginner' | 'intermediate' | 'advanced' =
    route?.difficulty ||
    finding.readiness?.difficulty ||
    (rawReadinessTotal >= 60 ? 'beginner' : rawReadinessTotal >= 40 ? 'intermediate' : 'advanced');

  let estimatedMinutes = 30;
  if (typeof route?.estimatedMinutes === 'number' && route.estimatedMinutes > 0) {
    estimatedMinutes = route.estimatedMinutes;
  } else if (typeof finding.readiness?.estimatedMinutes === 'number' && finding.readiness.estimatedMinutes > 0) {
    estimatedMinutes = finding.readiness.estimatedMinutes;
  } else if (difficulty === 'beginner') {
    estimatedMinutes = 20;
  } else if (difficulty === 'intermediate') {
    estimatedMinutes = 45;
  } else {
    estimatedMinutes = 60;
  }

  // 4. Beginner & short effort bonuses
  const beginnerBonus = difficulty === 'beginner' ? 15 : 0;
  const effortBonus = estimatedMinutes > 0 && estimatedMinutes <= 30 ? 10 : 0;

  // 5. Total Score
  let score = severityWeight + readinessContribution + beginnerBonus + effortBonus;

  // Secrets and private disclosures must not outrank safe public contributions
  if (isPrivateDisclosure) {
    score = Math.min(55, score);
  }

  // 6. Priority label
  let priorityLabel: RecommendationPriority = 'Lower priority';
  if (score >= 65) {
    priorityLabel = 'Fix this now';
  } else if (score >= 40) {
    priorityLabel = 'Good next step';
  }

  // 7. Title & file
  const title = route?.title || finding.title;
  const targetFile = route?.files?.[0] || finding.file || undefined;

  // 8. Reason sentence
  const reason = generateRecommendationReason({
    ruleId: finding.ruleId,
    category: finding.category,
    severity: finding.severity,
    difficulty,
    estimatedMinutes,
    isPrivateDisclosure,
    title,
  });

  // 9. Top skill & documentation link
  const { skill: learnSkill, url: learnUrl } = getTopSkillAndLink(finding, route || undefined);

  // 10. Direct link target
  const targetType: 'route' | 'finding' = route ? 'route' : 'finding';
  const targetUrl = route ? `/app/contributions/${route.id}` : `/app/findings/${finding.id}`;

  return {
    id: route ? route.id : finding.id,
    findingId: finding.id,
    routeId: route?.id,
    title,
    category: finding.category,
    ruleId: finding.ruleId,
    severity: finding.severity,
    difficulty,
    estimatedMinutes,
    score,
    breakdown: {
      severityWeight,
      readinessContribution,
      beginnerBonus,
      effortBonus,
    },
    priorityLabel,
    reason,
    learnSkill,
    learnUrl,
    targetUrl,
    targetType,
    isPrivateDisclosure,
    targetFile,
  };
}

/**
 * Computes ordered list of recommendations for the workspace.
 * 
 * Invariants:
 * - Empty findings/routes returns []
 * - Filters out completed routes and resolved findings
 * - Orders by score descending, with deterministic tie-breaking
 */
export function getRecommendations(input: {
  findings?: Finding[];
  routes?: ContributionRoute[];
  scans?: ScanSummary[];
}): RecommendationItem[] {
  const findings = input.findings || [];
  const routes = input.routes || [];

  if (findings.length === 0 && routes.length === 0) {
    return [];
  }

  const items: RecommendationItem[] = [];
  const processedFindingIds = new Set<string>();

  // 1. Process routes first (they have higher user intent / existing plan)
  for (const route of routes) {
    if (route.status === 'completed') {
      continue;
    }
    const matchingFinding = findings.find(
      (f) => (route.findingIds?.includes(f.id) || route.findingId === f.id) && f.status !== 'resolved'
    );

    if (matchingFinding) {
      processedFindingIds.add(matchingFinding.id);
      items.push(scoreRecommendationItem(matchingFinding, route));
    } else {
      // Synthesize minimal finding wrapper for standalone route
      const mockFinding: Finding = {
        id: route.findingIds?.[0] || route.findingId || `route-${route.id}`,
        scanId: route.scanId,
        category: 'actions',
        ruleId: 'GH-ACTIONS-WORKFLOW',
        title: route.title,
        severity: route.difficulty === 'advanced' ? 'critical' : route.difficulty === 'intermediate' ? 'medium' : 'high',
        confidence: 0.9,
        sourceTool: 'contriblens-rule-engine',
        file: route.files?.[0] || null,
        impact: route.summary,
        fixHint: route.suggestedChange,
        skills: route.skills,
        learningResources: route.learningResources || [],
        disclosureMode: 'public-issue',
        redacted: false,
        evidenceHash: 'deterministic',
        fingerprint: `route:${route.id}`,
        createdAt: new Date().toISOString(),
      };
      items.push(scoreRecommendationItem(mockFinding, route));
    }
  }

  // 2. Process remaining open findings
  for (const finding of findings) {
    if (processedFindingIds.has(finding.id) || finding.status === 'resolved') {
      continue;
    }
    items.push(scoreRecommendationItem(finding, null));
  }

  // 3. Sort descending by score, tie-breaking by severityWeight then estimatedMinutes
  return items.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    if (b.breakdown.severityWeight !== a.breakdown.severityWeight) {
      return b.breakdown.severityWeight - a.breakdown.severityWeight;
    }
    return a.estimatedMinutes - b.estimatedMinutes;
  });
}

/**
 * Generates the "Your next steps" 3-bullet breakdown for scan results:
 * 1. fixFirst: Top recommendation
 * 2. learn: Top skill + learning documentation link
 * 3. draft: Suggested maintainer issue draft
 */
export function getScanNextSteps(
  findings: Finding[],
  routes: ContributionRoute[] = []
): NextStepsSummary | null {
  const recommendations = getRecommendations({ findings, routes });
  if (recommendations.length === 0) {
    return null;
  }

  const topRec = recommendations[0];
  const { skill, url, concept } = getTopSkillAndLink(
    findings.find((f) => f.id === topRec.findingId),
    routes.find((r) => r.id === topRec.routeId)
  );

  return {
    fixFirst: {
      title: topRec.title,
      reason: topRec.reason,
      targetUrl: topRec.targetUrl,
      priorityLabel: topRec.priorityLabel,
    },
    learn: {
      skill,
      url,
      concept,
    },
    draft: {
      title: topRec.isPrivateDisclosure
        ? 'Maintainer Security Disclosure'
        : 'Maintainer Pull Request Draft',
      suggestion: topRec.isPrivateDisclosure
        ? 'Generate a private security report to coordinate with project maintainers.'
        : 'Generate an AI-grounded contribution route with acceptance criteria and a ready-to-copy PR draft.',
      targetUrl: topRec.targetUrl,
    },
  };
}
