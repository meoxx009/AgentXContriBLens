import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { apiError, requireAuth, checkRateLimit } from '@/lib/api-guard';
import {
  generateGroundedPlan,
  buildGeminiPlanRequest,
  explainFinding,
  buildContributionRoute,
  createIssueDraft,
  generateRepositorySummary,
  explainTechStack,
  checkUserAIDailyLimit,
  recordUserAICall,
  PROMPT_VERSION,
  MAX_AI_REQUEST_BYTES,
} from '@/lib/gemini';
import type { Finding } from '@/types';

export async function POST(req: Request) {
  try {
    // 1. Request size limit guard
    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_AI_REQUEST_BYTES) {
      return NextResponse.json(
        {
          error: `Request body exceeds maximum size of ${MAX_AI_REQUEST_BYTES} bytes.`,
          errorCode: 'AUTH_INVALID_INPUT',
          ok: false,
        },
        { status: 400 }
      );
    }

    // 2. Authenticate user
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    // Rate limit AI plan calls per user: max 25 calls per minute
    const rate = checkRateLimit(`ai-plan:${user.id}`, { windowMs: 60 * 1000, max: 25 });
    if (!rate.allowed) {
      return apiError(
        'Too many AI requests. Please wait a moment before trying again.',
        429,
        'RATE_LIMITED',
        { resetTime: rate.resetTime }
      );
    }

    // 3. Per-user daily quota verification
    const dailyQuota = checkUserAIDailyLimit(user.id);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    const rawOperation = (body.operation || 'all').toLowerCase();
    const validOperations = ['explain', 'route', 'issue', 'summary', 'stack', 'all'];

    if (!validOperations.includes(rawOperation)) {
      return apiError(
        `Invalid operation "${rawOperation}". Supported operations: explain, route, issue, summary, stack.`,
        400,
        'AUTH_INVALID_INPUT'
      );
    }

    const operation = rawOperation as 'explain' | 'route' | 'issue' | 'summary' | 'stack' | 'all';
    const scanId = body.scanId;

    if (!scanId || typeof scanId !== 'string') {
      return apiError('scanId is required.', 400, 'AUTH_INVALID_INPUT');
    }

    // 4. Verify scan ownership in database
    const scan = await db.getScanById(scanId);
    if (!scan) {
      return apiError('Scan record not found.', 404, 'GITHUB_NOT_FOUND');
    }

    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to scan.', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    // Track user call quota
    recordUserAICall(user.id);

    // Operation: Summary
    if (operation === 'summary') {
      const summary = await generateRepositorySummary(scan);
      return NextResponse.json({
        ok: true,
        operation: 'summary',
        summary,
        promptVersion: PROMPT_VERSION,
        fallback: summary.fallback ?? summary.generatedBy === 'deterministic',
        fallbackReason: summary.fallbackReason,
        dailyRemaining: dailyQuota.remaining,
        engineUsed: summary.generatedBy,
        modelUsed: summary.generatedBy,
      });
    }

    // Operation: Stack (Technology Stack & Manifests AI Explanation)
    if (operation === 'stack') {
      const explanation = await explainTechStack(scan);
      return NextResponse.json({
        ok: true,
        operation: 'stack',
        explanation,
        promptVersion: PROMPT_VERSION,
        fallback: explanation.fallback ?? explanation.generatedBy === 'deterministic',
        fallbackReason: explanation.fallbackReason,
        dailyRemaining: dailyQuota.remaining,
        engineUsed: explanation.generatedBy,
        modelUsed: explanation.modelUsed || explanation.generatedBy,
      });
    }

    // For explain, route, issue, or all: resolve verified findings strictly from DB
    const rawFindingIds = body.findingIds || (body.findingId ? [body.findingId] : []);
    const findingIds: string[] = Array.isArray(rawFindingIds) ? rawFindingIds : [];

    if (findingIds.length === 0) {
      return NextResponse.json(
        { error: 'findingIds or findingId is required for this operation.', errorCode: 'AUTH_INVALID_INPUT', ok: false },
        { status: 400 }
      );
    }

    const targetFindings: Finding[] = [];
    for (const fId of findingIds) {
      const found = await db.getFindingById(fId);
      if (!found || found.scanId !== scan.id) {
        return NextResponse.json(
          { error: `Unknown finding ID: "${fId}".`, errorCode: 'GITHUB_NOT_FOUND', ok: false },
          { status: 404 }
        );
      }
      targetFindings.push(found);
    }

    const primaryFinding = targetFindings[0];

    // Security Guard: Secrets and security-disclosure findings cannot produce public issue drafts
    if (operation === 'issue') {
      const hasRestrictedFinding = targetFindings.some(
        (f) => f.disclosureMode === 'security-disclosure' || f.category === 'secret'
      );
      if (hasRestrictedFinding) {
        return NextResponse.json(
          {
            error:
              'Public issue draft generation is strictly blocked for secrets and sensitive security findings. Please follow responsible private security disclosure guidance.',
            errorCode: 'DISCLOSURE_BLOCKED',
            guidance:
              'Notify the repository maintainer privately via their SECURITY.md policy, security email, or GitHub Private Vulnerability Reporting.',
            ok: false,
          },
          { status: 403 }
        );
      }
    }

    // Build minimal defensive evidence bundle
    const planRequest = buildGeminiPlanRequest(
      scan.id,
      targetFindings.map((f) => f.id),
      targetFindings,
      scan.technologies || (scan.techStack as any),
      operation === 'all' ? 'route' : operation
    );

    // Execute grounded plan generation with timeout and safety validation
    const plan = await generateGroundedPlan(planRequest, {
      expectedSeverity: primaryFinding.severity,
    });

    // Operation: Explain
    if (operation === 'explain') {
      const explanation = await explainFinding(primaryFinding, scan);
      return NextResponse.json({
        ok: true,
        operation: 'explain',
        plan,
        explanation,
        promptVersion: PROMPT_VERSION,
        fallback: plan.fallback ?? plan.generatedBy === 'deterministic',
        fallbackReason: plan.fallbackReason,
        dailyRemaining: dailyQuota.remaining,
        engineUsed: plan.modelUsed || plan.generatedBy,
        modelUsed: plan.modelUsed || plan.generatedBy,
      });
    }

    // Operation: Route
    if (operation === 'route') {
      const route = await buildContributionRoute(primaryFinding, scan);
      db.saveRoute(route);
      return NextResponse.json({
        ok: true,
        operation: 'route',
        plan,
        route,
        promptVersion: PROMPT_VERSION,
        fallback: plan.fallback ?? plan.generatedBy === 'deterministic',
        fallbackReason: plan.fallbackReason,
        dailyRemaining: dailyQuota.remaining,
        engineUsed: plan.modelUsed || plan.generatedBy,
        modelUsed: plan.modelUsed || plan.generatedBy,
      });
    }

    // Operation: Issue
    if (operation === 'issue') {
      const route = await buildContributionRoute(primaryFinding, scan);
      const draft = await createIssueDraft(route, primaryFinding, scan);
      db.saveDraft(draft);

      db.logActivity({
        userId: user.id,
        type: 'draft_generated',
        repoName: scan.repoName,
        description: `Generated maintainer-reviewable issue draft "${draft.title}" via ${draft.generatedBy.toUpperCase()}`,
      });

      return NextResponse.json({
        ok: true,
        operation: 'issue',
        plan,
        draft,
        promptVersion: PROMPT_VERSION,
        fallback: draft.fallback ?? draft.generatedBy === 'deterministic',
        fallbackReason: draft.fallbackReason,
        dailyRemaining: dailyQuota.remaining,
        engineUsed: plan.modelUsed || plan.generatedBy,
        modelUsed: plan.modelUsed || plan.generatedBy,
      });
    }

    // Operation: All (End-to-end contribution pipeline)
    const explanation = await explainFinding(primaryFinding, scan);
    const route = await buildContributionRoute(primaryFinding, scan);
    db.saveRoute(route);

    let draft = null;
    if (primaryFinding.disclosureMode !== 'security-disclosure' && primaryFinding.category !== 'secret') {
      draft = await createIssueDraft(route, primaryFinding, scan);
      route.draftId = draft.id;
      db.saveDraft(draft);
      db.saveRoute(route);
      db.logActivity({
        userId: user.id,
        type: 'draft_generated',
        repoName: scan.repoName,
        description: `Generated maintainer-reviewable issue draft "${draft.title}" via ${draft.generatedBy.toUpperCase()}`,
      });
    }

    db.logActivity({
      userId: user.id,
      type: 'route_created',
      repoName: scan.repoName,
      description: `Generated AI contribution plan for "${primaryFinding.title}" (${plan.generatedBy.toUpperCase()})`,
    });

    return NextResponse.json({
      ok: true,
      operation: 'all',
      plan,
      explanation,
      route,
      draft,
      promptVersion: PROMPT_VERSION,
      fallback: plan.fallback ?? plan.generatedBy === 'deterministic',
      fallbackReason: plan.fallbackReason,
      dailyRemaining: dailyQuota.remaining,
      engineUsed: plan.modelUsed || plan.generatedBy,
      modelUsed: plan.modelUsed || plan.generatedBy,
    });
  } catch (error: any) {
    console.error('AI plan endpoint error:', error?.message || error);
    const isDisclosureBlocked = error.code === 'DISCLOSURE_BLOCKED' || error.message?.includes('DISCLOSURE_BLOCKED');
    return apiError(
      error.message || 'Failed to generate AI plan',
      isDisclosureBlocked ? 403 : 500,
      isDisclosureBlocked ? 'DISCLOSURE_BLOCKED' : 'GEMINI_UNAVAILABLE'
    );
  }
}
