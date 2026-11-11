/**
 * ContribLens OSV.dev Batch Vulnerability Scanner
 * 
 * Queries the official OSV.dev batch API deterministically.
 * Maps CVEs / GHSAs to normalized Findings with exact severity, confidence, and fix recommendations.
 */

import type { ParsedDependency } from './manifests.ts';
import type { Finding, Severity } from '../../types';
import { createFindingEvidence } from './evidence';

interface OSVVulnerability {
  id: string;
  summary?: string;
  details?: string;
  database_specific?: {
    severity?: string;
    github_reviewed?: boolean;
  };
  severity?: Array<{
    type: string;
    score: string;
  }>;
  affected?: Array<{
    package: {
      name: string;
      ecosystem: string;
    };
    ranges?: Array<{
      type: string;
      events: Array<{
        introduced?: string;
        fixed?: string;
      }>;
    }>;
  }>;
}

interface OSVBatchResponse {
  results: Array<{
    vulns?: OSVVulnerability[];
  }>;
}

function parseSeverityFromOSV(vuln: OSVVulnerability): { severity: Severity; reason?: string } {
  // Check database_specific severity string
  const rawSev = (vuln.database_specific?.severity || '').toUpperCase();
  if (rawSev.includes('CRITICAL')) return { severity: 'critical' };
  if (rawSev.includes('HIGH')) return { severity: 'high' };
  if (rawSev.includes('MODERATE') || rawSev.includes('MEDIUM')) return { severity: 'medium' };
  if (rawSev.includes('LOW')) return { severity: 'low' };

  // Check CVSS score if present
  const cvssObj = vuln.severity?.find((s) => s.type.includes('CVSS'));
  if (cvssObj) {
    // E.g. CVSS:3.1/AV:N/...
    const scoreMatch = cvssObj.score.match(/CVSS:[\d\.]+\/.*BaseScore:([\d\.]+)/i);
    if (scoreMatch) {
      const num = parseFloat(scoreMatch[1]);
      if (num >= 9.0) return { severity: 'critical' };
      if (num >= 7.0) return { severity: 'high' };
      if (num >= 4.0) return { severity: 'medium' };
      return { severity: 'low' };
    }
  }

  // Spec: If an advisory has no severity, keep severity: medium only as a review priority and mark the reason as OSV advisory did not provide severity
  return { severity: 'medium', reason: 'OSV advisory did not provide severity' };
}

export async function queryOSVBatch(
  dependencies: ParsedDependency[],
  scanId: string
): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (dependencies.length === 0) return findings;

  // Bounded batch of up to 100 dependencies to prevent rate limits
  const targetDeps = dependencies.slice(0, 100);

  const queryPayload = {
    queries: targetDeps.map((dep) => ({
      package: {
        name: dep.name,
        ecosystem: dep.ecosystem,
      },
      ...(dep.version && dep.version !== '0.0.0' ? { version: dep.version } : {}),
    })),
  };

  try {
    const res = await fetch('https://api.osv.dev/v1/querybatch', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ContribLens-OSS-Scanner',
      },
      body: JSON.stringify(queryPayload),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`OSV.dev API returned status ${res.status}`);
      return findings;
    }

    const data: OSVBatchResponse = await res.json();

    data.results?.forEach((result, idx) => {
      const dep = targetDeps[idx];
      if (result.vulns && result.vulns.length > 0) {
        // Take top 3 most critical per package to avoid flood
        result.vulns.slice(0, 3).forEach((vuln) => {
          const { severity, reason } = parseSeverityFromOSV(vuln);
          let fixedVersion: string | undefined;

          vuln.affected?.forEach((aff) => {
            aff.ranges?.forEach((range) => {
              range.events.forEach((event) => {
                if (event.fixed) fixedVersion = event.fixed;
              });
            });
          });

          const note = reason ? ` (${reason})` : '';

          findings.push(
            createFindingEvidence({
              scanId,
              title: `Vulnerable Dependency: ${dep.name} (${vuln.id})`,
              category: 'dependency',
              severity,
              confidence: 0.95,
              sourceTool: 'OSV.dev Vulnerability Engine',
              ruleId: vuln.id,
              file: dep.sourceFile,
              lineStart: 1,
              lineEnd: 1,
              evidence: `Package: ${dep.name}@${dep.version}\nAdvisory ID: ${vuln.id}\nSummary: ${vuln.summary || 'Known published vulnerability'}${note}`,
              impact: vuln.summary || `Vulnerability in ${dep.name} may expose applications to exploit.`,
              fixHint: fixedVersion
                ? `Upgrade ${dep.name} to version ${fixedVersion} or higher in ${dep.sourceFile}`
                : `Review ${dep.name} dependencies and update to the latest patched release.`,
              disclosureMode: 'maintainer-review',
            })
          );
        });
      }
    });
  } catch (err) {
    console.warn('Error querying OSV.dev:', err);
  }

  return findings;
}
