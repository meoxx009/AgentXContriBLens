import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateContributionReadiness, calculateUrgency } from '@/lib/scanner/readiness';
import { buildEvidenceChain } from '@/lib/scanner/evidence-chain';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get('scanId') || undefined;

    const severity = searchParams.get('severity')?.toUpperCase();
    const category = searchParams.get('category')?.toLowerCase();
    const search = searchParams.get('search')?.toLowerCase();
    const readinessLabel = searchParams.get('readinessLabel')?.toLowerCase();
    const diffStatus = searchParams.get('diffStatus')?.toLowerCase();
    const ruleId = searchParams.get('ruleId')?.toLowerCase();
    const file = searchParams.get('file')?.toLowerCase();
    const status = searchParams.get('status')?.toLowerCase();

    let findings = db.getFindings(scanId);

    if (scanId) {
      const scan = db.getScanById(scanId);
      if (!scan) {
        return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
      }
      if (scan.userId && scan.userId !== user.id) {
        return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
      }
    } else {
      const userScanIds = db.getScans(user.id).map((s) => s.id);
      findings = findings.filter((f) => userScanIds.includes(f.scanId));
    }

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

    if (severity && severity !== 'ALL') {
      findings = findings.filter((f) => f.severity.toUpperCase() === severity);
    }

    if (category && category !== 'all') {
      findings = findings.filter((f) => {
        const cat = f.category.toLowerCase();
        if (category === 'actions' || category === 'github-actions') {
          return cat === 'github-actions' || cat === 'actions';
        }
        if (category === 'health' || category === 'repository-health') {
          return cat === 'repository-health' || cat === 'health';
        }
        return cat === category;
      });
    }

    if (readinessLabel && readinessLabel !== 'all') {
      findings = findings.filter((f) => f.readiness?.label === readinessLabel);
    }

    if (diffStatus && diffStatus !== 'all') {
      findings = findings.filter((f) => f.diffStatus === diffStatus);
    }

    if (search) {
      findings = findings.filter(
        (f) =>
          f.title.toLowerCase().includes(search) ||
          (f.file && f.file.toLowerCase().includes(search)) ||
          f.ruleId.toLowerCase().includes(search) ||
          f.impact.toLowerCase().includes(search) ||
          (f.evidence && f.evidence.toLowerCase().includes(search))
      );
    }

    if (ruleId && ruleId !== 'all') {
      findings = findings.filter(
        (f) =>
          f.ruleId.toLowerCase() === ruleId ||
          f.ruleId.toLowerCase().includes(ruleId)
      );
    }

    if (file) {
      findings = findings.filter(
        (f) => f.file && f.file.toLowerCase().includes(file)
      );
    }

    if (status && status !== 'all') {
      if (status === 'open') {
        findings = findings.filter(
          (f) => !f.reviewed && f.status !== 'resolved' && f.diffStatus !== 'resolved'
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

    return NextResponse.json({ findings, ok: true, success: true });
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

    if (!findingId) {
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
