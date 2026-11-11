/**
 * ContribLens Server-Side Agent Run Manager
 * 
 * Manages active and historical agent runs:
 * 1. Tracks in-flight orchestrator runs with per-user ownership verification.
 * 2. Emits real-time Server-Sent Events (SSE) to active subscribers.
 * 3. Enforces in-memory secret redaction before any event leaves the server.
 * 4. Safe reconnection & state recovery without duplicate execution.
 * 5. Full cancellation support via AbortController.
 */

import { redactSecrets } from '../redaction';
import { runAgentOrchestrator, type AgentRunOptions } from './orchestrator';
import {
  type AgentRunResult,
  type AgentRunEvent,
  type AgentRunStatus,
  type PlannedStep,
  type ToolExecutionRecord,
} from '../../types';

export interface ActiveAgentRun {
  runId: string;
  userId: string;
  repoUrl: string;
  branch?: string;
  goal?: string;
  status: AgentRunStatus;
  createdAt: string;
  updatedAt: string;
  plan: PlannedStep[];
  events: AgentRunEvent[];
  toolCalls: ToolExecutionRecord[];
  result?: AgentRunResult;
  error?: string;
  abortController: AbortController;
  listeners: Set<(event: AgentRunEvent) => void>;
}

// Global run store shared across all Next.js route bundles and requests
const globalForAgent = globalThis as unknown as {
  __contriblens_agent_runs__?: Map<string, ActiveAgentRun>;
};

const runsStore: Map<string, ActiveAgentRun> =
  globalForAgent.__contriblens_agent_runs__ ?? new Map<string, ActiveAgentRun>();

if (!globalForAgent.__contriblens_agent_runs__) {
  globalForAgent.__contriblens_agent_runs__ = runsStore;
}

export class AgentOwnershipError extends Error {
  constructor(message = 'Unauthorized access to agent run.') {
    super(message);
    this.name = 'AgentOwnershipError';
  }
}

/**
 * Creates and starts a new agent orchestration run.
 * Executes asynchronously in the background so SSE/polling clients can stream progress immediately.
 */
export function startAgentRun(params: {
  userId: string;
  repoUrl: string;
  branch?: string;
  goal?: string;
  scanId?: string;
  findingId?: string;
  maxToolCalls?: number;
  initialPlan?: PlannedStep[];
}): ActiveAgentRun {
  const runId = `agt_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const abortController = new AbortController();
  const now = new Date().toISOString();

  const run: ActiveAgentRun = {
    runId,
    userId: params.userId,
    repoUrl: params.repoUrl,
    branch: params.branch,
    goal: params.goal,
    status: 'connecting',
    createdAt: now,
    updatedAt: now,
    plan: params.initialPlan ? [...params.initialPlan] : [],
    events: [],
    toolCalls: [],
    abortController,
    listeners: new Set(),
  };

  runsStore.set(runId, run);

  // Keep runsStore bounded (max 100 historical runs in memory)
  if (runsStore.size > 100) {
    const oldestKey = runsStore.keys().next().value;
    if (oldestKey) runsStore.delete(oldestKey);
  }

  // Asynchronously execute orchestrator on next tick
  setTimeout(async () => {
    try {
      run.status = 'running';
      run.updatedAt = new Date().toISOString();

      const result = await runAgentOrchestrator({
        runId,
        repoUrl: params.repoUrl,
        branch: params.branch,
        goal: params.goal,
        scanId: params.scanId,
        findingId: params.findingId,
        userId: params.userId,
        maxToolCalls: params.maxToolCalls,
        initialPlan: params.initialPlan,
        signal: abortController.signal,
        onEvent: (evt) => {
          // Redact all sensitive fields in event payload
          const safeEvent: AgentRunEvent = {
            ...evt,
            outputSummary: evt.outputSummary ? redactSecrets(evt.outputSummary) : undefined,
            reason: evt.reason ? redactSecrets(evt.reason) : undefined,
            error: evt.error ? redactSecrets(evt.error) : undefined,
          };

          run.events.push(safeEvent);
          run.updatedAt = new Date().toISOString();

          if (evt.plan) {
            run.plan = evt.plan;
          }

          // Broadcast to all active listeners (SSE streams)
          for (const listener of run.listeners) {
            try {
              listener(safeEvent);
            } catch {
              // Ignore disconnected client failures
            }
          }
        },
      });

      run.result = result;
      run.status = result.status;
      run.plan = result.plan;
      run.toolCalls = result.toolCalls;
      run.error = result.error;
      run.updatedAt = new Date().toISOString();
    } catch (err: any) {
      if (run.status !== 'cancelled') {
        run.status = 'failed';
        run.error = redactSecrets(err?.message || 'Agent orchestration encountered an internal error.');
        run.updatedAt = new Date().toISOString();

        const failSeq = run.events.length + 1;
        const failEvent: AgentRunEvent = {
          id: `evt_${runId}_${failSeq}`,
          runId,
          seq: failSeq,
          sequence: failSeq,
          type: 'run_failed',
          status: 'failed',
          timestamp: new Date().toISOString(),
          error: run.error,
          reason: run.error,
        };
        run.events.push(failEvent);

        for (const listener of run.listeners) {
          try {
            listener(failEvent);
          } catch {
            // Ignore
          }
        }
      }
    }
  }, 0);

  return run;
}

/**
 * Records a completed synchronous orchestrator run into the runsStore so that
 * subsequent status checks, polling, and logs can access it.
 */
export function recordCompletedRun(
  result: AgentRunResult,
  userId: string,
  repoUrl: string,
  branch?: string,
  goal?: string
): ActiveAgentRun {
  const now = new Date().toISOString();
  const run: ActiveAgentRun = {
    runId: result.runId,
    userId,
    repoUrl,
    branch,
    goal,
    status: result.status,
    createdAt: now,
    updatedAt: now,
    plan: result.plan,
    events: result.events ?? [],
    toolCalls: result.toolCalls,
    result,
    error: result.error,
    abortController: new AbortController(),
    listeners: new Set(),
  };

  runsStore.set(result.runId, run);

  // Keep runsStore bounded (max 100 historical runs in memory)
  if (runsStore.size > 100) {
    const oldestKey = runsStore.keys().next().value;
    if (oldestKey) runsStore.delete(oldestKey);
  }

  return run;
}

/**
 * Retrieves an active or past agent run, verifying user ownership.
 */
export function getAgentRun(runId: string, userId: string): ActiveAgentRun | null {
  const run = runsStore.get(runId);
  if (!run) return null;

  if (run.userId !== userId) {
    throw new AgentOwnershipError('Unauthorized: You do not own this agent run.');
  }

  return run;
}

/**
 * Returns a sanitized snapshot of a run for polling or reconnect state recovery.
 */
export function getAgentRunSnapshot(runId: string, userId: string, sinceSeq?: number) {
  const run = getAgentRun(runId, userId);
  if (!run) return null;

  const filteredEvents =
    sinceSeq !== undefined && !isNaN(sinceSeq)
      ? run.events.filter((e) => (e.seq ?? 0) > sinceSeq)
      : run.events;

  return {
    runId: run.runId,
    status: run.status,
    repoUrl: run.repoUrl,
    branch: run.branch,
    goal: run.goal,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    plan: run.plan,
    events: filteredEvents,
    toolCalls: run.toolCalls,
    summary: run.result?.summary,
    error: run.error,
    findingsCount: run.result?.findingsCount,
    generatedArtifacts: run.result?.generatedArtifacts,
  };
}

/**
 * Cancels an in-flight agent run.
 */
export function cancelAgentRun(runId: string, userId: string): boolean {
  const run = getAgentRun(runId, userId);
  if (!run) return false;

  if (run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
    return false;
  }

  run.status = 'cancelled';
  run.updatedAt = new Date().toISOString();
  run.abortController.abort();

  const cancelSeq = run.events.length + 1;
  const cancelEvent: AgentRunEvent = {
    id: `evt_${runId}_${cancelSeq}`,
    runId,
    seq: cancelSeq,
    sequence: cancelSeq,
    type: 'run_cancelled',
    status: 'skipped',
    timestamp: new Date().toISOString(),
    reason: 'Run cancelled by user request.',
  };

  run.events.push(cancelEvent);

  for (const listener of run.listeners) {
    try {
      listener(cancelEvent);
    } catch {
      // Ignore
    }
  }

  return true;
}

/**
 * Subscribes a listener to Server-Sent Events for a run.
 * Returns initial replay events for safe reconnection without duplicate execution.
 */
export function subscribeToRunEvents(
  runId: string,
  userId: string,
  listener: (event: AgentRunEvent) => void,
  lastEventId?: string,
  sinceSeq?: number
): {
  unsubscribe: () => void;
  replayEvents: AgentRunEvent[];
  currentRun: ActiveAgentRun;
} {
  const run = getAgentRun(runId, userId);
  if (!run) {
    throw new Error('Run not found');
  }

  // Find missed events for reconnection
  let replayEvents: AgentRunEvent[] = run.events;
  if (sinceSeq !== undefined && !isNaN(sinceSeq)) {
    replayEvents = run.events.filter((e) => (e.seq ?? 0) > sinceSeq);
  } else if (lastEventId) {
    const idx = run.events.findIndex((e) => e.id === lastEventId);
    if (idx !== -1) {
      replayEvents = run.events.slice(idx + 1);
    }
  }

  run.listeners.add(listener);

  const unsubscribe = () => {
    run.listeners.delete(listener);
  };

  return {
    unsubscribe,
    replayEvents,
    currentRun: run,
  };
}

/**
 * Helper for tests to reset in-memory state.
 */
export function clearAllAgentRunsForTesting() {
  runsStore.clear();
}
