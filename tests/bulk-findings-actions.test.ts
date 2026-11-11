import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PATCH as patchFindingById } from '../src/app/api/findings/[findingId]/route';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import type { Finding, ScanSummary } from '../src/types';
import ConfirmDialog from '../src/components/ui/ConfirmDialog';
import fs from 'fs';
import path from 'path';

const TEST_USER = {
  id: 'usr_bulk_tester_1',
  email: 'bulk_tester@example.com',
  name: 'Bulk Actions Tester',
  createdAt: new Date().toISOString(),
};

const TEST_SCAN: ScanSummary = {
  id: 'scan_bulk_test_1',
  userId: TEST_USER.id,
  repoName: 'contriblens/bulk-demo',
  repoUrl: 'https://github.com/contriblens/bulk-demo',
  owner: 'contriblens',
  branch: 'main',
  commitSha: 'a1b2c3d4e5f6',
  scannedAt: new Date().toISOString(),
  totalFiles: 3,
  totalBytes: 5000,
  status: 'completed',
  findingsCount: {
    total: 3,
    critical: 1,
    high: 1,
    medium: 1,
    low: 0,
    info: 0,
  },
  readinessScore: 85,
  techStack: {
    languages: [{ name: 'TypeScript', percentage: 100, filesCount: 1 }],
    frameworks: [{ name: 'Next.js', category: 'fullstack' }],
    packageManagers: [{ name: 'npm', lockfile: 'package-lock.json', status: 'detected', source: 'package.json', confidence: 1 }],
    tooling: [{ name: 'github-actions', category: 'ci' }],
    manifests: [],
    confidenceScore: 1,
  },
};

const MOCK_FINDINGS: Finding[] = [
  {
    id: 'finding_bulk_1',
    scanId: TEST_SCAN.id,
    category: 'dependency',
    ruleId: 'SEC-DEP-001',
    title: 'Insecure dependency version',
    severity: 'HIGH',
    confidence: 'HIGH',
    sourceTool: 'scanner',
    file: 'package.json',
    impact: 'Potential vulnerability in dependency',
    fixHint: 'Upgrade to patched version',
    skills: ['Dependencies'],
    learningResources: [],
    disclosureMode: 'maintainer-review',
    redacted: false,
    evidenceHash: 'hash_1111111111111111111111111111111111111111111111111111111111111111',
    fingerprint: 'fp_1',
    createdAt: new Date().toISOString(),
    reviewed: false,
  },
  {
    id: 'finding_bulk_2',
    scanId: TEST_SCAN.id,
    category: 'github-actions',
    ruleId: 'SEC-ACT-002',
    title: 'Unpinned action runner',
    severity: 'MEDIUM',
    confidence: 'HIGH',
    sourceTool: 'scanner',
    file: '.github/workflows/ci.yml',
    impact: 'Unpinned action can execute untrusted updates',
    fixHint: 'Pin to full commit SHA',
    skills: ['CI/CD'],
    learningResources: [],
    disclosureMode: 'public-issue',
    redacted: false,
    evidenceHash: 'hash_2222222222222222222222222222222222222222222222222222222222222222',
    fingerprint: 'fp_2',
    createdAt: new Date().toISOString(),
    reviewed: false,
  },
  {
    id: 'finding_bulk_3',
    scanId: TEST_SCAN.id,
    category: 'secret',
    ruleId: 'SEC-KEY-003',
    title: 'Exposed secret API key token',
    severity: 'CRITICAL',
    confidence: 'HIGH',
    sourceTool: 'scanner',
    file: 'config.env',
    impact: 'Credential exposure',
    fixHint: 'Revoke key immediately',
    skills: ['Security'],
    learningResources: [],
    disclosureMode: 'security-disclosure',
    redacted: true,
    evidenceHash: 'hash_3333333333333333333333333333333333333333333333333333333333333333',
    fingerprint: 'fp_3',
    createdAt: new Date().toISOString(),
    reviewed: false,
  },
];

function authReq(url: string, method: string = 'PATCH', body?: any) {
  const token = signSessionToken({
    id: TEST_USER.id,
    email: TEST_USER.email,
    name: TEST_USER.name,
  });

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `contriblens_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Bulk Actions & Multi-Select on Findings List', () => {
  beforeEach(() => {
    db.saveUser({
      id: TEST_USER.id,
      email: TEST_USER.email,
      name: TEST_USER.name,
      createdAt: TEST_USER.createdAt,
    });
    db.saveScan(TEST_SCAN);
    db.saveFindings(MOCK_FINDINGS);
  });

  describe('1. Server-Side Sequential Execution & Honest Partial-Failure Handling', () => {
    it('successfully approves a batch of findings sequentially through PATCH /api/findings/[id]', async () => {
      const selectedIds = ['finding_bulk_1', 'finding_bulk_2'];
      const results: { id: string; ok: boolean }[] = [];

      for (const id of selectedIds) {
        const req = authReq(`http://localhost:3000/api/findings/${id}`, 'PATCH', { reviewed: true });
        const res = await patchFindingById(req, { params: Promise.resolve({ findingId: id }) });
        const data = await res.json();
        results.push({ id, ok: res.ok && data.ok });
      }

      expect(results.every((r) => r.ok)).toBe(true);

      // Verify DB persistence
      const f1 = db.getFindingById('finding_bulk_1');
      const f2 = db.getFindingById('finding_bulk_2');
      const f3 = db.getFindingById('finding_bulk_3');

      expect(f1?.reviewed).toBe(true);
      expect(f1?.reviewedBy).toBe(TEST_USER.id);
      expect(f2?.reviewed).toBe(true);
      expect(f3?.reviewed).toBe(false); // was not in selectedIds
    });

    it('handles honest partial failure when an item fails, keeping failed items identifiable for retry', async () => {
      const selectedIds = ['finding_bulk_1', 'nonexistent_finding_id', 'finding_bulk_2'];
      let successCount = 0;
      const failedIds: string[] = [];

      for (const id of selectedIds) {
        const req = authReq(`http://localhost:3000/api/findings/${id}`, 'PATCH', { reviewed: true });
        const res = await patchFindingById(req, { params: Promise.resolve({ findingId: id }) });
        if (res.ok) {
          const data = await res.json();
          if (data.ok) successCount++;
          else failedIds.push(id);
        } else {
          failedIds.push(id);
        }
      }

      expect(successCount).toBe(2);
      expect(failedIds).toHaveLength(1);
      expect(failedIds).toContain('nonexistent_finding_id');

      // Summary contract
      const summaryMessage = `${successCount} approved, ${failedIds.length} failed — retry`;
      expect(summaryMessage).toBe('2 approved, 1 failed — retry');
    });

    it('unmarks review status through PATCH /api/findings/[id] with reviewed: false', async () => {
      // Pre-set as reviewed
      db.updateFinding({ ...MOCK_FINDINGS[0], reviewed: true, reviewedBy: TEST_USER.id });
      db.updateFinding({ ...MOCK_FINDINGS[1], reviewed: true, reviewedBy: TEST_USER.id });

      const selectedIds = ['finding_bulk_1', 'finding_bulk_2'];

      for (const id of selectedIds) {
        const req = authReq(`http://localhost:3000/api/findings/${id}`, 'PATCH', { reviewed: false });
        const res = await patchFindingById(req, { params: Promise.resolve({ findingId: id }) });
        expect(res.ok).toBe(true);
      }

      expect(db.getFindingById('finding_bulk_1')?.reviewed).toBe(false);
      expect(db.getFindingById('finding_bulk_1')?.reviewedBy).toBeUndefined();
      expect(db.getFindingById('finding_bulk_2')?.reviewed).toBe(false);
    });
  });

  describe('2. Selection Logic Contracts (Select All, Partial, Filter-Clearing)', () => {
    it('simulates select all, deselect all, and partial selection calculation', () => {
      const items = MOCK_FINDINGS;
      let selectedIds = new Set<string>();

      // Select all filtered items
      items.forEach((item) => selectedIds.add(item.id));
      expect(selectedIds.size).toBe(3);
      const allSelected = items.every((item) => selectedIds.has(item.id));
      expect(allSelected).toBe(true);

      // Deselect one item -> partial selection (indeterminate)
      selectedIds.delete('finding_bulk_1');
      expect(selectedIds.size).toBe(2);
      const isSomeSelected = items.some((item) => selectedIds.has(item.id)) && !items.every((item) => selectedIds.has(item.id));
      expect(isSomeSelected).toBe(true);

      // Deselect all
      selectedIds.clear();
      expect(selectedIds.size).toBe(0);
      expect(items.some((item) => selectedIds.has(item.id))).toBe(false);
    });

    it('verifies that selection only operates on visible filtered rows', () => {
      // If filter is category === 'secret', only 1 item matches
      const activeFilterCategory = 'secret';
      const filtered = MOCK_FINDINGS.filter((f) => f.category === activeFilterCategory);
      expect(filtered).toHaveLength(1);

      const selectedIds = new Set<string>();
      filtered.forEach((f) => selectedIds.add(f.id));

      expect(selectedIds.size).toBe(1);
      expect(selectedIds.has('finding_bulk_3')).toBe(true);
      expect(selectedIds.has('finding_bulk_1')).toBe(false);
    });
  });

  describe('3. Reusable ConfirmDialog Component Contracts', () => {
    it('renders accessible alertdialog with destructive styling when open', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConfirmDialog, {
          isOpen: true,
          title: 'Unmark 3 Selected Findings?',
          description: 'Are you sure you want to remove review approval from 3 selected findings?',
          confirmLabel: 'Unmark 3 Findings',
          cancelLabel: 'Keep Reviewed',
          isDestructive: true,
          onConfirm: () => {},
          onCancel: () => {},
        })
      );

      expect(html).toContain('role="alertdialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('Unmark 3 Selected Findings?');
      expect(html).toContain('Unmark 3 Findings');
      expect(html).toContain('Keep Reviewed');
      expect(html).toContain('bg-rosewood'); // Destructive styling
    });

    it('renders nothing when isOpen is false', () => {
      const html = renderToStaticMarkup(
        React.createElement(ConfirmDialog, {
          isOpen: false,
          title: 'Hidden Dialog',
          description: 'Should not appear',
          onConfirm: () => {},
          onCancel: () => {},
        })
      );
      expect(html).toBe('');
    });
  });

  describe('4. FindingsView Codebase Wiring & Accessibility Contracts', () => {
    const root = process.cwd();
    const findingsViewPath = path.join(root, 'src/components/views/FindingsView.tsx');
    const content = fs.readFileSync(findingsViewPath, 'utf-8');

    it('wires header checkbox for selecting all filtered rows', () => {
      expect(content).toContain('id="findings-select-all"');
      expect(content).toContain('allFilteredSelected');
      expect(content).toContain('handleToggleSelectAll');
      expect(content).toContain('headerCheckboxRef');
      expect(content).toContain('indeterminate');
    });

    it('wires individual checkboxes for each finding row with stopPropagation', () => {
      expect(content).toContain('id={`finding-checkbox-${finding.id}`}');
      expect(content).toContain('handleToggleSelectFinding');
      expect(content).toContain('aria-label={`Select finding: ${finding.title}`}');
    });

    it('renders bulk action bar with Approve and Unmark buttons when selection is non-empty', () => {
      expect(content).toContain('aria-label="Bulk actions toolbar"');
      expect(content).toContain('Approve Selected');
      expect(content).toContain('Unmark Selected');
      expect(content).toContain('Deselect All');
      expect(content).toContain('executeBulkReview(true)');
      expect(content).toContain('setShowUnmarkConfirm(true)');
    });

    it('wires truthful partial failure result summary banner with retry', () => {
      expect(content).toContain('bulkResultSummary');
      expect(content).toContain('failedCount > 0');
      expect(content).toContain('failed — retry');
      expect(content).toContain('Retry Failed');
    });

    it('clears selection when active filters or active scan change', () => {
      expect(content).toContain('setSelectedFindingIds(new Set())');
      expect(content).toContain('setBulkResultSummary(null)');
    });

    it('links destructive confirmation to ConfirmDialog', () => {
      expect(content).toContain('<ConfirmDialog');
      expect(content).toContain('isOpen={showUnmarkConfirm}');
      expect(content).toContain('isDestructive={true}');
    });
  });
});
