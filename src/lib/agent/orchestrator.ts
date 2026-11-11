/**
 * ContribLens Server-Side Agent Orchestrator
 * 
 * Executes validated agent plans with bounded loops, safety guards, and strict tool allowlists.
 * 
 * Invariants:
 * - Maximum 20 tool calls total.
 * - Maximum 3 replans after tool errors.
 * - Infinite loop prevention via input hash tracking.
 * - Pure server-side execution; zero code execution of scanned repositories.
 * - Deterministic scanner is authoritative for all security findings.
 */

import { createHash } from 'crypto';
import { redactSecrets } from '../redaction.ts';
import {
  ALLOWED_TOOL_NAMES,
  executeToolByName,
  type AgentToolContext,
} from './tools.ts';
import {
  planNextStep,
  type PlannerContext,
} from './planner.ts';
import {
  PlannedStepSchema,
  type PlannedStep,
  type ToolExecutionRecord,
  type AgentRunResult,
  type Finding,
  type AgentRunEvent,
  type AgentToolName,
  AGENT_TOOL_PURPOSES,
} from '../../types.ts';

export const MAX_TOOL_CALLS = 20;
export const MAX_REPLANS = 3;

export interface AgentRunOptions {
  runId?: string;
  repoUrl: string;
  branch?: string;
  goal?: string;
  scanId?: string;
  findingId?: string;
  userId?: string;
  maxToolCalls?: number;
  initialPlan?: PlannedStep[];
  signal?: AbortSignal;
  onEvent?: (event: AgentRunEvent) => void;
}

export function createSafeOutputSummary(tool: AgentToolName, data: any): string {
  if (!data) return 'Action completed successfully.';

  switch (tool) {
    case 'github_fetch_tree': {
      const count = data.candidateFiles?.length || data.filesIndexed || 0;
      const branch = data.targetBranch || data.defaultBranch || 'main';
      return `Indexed ${count} candidate configuration and manifest files on branch "${branch}".`;
    }
    case 'fetch_file': {
      const path = data.path || 'file';
      const size = data.size || 0;
      const hash = data.sha256 ? data.sha256.substring(0, 10) : '';
      return `Loaded "${path}" (${size} bytes, sha256: ${hash}...).`;
    }
    case 'rule_scan': {
      const count = data.findings?.length ?? data.totalFindings ?? 0;
      const scanned = data.scanSummary?.filesScanned || 1;
      return `Scanned ${scanned} files in-memory. Detected ${count} security finding${count === 1 ? '' : 's'}.`;
    }
    case 'osv_lookup': {
      const vuln = data.vulnerabilitiesCount || 0;
      const checked = data.checkedCount || data.checkedPackages?.length || 0;
      return `Queried OSV.dev database for ${checked} dependencies. Identified ${vuln} known advisories.`;
    }
    case 'explain_finding': {
      const title = data.title || 'Security Finding';
      const summary = data.summary || data.explanation || '';
      return `Generated beginner explanation for "${title}": ${summary.slice(0, 80)}${summary.length > 80 ? '...' : ''}`;
    }
    case 'patch_preview': {
      const file = data.file || 'configuration';
      const lines = data.diff ? data.diff.split('\n').length : 0;
      return `Synthesized unified diff proposal for "${file}" (${lines} lines). Marked for human maintainer review.`;
    }
    case 'draft_issue': {
      const title = data.title || 'Maintainer Disclosure';
      return `Drafted maintainer issue disclosure: "${title}" (Badge: ${data.badge || 'Maintainer review required'}).`;
    }
    default:
      return 'Tool execution completed.';
  }
}

export function hashObject(obj: unknown): string {
  const str = typeof obj === 'string' ? obj : JSON.stringify(obj || {});
  return createHash('sha256').update(str).digest('hex').substring(0, 16);
}

export async function runAgentOrchestrator(options: AgentRunOptions): Promise<AgentRunResult> {
  const startTime = Date.now();
  const runId = options.runId || `agt_run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const maxCalls = Math.min(options.maxToolCalls || MAX_TOOL_CALLS, MAX_TOOL_CALLS);

  const plan: PlannedStep[] = [];
  const toolCalls: ToolExecutionRecord[] = [];
  const visitedSignatures = new Set<string>();

  let replanCount = 0;
  let status: 'completed' | 'failed' | 'cancelled' | 'needs_human_approval' = 'completed';
  let summary = '';
  let finalError: string | undefined = undefined;

  let eventSeq = 0;
  const recordedEvents: AgentRunEvent[] = [];

  const emit = (eventData: Omit<AgentRunEvent, 'id' | 'runId' | 'timestamp'>) => {
    eventSeq++;
    const event: AgentRunEvent = {
      id: `evt_${runId}_${eventSeq}`,
      runId,
      seq: eventSeq,
      sequence: eventSeq,
      timestamp: new Date().toISOString(),
      ...eventData,
      outputSummary: eventData.outputSummary ? redactSecrets(eventData.outputSummary) : undefined,
      reason: eventData.reason ? redactSecrets(eventData.reason) : undefined,
      error: eventData.error ? redactSecrets(eventData.error) : undefined,
    };
    recordedEvents.push(event);
    if (options.onEvent) {
      try {
        options.onEvent(event);
      } catch {
        // Safe listener failure isolation
      }
    }
  };

  // 1. Emit run_started
  emit({
    type: 'run_started',
    status: 'running',
    reason: options.goal || `Auditing ${options.repoUrl}`,
  });

  // If initialPlan was provided, emit plan_created and queued steps upfront
  if (options.initialPlan && options.initialPlan.length > 0) {
    emit({
      type: 'plan_created',
      plan: options.initialPlan,
      reason: `Plan loaded with ${options.initialPlan.length} verified steps.`,
    });
    for (let i = 0; i < options.initialPlan.length; i++) {
      const p = options.initialPlan[i];
      emit({
        type: 'tool_queued',
        stepNumber: p.stepNumber || i + 1,
        tool: p.tool,
        toolPurpose: AGENT_TOOL_PURPOSES[p.tool] || p.rationale || p.reasoning || 'Execute step',
        status: 'queued',
      });
    }
  }

  // Context caches for files, findings, and metadata
  const context: AgentToolContext = {
    userId: options.userId,
    scanId: options.scanId,
    findingId: options.findingId,
    repoUrl: options.repoUrl,
    branch: options.branch,
    filesCache: new Map(),
    findingsCache: new Map(),
  };

  const generatedArtifacts: {
    scanId?: string;
    draftId?: string;
    diffs?: string[];
  } = {
    diffs: [],
  };

  // Main Orchestration Loop
  while (toolCalls.length < maxCalls) {
    // Check cancellation signal
    if (options.signal?.aborted) {
      status = 'cancelled';
      summary = 'Agent run was cancelled by user request.';
      emit({
        type: 'run_cancelled',
        status: 'skipped',
        reason: 'Execution halted by cancellation signal.',
      });
      break;
    }

    const plannerContext: PlannerContext = {
      repoUrl: options.repoUrl,
      branch: options.branch,
      goal: options.goal,
      scanId: options.scanId,
      findingId: options.findingId,
      history: toolCalls,
      replanCount,
    };

    // 1. Determine next step: from initialPlan or from planner
    let proposedStep: unknown;

    if (options.initialPlan && options.initialPlan.length > 0) {
      if (plan.length >= options.initialPlan.length) {
        summary = 'Plan execution completed.';
        break;
      }
      proposedStep = options.initialPlan[plan.length];
    } else {
      const decision = await planNextStep(plannerContext);
      if (decision.done) {
        summary = decision.summary || decision.rationale || 'Goal achieved.';
        break;
      }
      proposedStep = decision.step;
    }

    // 2. Validate proposed step against Zod PlannedStepSchema
    const validatedStep = PlannedStepSchema.safeParse(proposedStep);
    if (!validatedStep.success) {
      replanCount++;
      emit({
        type: 'replan_triggered',
        stepNumber: plan.length + 1,
        reason: `Planner proposed invalid step: ${validatedStep.error.message}`,
      });
      if (replanCount >= MAX_REPLANS) {
        status = 'failed';
        finalError = `Planner proposed invalid step: ${validatedStep.error.message}`;
        break;
      }
      continue;
    }

    const step = validatedStep.data;
    plan.push(step);

    const stepNumber = plan.length;
    const toolPurpose = AGENT_TOOL_PURPOSES[step.tool] || step.rationale || step.reasoning || 'Execute step';

    // If step was dynamically planned (not from initialPlan), emit tool_queued
    if (!options.initialPlan) {
      emit({
        type: 'tool_queued',
        stepNumber,
        tool: step.tool,
        toolPurpose,
        status: 'queued',
      });
    }

    // 3. Infinite Loop Prevention: Detect repeated identical calls
    const signature = `${step.tool}:${hashObject(step.arguments)}`;
    if (visitedSignatures.has(signature)) {
      replanCount++;
      const loopReason = `Infinite loop prevented: Tool "${step.tool}" was already executed with identical arguments in this run.`;
      toolCalls.push({
        tool: step.tool,
        arguments: step.arguments,
        ok: false,
        error: loopReason,
        durationMs: 0,
      });

      emit({
        type: 'replan_triggered',
        stepNumber,
        tool: step.tool,
        reason: loopReason,
      });

      status = 'completed';
      summary = 'Execution concluded: Infinite loop prevented on repeated tool call.';
      break;
    }
    visitedSignatures.add(signature);

    // Check cancellation again before executing
    if (options.signal?.aborted) {
      status = 'cancelled';
      summary = 'Agent run was cancelled by user request.';
      emit({
        type: 'run_cancelled',
        status: 'skipped',
        reason: 'Execution halted by cancellation signal.',
      });
      break;
    }

    // 4. Execute tool
    const stepStartTime = new Date().toISOString();
    emit({
      type: 'tool_started',
      stepNumber,
      tool: step.tool,
      toolPurpose,
      status: 'running',
      startTime: stepStartTime,
    });

    const stepStart = Date.now();
    const result = await executeToolByName(step.tool, step.arguments, context);
    const durationMs = Date.now() - stepStart;
    const stepEndTime = new Date().toISOString();

    toolCalls.push({
      tool: step.tool,
      arguments: step.arguments,
      ok: result.ok,
      result: result.data,
      error: result.error,
      warnings: result.warnings,
      durationMs,
    });

    if (result.ok) {
      const outputSummary = createSafeOutputSummary(step.tool, result.data);
      emit({
        type: 'tool_completed',
        stepNumber,
        tool: step.tool,
        toolPurpose,
        status: 'succeeded',
        startTime: stepStartTime,
        endTime: stepEndTime,
        durationMs,
        outputSummary,
      });
    } else {
      emit({
        type: 'tool_failed',
        stepNumber,
        tool: step.tool,
        toolPurpose,
        status: 'failed',
        startTime: stepStartTime,
        endTime: stepEndTime,
        durationMs,
        reason: result.error || 'Tool execution encountered an error.',
      });
    }

    // 5. Track generated artifacts
    if (result.ok && result.data) {
      const data = result.data as any;
      if (step.tool === 'rule_scan' && data.scanId) {
        generatedArtifacts.scanId = data.scanId;
      } else if (step.tool === 'draft_issue' && data.draftId) {
        generatedArtifacts.draftId = data.draftId;
      } else if (step.tool === 'patch_preview' && data.diff) {
        generatedArtifacts.diffs?.push(data.diff);
      }
    }

    // 6. Handle tool failures & replan limits
    if (!result.ok) {
      replanCount++;
      if (replanCount < MAX_REPLANS) {
        emit({
          type: 'replan_triggered',
          stepNumber,
          tool: step.tool,
          reason: `Re-planning attempt ${replanCount}/${MAX_REPLANS} after error: ${result.error || 'Unknown failure'}`,
        });
      }
      if (replanCount >= MAX_REPLANS) {
        if (toolCalls.length <= 3) {
          status = 'failed';
          finalError = result.error || 'Execution failed after maximum replan attempts.';
        } else {
          status = 'completed';
          summary = `Execution completed with warnings: ${result.error || 'Some stages skipped.'}`;
        }
        break;
      }
    }
  }

  // Bound check
  if (toolCalls.length >= maxCalls && !summary) {
    summary = `Execution capped at maximum allowed limit of ${maxCalls} tool calls.`;
  }

  // Count total findings discovered across all tool calls
  let findingsCount = 0;
  for (const tc of toolCalls) {
    if (tc.ok && tc.result) {
      const data = tc.result as any;
      if (Array.isArray(data.findings)) {
        findingsCount += data.findings.length;
      }
    }
  }

  // Determine final status
  const hasHumanArtifacts = toolCalls.some(
    (tc) => tc.ok && (tc.tool === 'patch_preview' || tc.tool === 'draft_issue')
  );

  if (status !== 'failed' && status !== 'cancelled' && hasHumanArtifacts) {
    status = 'needs_human_approval';
  }

  if (status === 'failed') {
    emit({
      type: 'run_failed',
      status: 'failed',
      error: finalError || 'Run execution failed.',
      reason: finalError,
    });
  } else if (status === 'cancelled') {
    emit({
      type: 'run_cancelled',
      status: 'skipped',
      reason: summary || 'Run cancelled by user.',
    });
  } else {
    emit({
      type: 'run_completed',
      status,
      outputSummary: summary || `Agent completed ${toolCalls.length} tool executions across ${plan.length} planned steps.`,
    });
  }

  return {
    runId,
    status,
    plan,
    toolCalls,
    retries: replanCount,
    summary: summary || `Agent completed ${toolCalls.length} tool executions across ${plan.length} planned steps.`,
    error: finalError,
    findingsCount,
    generatedArtifacts,
    events: recordedEvents,
  };
}
