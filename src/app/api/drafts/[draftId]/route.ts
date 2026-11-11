import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redactSecrets } from '@/lib/redaction';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    if (!draftId) {
      return apiError('draftId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const draft = db.getDraftById(draftId);
    if (!draft) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (draft.userId && draft.userId !== user.id) {
      return apiError('Unauthorized access to draft', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    return NextResponse.json({ ok: true, draft, success: true });
  } catch (error: any) {
    console.error('Error in GET /api/drafts/[draftId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve draft',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    if (!draftId) {
      return apiError('draftId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const existingDraft = db.getDraftById(draftId);
    if (!existingDraft) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (existingDraft.userId && existingDraft.userId !== user.id) {
      return apiError('Unauthorized access to draft', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    const {
      title,
      markdownContent,
      body: draftBody,
      labels,
      status: requestedStatus,
      action,
      reviewDecision: requestedDecision,
      rejectedReason,
    } = body || {};

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

    if (!updated) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (reviewDecision) {
      db.logActivity({
        userId: user.id,
        type: 'draft_reviewed',
        repoName: existingDraft.repoName,
        description: `Draft "${updated.title}" was ${reviewDecision} by user (Human Review Invariant)`,
      });
    }

    return NextResponse.json({ ok: true, draft: updated, storageTier, success: true });
  } catch (error: any) {
    console.error('Error in PATCH /api/drafts/[draftId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to update draft',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { draftId } = await params;
    if (!draftId) {
      return apiError('draftId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const existingDraft = db.getDraftById(draftId);
    if (!existingDraft) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (existingDraft.userId && existingDraft.userId !== user.id) {
      return apiError('Unauthorized access to draft', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const deleted = db.deleteDraft(draftId);
    if (!deleted) {
      return apiError('Draft not found', 404, 'GITHUB_NOT_FOUND');
    }

    return NextResponse.json({ ok: true, success: true, message: 'Draft deleted' });
  } catch (error: any) {
    console.error('Error in DELETE /api/drafts/[draftId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to delete draft',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
