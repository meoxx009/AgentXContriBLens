import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createIssueDraft } from '@/lib/gemini';
import { redactSecrets } from '@/lib/redaction';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

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

    const { routeId, draftId, regenerate } = body || {};

    let targetRouteId = routeId;
    let existingDraft: any = null;

    if (!targetRouteId && draftId) {
      existingDraft = db.getDraftById(draftId);
      if (!existingDraft) {
        return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
      }
      targetRouteId = existingDraft.routeId;
    }

    if (!targetRouteId) {
      return apiError('routeId or draftId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const route = db.getRouteById(targetRouteId);
    if (!route) {
      return apiError('Contribution route not found', 404, 'GITHUB_NOT_FOUND');
    }

    const scan = db.getScanById(route.scanId);
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to this route', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    // Server-side evidence loading (do NOT trust client-supplied evidence)
    const targetFindingId = route.findingId || (route.findingIds && route.findingIds[0]) || '';
    const finding = db.getFindingById(targetFindingId);
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    // Strict Security Model Rule: Secret & critical findings cannot create a public issue draft (SECURITY.md §4)
    const isDisclosureBlocked =
      finding.category === 'secret' ||
      finding.disclosureMode === 'security-disclosure' ||
      finding.disclosureMode === 'DISCLOSURE_BLOCKED' ||
      String(finding.severity).toUpperCase() === 'CRITICAL';

    if (isDisclosureBlocked) {
      return apiError(
        'Public issue draft generation is strictly blocked for secrets and critical severity findings. Please follow responsible private security disclosure guidance.',
        403,
        'DISCLOSURE_BLOCKED',
        {
          guidance:
            'Notify the repository maintainer privately via their SECURITY.md policy, security email, or GitHub Private Vulnerability Reporting.',
        }
      );
    }

    const draft = await createIssueDraft(route, finding, scan as any, { bypassCache: Boolean(regenerate) });
    draft.userId = user.id;
    draft.status = 'draft';
    draft.labels = ['security', 'good-first-issue', route.difficulty];

    // Defensive re-redaction before persistence
    draft.markdownContent = redactSecrets(draft.markdownContent);
    draft.title = redactSecrets(draft.title);

    if (draftId && regenerate) {
      draft.id = draftId;
      db.updateDraft(draftId, {
        markdownContent: draft.markdownContent,
        title: draft.title,
        generatedBy: draft.generatedBy,
        fallback: draft.fallback,
        fallbackReason: draft.fallbackReason,
        updatedAt: new Date().toISOString(),
      });
    } else {
      db.saveDraft(draft);
      // Update route with draftId
      route.draftId = draft.id;
      db.saveRoute(route);
    }

    db.logActivity({
      userId: user.id,
      type: 'draft_generated',
      repoName: scan.repoName,
      description: `${regenerate ? 'Regenerated' : 'Generated'} maintainer-reviewable issue draft "${draft.title}" via ${draft.generatedBy.toUpperCase()}`,
    });

    return NextResponse.json({ ok: true, draft, success: true });
  } catch (error: any) {
    if (error?.errorCode === 'DISCLOSURE_BLOCKED' || error?.statusCode === 403) {
      return apiError(
        error.message || 'Public issue draft generation is strictly blocked for secrets and critical severity findings.',
        403,
        'DISCLOSURE_BLOCKED',
        {
          guidance:
            'Notify the repository maintainer privately via their SECURITY.md policy or GitHub Private Vulnerability Reporting.',
        }
      );
    }
    console.error('Error in POST /api/drafts:', error?.message || error);
    return apiError(
      error?.message || 'Failed to generate issue draft',
      500,
      'GEMINI_UNAVAILABLE'
    );
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get('scanId') || undefined;
    const draftId = searchParams.get('draftId') || undefined;

    if (draftId) {
      const draft = db.getDraftById(draftId);
      if (!draft) {
        return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
      }
      if (draft.userId && draft.userId !== user.id) {
        return apiError('Unauthorized access to this draft', 403, 'AUTH_INVALID_CREDENTIALS');
      }
      return NextResponse.json({ ok: true, draft, success: true });
    }

    let drafts = db.getDrafts(scanId);
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
      drafts = drafts.filter((d) => d.userId === user.id || userScanIds.includes(d.scanId));
    }

    return NextResponse.json({ ok: true, drafts, success: true });
  } catch (error: any) {
    console.error('Error in GET /api/drafts:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve issue drafts',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function PATCH(req: Request) {
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

    const {
      draftId,
      title,
      body: draftBody,
      markdownContent,
      labels,
      status: requestedStatus,
      action,
      reviewDecision: requestedDecision,
      rejectedReason,
    } = body || {};

    if (!draftId) {
      return apiError('draftId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const existing = db.getDraftById(draftId);
    if (!existing) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (existing.userId && existing.userId !== user.id) {
      return apiError('Unauthorized access to this draft', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    let status = requestedStatus;
    let reviewDecision = requestedDecision;
    let reviewedAt: string | undefined = undefined;
    let exportedAt: string | undefined = undefined;

    if (action === 'approve' || status === 'approved') {
      status = 'approved';
      reviewDecision = 'approved';
      reviewedAt = new Date().toISOString();
    } else if (action === 'reject' || status === 'rejected') {
      status = 'rejected';
      reviewDecision = 'rejected';
      reviewedAt = new Date().toISOString();
    } else if (action === 'export' || status === 'exported') {
      status = 'exported';
      exportedAt = new Date().toISOString();
    }

    if (status) {
      const validStatuses = ['draft', 'awaiting_review', 'reviewed', 'approved', 'rejected', 'exported'];
      if (!validStatuses.includes(status)) {
        return apiError(
          `Invalid draft status "${status}". Allowed statuses: ${validStatuses.join(', ')}`,
          400,
          'AUTH_INVALID_INPUT'
        );
      }
    }

    // Defensive re-redaction before updating
    const safeTitle = title !== undefined ? redactSecrets(title) : undefined;
    const rawContent = markdownContent !== undefined ? markdownContent : draftBody;
    const safeMarkdown = rawContent !== undefined ? redactSecrets(rawContent) : undefined;
    const storageTier = db.getStorageTierStatus().tier;

    const updated = db.updateDraft(draftId, {
      ...(safeTitle !== undefined && { title: safeTitle }),
      ...(safeMarkdown !== undefined && { markdownContent: safeMarkdown, body: safeMarkdown }),
      ...(labels !== undefined && { labels }),
      ...(status !== undefined && { status }),
      ...(reviewDecision !== undefined && { reviewDecision }),
      ...(reviewedAt !== undefined && { reviewedAt }),
      ...(rejectedReason !== undefined && { rejectedReason: redactSecrets(rejectedReason) }),
      ...(exportedAt !== undefined && { exportedAt }),
      storageTier,
      updatedAt: new Date().toISOString(),
    });

    if (reviewDecision) {
      db.logActivity({
        userId: user.id,
        type: 'draft_reviewed',
        repoName: existing.repoName,
        description: `Draft "${updated?.title || existing.title}" was ${reviewDecision} by user (Human Review Invariant)`,
      });
    }

    return NextResponse.json({ ok: true, draft: updated, storageTier, success: true });
  } catch (error: any) {
    console.error('Error in PATCH /api/drafts:', error?.message || error);
    return apiError(
      error?.message || 'Failed to update draft',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const draftId = searchParams.get('draftId');

    if (!draftId) {
      return apiError('draftId query parameter is required', 400, 'AUTH_INVALID_INPUT');
    }

    const existing = db.getDraftById(draftId);
    if (!existing) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (existing.userId && existing.userId !== user.id) {
      return apiError('Unauthorized access to this draft', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const deleted = db.deleteDraft(draftId);
    if (!deleted) {
      return apiError('Failed to delete draft', 500, 'PERSISTENCE_FAILED');
    }

    db.logActivity({
      userId: user.id,
      type: 'draft_generated',
      repoName: existing.repoName,
      description: `Deleted issue draft: "${existing.title}"`,
    });

    return NextResponse.json({ ok: true, success: true, message: 'Draft deleted' });
  } catch (error: any) {
    console.error('Error in DELETE /api/drafts:', error?.message || error);
    return apiError(
      error?.message || 'Failed to delete draft',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
