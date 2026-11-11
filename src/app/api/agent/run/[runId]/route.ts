/**
 * ContribLens Dedicated Agent Run Query & Streaming Route
 * 
 * GET /api/agent/run/[runId]
 * - Returns current snapshot of run state (events, plan, toolCalls, status).
 * - If requested with Accept: text/event-stream or ?stream=true, streams Server-Sent Events (SSE).
 * - Enforces authentication and per-user ownership.
 * 
 * POST /api/agent/run/[runId]
 * - Cancels the active run.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
import {
  getAgentRun,
  getAgentRunSnapshot,
  cancelAgentRun,
  subscribeToRunEvents,
  AgentOwnershipError,
} from '@/lib/agent/run-manager';

export async function GET(
  req: Request,
  props: { params: Promise<{ runId: string }> }
) {
  try {
    const paramsResolved = await props.params;
    const runId = paramsResolved?.runId;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required.', errorCode: 'AUTH_INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    const url = new URL(req.url);
    const wantsStream =
      url.searchParams.get('stream') === 'true' ||
      req.headers.get('accept')?.includes('text/event-stream');

    const sinceSeqParam = url.searchParams.get('sinceSeq');
    const sinceSeq = sinceSeqParam ? parseInt(sinceSeqParam, 10) : undefined;

    // Verify run existence and ownership upfront
    try {
      const run = getAgentRun(runId, user.id);
      if (!run) {
        return NextResponse.json(
          { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
          { status: 404 }
        );
      }
    } catch (err: any) {
      if (err instanceof AgentOwnershipError || err?.name === 'AgentOwnershipError') {
        return NextResponse.json(
          { ok: false, error: err.message, errorCode: 'AUTH_INVALID_CREDENTIALS' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    if (wantsStream) {
      const lastEventId =
        req.headers.get('last-event-id') ||
        url.searchParams.get('lastEventId') ||
        undefined;

      const encoder = new TextEncoder();

      try {
        let streamClosed = false;
        let unsubscribeFn: (() => void) | null = null;

        const stream = new ReadableStream({
          start(controller) {
            try {
              // 1. Initial comment handshake
              controller.enqueue(encoder.encode(': connected\n\n'));

              // 2. Subscribe to new events
              const { unsubscribe, replayEvents, currentRun } = subscribeToRunEvents(
                runId,
                user.id,
                (event) => {
                  if (streamClosed) return;
                  try {
                    const msg = `event: agent_event\ndata: ${JSON.stringify(event)}\nid: ${event.id}\n\n`;
                    controller.enqueue(encoder.encode(msg));

                    if (
                      event.type === 'run_completed' ||
                      event.type === 'run_failed' ||
                      event.type === 'run_cancelled'
                    ) {
                      streamClosed = true;
                      setTimeout(() => {
                        try {
                          controller.close();
                        } catch (closeErr) {
                          console.debug('Controller close suppressed:', closeErr);
                        }
                      }, 500);
                    }
                  } catch (streamErr) {
                    console.debug('SSE event delivery failure, unsubscribing:', streamErr);
                    unsubscribe();
                  }
                },
                lastEventId,
                sinceSeq
              );

              unsubscribeFn = unsubscribe;

              // 3. Immediately replay any past/missed events
              for (const evt of replayEvents) {
                if (streamClosed) break;
                const msg = `event: agent_event\ndata: ${JSON.stringify(evt)}\nid: ${evt.id}\n\n`;
                controller.enqueue(encoder.encode(msg));
              }

              // If run has already finished before connection, close gracefully after replay
              if (
                currentRun.status === 'completed' ||
                currentRun.status === 'failed' ||
                currentRun.status === 'cancelled' ||
                currentRun.status === 'needs_human_approval'
              ) {
                streamClosed = true;
                setTimeout(() => {
                  try {
                    controller.close();
                  } catch (closeErr) {
                    console.debug('Controller close suppressed on terminal state:', closeErr);
                  }
                }, 500);
              }
            } catch (err) {
              try {
                controller.error(err);
              } catch (err2) {
                console.debug('Controller error delivery suppressed:', err2);
              }
            }
          },
          cancel() {
            streamClosed = true;
            if (unsubscribeFn) {
              unsubscribeFn();
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
            'Content-Encoding': 'none',
          },
        });
      } catch (err: any) {
        if (err instanceof AgentOwnershipError || err?.name === 'AgentOwnershipError') {
          return NextResponse.json(
            { ok: false, error: err.message, errorCode: 'AUTH_INVALID_CREDENTIALS' },
            { status: 403 }
          );
        }
        return NextResponse.json(
          { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
          { status: 404 }
        );
      }
    }

    // Default: Return snapshot object
    try {
      const snapshot = getAgentRunSnapshot(runId, user.id, sinceSeq);
      if (!snapshot) {
        return NextResponse.json(
          { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        ok: true,
        run: snapshot,
      });
    } catch (err: any) {
      if (err instanceof AgentOwnershipError || err?.name === 'AgentOwnershipError') {
        return NextResponse.json(
          { ok: false, error: err.message, errorCode: 'AUTH_INVALID_CREDENTIALS' },
          { status: 403 }
        );
      }
      return NextResponse.json(
        { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
        { status: 404 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
}

export async function POST(
  req: Request,
  props: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await props.params;
    const user = await getCurrentUser(req);
    if (!user) {
      return NextResponse.json(
        { ok: false, error: 'Authentication required.', errorCode: 'AUTH_INVALID_CREDENTIALS' },
        { status: 401 }
      );
    }

    try {
      const cancelled = cancelAgentRun(runId, user.id);
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
        { ok: false, error: 'Agent run not found.', errorCode: 'NOT_FOUND' },
        { status: 404 }
      );
    }
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Internal error' },
      { status: 500 }
    );
  }
}
