import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { explainFinding } from '@/lib/gemini';
import { apiError, requireAuth, validateBody, checkRateLimit } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const ExplainInputSchema = z.object({
  findingId: z.string({ required_error: 'findingId is required' }).min(1, 'findingId is required'),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const validated = await validateBody(req, ExplainInputSchema);
    if (validated.error) return validated.error;
    const { findingId } = validated.data;

    // Rate limit per user: max 30 explain calls per minute
    const rate = checkRateLimit(`explain:${user.id}`, { windowMs: 60 * 1000, max: 30 });
    if (!rate.allowed) {
      return apiError(
        'Too many explanation requests. Please wait a moment before trying again.',
        429,
        'RATE_LIMITED',
        { resetTime: rate.resetTime }
      );
    }

    const finding = await db.getFindingById(findingId);
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    const scan = await db.getScanById(finding.scanId);
    if (!scan) {
      return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const explanation = await explainFinding(finding, scan as any);

    db.logActivity({
      userId: user.id,
      type: 'finding_explained',
      repoName: scan.repoName,
      description: `Requested grounded explanation for finding "${finding.title}" via ${explanation.generatedBy.toUpperCase()}`,
    });

    return NextResponse.json({
      success: true,
      explanation,
      ok: true,
      remaining: rate.remaining,
    });
  } catch (error: any) {
    const isDisclosureBlocked = error?.code === 'DISCLOSURE_BLOCKED' || error?.message?.includes('DISCLOSURE_BLOCKED');
    if (isDisclosureBlocked) {
      return apiError(
        'Explanation blocked for secret finding (Responsible Disclosure Contract).',
        403,
        'DISCLOSURE_BLOCKED'
      );
    }
    console.error('Error in POST /api/explain:', error?.message || error);
    return apiError(
      error?.message || 'Failed to explain finding',
      500,
      'GEMINI_UNAVAILABLE'
    );
  }
}
