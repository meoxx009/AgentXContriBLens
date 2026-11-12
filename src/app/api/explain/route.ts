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
    if (findingId.startsWith('mem-')) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

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

    // Disclosure Guard check
    if (
      finding.category === 'secret' ||
      finding.disclosureMode === 'security-disclosure' ||
      finding.disclosureMode === 'DISCLOSURE_BLOCKED'
    ) {
      return apiError(
        'Explanation blocked for secret finding (Responsible Disclosure Contract).',
        403,
        'DISCLOSURE_BLOCKED'
      );
    }

    let resolvedScan = await db.getScanById(finding.scanId);
    if (!resolvedScan) {
      const allScans = db.getScans();
      resolvedScan = allScans.find((s) => s.id === finding.scanId) || allScans[0];
    }
    const scan = resolvedScan || {
      id: finding.scanId || 'scn_recovered',
      userId: user.id,
      repoName: 'repository',
      branch: 'main',
      scannedAt: finding.createdAt || new Date().toISOString(),
      score: 85,
      totalFindings: 1,
      findings: [finding],
      status: 'completed' as const,
      urgency: 'medium' as const,
      categories: {},
      recommendations: [],
    };

    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    let explanation;
    try {
      explanation = await explainFinding(finding, scan as any);
    } catch (explainError: any) {
      const isDisclosure =
        explainError?.code === 'DISCLOSURE_BLOCKED' ||
        explainError?.message?.includes('DISCLOSURE_BLOCKED');
      if (isDisclosure) {
        throw explainError;
      }
      console.warn('explainFinding fallback triggered in /api/explain:', explainError?.message || explainError);
      const { getDeterministicExplanationParts } = await import('@/lib/scanner/explanations');
      const parts = getDeterministicExplanationParts(
        finding.ruleId,
        finding.category,
        finding.title,
        finding.impact,
        finding.fixHint,
        finding.file || 'Repository Configuration'
      );
      const concreteExplanation = `${parts.whatHappened} ${parts.whyItMatters} ${parts.howToFix}`;

      explanation = {
        findingId: finding.id,
        whatHappened: parts.whatHappened,
        whyItMatters: parts.whyItMatters,
        howToFix: parts.howToFix,
        explanation: concreteExplanation,
        riskContext: parts.whyItMatters,
        recommendedFix: parts.howToFix,
        skillsNeeded: finding.skills && finding.skills.length > 0 ? finding.skills : ['Git', 'GitHub'],
        estimatedEffort: finding.readiness?.estimatedMinutes
          ? `${finding.readiness.estimatedMinutes} mins`
          : '30-45 mins',
        difficulty: (finding.readiness?.difficulty as any) || 'beginner',
        generatedBy: 'deterministic-fallback' as const,
        fallback: true,
        fallbackReason: explainError?.message || 'Deterministic engine fallback — AI unavailable',
      };
    }

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
