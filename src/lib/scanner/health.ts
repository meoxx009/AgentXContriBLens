/**
 * ContribLens Repository Health & Community Standards Checker
 * 
 * Rules per SCANNER_RULES.md:
 * - REPO-MISSING-LICENSE: Missing LICENSE file (default: low, confidence: 0.99)
 * - REPO-MISSING-SECURITY: Missing SECURITY.md (default: low, confidence: 0.99)
 * - REPO-MISSING-CONTRIBUTING: Missing CONTRIBUTING.md (default: low, confidence: 0.99)
 * - REPO-WEAK-README: README is missing or below minimum structure (default: low, confidence: 0.78)
 * - REPO-NO-TEST-SIGNAL: No recognized test directory/configuration/script (default: low, confidence: 0.70)
 */

import type { Finding } from '../../types';
import type { BoundedFile } from './github';
import { createFindingEvidence } from './evidence';

export function checkRepositoryHealth(
  files: BoundedFile[],
  scanId: string,
  repoLicense?: string
): { findings: Finding[]; healthScore: number } {
  const findings: Finding[] = [];

  let hasReadme = false;
  let readmeContent = '';
  let hasLicense = Boolean(repoLicense && repoLicense !== 'NOASSERTION');
  let hasContributing = false;
  let hasSecurityPolicy = false;
  let hasTestSignal = false;

  for (const file of files) {
    const path = file.path.toLowerCase();
    if (path === 'readme.md' || path.startsWith('readme')) {
      hasReadme = true;
      readmeContent = file.content;
    }
    if (path.includes('license') || path.includes('licence') || path.includes('copying')) {
      hasLicense = true;
    }
    if (path.includes('contributing')) {
      hasContributing = true;
    }
    if (path.includes('security.md') || path.includes('.github/security.md')) {
      hasSecurityPolicy = true;
    }
    if (
      path.includes('test/') ||
      path.includes('tests/') ||
      path.includes('spec/') ||
      path.includes('jest.config') ||
      path.includes('vitest.config') ||
      path.includes('pytest.ini') ||
      path.includes('.eslintrc') ||
      path.includes('test_') ||
      path.endsWith('.test.ts') ||
      path.endsWith('.test.js') ||
      path.endsWith('.spec.ts') ||
      path.endsWith('.spec.js')
    ) {
      hasTestSignal = true;
    }
  }

  // 1. REPO-MISSING-SECURITY
  if (!hasSecurityPolicy) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: 'Missing SECURITY.md Vulnerability Disclosure Policy',
        category: 'repository-health',
        severity: 'LOW',
        confidence: 0.99,
        sourceTool: 'Community Health Auditor',
        ruleId: 'REPO-MISSING-SECURITY',
        file: 'SECURITY.md',
        evidence: 'No SECURITY.md or .github/SECURITY.md found in repository root.',
        impact: 'Without a clear security policy, security researchers and users do not know how to safely report sensitive vulnerabilities privately.',
        fixHint: 'Create a SECURITY.md file explaining your supported versions and a private contact email for responsible vulnerability disclosure.',
        disclosureMode: 'public-issue',
      })
    );
  }

  // 2. REPO-MISSING-LICENSE
  if (!hasLicense) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: 'Missing or Unrecognized Open Source License',
        category: 'repository-health',
        severity: 'LOW',
        confidence: 0.99,
        sourceTool: 'Community Health Auditor',
        ruleId: 'REPO-MISSING-LICENSE',
        file: 'LICENSE',
        evidence: 'No standard LICENSE or COPYING file detected in repository.',
        impact: 'Without an explicit license, default copyright laws apply, meaning contributors cannot legally use, modify, or distribute the code.',
        fixHint: 'Add an OSI-approved open source license (such as MIT, Apache-2.0, or BSD-3-Clause) to the repository root.',
        disclosureMode: 'public-issue',
      })
    );
  }

  // 3. REPO-MISSING-CONTRIBUTING
  if (!hasContributing) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: 'Missing CONTRIBUTING.md Guidelines',
        category: 'repository-health',
        severity: 'LOW',
        confidence: 0.99,
        sourceTool: 'Community Health Auditor',
        ruleId: 'REPO-MISSING-CONTRIBUTING',
        file: 'CONTRIBUTING.md',
        evidence: 'No CONTRIBUTING.md file present in repository root or .github directory.',
        impact: 'New contributors may be unsure of environment setup, testing requirements, coding conventions, and pull request workflows.',
        fixHint: 'Add a CONTRIBUTING.md document detailing development prerequisites, running tests locally, and code style expectations.',
        disclosureMode: 'public-issue',
      })
    );
  }

  // 4. REPO-WEAK-README
  if (!hasReadme || readmeContent.trim().length < 50) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: 'Missing or Minimal README Documentation',
        category: 'repository-health',
        severity: 'LOW',
        confidence: 0.78,
        sourceTool: 'Community Health Auditor',
        ruleId: 'REPO-WEAK-README',
        file: 'README.md',
        evidence: !hasReadme
          ? 'No README.md documentation file discovered.'
          : `README.md content is minimal (${readmeContent.trim().length} characters).`,
        impact: 'A repository with minimal or missing documentation is difficult for developers to evaluate, install, and contribute to.',
        fixHint: 'Create or expand the README.md file summarizing the purpose of the project, quickstart instructions, and usage examples.',
        disclosureMode: 'public-issue',
      })
    );
  }

  // 5. REPO-NO-TEST-SIGNAL
  if (!hasTestSignal) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: 'Missing Automated Test Suite Signal',
        category: 'repository-health',
        severity: 'LOW',
        confidence: 0.70,
        sourceTool: 'Community Health Auditor',
        ruleId: 'REPO-NO-TEST-SIGNAL',
        file: null,
        evidence: 'No recognizable test directories (test/, tests/) or configuration files (jest, vitest, pytest) detected.',
        impact: 'Without an automated test suite, contributor pull requests cannot be reliably validated against regressions.',
        fixHint: 'Establish an automated test directory and configure an npm test or pytest verification command.',
        disclosureMode: 'public-issue',
      })
    );
  }

  // Compute Repository Health Score (0-100)
  let score = 0;
  if (hasReadme && readmeContent.trim().length >= 50) score += 20;
  if (hasLicense) score += 25;
  if (hasSecurityPolicy) score += 20;
  if (hasContributing) score += 15;
  if (hasTestSignal) score += 20;

  return { findings, healthScore: score };
}
