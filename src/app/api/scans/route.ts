import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { apiError, requireAuth } from '@/lib/api-guard';
import { executeRepositoryScan } from '@/lib/scanner';
import { convertToTechnologySnapshot } from '@/lib/scanner/evidence';
import { db } from '@/lib/db';
import {
  parseGitHubUrl,
  GitHubRateLimitError,
  GitHubBranchNotFoundError,
  GitHubNotFoundError,
  GitHubPrivateOrUnavailableError,
  GitHubAuthError,
} from '@/lib/scanner/github';
import type { ContribLensErrorCode } from '@/types';

// In-memory rate limiting and concurrency tracking
interface RateLimitTracker {
  timestamps: number[];
  activeCount: number;
}

const userRateLimits = new Map<string, RateLimitTracker>();
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_WINDOW = 10;
const MAX_CONCURRENT_SCANS_PER_USER = 2;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache TTL

function checkRateLimitAndConcurrency(userId: string): { allowed: boolean; reason?: string } {
  const now = Date.now();
  let tracker = userRateLimits.get(userId);

  if (!tracker) {
    tracker = { timestamps: [], activeCount: 0 };
    userRateLimits.set(userId, tracker);
  }

  // Filter timestamps within sliding window
  tracker.timestamps = tracker.timestamps.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (tracker.activeCount >= MAX_CONCURRENT_SCANS_PER_USER) {
    return {
      allowed: false,
      reason: 'Too many concurrent scans. Please wait for your active scan to complete.',
    };
  }

  if (tracker.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      reason: 'Scan rate limit exceeded (maximum 10 scans per 5 minutes). Please try again shortly.',
    };
  }

  // Increment active counter and record timestamp
  tracker.activeCount += 1;
  tracker.timestamps.push(now);
  return { allowed: true };
}

function releaseActiveScan(userId: string) {
  const tracker = userRateLimits.get(userId);
  if (tracker && tracker.activeCount > 0) {
    tracker.activeCount -= 1;
  }
}

export async function POST(req: Request) {
  let authenticatedUserId: string | null = null;

  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        {
          error: 'Authentication required. Please sign in to ContribLens to scan a repository.',
          errorCode: 'AUTH_INVALID_CREDENTIALS' as ContribLensErrorCode,
          correlationId: `CL-ERR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          ok: false,
        },
        { status: 401 }
      );
    }

    authenticatedUserId = user.id;

    // Concurrency and rate limit guard
    const rateCheck = checkRateLimitAndConcurrency(user.id);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: rateCheck.reason,
          errorCode: 'GITHUB_RATE_LIMITED' as ContribLensErrorCode,
        },
        { status: 429 }
      );
    }

    const body = await req.json();
    const repoUrl = body.repositoryUrl || body.repoUrl;
    const ref = (body.ref || body.branch || '').trim() || undefined;
    const scope = body.scope === 'deep' ? 'deep' : 'partial';
    const forceRefresh = Boolean(body.forceRefresh || body.refresh);
    const checks = Array.isArray(body.checks) ? body.checks : undefined;

    if (!repoUrl || typeof repoUrl !== 'string') {
      releaseActiveScan(user.id);
      return NextResponse.json(
        {
          error: 'Please provide a valid GitHub repository URL.',
          errorCode: 'GITHUB_INVALID_URL' as ContribLensErrorCode,
        },
        { status: 400 }
      );
    }

    const parsed = parseGitHubUrl(repoUrl);
    if (!parsed) {
      releaseActiveScan(user.id);
      return NextResponse.json(
        {
          error: 'Invalid GitHub repository URL. Must be in the format: https://github.com/owner/repo',
          errorCode: 'GITHUB_INVALID_URL' as ContribLensErrorCode,
        },
        { status: 400 }
      );
    }

    const effectiveRef = ref || parsed.branch;
    const expectedRepoName = `${parsed.owner}/${parsed.repo}`;

    // Caching check per API_INTEGRATION.md
    if (!forceRefresh) {
      const existingScans = db.getScans(user.id);
      const recentScan = existingScans.find(
        (s) =>
          s.repoName.toLowerCase() === expectedRepoName.toLowerCase() &&
          (!effectiveRef || s.branch === effectiveRef) &&
          Date.now() - new Date(s.scannedAt).getTime() < CACHE_TTL_MS
      );

      if (recentScan) {
        releaseActiveScan(user.id);
        const cachedFindings = db.getFindings(recentScan.id);
        const findingsCount = recentScan.findingsCount;

        return NextResponse.json({
          ok: true,
          scanId: recentScan.id,
          repository: {
            fullName: recentScan.repoName,
            ref: recentScan.branch,
          },
          scope: recentScan.scope || scope,
          summary: {
            findings: findingsCount.total,
            critical: findingsCount.critical,
            high: findingsCount.high,
            medium: findingsCount.medium,
            low: findingsCount.low,
            info: findingsCount.info,
          },
          diff: {
            new: recentScan.comparison?.summary.newCount ?? 0,
            resolved: recentScan.comparison?.summary.resolvedCount ?? 0,
            unchanged: recentScan.comparison?.summary.unchangedCount ?? findingsCount.total,
          },
          technologies: recentScan.technologies || convertToTechnologySnapshot(recentScan.techStack),
          warnings: recentScan.warnings || [],
          cached: true,
          scan: recentScan,
          findings: cachedFindings,
        });
      }
    }

    // Execute pure deterministic scan bounded by safety caps
    const result = await executeRepositoryScan(repoUrl, user.id, effectiveRef, checks, scope);
    releaseActiveScan(user.id);

    // Update scope
    result.scan.scope = scope;
    db.saveScan(result.scan);

    // Ensure durable cloud persistence if Supabase configured
    if (result.scan) {
      await db.syncScanToSupabase(result.scan);
    }
    if (result.findings?.length) {
      await db.syncFindingsToSupabase(result.findings);
    }

    const findingsCount = result.scan.findingsCount;

    return NextResponse.json({
      ok: true,
      scanId: result.scan.id,
      repository: {
        fullName: result.scan.repoName,
        ref: result.scan.branch,
      },
      scope,
      summary: {
        findings: findingsCount.total,
        critical: findingsCount.critical,
        high: findingsCount.high,
        medium: findingsCount.medium,
        low: findingsCount.low,
        info: findingsCount.info,
      },
      diff: {
        new: result.scan.comparison?.summary.newCount ?? findingsCount.total,
        resolved: result.scan.comparison?.summary.resolvedCount ?? 0,
        unchanged: result.scan.comparison?.summary.unchangedCount ?? 0,
      },
      technologies: result.scan.technologies || convertToTechnologySnapshot(result.scan.techStack),
      warnings: result.warnings || [],
      cached: false,
      scan: result.scan,
      findings: result.findings,
    });
  } catch (error: any) {
    if (authenticatedUserId) {
      releaseActiveScan(authenticatedUserId);
    }

    console.error('Scan execution error:', error);
    const message = error.message || 'Scan failed';

    let errorCode: ContribLensErrorCode = 'PERSISTENCE_FAILED';
    let statusCode = 500;
    let resetTime: string | undefined = undefined;
    let defaultBranch: string | undefined = undefined;

    if (error instanceof GitHubRateLimitError || error?.name === 'GitHubRateLimitError') {
      errorCode = 'GITHUB_RATE_LIMITED';
      statusCode = 429;
      resetTime = error.resetTime?.toISOString();
    } else if (
      error instanceof GitHubPrivateOrUnavailableError ||
      error?.name === 'GitHubPrivateOrUnavailableError' ||
      (error instanceof GitHubNotFoundError && (error.message?.toLowerCase().includes('private') || error.message?.toLowerCase().includes('unavailable')))
    ) {
      errorCode = 'GITHUB_PRIVATE_OR_UNAVAILABLE';
      statusCode = 404;
    } else if (error instanceof GitHubBranchNotFoundError || error?.name === 'GitHubBranchNotFoundError') {
      errorCode = 'GITHUB_BRANCH_NOT_FOUND';
      statusCode = 404;
      defaultBranch = error.defaultBranch;
    } else if (error instanceof GitHubNotFoundError || error?.name === 'GitHubNotFoundError') {
      errorCode = 'GITHUB_NOT_FOUND';
      statusCode = 404;
    } else if (error instanceof GitHubAuthError || error?.name === 'GitHubAuthError') {
      errorCode = 'AUTH_INVALID_CREDENTIALS';
      statusCode = 401;
    } else {
      const lower = message.toLowerCase();
      if (lower.includes('rate limit') || lower.includes('403') || lower.includes('429')) {
        errorCode = 'GITHUB_RATE_LIMITED';
        statusCode = 429;
      } else if (lower.includes('branch') && (lower.includes('not found') || lower.includes('failed to load'))) {
        errorCode = 'GITHUB_BRANCH_NOT_FOUND';
        statusCode = 404;
      } else if (lower.includes('not found') || lower.includes('404')) {
        errorCode = 'GITHUB_NOT_FOUND';
        statusCode = 404;
      } else if (lower.includes('private') || lower.includes('access')) {
        errorCode = 'GITHUB_PRIVATE_OR_UNAVAILABLE';
        statusCode = 404;
      } else if (lower.includes('tree') || lower.includes('truncate') || lower.includes('candidate')) {
        errorCode = 'GITHUB_TREE_TRUNCATED';
        statusCode = 422;
      } else if (lower.includes('15 mb') || lower.includes('3 mb') || lower.includes('180 kb') || lower.includes('limit')) {
        errorCode = 'GITHUB_FILE_LIMIT';
        statusCode = 413;
      } else if (lower.includes('osv') || lower.includes('advisory')) {
        errorCode = 'OSV_UNAVAILABLE';
        statusCode = 503;
      }
    }

    const correlationId = `CL-ERR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    return NextResponse.json(
      {
        error: message,
        errorCode,
        correlationId,
        resetTime,
        defaultBranch,
        ok: false,
      },
      { status: statusCode }
    );
  }
}

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const repo = searchParams.get('repo')?.trim().toLowerCase();
    const status = searchParams.get('status')?.trim().toLowerCase();
    const dateRange = searchParams.get('dateRange')?.trim().toLowerCase();
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    if (db.getScans(user.id).length === 0 && db.hydrateFromSupabase) {
      await db.hydrateFromSupabase(user.id);
    }

    let scans = db.getScans(user.id);

    // Repository search filter
    if (repo) {
      scans = scans.filter(
        (s) =>
          s.repoName.toLowerCase().includes(repo) ||
          s.repoUrl.toLowerCase().includes(repo) ||
          (s.owner && s.owner.toLowerCase().includes(repo))
      );
    }

    // Status filter
    if (status && status !== 'all') {
      if (status === 'completed' || status === 'complete') {
        scans = scans.filter(
          (s) =>
            s.status === 'completed' ||
            s.status === 'complete' ||
            s.status === 'complete_with_warnings'
        );
      } else if (status === 'in-progress' || status === 'running' || status === 'scanning') {
        scans = scans.filter(
          (s) => s.status === 'scanning' || s.status === 'running'
        );
      } else if (status === 'failed') {
        scans = scans.filter((s) => s.status === 'failed');
      } else {
        scans = scans.filter((s) => s.status === status);
      }
    }

    // Date range filter
    const now = Date.now();
    if (dateRange && dateRange !== 'all') {
      if (dateRange === 'today') {
        const oneDayAgo = now - 24 * 60 * 60 * 1000;
        scans = scans.filter((s) => new Date(s.scannedAt).getTime() >= oneDayAgo);
      } else if (dateRange === '7d') {
        const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
        scans = scans.filter((s) => new Date(s.scannedAt).getTime() >= sevenDaysAgo);
      } else if (dateRange === '30d') {
        const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
        scans = scans.filter((s) => new Date(s.scannedAt).getTime() >= thirtyDaysAgo);
      }
    }

    if (from) {
      const fromTime = new Date(from).getTime();
      if (!isNaN(fromTime)) {
        scans = scans.filter((s) => new Date(s.scannedAt).getTime() >= fromTime);
      }
    }

    if (to) {
      const toTime = new Date(to).getTime();
      if (!isNaN(toTime)) {
        scans = scans.filter((s) => new Date(s.scannedAt).getTime() <= toTime);
      }
    }

    // Deterministic sort: scannedAt descending
    scans.sort(
      (a, b) =>
        new Date(b.scannedAt).getTime() - new Date(a.scannedAt).getTime()
    );

    const storageStatus = db.getStorageTierStatus();
    return NextResponse.json({ ok: true, scans, storageTier: storageStatus.tier });
  } catch (error: any) {
    console.error('Error in GET /api/scans:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve scans',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
