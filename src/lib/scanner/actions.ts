/**
 * ContribLens GitHub Actions Security Scanner
 * 
 * Inspects workflow YAML files for deterministic CI/CD and supply-chain risks:
 * 1. GH-ACTIONS-WRITE-ALL (permissions: write-all)
 * 2. GH-ACTIONS-UNPINNED (uses: owner/repo@v1 mutable tag instead of full commit SHA)
 * 3. GH-ACTIONS-MISSING-PERMISSIONS (no explicit least-privilege permissions block)
 * 4. GH-ACTIONS-PULL-REQUEST-TARGET (pull_request_target checkout of untrusted PR head)
 * 5. GH-ACTIONS-CURL-PIPE-SHELL (curl ... | bash/sh remote script execution)
 * 6. GH-ACTIONS-SCRIPT-INJECTION (untrusted context variable in run: steps)
 */

import type { Finding } from '../../types';
import { createFindingEvidence } from './evidence';

export function scanGitHubActions(
  filePath: string,
  content: string,
  scanId: string
): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');

  let hasPermissions = false;
  let isPullRequestTarget = false;

  // Check top-level pull_request_target trigger
  if (/on:\s*pull_request_target|pull_request_target:/i.test(content)) {
    isPullRequestTarget = true;
  }

  // Check top-level permissions
  if (/^\s*permissions:\s*/m.test(content)) {
    hasPermissions = true;
  }

  // Line-by-line checks
  lines.forEach((line, index) => {
    const lineNum = index + 1;
    const trimmed = line.trim();

    // 1. GH-ACTIONS-WRITE-ALL
    if (/^\s*permissions:\s*write-all\b/i.test(line)) {
      findings.push(
        createFindingEvidence({
          scanId,
          title: `Overly Permissive Workflow: write-all declared`,
          category: 'github-actions',
          severity: 'HIGH',
          confidence: 0.98,
          sourceTool: 'CI/CD Workflow Auditor',
          ruleId: 'GH-ACTIONS-WRITE-ALL',
          file: filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          evidence: trimmed,
          impact: 'Declaring write-all grants broad write access to all GitHub repository scopes including actions, checks, issues, pull-requests, and contents.',
          fixHint: 'Declare explicit minimum required permissions at workflow or job scope (e.g. permissions: contents: read).',
          disclosureMode: 'public-issue',
        })
      );
    }

    // 2. GH-ACTIONS-UNPINNED
    const usesMatch = trimmed.match(/^(?:-\s*)?uses:\s*([a-zA-Z0-9_\-\.\/]+)@([a-zA-Z0-9_\-\.]+)/);
    if (usesMatch) {
      const actionName = usesMatch[1];
      const ref = usesMatch[2];

      // Ignore local actions (./) or docker actions
      if (!actionName.startsWith('./') && !actionName.startsWith('docker://')) {
        // Full commit SHA is 40 hex chars
        const isSha = /^[a-f0-9]{40}$/i.test(ref);
        if (!isSha) {
          findings.push(
            createFindingEvidence({
              scanId,
              title: `Unpinned GitHub Action: ${actionName}@${ref}`,
              category: 'github-actions',
              severity: ref === 'master' || ref === 'main' ? 'HIGH' : 'MEDIUM',
              confidence: 0.90,
              sourceTool: 'CI/CD Workflow Auditor',
              ruleId: 'GH-ACTIONS-UNPINNED',
              file: filePath,
              lineStart: lineNum,
              lineEnd: lineNum,
              evidence: trimmed,
              impact: `Using mutable ref "@${ref}" allows malicious or unauthorized upstream updates to compromise your CI/CD runner environment.`,
              fixHint: `Pin ${actionName} to a reviewed 40-character commit SHA (e.g., uses: ${actionName}@<sha> # ${ref})`,
              disclosureMode: 'maintainer-review',
            })
          );
        }
      }
    }

    // 3. GH-ACTIONS-CURL-PIPE-SHELL
    if (/curl\s+[^\|]+\|\s*(?:ba)?sh\b|wget\s+[^\|]+\|\s*(?:ba)?sh\b/i.test(line)) {
      findings.push(
        createFindingEvidence({
          scanId,
          title: `Remote Script Execution via Pipe to Shell in Workflow`,
          category: 'github-actions',
          severity: 'HIGH',
          confidence: 0.92,
          sourceTool: 'CI/CD Workflow Auditor',
          ruleId: 'GH-ACTIONS-CURL-PIPE-SHELL',
          file: filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          evidence: trimmed,
          impact: 'Piping remote web scripts directly into a shell interpreter bypasses integrity checks and enables remote code execution if upstream servers are tampered with.',
          fixHint: 'Download the script, verify its SHA-256 checksum against an immutable hash, or replace with a trusted, pinned GitHub Action.',
          disclosureMode: 'maintainer-review',
        })
      );
    }

    // 4. GH-ACTIONS-SCRIPT-INJECTION
    if (/run:\s*/.test(line) || (trimmed.startsWith('- run:') || trimmed.startsWith('run:'))) {
      const injectionMatch = line.match(/\$\{\{\s*github\.event\.(issue|pull_request|comment|review|head_commit)\.[a-zA-Z0-9_\.]+\s*\}\}/i);
      if (injectionMatch) {
        findings.push(
          createFindingEvidence({
            scanId,
            title: `Potential Script Injection in Workflow Run Step`,
            category: 'github-actions',
            severity: 'HIGH',
            confidence: 0.95,
            sourceTool: 'CI/CD Workflow Auditor',
            ruleId: 'GH-ACTIONS-SCRIPT-INJECTION',
            file: filePath,
            lineStart: lineNum,
            lineEnd: lineNum,
            evidence: trimmed,
            impact: 'Untrusted user input interpolated into shell commands can allow an external attacker to execute arbitrary shell code in the CI runner.',
            fixHint: 'Pass the context value via an intermediate environment variable (e.g., env: ISSUE_TITLE: ${{ github.event.issue.title }}) and reference $ISSUE_TITLE in the script.',
            disclosureMode: 'maintainer-review',
          })
        );
      }
    }

    // 5. GH-ACTIONS-PULL-REQUEST-TARGET
    if (isPullRequestTarget && /ref:\s*\$\{\{\s*github\.event\.pull_request\.head\.sha\s*\}\}/.test(line)) {
      findings.push(
        createFindingEvidence({
          scanId,
          title: `Dangerous pull_request_target Checkout`,
          category: 'github-actions',
          severity: 'HIGH',
          confidence: 0.95,
          sourceTool: 'CI/CD Workflow Auditor',
          ruleId: 'GH-ACTIONS-PULL-REQUEST-TARGET',
          file: filePath,
          lineStart: lineNum,
          lineEnd: lineNum,
          evidence: trimmed,
          impact: 'pull_request_target runs with base repository secrets. Checking out untrusted PR head code allows hostile PRs to exfiltrate workflow secrets.',
          fixHint: 'Do not check out untrusted pull request code under pull_request_target, or use the standard "pull_request" event which has no write secrets access.',
          disclosureMode: 'security-disclosure',
        })
      );
    }
  });

  // 6. GH-ACTIONS-MISSING-PERMISSIONS
  if (!hasPermissions && lines.length > 5) {
    findings.push(
      createFindingEvidence({
        scanId,
        title: `Workflow Missing Explicit Least-Privilege Permissions`,
        category: 'github-actions',
        severity: 'LOW',
        confidence: 0.72,
        sourceTool: 'CI/CD Workflow Auditor',
        ruleId: 'GH-ACTIONS-MISSING-PERMISSIONS',
        file: filePath,
        lineStart: 1,
        lineEnd: 1,
        evidence: `Workflow "${filePath}" has no top-level "permissions:" block defined.`,
        impact: 'Without an explicit permissions block, GitHub Actions defaults to repository default permissions which may permit write access.',
        fixHint: 'Add "permissions: contents: read" at the root of the workflow file to follow the principle of least privilege.',
        disclosureMode: 'maintainer-review',
      })
    );
  }

  return findings;
}
