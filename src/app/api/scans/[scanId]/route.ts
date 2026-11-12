import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  props: { params: Promise<{ scanId: string }> }
) {
  try {
    const { scanId } = await props.params;
    if (!scanId) {
      return apiError('scanId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const scan = await db.getScanById(scanId);
    if (!scan) {
      return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
    }

    // Verify scan ownership or access
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to this scan', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const findings = await db.getFindingsByScanId(scanId);
    const routes = await db.getRoutesByScanId(scanId);
    const drafts = db.getDrafts(scanId);

    return NextResponse.json({
      ok: true,
      scanId: scan.id,
      repository: {
        fullName: scan.fullName || scan.repoName,
        ref: scan.ref || scan.branch,
      },
      summary: scan,
      technologies: scan.technologies || scan.techStack,
      health: {
        score: scan.readinessScore,
      },
      findings,
      routes,
      drafts,
      scan,
    });
  } catch (error: any) {
    console.error('Error in GET /api/scans/[scanId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve scan',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function DELETE(
  req: Request,
  props: { params: Promise<{ scanId: string }> }
) {
  try {
    const { scanId } = await props.params;
    if (!scanId) {
      return apiError('scanId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const scan = await db.getScanById(scanId);
    if (!scan) {
      return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized to delete this scan', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const deleted = db.deleteScan(scanId, user.id);
    if (!deleted) {
      return apiError('Failed to delete scan', 500, 'PERSISTENCE_FAILED');
    }

    db.logActivity({
      userId: user.id,
      type: 'scan',
      repoName: scan.repoName,
      description: `Removed repository scan ${scan.repoName} and all associated findings, routes, and drafts.`,
    });

    return NextResponse.json({
      ok: true,
      success: true,
      deleted: true,
      scanId,
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/scans/[scanId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to delete scan',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
