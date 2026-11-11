/**
 * ContribLens Deterministic Explanations & Rule Dictionary
 * 
 * F4 Task 1 & 3:
 * Every explanation — AI or deterministic — reads like a friendly senior engineer
 * explaining to a beginner, in a consistent three-part structure:
 * - whatHappened: 1-2 plain sentences with jargon defined inline (define technical terms on first use)
 * - whyItMatters: 1-2 plain sentences on real-world security or operational impact
 * - howToFix: 1-2 plain sentences providing clear, beginner-friendly fix steps
 * 
 * Pure TypeScript — safe for both client and server runtime.
 */

export interface RuleExplanationTemplate {
  whatHappened: string;
  whyItMatters: string;
  howToFix: string;
}

export const RULE_CONCRETE_EXPLANATIONS: Record<string, RuleExplanationTemplate> = {
  'GH-ACTIONS-WRITE-ALL': {
    whatHappened:
      'This workflow file declares "permissions: write-all", elevating privileges for automated build scripts to grant full write access across repository files, issues, and releases.',
    whyItMatters:
      'If any third-party action or compromised upstream dependency runs in this pipeline, attackers could use these broad permissions to modify your code or publish malicious releases.',
    howToFix:
      'Replace "write-all" with least-privilege permissions (e.g. "contents: read"), granting only the minimum access each workflow job specifically needs.',
  },
  'GH-ACTIONS-UNPINNED': {
    whatHappened:
      'This workflow runs a third-party GitHub Action using a mutable branch or tag (like "@v3") instead of an immutable 40-character commit hash (a permanent snapshot of code).',
    whyItMatters:
      'If the action author\'s account is compromised or a tag is modified, malicious code could run inside your automated build pipeline without warning.',
    howToFix:
      'Pin the action to its full 40-character commit SHA (commit hash) and append a friendly release version comment so humans know which version is running.',
  },
  'GH-ACTIONS-CURL-PIPE-SHELL': {
    whatHappened:
      'This workflow downloads an external script directly from the internet and pipes it straight into a shell command without verifying its content.',
    whyItMatters:
      'If the download link is intercepted or the remote server is compromised, malicious code will immediately execute with your build pipeline\'s privileges.',
    howToFix:
      'Download the script as a file first, verify its cryptographic checksum (a digital fingerprint) against a known good value, and only then execute it.',
  },
  'GH-ACTIONS-SCRIPT-INJECTION': {
    whatHappened:
      'An untrusted input variable (like an issue title or commit message) is placed directly inside an inline run script instead of using an environment variable.',
    whyItMatters:
      'An attacker could craft a malicious pull request title containing shell commands that execute inside your CI build (known as script injection).',
    howToFix:
      'Pass untrusted inputs into your script as environment variables using the "env:" block rather than interpolating them directly in "run:".',
  },
  'GH-ACTIONS-PULL-REQUEST-TARGET': {
    whatHappened:
      'This workflow triggers on "pull_request_target", which runs with write permissions and access to repository secrets even when triggered by external forks.',
    whyItMatters:
      'If the workflow checks out untrusted code from the pull request, attackers can steal secrets or modify protected branches.',
    howToFix:
      'Avoid checking out untrusted pull request code in "pull_request_target" workflows, or switch to the standard "pull_request" trigger for untrusted code.',
  },
  'GH-ACTIONS-MISSING-PERMISSIONS': {
    whatHappened:
      'This workflow does not declare an explicit "permissions" block, which means it inherits GitHub\'s default token permissions.',
    whyItMatters:
      'Default repository permissions may grant write access to issues or contents, increasing risk if a pipeline dependency is compromised.',
    howToFix:
      'Add an explicit top-level "permissions: read-all" or "contents: read" block to restrict access to read-only by default.',
  },
  'SECRET-GITHUB-PAT': {
    whatHappened:
      'A GitHub Personal Access Token (a secret password used to access your GitHub account) was detected in repository files.',
    whyItMatters:
      'Anyone who views this repository can use this token to impersonate you, alter your code, or access private assets.',
    howToFix:
      'Revoke and rotate this token immediately in your GitHub account settings, remove it from git history, and store credentials in GitHub Actions Secrets.',
  },
  'SECRET-AWS-KEY': {
    whatHappened:
      'An Amazon Web Services (AWS) credential key was detected committed inside repository files.',
    whyItMatters:
      'Exposed cloud keys are quickly discovered by automated scanners, which can lead to unauthorized cloud infrastructure usage and data leaks.',
    howToFix:
      'Deactivate and delete the key in your AWS IAM console immediately, and load secrets using environment variables or a secrets manager.',
  },
  'REPO-MISSING-SECURITY': {
    whatHappened:
      'This repository does not have a SECURITY.md file, which is the standard guide explaining how to report security bugs privately.',
    whyItMatters:
      'When researchers find security flaws, they might publish them publicly in GitHub Issues if there is no private contact channel documented.',
    howToFix:
      'Create a SECURITY.md file in the root or .github/ folder with clear instructions on who to email or message privately with security concerns.',
  },
  'REPO-NO-TEST-SIGNAL': {
    whatHappened:
      'This repository does not appear to have an automated test command (like "npm test" or "pytest") or continuous integration test workflow configured.',
    whyItMatters:
      'Without automated tests, maintainers cannot quickly verify if new contributor pull requests accidentally break existing functionality.',
    howToFix:
      'Add a basic test runner script to your project configuration and set up a GitHub Actions workflow that runs your tests on every pull request.',
  },
  'REPO-MISSING-LICENSE': {
    whatHappened:
      'This repository has no LICENSE file declaring terms of use and distribution for open-source contributors.',
    whyItMatters:
      'Without an explicit license, default copyright laws apply, meaning other developers cannot legally use, modify, or contribute to this code.',
    howToFix:
      'Add an open-source license file (such as MIT or Apache-2.0) to the repository root.',
  },
  'REPO-MISSING-CONTRIBUTING': {
    whatHappened:
      'This project lacks a CONTRIBUTING.md guide to help new developers set up and submit pull requests.',
    whyItMatters:
      'Beginner contributors may hesitate to contribute or submit improperly formatted PRs without clear local setup and contribution steps.',
    howToFix:
      'Create a CONTRIBUTING.md file detailing local installation, coding standards, and pull request guidelines.',
  },
  'REPO-WEAK-README': {
    whatHappened:
      'The repository README.md is brief or missing essential sections like installation, usage, or project description.',
    whyItMatters:
      'A detailed README helps both contributors and users understand what the project does and how to get started quickly.',
    howToFix:
      'Expand the README with an overview, quickstart installation guide, and usage examples.',
  },
};

/**
 * Returns structured 3-part beginner-friendly explanation parts for any rule.
 */
export function getDeterministicExplanationParts(
  ruleId?: string,
  category?: string,
  title?: string,
  impact?: string,
  fixHint?: string,
  targetLocation?: string
): RuleExplanationTemplate {
  const normRule = (ruleId || '').toUpperCase().trim();
  const directMatch = RULE_CONCRETE_EXPLANATIONS[normRule];
  if (directMatch) return directMatch;

  for (const [key, template] of Object.entries(RULE_CONCRETE_EXPLANATIONS)) {
    if (normRule.includes(key) || key.includes(normRule)) {
      return template;
    }
  }

  const loc = targetLocation || 'repository configuration';

  if (category === 'dependency' || normRule.startsWith('GHSA-') || normRule.startsWith('CVE-')) {
    return {
      whatHappened: `A dependency package in \`${loc}\` has a known security advisory or outdated version (${ruleId || 'dependency advisory'}).`,
      whyItMatters: impact || 'Using outdated or vulnerable dependencies exposes your application to known security exploits and unexpected bugs.',
      howToFix: fixHint || 'Upgrade the dependency to a secure patched release in your package manifest and update your lockfile.',
    };
  }

  if (category === 'secret' || normRule.startsWith('SEC-') || normRule.includes('SECRET')) {
    return {
      whatHappened: `A sensitive credential pattern (${title || ruleId}) was detected in \`${loc}\`.`,
      whyItMatters: impact || 'Committed credentials can be found by automated scanners and used to access protected accounts without authorization.',
      howToFix: fixHint || 'Revoke and rotate this credential immediately, remove it from git history, and use environment variables or secret stores instead.',
    };
  }

  if (category === 'actions' || category === 'github-actions' || normRule.startsWith('GH-ACTIONS')) {
    return {
      whatHappened: `A continuous integration workflow security risk (${title || ruleId}) was identified in \`${loc}\`.`,
      whyItMatters: impact || 'Misconfigured CI/CD workflows can allow untrusted code execution or unauthorized access to repository build tokens.',
      howToFix: fixHint || 'Update the workflow YAML following GitHub Actions security best practices.',
    };
  }

  return {
    whatHappened: `Static verification identified a potential code or configuration issue (${title || ruleId || 'finding'}) in \`${loc}\`.`,
    whyItMatters: impact || 'Resolving static findings keeps the repository secure, maintainable, and welcoming to new contributors.',
    howToFix: fixHint || 'Inspect the affected configuration, apply the recommended fix, and verify changes locally before proposing a pull request.',
  };
}
