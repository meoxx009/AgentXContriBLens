import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { buildContributionRoute } from '@/lib/gemini';
import { apiError, requireAuth, validateBody } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

const CreateRouteSchema = z.object({
  findingId: z.string({ required_error: 'findingId is required' }).min(1, 'findingId is required'),
});

const PatchRouteSchema = z.object({
  routeId: z.string({ required_error: 'routeId is required' }).min(1, 'routeId is required'),
  status: z.enum(['not-started', 'in-progress', 'needs-review', 'completed']).optional(),
  learningChecklist: z.array(z.any()).optional(),
  skillId: z.string().optional(),
  completed: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const validated = await validateBody(req, CreateRouteSchema);
    if (validated.error) return validated.error;
    const { findingId } = validated.data;

    const finding = await db.getFindingById(findingId);
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    const scan = await db.getScanById(finding.scanId);
    if (!scan) {
      return apiError('Associated scan not found', 404, 'GITHUB_NOT_FOUND');
    }
    if (scan.userId && scan.userId !== user.id) {
      return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
    }

    const route = await buildContributionRoute(finding, scan as any);
    db.saveRoute(route);

    // Update finding reference
    finding.routeCreated = true;
    finding.routeId = route.id;
    db.updateFinding(finding);

    db.logActivity({
      userId: user.id,
      type: 'route_created',
      repoName: scan.repoName,
      description: `Created contribution route for "${finding.title}" (${route.difficulty}, ${route.estimatedEffort})`,
    });

    return NextResponse.json({ success: true, route, ok: true });
  } catch (error: any) {
    console.error('Error in POST /api/routes:', error?.message || error);
    return apiError(
      error?.message || 'Failed to create contribution route',
      500,
      'PERSISTENCE_FAILED'
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

    let routes = db.getRoutes(scanId);
    if (scanId) {
      const scan = db.getScanById(scanId);
      if (!scan) {
        return apiError('Scan not found', 404, 'GITHUB_NOT_FOUND');
      }
      if (scan.userId && scan.userId !== user.id) {
        return apiError('Unauthorized access to scan', 403, 'AUTH_INVALID_CREDENTIALS');
      }

      // Lazy on-demand route generation: if scan has no routes yet, generate concurrently with timeout
      if (routes.length === 0) {
        const findings = db.getFindings(scanId);
        const eligibleFindings = findings.filter(
          (f) =>
            f.category !== 'secret' &&
            f.disclosureMode !== 'security-disclosure' &&
            f.disclosureMode !== 'DISCLOSURE_BLOCKED'
        );
        const sortedFindings = [...eligibleFindings].sort((a, b) => {
          const aIsGoodFirst = a.readiness?.label === 'good-first-contribution' ? 1 : 0;
          const bIsGoodFirst = b.readiness?.label === 'good-first-contribution' ? 1 : 0;
          if (aIsGoodFirst !== bIsGoodFirst) return bIsGoodFirst - aIsGoodFirst;
          return (b.urgencyScore ?? 0) - (a.urgencyScore ?? 0);
        });

        const topFindings = sortedFindings.slice(0, 5);
        // Execute concurrent lazy route generation
        await Promise.allSettled(
          topFindings.map(async (f) => {
            try {
              const route = await buildContributionRoute(f, scan as any);
              db.saveRoute(route);
              f.routeCreated = true;
              f.routeId = route.id;
              db.updateFinding(f);
            } catch (routeErr) {
              console.warn(`Lazy route generation skipped for finding ${f.id}:`, routeErr);
            }
          })
        );
        routes = db.getRoutes(scanId);
      }
    } else {
      const userScanIds = db.getScans(user.id).map((s) => s.id);
      routes = routes.filter((r) => userScanIds.includes(r.scanId));
    }

    return NextResponse.json({ routes, ok: true, success: true });
  } catch (error: any) {
    console.error('Error in GET /api/routes:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve contribution routes',
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

    const { routeId, status, learningChecklist, skillId, completed } = body || {};
    if (!routeId) {
      return apiError('routeId is required', 400, 'AUTH_INVALID_INPUT');
    }

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

    if (learningChecklist && Array.isArray(learningChecklist)) {
      route.learningChecklist = learningChecklist;
    }

    if (skillId && completed !== undefined && route.learningChecklist) {
      route.learningChecklist = route.learningChecklist.map((item) =>
        item.id === skillId ? { ...item, completed: Boolean(completed) } : item
      );
    }

    db.saveRoute(route);

    db.logActivity({
      userId: user.id,
      type: 'route_updated',
      repoName: scan.repoName,
      description: `Updated contribution route "${route.title}" status to ${status || route.status}`,
    });

    return NextResponse.json({ success: true, route, ok: true });
  } catch (error: any) {
    console.error('Error in PATCH /api/routes:', error?.message || error);
    return apiError(
      error?.message || 'Failed to update route',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
