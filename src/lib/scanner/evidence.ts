/**
 * ContribLens Evidence Normalizer & Schema Contracts
 * 
 * Normalizes all scanner findings into the unified FindingEvidence contract:
 * Code verifies → evidence schema → Gemini explains → validator accepts/rejects
 */

import { createHash } from 'crypto';
import { computeEvidenceHash, redactSecrets } from '../redaction.ts';
import type {
  FindingEvidence,
  FindingCategory,
  Severity,
  DisclosureMode,
  TechnologySnapshot,
  TechStack,
  LearningResource,
} from '../../types.ts';

function getDefaultSkills(category: FindingCategory, ruleId: string): string[] {
  const normRule = (ruleId || '').toUpperCase();
  if (normRule === 'GH-ACTIONS-WRITE-ALL') {
    return ['GitHub Actions', 'YAML', 'Principle of least privilege'];
  }
  if (normRule === 'GH-ACTIONS-UNPINNED') {
    return ['GitHub Actions', 'Supply-chain security'];
  }
  if (normRule === 'GH-ACTIONS-MISSING-PERMISSIONS') {
    return ['GitHub Actions', 'Principle of least privilege', 'Token Security'];
  }
  if (normRule === 'GH-ACTIONS-PULL-REQUEST-TARGET') {
    return ['GitHub Actions', 'CI/CD Security', 'Event Triggers'];
  }
  if (normRule === 'GH-ACTIONS-CURL-PIPE-SHELL') {
    return ['Shell Scripting', 'Supply-chain security', 'Integrity Verification'];
  }
  if (normRule === 'REPO-MISSING-LICENSE') {
    return ['Licensing', 'Open source'];
  }
  if (normRule === 'REPO-MISSING-SECURITY') {
    return ['Security policy', 'Responsible disclosure'];
  }
  if (normRule === 'REPO-MISSING-CONTRIBUTING') {
    return ['Contribution guidelines', 'Open source governance'];
  }
  if (normRule === 'REPO-WEAK-README') {
    return ['Technical writing', 'Markdown'];
  }
  if (normRule === 'REPO-NO-TEST-SIGNAL') {
    return ['Testing', 'Continuous Integration'];
  }

  if (category === 'github-actions' || category === 'actions') {
    return ['GitHub Actions', 'YAML Configuration', 'CI/CD Security'];
  }
  if (category === 'dependency') {
    return ['Dependency Management', 'SemVer', 'Vulnerability Remediation'];
  }
  if (category === 'secret') {
    return ['Secrets Management', 'Git Hygiene', 'Environment Variables'];
  }
  return ['Open Source Governance', 'Documentation', 'Git Hygiene'];
}

function getDefaultLearningResources(category: FindingCategory, ruleId: string): LearningResource[] {
  const normRule = (ruleId || '').toUpperCase();

  if (normRule === 'GH-ACTIONS-WRITE-ALL') {
    return [
      {
        title: 'GitHub Actions: Workflow syntax and least privilege',
        url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#assigning-permissions-to-jobs',
        provider: 'docs',
      },
      {
        title: 'Understanding Least Privilege Security',
        url: 'https://developer.mozilla.org/en-US/docs/Web/Security',
        provider: 'MDN',
      },
    ];
  }

  if (normRule === 'GH-ACTIONS-UNPINNED') {
    return [
      {
        title: 'Security hardening for GitHub Actions: Using third-party actions',
        url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions#using-third-party-actions',
        provider: 'docs',
      },
      {
        title: 'Software Supply Chain Security Guide',
        url: 'https://www.freecodecamp.org/news/software-supply-chain-security-guide/',
        provider: 'freeCodeCamp',
      },
      {
        title: 'Pinning Actions to SHA Best Practices',
        url: 'https://www.youtube.com/watch?v=R8_veQiYBlo',
        provider: 'youtube',
      },
    ];
  }

  if (normRule === 'GH-ACTIONS-MISSING-PERMISSIONS') {
    return [
      {
        title: 'Automatic token authentication in GitHub Actions',
        url: 'https://docs.github.com/en/actions/security-guides/automatic-token-authentication#modifying-the-permissions-for-the-github_token',
        provider: 'docs',
      },
      {
        title: 'GitHub Actions Permissions Tutorial',
        url: 'https://www.freecodecamp.org/news/how-to-build-a-cicd-pipeline-with-github-actions-and-security/',
        provider: 'freeCodeCamp',
      },
    ];
  }

  if (normRule === 'GH-ACTIONS-PULL-REQUEST-TARGET') {
    return [
      {
        title: 'Keeping GitHub Actions workflows secure: Preventing pwn requests',
        url: 'https://securitylab.github.com/research/github-actions-preventing-pwn-requests/',
        provider: 'docs',
      },
      {
        title: 'Securing pull_request_target Triggers',
        url: 'https://www.youtube.com/watch?v=7M0fMhN1Yrs',
        provider: 'youtube',
      },
    ];
  }

  if (normRule === 'GH-ACTIONS-CURL-PIPE-SHELL') {
    return [
      {
        title: 'Defending against remote shell piping in CI/CD',
        url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions',
        provider: 'docs',
      },
      {
        title: 'Command Line Security and Verification',
        url: 'https://developer.mozilla.org/en-US/docs/Web/Security',
        provider: 'MDN',
      },
    ];
  }

  if (normRule === 'REPO-MISSING-LICENSE') {
    return [
      {
        title: 'Choose an Open Source License',
        url: 'https://choosealicense.com/',
        provider: 'docs',
      },
      {
        title: 'Open Source Licenses Explained',
        url: 'https://www.freecodecamp.org/news/open-source-licenses-explained-mit-apache-gpl/',
        provider: 'freeCodeCamp',
      },
    ];
  }

  if (normRule === 'REPO-MISSING-SECURITY') {
    return [
      {
        title: 'Adding a security policy to your repository',
        url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
        provider: 'docs',
      },
      {
        title: 'Open Source Security Policy Best Practices',
        url: 'https://www.freecodecamp.org/news/how-to-secure-your-open-source-projects/',
        provider: 'freeCodeCamp',
      },
    ];
  }

  if (normRule === 'REPO-MISSING-CONTRIBUTING') {
    return [
      {
        title: 'Setting up your project for healthy contributions',
        url: 'https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/setting-guidelines-for-repository-contributors',
        provider: 'docs',
      },
      {
        title: 'How to Write a Great CONTRIBUTING.md',
        url: 'https://www.freecodecamp.org/news/how-to-write-a-contributing-guide/',
        provider: 'freeCodeCamp',
      },
    ];
  }

  if (normRule === 'REPO-WEAK-README') {
    return [
      {
        title: 'How to write a Good README file',
        url: 'https://www.freecodecamp.org/news/how-to-write-a-good-readme-file/',
        provider: 'freeCodeCamp',
      },
      {
        title: 'Markdown Guide: Basic Syntax',
        url: 'https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Howto/Markdown_in_MDN',
        provider: 'MDN',
      },
    ];
  }

  if (normRule === 'REPO-NO-TEST-SIGNAL') {
    return [
      {
        title: 'Automated Testing Fundamentals',
        url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Testing',
        provider: 'MDN',
      },
      {
        title: 'JavaScript & Node.js Testing Best Practices',
        url: 'https://www.freecodecamp.org/news/testing-in-javascript-best-practices/',
        provider: 'freeCodeCamp',
      },
    ];
  }

  if (category === 'github-actions' || category === 'actions') {
    return [
      {
        title: 'GitHub Actions Security Hardening',
        url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions',
        provider: 'docs',
      },
      {
        title: 'CI/CD Pipeline Security Concepts',
        url: 'https://www.freecodecamp.org/news/how-to-build-a-cicd-pipeline-with-github-actions-and-security/',
        provider: 'freeCodeCamp',
      },
    ];
  }
  if (category === 'dependency') {
    return [
      {
        title: 'Understanding Semantic Versioning',
        url: 'https://docs.npmjs.com/about-semantic-versioning',
        provider: 'docs',
      },
      {
        title: 'Managing Open Source Dependency Vulnerabilities',
        url: 'https://www.freecodecamp.org/news/managing-dependencies-and-security-vulnerabilities/',
        provider: 'freeCodeCamp',
      },
    ];
  }
  if (category === 'secret') {
    return [
      {
        title: 'Best Practices for Secrets Management',
        url: 'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning',
        provider: 'docs',
      },
      {
        title: 'Removing sensitive data from a repository',
        url: 'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository',
        provider: 'docs',
      },
    ];
  }
  return [
    {
      title: 'Open Source Guides: Best Practices for Community Repositories',
      url: 'https://opensource.guide/',
      provider: 'docs',
    },
  ];
}

function getDefaultContributorImpact(category: FindingCategory, ruleId: string): number {
  const normRule = (ruleId || '').toUpperCase();
  if (normRule === 'GH-ACTIONS-PULL-REQUEST-TARGET') return 35;
  if (normRule === 'GH-ACTIONS-CURL-PIPE-SHELL') return 30;
  if (normRule === 'GH-ACTIONS-WRITE-ALL') return 25;
  if (normRule === 'GH-ACTIONS-UNPINNED') return 20;
  if (normRule === 'GH-ACTIONS-MISSING-PERMISSIONS') return 15;
  if (normRule === 'REPO-NO-TEST-SIGNAL') return 20;
  if (normRule === 'REPO-MISSING-LICENSE') return 15;
  if (normRule === 'REPO-MISSING-SECURITY') return 15;
  if (normRule === 'REPO-MISSING-CONTRIBUTING') return 15;
  if (normRule === 'REPO-WEAK-README') return 10;
  if (category === 'secret') return 30;
  if (category === 'dependency') return 25;
  return 15;
}

export function createFindingEvidence(params: {
  scanId: string;
  category: FindingCategory;
  ruleId: string;
  title: string;
  severity: Severity;
  confidence: number | 'HIGH' | 'MEDIUM' | 'LOW';
  sourceTool: string;
  file: string | null;
  lineStart?: number | null;
  lineEnd?: number | null;
  evidence: string;
  impact: string;
  fixHint: string;
  disclosureMode?: DisclosureMode;
  redacted?: boolean;
  skills?: string[];
  learningResources?: LearningResource[];
  contributorLevelImpact?: number;
  fingerprint?: string;
}): FindingEvidence {
  // Normalize confidence (0..1)
  let numConfidence = 0.85;
  if (typeof params.confidence === 'number') {
    numConfidence = Math.max(0, Math.min(1, params.confidence));
  } else if (params.confidence === 'HIGH') {
    numConfidence = 0.95;
  } else if (params.confidence === 'MEDIUM') {
    numConfidence = 0.75;
  } else if (params.confidence === 'LOW') {
    numConfidence = 0.5;
  }

  // Determine disclosure mode
  let disclosureMode: DisclosureMode = 'maintainer-review';
  if (params.category === 'secret') {
    disclosureMode = 'security-disclosure';
  } else if (params.category === 'repository-health' || params.category === 'health') {
    disclosureMode = 'public-issue';
  }
  if (params.disclosureMode) {
    disclosureMode = params.disclosureMode;
  }

  const isRedacted = params.redacted ?? (params.category === 'secret');
  const safeEvidence = redactSecrets((params.evidence || '').trim());
  const evidenceHash = computeEvidenceHash(safeEvidence);

  // Stable ID across repeated scans for identical rule and file location
  const fileClean = params.file ? params.file.replace(/[^a-zA-Z0-9_-]/g, '_') : 'root';
  const lineClean = params.lineStart ? `_L${params.lineStart}` : '';
  const id = `fnd_${params.ruleId}_${fileClean}${lineClean}`.slice(0, 80);

  const skills = params.skills ?? getDefaultSkills(params.category, params.ruleId);
  const learningResources = params.learningResources ?? getDefaultLearningResources(params.category, params.ruleId);
  const contributorLevelImpact = params.contributorLevelImpact ?? getDefaultContributorImpact(params.category, params.ruleId);

  // Stable diff key: sha256(rule_id + normalized_path + normalized evidence core)
  const normRule = (params.ruleId || 'GENERIC').trim().toLowerCase();
  const normFile = (params.file || 'root').trim().toLowerCase();
  const normLine = params.lineStart || 0;
  const rawCore = `${normRule}|${normFile}|${normLine}|${safeEvidence.replace(/\s+/g, ' ')}`;
  const defaultFingerprint = createHash('sha256').update(rawCore).digest('hex').substring(0, 24);
  const fingerprint = params.fingerprint ?? defaultFingerprint;

  return {
    id,
    scanId: params.scanId,
    category: params.category,
    ruleId: params.ruleId,
    title: params.title,
    severity: params.severity,
    confidence: numConfidence,
    sourceTool: params.sourceTool,
    file: params.file,
    lineStart: params.lineStart ?? null,
    lineEnd: params.lineEnd ?? params.lineStart ?? null,
    evidence: safeEvidence,
    impact: params.impact,
    fixHint: params.fixHint,
    skills,
    learningResources,
    contributorLevelImpact,
    disclosureMode,
    redacted: isRedacted,
    evidenceHash,
    fingerprint,
    createdAt: new Date().toISOString(),
    // Backward compatibility aliases
    line: params.lineStart ?? undefined,
    redactedEvidence: safeEvidence,
  };
}

export function convertToTechnologySnapshot(techStack: TechStack): TechnologySnapshot {
  return {
    languages: techStack.languages.map((l) => ({
      name: l.name,
      confidence: l.confidence ?? (l.percentage > 30 ? 0.95 : 0.75),
      sources: l.sources && l.sources.length > 0 ? l.sources : [`${l.filesCount} detected source files`],
    })),
    frameworks: techStack.frameworks.map((f) => ({
      name: f.name,
      confidence: f.confidence ?? 0.9,
      sources: f.sources && f.sources.length > 0 ? f.sources : ['Detected dependency/config'],
    })),
    tooling: techStack.tooling.map((t) => ({
      name: t.name,
      confidence: t.confidence ?? 0.9,
      sources: t.sources && t.sources.length > 0 ? t.sources : ['Detected configuration file'],
    })),
    manifests: techStack.manifests.map((m) => {
      let type: any = 'other';
      if (m.path.endsWith('package.json')) type = 'package.json';
      else if (m.path.endsWith('package-lock.json')) type = 'package-lock.json';
      else if (m.path.endsWith('yarn.lock')) type = 'yarn.lock';
      else if (m.path.endsWith('pnpm-lock.yaml')) type = 'pnpm-lock.yaml';
      else if (m.path.endsWith('requirements.txt')) type = 'requirements.txt';
      else if (m.path.endsWith('pyproject.toml')) type = 'pyproject.toml';
      else if (m.path.includes('.github/workflows')) type = 'workflow';

      return {
        type,
        file: m.path,
        present: true,
      };
    }),
  };
}
