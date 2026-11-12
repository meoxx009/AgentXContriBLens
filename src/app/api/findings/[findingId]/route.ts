import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateContributionReadiness, calculateUrgency } from '@/lib/scanner/readiness';
import { buildEvidenceChain } from '@/lib/scanner/evidence-chain';
import { apiError, requireAuth } from '@/lib/api-guard';
import type { Finding } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  props: { params: Promise<{ findingId: string }> }
) {
  try {
    const { findingId } = await props.params;
    if (!findingId) {
      return apiError('findingId is required', 400, 'AUTH_INVALID_INPUT');
    }
    if (findingId.startsWith('mem-')) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const finding = await db.getFindingById(findingId);
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    let scan = await db.getScanById(finding.scanId);
    if (!scan) {
      const allScans = db.getScans();
      scan = allScans.find((s) => s.id === finding.scanId) || allScans[0];
    }
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to finding', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    // Ensure finding has readiness, urgency, and evidence chain
    if (!finding.readiness) {
      finding.readiness = calculateContributionReadiness(finding);
    }
    if (finding.urgencyScore === undefined) {
      const u = calculateUrgency(finding);
      finding.urgencyScore = u.urgencyScore;
      finding.urgencyLabel = u.urgencyLabel;
    }
    if (!finding.evidenceChain) {
      finding.evidenceChain = buildEvidenceChain(finding, { repoName: scan.repoName });
    }

    // Look up route if exists
    const routes = await db.getRoutesByScanId(scan.id);
    const route = routes.find((r) => r.findingId === finding.id || (r.findingIds && r.findingIds.includes(finding.id)));

    return NextResponse.json({
      ok: true,
      success: true,
      finding,
      route,
      scan: {
        id: scan.id,
        repoName: scan.repoName,
        branch: scan.branch,
        scannedAt: scan.scannedAt,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/findings/[findingId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve finding',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ findingId: string }> }
) {
  try {
    const { findingId } = await props.params;
    if (!findingId) {
      return apiError('findingId is required', 400, 'AUTH_INVALID_INPUT');
    }
    if (findingId.startsWith('mem-')) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const finding = await db.getFindingById(findingId);
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    let scan = await db.getScanById(finding.scanId);
    if (!scan) {
      const allScans = db.getScans();
      scan = allScans.find((s) => s.id === finding.scanId) || allScans[0];
    }
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to finding', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    let isReviewed = finding.reviewed;
    if (body?.reviewed !== undefined) {
      isReviewed = Boolean(body.reviewed);
    }

    const nextStatus = typeof body?.status === 'string' ? body.status : finding.status;

    const updatedFinding: Finding = {
      ...finding,
      reviewed: isReviewed,
      reviewedBy: isReviewed ? user.id : undefined,
      reviewedAt: isReviewed ? (finding.reviewedAt || new Date().toISOString()) : undefined,
      status: nextStatus,
    };

    db.updateFinding(updatedFinding);
    await db.syncFindingsToSupabase([updatedFinding]);

    let activityDesc = isReviewed
      ? `Reviewed finding: ${finding.title}`
      : `Unmarked review on finding: ${finding.title}`;

    if (body?.status === 'dismissed') {
      activityDesc = `Dismissed finding: ${finding.title}`;
    } else if (body?.status === 'open' && finding.status === 'dismissed') {
      activityDesc = `Restored finding to open: ${finding.title}`;
    }

    db.logActivity({
      userId: user.id,
      repoName: scan.repoName,
      type: 'finding_reviewed',
      description: activityDesc,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      finding: updatedFinding,
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/findings/[findingId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to update finding review status',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
