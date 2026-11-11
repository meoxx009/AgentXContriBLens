import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateFindingSuggestions } from '@/lib/gemini';
import { apiError, requireAuth, checkRateLimit } from '@/lib/api-guard';
import type { AIFindingSuggestionsResponse } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const scanId = searchParams.get('scanId');

    // Rate limit: max 60 suggestion requests per minute per user
    const rate = checkRateLimit(`suggestions:${user.id}`, { windowMs: 60 * 1000, max: 60 });
    if (!rate.allowed) {
      return apiError(
        'Too many suggestion requests. Please wait a moment before trying again.',
        429,
        'RATE_LIMITED',
        { resetTime: rate.resetTime }
      );
    }

    let targetScan: any = null;

    if (scanId) {
      targetScan = db.getScanById(scanId);
      if (!targetScan) {
        return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
      }
      if (targetScan.userId && targetScan.userId !== user.id) {
        return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
      }
    } else {
      const userScans = db.getScans(user.id);
      if (userScans.length > 0) {
        targetScan = userScans[0];
      }
    }

    if (!targetScan) {
      const emptyResponse: AIFindingSuggestionsResponse = {
        ok: true,
        success: true,
        scanId: '',
        repoName: '',
        isPartial: false,
        totalFindings: 0,
        suggestions: [],
      };
      return NextResponse.json(emptyResponse);
    }

    // Retrieve verified findings directly from deterministic scanner database
    const findings = db.getFindings(targetScan.id);

    if (findings.length === 0) {
      const emptyResponse: AIFindingSuggestionsResponse = {
        ok: true,
        success: true,
        scanId: targetScan.id,
        repoName: targetScan.repoName,
        isPartial: targetScan.scope === 'partial',
        totalFindings: 0,
        suggestions: [],
      };
      return NextResponse.json(emptyResponse);
    }

    // Generate grounded beginner-friendly suggestions (max 5 key findings)
    const suggestions = await generateFindingSuggestions(targetScan, findings, 5);

    const response: AIFindingSuggestionsResponse = {
      ok: true,
      success: true,
      scanId: targetScan.id,
      repoName: targetScan.repoName,
      isPartial: targetScan.scope === 'partial',
      totalFindings: findings.length,
      suggestions,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('Error in GET /api/findings/suggestions:', error?.message || error);
    return apiError(
      error?.message || 'Failed to generate grounded finding suggestions',
      500,
      'GEMINI_UNAVAILABLE'
    );
  }
}
