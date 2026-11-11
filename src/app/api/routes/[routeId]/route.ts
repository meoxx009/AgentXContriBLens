import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateContributionReadiness, calculateUrgency } from '@/lib/scanner/readiness';
import { buildEvidenceChain } from '@/lib/scanner/evidence-chain';
import { generateSkillChecklist, generateExplanationModes } from '@/lib/scanner/learning';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  props: { params: Promise<{ routeId: string }> }
) {
  try {
    const { routeId } = await props.params;
    if (!routeId) {
      return apiError('routeId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const route = db.getRouteById(routeId);
    if (!route) {
      return apiError('Route not found', 404, 'GITHUB_NOT_FOUND');
    }

    const scan = db.getScanById(route.scanId);
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to route', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const fId = route.findingId || (route.findingIds && route.findingIds[0]);
    const finding = fId ? db.getFindingById(fId) : null;

    // Ensure readiness, evidence chain, and learning checklist are populated
    if (finding) {
      if (!route.contributionReadiness) {
        route.contributionReadiness = calculateContributionReadiness(finding);
        route.readinessScore = route.contributionReadiness.total;
      }
      if (!route.urgencyScore) {
        const u = calculateUrgency(finding);
        route.urgencyScore = u.urgencyScore;
        route.urgencyLabel = u.urgencyLabel;
      }
      if (!route.evidenceChain) {
        route.evidenceChain = buildEvidenceChain(finding, { repoName: scan.repoName });
      }
      if (!route.learningChecklist) {
        route.learningChecklist = generateSkillChecklist(finding, route);
      }
      if (!route.explanationModes) {
        route.explanationModes = generateExplanationModes(finding, route);
      }
      db.saveRoute(route);
    }

    return NextResponse.json({
      ok: true,
      success: true,
      route,
      finding,
    });
  } catch (error: any) {
    console.error('Error in GET /api/routes/[routeId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve route',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function PATCH(
  req: Request,
  props: { params: Promise<{ routeId: string }> }
) {
  try {
    const { routeId } = await props.params;
    if (!routeId) {
      return apiError('routeId is required', 400, 'AUTH_INVALID_INPUT');
    }

    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    const { status, learningChecklist, skillId, completed } = body || {};

    const route = db.getRouteById(routeId);
    if (!route) {
      return apiError('Route not found', 404, 'GITHUB_NOT_FOUND');
    }

    const scan = db.getScanById(route.scanId);
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to route', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    if (status) {
      const validStatuses = ['not-started', 'in-progress', 'needs-review', 'completed'];
      if (!validStatuses.includes(status)) {
        return apiError(
          `Invalid status value "${status}". Valid statuses: ${validStatuses.join(', ')}.`,
          400,
          'AUTH_INVALID_INPUT'
        );
      }

      const currentStatus = route.status || 'not-started';
      const allowedTransitions: Record<string, string[]> = {
        'not-started': ['not-started', 'in-progress'],
        'in-progress': ['in-progress', 'needs-review', 'not-started'],
        'needs-review': ['needs-review', 'completed', 'in-progress'],
        'completed': ['completed', 'needs-review', 'in-progress'],
      };

      if (!allowedTransitions[currentStatus]?.includes(status)) {
        return apiError(
          `Invalid status transition from "${currentStatus}" to "${status}". Allowed transitions: ${allowedTransitions[currentStatus]?.filter((s) => s !== currentStatus).join(', ')}.`,
          400,
          'AUTH_INVALID_INPUT'
        );
      }
      route.status = status;
    }

    if (Array.isArray(learningChecklist)) {
      route.learningChecklist = learningChecklist;
    } else if (skillId && typeof completed === 'boolean') {
      if (route.learningChecklist) {
        route.learningChecklist = route.learningChecklist.map((item) =>
          item.id === skillId ? { ...item, completed } : item
        );
      }
    }

    db.saveRoute(route);

    // Persist contributor progress durable memory across sessions
    const learnedSkills = (route.learningChecklist || [])
      .filter((item: any) => item.completed)
      .map((item: any) => item.id || item.skill);

    let progressResult;
    try {
      progressResult = await db.saveContributorProgress({
        userId: user.id,
        taskId: route.id,
        taskTitle: route.title || route.summary || 'Contribution Task',
        status: route.status === 'completed' ? 'completed' : 'in-progress',
        learnedSkills,
        completedAt: route.status === 'completed' ? new Date().toISOString() : null,
        storageTier: 'durable_cloud',
      });
    } catch {
      // Non-blocking for route response
    }

    return NextResponse.json({
      ok: true,
      success: true,
      route,
      storageTier: progressResult?.tier || 'local_ephemeral',
    });
  } catch (error: any) {
    console.error('Error in PATCH /api/routes/[routeId]:', error?.message || error);
    return apiError(
      error?.message || 'Failed to update route',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
