/**
 * Explicit SSE endpoint for Browser EventSource
 * 
 * GET /api/agent/run/[runId]/events
 */

import { GET as getHandler } from '../route';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(
  req: Request,
  props: { params: Promise<{ runId: string }> }
) {
  // Delegate directly to the main handler which supports SSE streaming
  return getHandler(req, props);
}
