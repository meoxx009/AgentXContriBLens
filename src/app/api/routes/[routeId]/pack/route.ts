import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateContributionPackMarkdown } from '@/lib/scanner/learning';
import { calculateContributionReadiness } from '@/lib/scanner/readiness';
import { buildEvidenceChain } from '@/lib/scanner/evidence-chain';
import { generateSkillChecklist } from '@/lib/scanner/learning';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  props: { params: Promise<{ routeId: string }> }
) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { routeId } = await props.params;
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

    const fId = route.findingId || (route.findingIds && route.findingIds[0]);
    const finding = fId ? db.getFindingById(fId) : null;
    if (!finding) {
      return apiError('Finding not found', 404, 'GITHUB_NOT_FOUND');
    }

    // Strict disclosure guard: secrets and critical findings cannot produce contribution packs for public disclosure
    if (
      finding.disclosureMode === 'security-disclosure' ||
      finding.disclosureMode === 'DISCLOSURE_BLOCKED' ||
      finding.category === 'secret' ||
      String(finding.severity).toUpperCase() === 'CRITICAL'
    ) {
      return apiError(
        'Public contribution pack export is strictly blocked for secrets and critical security findings.',
        403,
        'DISCLOSURE_BLOCKED',
        {
          guidance: 'Notify the repository maintainer privately via their SECURITY.md policy.',
        }
      );
    }

    const readiness = route.contributionReadiness || calculateContributionReadiness(finding);
    const chain = route.evidenceChain || buildEvidenceChain(finding, { repoName: scan.repoName });
    const checklist = route.learningChecklist || generateSkillChecklist(finding, route);
    const draft = route.draftId ? db.getDraftById(route.draftId) : undefined;

    const packMarkdown = generateContributionPackMarkdown(
      route,
      finding,
      scan,
      readiness,
      chain,
      checklist,
      draft?.markdownContent
    );

    const filename = `contribution-pack-${scan.repoName.replace(/[^a-zA-Z0-9_-]/g, '_')}-${finding.id}.md`;

    return NextResponse.json({
      ok: true,
      success: true,
      filename,
      markdown: packMarkdown,
    });
  } catch (error: any) {
    console.error('Error in GET /api/routes/[routeId]/pack:', error?.message || error);
    return apiError(
      error?.message || 'Failed to generate contribution pack',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
