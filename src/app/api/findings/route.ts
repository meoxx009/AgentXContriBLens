import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateContributionReadiness, calculateUrgency } from '@/lib/scanner/readiness';
import { buildEvidenceChain } from '@/lib/scanner/evidence-chain';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

function isFalsePositiveOrSynthetic(f: { id?: string; file?: string | null }): boolean {
  if (!f.id || f.id.startsWith('mem-')) return true;
  const filePath = (f.file || '').toLowerCase().trim();
  if (!filePath) return false;

  // Directory exclusions: node_modules/, vendor/
  if (
    filePath.startsWith('node_modules/') ||
    filePath.includes('/node_modules/') ||
    filePath.startsWith('vendor/') ||
    filePath.includes('/vendor/')
  ) {
    return true;
  }

  // Minified file exclusions: *.min.js
  if (filePath.endsWith('.min.js') || filePath.includes('.min.js/')) {
    return true;
  }

  // Lockfile exclusions: package-lock.json, yarn.lock, pnpm-lock.yaml, poetry.lock
  const basename = filePath.split('/').pop() || filePath;
  const lockFiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock'];
  if (lockFiles.includes(basename)) {
    return true;
  }

  return false;
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get('scanId') || undefined;

    const severity = (searchParams.get('severity') || '').trim().toUpperCase();
    const category = (searchParams.get('category') || '').trim().toLowerCase();
    const search = (searchParams.get('search') || searchParams.get('q') || '').trim().toLowerCase();
    const readinessLabel = (searchParams.get('readinessLabel') || searchParams.get('readiness') || '').trim().toLowerCase();
    const diffStatus = (searchParams.get('diffStatus') || searchParams.get('diff') || '').trim().toLowerCase();
    const ruleId = (searchParams.get('ruleId') || '').trim().toLowerCase();
    const file = (searchParams.get('file') || searchParams.get('filePath') || '').trim().toLowerCase();
    const status = (searchParams.get('status') || '').trim().toLowerCase();

    let findings = db.getFindings(scanId);

    if (scanId) {
      let scan = await db.getScanById(scanId);
      if (!scan) {
        await db.hydrateFromSupabase(user.id, scanId);
        scan = await db.getScanById(scanId);
      }
      if (!scan) {
        return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
      }
      if (scan.userId && scan.userId !== user.id) {
        return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
      }
      if (findings.length === 0) {
        await db.hydrateFromSupabase(user.id, scanId);
        findings = db.getFindings(scanId);
      }
    } else {
      const scans = db.getScans(user.id);
      if (scans.length === 0) {
        await db.hydrateFromSupabase(user.id);
      }
      const userScanIds = db.getScans(user.id).map((s) => s.id);
      findings = findings.filter((f) => userScanIds.includes(f.scanId));
    }

    // Filter out synthetic memory findings and false-positive sources (node_modules, vendor, lockfiles, .min.js)
    findings = findings.filter((f) => !isFalsePositiveOrSynthetic(f));

    // Deduplicate findings by finding ID to ensure each finding appears exactly once
    const seenFindingIds = new Set<string>();
    findings = findings.filter((f) => {
      if (seenFindingIds.has(f.id)) return false;
      seenFindingIds.add(f.id);
      return true;
    });

    // Ensure all returned findings are populated with readiness, urgency, and evidenceChain
    findings = findings.map((f) => {
      const r = f.readiness || calculateContributionReadiness(f);
      const u = f.urgencyScore !== undefined ? { urgencyScore: f.urgencyScore, urgencyLabel: f.urgencyLabel || 'medium' } : calculateUrgency(f);
      const chain = f.evidenceChain || buildEvidenceChain(f);
      return {
        ...f,
        readiness: r,
        urgencyScore: u.urgencyScore,
        urgencyLabel: u.urgencyLabel,
        evidenceChain: chain,
        diffStatus: f.diffStatus || 'new',
      };
    });

    // Record total unfiltered count before applying active filters
    const totalUnfiltered = findings.length;

    // 1. Severity filter
    if (severity && severity !== 'ALL') {
      findings = findings.filter((f) => {
        const sev = (f.severity || '').toString().trim().toUpperCase();
        return sev === severity;
      });
    }

    // 2. Category filter (null-safe + handles singular/plural aliases)
    if (category && category !== 'all') {
      findings = findings.filter((f) => {
        const cat = (f.category || '').toString().trim().toLowerCase();
        if (category === 'actions' || category === 'github-actions' || category === 'workflow') {
          return cat === 'github-actions' || cat === 'actions' || cat === 'workflow';
        }
        if (category === 'dependency' || category === 'dependencies') {
          return cat === 'dependency' || cat === 'dependencies';
        }
        if (category === 'secret' || category === 'secrets') {
          return cat === 'secret' || cat === 'secrets';
        }
        if (category === 'health' || category === 'repository-health') {
          return cat === 'repository-health' || cat === 'health';
        }
        return cat === category;
      });
    }

    // 3. Readiness Label filter (null-safe + normalized hyphen/underscore)
    if (readinessLabel && readinessLabel !== 'all') {
      findings = findings.filter((f) => {
        const rawLabel = (f.readiness?.label || '').toString().trim().toLowerCase().replace(/_/g, '-');
        const targetLabel = readinessLabel.replace(/_/g, '-');
        return rawLabel === targetLabel;
      });
    }

    // 4. Diff Status filter (null-safe + normalized)
    if (diffStatus && diffStatus !== 'all') {
      findings = findings.filter((f) => {
        const ds = (f.diffStatus || 'new').toString().trim().toLowerCase().replace(/_/g, '-');
        const targetDiff = diffStatus.replace(/_/g, '-');
        return ds === targetDiff;
      });
    }

    // 5. Search query filter (null-safe across all fields)
    if (search) {
      findings = findings.filter((f) => {
        const title = (f.title || '').toLowerCase();
        const filePath = (f.file || '').toLowerCase();
        const rid = (f.ruleId || '').toLowerCase();
        const impact = (f.impact || '').toLowerCase();
        const evidence = (f.evidence || f.redactedEvidence || '').toLowerCase();
        const fixHint = (f.fixHint || '').toLowerCase();
        return (
          title.includes(search) ||
          filePath.includes(search) ||
          rid.includes(search) ||
          impact.includes(search) ||
          evidence.includes(search) ||
          fixHint.includes(search)
        );
      });
    }

    // 6. Rule ID filter
    if (ruleId && ruleId !== 'all') {
      findings = findings.filter((f) => {
        const rid = (f.ruleId || '').toLowerCase();
        return rid === ruleId || rid.includes(ruleId);
      });
    }

    // 7. File path filter
    if (file) {
      findings = findings.filter((f) => {
        const filePath = (f.file || '').toLowerCase();
        return filePath.includes(file);
      });
    }

    // 8. Status filter
    if (status && status !== 'all') {
      if (status === 'open') {
        findings = findings.filter(
          (f) => !f.reviewed && f.status !== 'resolved' && f.diffStatus !== 'resolved' && f.status !== 'dismissed'
        );
      } else if (status === 'approved' || status === 'reviewed') {
        findings = findings.filter((f) => Boolean(f.reviewed));
      } else if (status === 'dismissed' || status === 'resolved') {
        findings = findings.filter(
          (f) => f.status === 'resolved' || f.diffStatus === 'resolved' || f.status === 'dismissed'
        );
      }
    }

    const SEVERITY_RANK: Record<string, number> = {
      CRITICAL: 5,
      HIGH: 4,
      MEDIUM: 3,
      LOW: 2,
      INFO: 1,
    };

    findings.sort((a, b) => {
      const sA = SEVERITY_RANK[a.severity?.toUpperCase()] || 0;
      const sB = SEVERITY_RANK[b.severity?.toUpperCase()] || 0;
      if (sB !== sA) return sB - sA;
      const cA = typeof a.confidence === 'number' ? a.confidence : (a.confidence === 'HIGH' ? 0.85 : a.confidence === 'MEDIUM' ? 0.7 : 0.5);
      const cB = typeof b.confidence === 'number' ? b.confidence : (b.confidence === 'HIGH' ? 0.85 : b.confidence === 'MEDIUM' ? 0.7 : 0.5);
      return cB - cA;
    });

    return NextResponse.json(
      { findings, total: totalUnfiltered, ok: true, success: true },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  } catch (error: any) {
    console.error('Error in GET /api/findings:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve findings',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    const { findingId, action } = body || {};

    if (!findingId || typeof findingId !== 'string' || findingId.startsWith('mem-')) {
      return apiError('findingId is required', 400, 'AUTH_INVALID_INPUT');
    }

    if (action === 'review' || action === 'mark_reviewed') {
      const updated = db.markFindingReviewed(findingId, user.id);
      if (!updated) {
        return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
      }
      return NextResponse.json({ success: true, finding: updated, ok: true });
    }

    return apiError('Invalid action', 400, 'AUTH_INVALID_INPUT');
  } catch (err: any) {
    console.error('Error in POST /api/findings:', err?.message || err);
    return apiError(
      err?.message || 'Failed to process request',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
