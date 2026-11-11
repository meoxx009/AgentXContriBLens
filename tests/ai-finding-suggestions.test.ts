import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GET as getSuggestions } from '@/app/api/findings/suggestions/route';
import { GET as getFindings } from '@/app/api/findings/route';
import { db } from '@/lib/db';
import { signSessionToken } from '@/lib/auth';
import type { ScanSummary, Finding } from '@/types';

const USER_A = {
  id: 'user-sug-alpha-fixed-id',
  email: 'sug-alpha-unique@example.com',
  name: 'Suggestion Alpha',
  createdAt: new Date().toISOString(),
};

const USER_B = {
  id: 'user-sug-beta-fixed-id',
  email: 'sug-beta-unique@example.com',
  name: 'Suggestion Beta',
  createdAt: new Date().toISOString(),
};

function authReq(url: string, user = USER_A) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `contriblens_session=${token}`,
    },
  });
}

function unauthReq(url: string) {
  return new Request(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

describe('AI Finding Suggestions Feature', () => {
  const findingsViewPath = path.join(process.cwd(), 'src/components/views/FindingsView.tsx');
  const suggestionsComponentPath = path.join(process.cwd(), 'src/components/views/AIFindingSuggestionsSection.tsx');
  const findingsViewSource = fs.readFileSync(findingsViewPath, 'utf-8');
  const suggestionsComponentSource = fs.readFileSync(suggestionsComponentPath, 'utf-8');

  let testScan: ScanSummary;
  let criticalFinding: Finding;
  let mediumFinding: Finding;
  let lowFindingWithNoEvidence: Finding;

  beforeEach(() => {
    db.saveUser(USER_A as any);
    db.saveUser(USER_B as any);

    const scanId = `scn_sug_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    testScan = {
      id: scanId,
      userId: USER_A.id,
      repoUrl: 'https://github.com/contriblens-test/ai-suggestions-repo',
      repoName: 'ai-suggestions-repo',
      owner: 'contriblens-test',
      branch: 'main',
      totalFiles: 15,
      totalBytes: 32000,
      scannedAt: new Date().toISOString(),
      status: 'completed',
      scope: 'deep',
      readinessScore: 84,
      findingsCount: { critical: 1, high: 0, medium: 1, low: 1, info: 0, total: 3 },
      techStack: {
        languages: [{ name: 'TypeScript', percentage: 90, filesCount: 12, confidence: 0.95, sources: ['package.json'] }],
        frameworks: [{ name: 'React', category: 'frontend', version: '19.0.0', confidence: 0.9, sources: ['package.json'] }],
        tooling: [{ name: 'Vitest', category: 'testing', confidence: 0.9, sources: ['package.json'] }],
        manifests: [{ path: 'package.json', type: 'npm', dependenciesCount: 8 }],
        confidenceScore: 0.95,
        packageManagers: [{ name: 'npm', lockfile: 'package-lock.json', status: 'detected', source: 'package-lock.json', confidence: 1 }],
      },
    };

    criticalFinding = {
      id: `fnd_crit_${Date.now()}`,
      scanId: testScan.id,
      category: 'secret',
      ruleId: 'SEC-API-KEY-EXPOSURE',
      title: 'Exposed API token in client configuration',
      severity: 'critical',
      confidence: 0.98,
      sourceTool: 'Secret Detector',
      file: 'src/config/api.ts',
      lineStart: 12,
      lineEnd: 12,
      evidence: 'const API_KEY = "sk-live-sample-fake-key";',
      impact: 'Allows unauthorized client requests and potential credential misuse.',
      fixHint: 'Move API tokens into server-side environment variables.',
      skills: ['Environment Configuration', 'Secret Management', 'TypeScript'],
      learningResources: [],
      disclosureMode: 'security-disclosure',
      redacted: true,
      evidenceHash: 'hash_crit_123',
      fingerprint: 'fp_crit_123',
      createdAt: new Date().toISOString(),
    };

    mediumFinding = {
      id: `fnd_med_${Date.now()}`,
      scanId: testScan.id,
      category: 'github-actions',
      ruleId: 'GH-ACTIONS-UNPINNED',
      title: 'Unpinned action in CI workflow',
      severity: 'medium',
      confidence: 0.92,
      sourceTool: 'CI Auditor',
      file: '.github/workflows/ci.yml',
      lineStart: 18,
      lineEnd: 18,
      evidence: 'uses: actions/checkout@v3',
      impact: 'Mutable action tags can drift or introduce unexpected upstream breaks.',
      fixHint: 'Pin GitHub Action to a full 40-character commit SHA with tag comment.',
      skills: ['GitHub Actions', 'YAML', 'CI/CD Security'],
      learningResources: [],
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash_med_456',
      fingerprint: 'fp_med_456',
      createdAt: new Date().toISOString(),
    };

    lowFindingWithNoEvidence = {
      id: `fnd_low_${Date.now()}`,
      scanId: testScan.id,
      category: 'repository-health',
      ruleId: 'HEALTH-MISSING-SECURITY-MD',
      title: 'Missing SECURITY.md vulnerability reporting policy',
      severity: 'low',
      confidence: 0.9,
      sourceTool: 'Health Checker',
      file: null,
      lineStart: null,
      evidence: '',
      impact: 'Security researchers have no documented channel to report vulnerabilities.',
      fixHint: 'Add a standard SECURITY.md policy to the repository root.',
      skills: ['Open Source Governance', 'Markdown'],
      learningResources: [],
      disclosureMode: 'public-issue',
      redacted: false,
      evidenceHash: 'hash_low_789',
      fingerprint: 'fp_low_789',
      createdAt: new Date().toISOString(),
    };

    db.saveScan(testScan);
    db.saveFindings([criticalFinding, mediumFinding, lowFindingWithNoEvidence]);
  });

  describe('1. Placement and UI Architecture', () => {
    it('renders the suggestions section above the filter toolbar and findings list in FindingsView', () => {
      // Must import AIFindingSuggestionsSection
      expect(findingsViewSource).toContain('import AIFindingSuggestionsSection');

      // Header appears before AIFindingSuggestionsSection
      const headerIndex = findingsViewSource.indexOf('Verified Findings');
      const suggestionsIndex = findingsViewSource.indexOf('<AIFindingSuggestionsSection');
      const filterToolbarIndex = findingsViewSource.indexOf('Filter Toolbar with URL Sync');
      const findingsListIndex = findingsViewSource.indexOf('filteredFindings.map');

      expect(headerIndex).toBeGreaterThan(-1);
      expect(suggestionsIndex).toBeGreaterThan(headerIndex);
      expect(filterToolbarIndex).toBeGreaterThan(suggestionsIndex);
      expect(findingsListIndex).toBeGreaterThan(filterToolbarIndex);
    });

    it('contains the title "AI Finding Suggestions" and accessible role', () => {
      expect(suggestionsComponentSource).toContain('AI Finding Suggestions');
      expect(suggestionsComponentSource).toContain('role="region"');
      expect(suggestionsComponentSource).toContain('aria-label="AI Finding Suggestions"');
    });

    it('links each finding list item with anchor id={finding-${id}}', () => {
      expect(findingsViewSource).toContain('id={`finding-${finding.id}`}');
    });

    it('implements 5 structured beginner explanation fields in the component', () => {
      expect(suggestionsComponentSource).toContain('1. What this means');
      expect(suggestionsComponentSource).toContain('2. Why it matters');
      expect(suggestionsComponentSource).toContain('3. Verified Scan Evidence');
      expect(suggestionsComponentSource).toContain('4. Safe Next Step');
      expect(suggestionsComponentSource).toContain('5. Skills');
    });
  });

  describe('2. Grounding in Verified Scanner Results', () => {
    it('generates suggestions strictly from confirmed scan findings', async () => {
      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${testScan.id}`, USER_A)
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.suggestions.length).toBeGreaterThan(0);

      // All returned suggestions must correspond strictly to findings present in the scan
      const validFindingIds = [criticalFinding.id, mediumFinding.id, lowFindingWithNoEvidence.id];
      data.suggestions.forEach((sug: any) => {
        expect(validFindingIds).toContain(sug.findingId);
        expect(sug.ruleId).toBeDefined();
        expect(sug.title).toBeDefined();
      });
    });

    it('strictly preserves verified severity — AI cannot alter deterministic severity', async () => {
      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${testScan.id}`, USER_A)
      );

      const data = await res.json();
      const critSug = data.suggestions.find((s: any) => s.findingId === criticalFinding.id);
      const medSug = data.suggestions.find((s: any) => s.findingId === mediumFinding.id);

      expect(critSug).toBeDefined();
      expect(critSug.severity).toBe('critical');

      expect(medSug).toBeDefined();
      expect(medSug.severity).toBe('medium');
    });

    it('handles findings with insufficient evidence honestly without inventing facts', async () => {
      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${testScan.id}`, USER_A)
      );

      const data = await res.json();
      const lowSug = data.suggestions.find((s: any) => s.findingId === lowFindingWithNoEvidence.id);

      expect(lowSug).toBeDefined();
      expect(lowSug.hasSufficientEvidence).toBe(false);
      expect(lowSug.evidenceSnippet).toContain('insufficient');
    });
  });

  describe('3. Zero Verified Findings Handling', () => {
    it('returns empty suggestions when scan has zero confirmed findings', async () => {
      const emptyScan: ScanSummary = {
        id: `scn_zero_${Date.now()}`,
        userId: USER_A.id,
        repoUrl: 'https://github.com/contriblens-test/clean-repo',
        repoName: 'clean-repo',
        owner: 'contriblens-test',
        branch: 'main',
        totalFiles: 10,
        totalBytes: 15000,
        scannedAt: new Date().toISOString(),
        status: 'completed',
        scope: 'deep',
        readinessScore: 100,
        findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0, total: 0 },
        techStack: { languages: [], frameworks: [], tooling: [], manifests: [], confidenceScore: 1 },
      };
      db.saveScan(emptyScan);

      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${emptyScan.id}`, USER_A)
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.totalFindings).toBe(0);
      expect(data.suggestions).toEqual([]);
    });

    it('renders calm empty state in component when totalFindings is zero', () => {
      expect(suggestionsComponentSource).toContain('data-testid="ai-suggestions-zero"');
      expect(suggestionsComponentSource).toContain('No Verified Findings in This Scan');
    });
  });

  describe('4. Partial Scan Behavior', () => {
    it('reports partial scan status truthfully when scope is partial', async () => {
      const partialScan: ScanSummary = {
        ...testScan,
        id: `scn_partial_${Date.now()}`,
        scope: 'partial',
      };
      db.saveScan(partialScan);
      db.saveFindings([{ ...mediumFinding, scanId: partialScan.id }]);

      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${partialScan.id}`, USER_A)
      );

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.isPartial).toBe(true);
    });

    it('displays partial scan advisory notice in UI component', () => {
      expect(suggestionsComponentSource).toContain('data-testid="partial-scan-badge"');
      expect(suggestionsComponentSource).toContain('Suggestions are based only on the findings currently available');
    });
  });

  describe('5. Data Ownership and Authorization Guard', () => {
    it('returns 401 when request is unauthenticated', async () => {
      const res = await getSuggestions(
        unauthReq(`http://localhost:3000/api/findings/suggestions?scanId=${testScan.id}`)
      );
      expect(res.status).toBe(401);
    });

    it('returns 403 when User B attempts to access suggestions for User A scan', async () => {
      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=${testScan.id}`, USER_B)
      );
      expect(res.status).toBe(403);
    });

    it('returns 404 when scanId does not exist', async () => {
      const res = await getSuggestions(
        authReq(`http://localhost:3000/api/findings/suggestions?scanId=non_existent_scan_id_999`, USER_A)
      );
      expect(res.status).toBe(404);
    });
  });

  describe('6. Scan Synchronization and Stale Response Protection', () => {
    it('FindingsView incorporates suggestionsSeqRef to guard against stale response overwriting', () => {
      expect(findingsViewSource).toContain('suggestionsSeqRef');
      expect(findingsViewSource).toContain('currentSeq !== suggestionsSeqRef.current');
    });

    it('clears previous suggestions immediately when activeScan changes', () => {
      expect(findingsViewSource).toContain('setSuggestions([])');
      expect(findingsViewSource).toContain('setSuggestionsError(null)');
    });
  });

  describe('7. Recoverable Error State & Findings List Independence', () => {
    it('renders non-blocking error container with retry button when AI suggestions fail', () => {
      expect(suggestionsComponentSource).toContain('data-testid="ai-suggestions-error"');
      expect(suggestionsComponentSource).toContain('Retry Suggestions');
      expect(suggestionsComponentSource).toContain('Your verified findings below are completely safe and unaffected');
    });

    it('existing findings API remains fully functional and accessible', async () => {
      const res = await getFindings(
        authReq(`http://localhost:3000/api/findings?scanId=${testScan.id}`, USER_A)
      );
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.findings.length).toBe(3);
    });
  });
});
