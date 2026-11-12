/**
 * ContribLens Dedicated Agent Orchestrator Run API Route
 * 
 * POST /api/agent/run
 * 
 * Executes bounded, grounded agent orchestration across the 7 approved tools:
 * 1. Authenticates request via server session cookie / Bearer token.
 * 2. Enforces ownership on specified scanId or findingId.
 * 3. Enforces bounded execution: max 20 tool calls, max 3 replans.
 * 4. Never executes repository code; strictly read-only analysis.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { db } from '@/lib/db';
import { checkRateLimit, apiError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import {
  startAgentRun,
  cancelAgentRun,
  getAgentRunSnapshot,
  recordCompletedRun,
  AgentOwnershipError,
} from '@/lib/agent/run-manager';
import { runAgentOrchestrator } from '@/lib/agent/orchestrator';

const AgentRunApiInputSchema = z.object({
  repositoryUrl: z.string({ required_error: 'repositoryUrl is required' }).min(1, 'repositoryUrl is required').optional(),
  branch: z.string().optional(),
  goal: z.string().optional(),
  scanId: z.string().optional(),
  findingId: z.string().optional(),
  maxToolCalls: z.number().int().min(1).max(20).optional(),
  initialPlan: z.array(z.any()).optional(),
  action: z.enum(['start', 'cancel']).optional().default('start'),
  runId: z.string().optional(),
  mode: z.enum(['sync', 'stream', 'async']).optional(),
}).refine((data) => {
  if (data.action === 'cancel') return !!data.runId;
  return !!data.repositoryUrl;
}, {
  message: 'repositoryUrl is required to start a run, runId is required to cancel',
  path: ['repositoryUrl'],
});

export async function POST(req: Request) {
  try {
    // 1. Authenticate user
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Authentication required to run agent orchestrator.',
          errorCode: 'AUTH_INVALID_CREDENTIALS',
        },
        { status: 401 }
      );
    }

    // Rate limit per user: max 15 agent runs per minute
    const rate = checkRateLimit(`agent-run:${user.id}`, { windowMs: 60 * 1000, max: 15 });
    if (!rate.allowed) {
      return apiError(
        'Agent run rate limit exceeded. Please wait a moment before starting a new run.',
        429,
        'GITHUB_RATE_LIMITED',
        { resetTime: rate.resetTime }
      );
    }

    // 2. Parse request body
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: 'Invalid JSON request payload.',
          errorCode: 'AUTH_INVALID_INPUT',
        },
        { status: 400 }
      );
    }

    const parsed = AgentRunApiInputSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.issues.map((i) => i.message).join(', ');
      return NextResponse.json(
        {
          ok: false,
          error: msg.includes('repositoryUrl') ? 'repositoryUrl is required' : `Invalid input: ${msg}`,
          errorCode: 'AUTH_INVALID_INPUT',
        },
        { status: 400 }
      );
    }

    // 3. Handle cancel action
    if (parsed.data.action === 'cancel' && parsed.data.runId) {
      try {
        const cancelled = cancelAgentRun(parsed.data.runId, user.id);
        return NextResponse.json({
          ok: true,
          cancelled,
          status: 'cancelled',
        });
      } catch (err: any) {
        if (err instanceof AgentOwnershipError || err?.name === 'AgentOwnershipError') {
          return NextResponse.json(
            { ok: false, error: err.message, errorCode: 'AUTH_INVALID_CREDENTIALS' },
            { status: 403 }
          );
        }
        return NextResponse.json(
          { ok: false, error: err?.message || 'Run not found', errorCode: 'NOT_FOUND' },
          { status: 404 }
        );
      }
    }

    const { repositoryUrl, branch, goal, scanId, findingId, maxToolCalls, initialPlan, mode } = parsed.data;
    const repoUrl = repositoryUrl!;

    // 4. Ownership verification if scanId provided
    if (scanId) {
      const scan = await db.getScanById(scanId);
      if (scan && scan.userId && scan.userId !== user.id) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Unauthorized access to scan.',
            errorCode: 'AUTH_INVALID_CREDENTIALS',
          },
          { status: 403 }
        );
      }
    }

    // 5. Ownership verification if findingId provided
    if (findingId) {
      const finding = await db.getFindingById(findingId);
      if (finding && finding.scanId) {
        const scan = await db.getScanById(finding.scanId);
        if (scan && scan.userId && scan.userId !== user.id) {
          return NextResponse.json(
            {
              ok: false,
              error: 'Unauthorized access to finding.',
              errorCode: 'AUTH_INVALID_CREDENTIALS',
            },
            { status: 403 }
          );
        }
      }
    }

    // 6. Handle async / stream run request
    if (mode === 'stream' || mode === 'async') {
      const activeRun = startAgentRun({
        userId: user.id,
        repoUrl,
        branch,
        goal,
        scanId,
        findingId,
        maxToolCalls,
        initialPlan,
      });

      return NextResponse.json({
        ok: true,
        runId: activeRun.runId,
        status: activeRun.status,
        plan: activeRun.plan,
        createdAt: activeRun.createdAt,
      });
    }

    // 7. Synchronous execution fallback (for CLI/scripts and backwards compatibility)
    const result = await runAgentOrchestrator({
      repoUrl,
      branch,
      goal,
      scanId,
      findingId,
      userId: user.id,
      maxToolCalls,
      initialPlan,
    });

    recordCompletedRun(result, user.id, repoUrl, branch, goal);

    return NextResponse.json({
      ok: result.status !== 'failed',
      ...result,
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: `Internal agent execution error: ${err?.message || 'unknown error'}`,
        errorCode: 'AUTH_PROVIDER_UNAVAILABLE',
      },
      { status: 500 }
    );
  }
}
