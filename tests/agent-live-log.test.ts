/**
 * ContribLens Live Action Log & Event Streaming Test Suite
 * 
 * Verifies:
 * 1. Event serialization: Events conform to AgentRunEventSchema with ISO timestamps,
 *    step numbers, and tool purposes.
 * 2. In-memory secret redaction: Sensitive tokens (ghp_*, sk_live_*, etc.) are redacted
 *    from output summaries, reasons, and error messages before event broadcast.
 * 3. Event ordering: Events are emitted in strict chronological order.
 * 4. Reconnect & state recovery: Connecting to an ongoing run replays past events without
 *    restarting or duplicating tool execution.
 * 5. Error states & replan reasons: Failures emit tool_failed and replan_triggered with
 *    sanitized reasons and zero stack traces.
 * 6. Per-user run ownership: User A's run cannot be retrieved, streamed, or cancelled by User B (403).
 * 7. Cancellation: In-flight runs can be cancelled via AbortController, emitting run_cancelled.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/lib/db';
import { signSessionToken } from '../src/lib/auth';
import { POST as agentRunPost } from '../src/app/api/agent/run/route';
import { GET as agentRunGet, POST as agentRunCancelPost } from '../src/app/api/agent/run/[runId]/route';
import {
  startAgentRun,
  getAgentRun,
  getAgentRunSnapshot,
  cancelAgentRun,
  subscribeToRunEvents,
  clearAllAgentRunsForTesting,
  AgentOwnershipError,
} from '../src/lib/agent/run-manager';
import {
  AgentRunEventSchema,
  type AgentRunEvent,
} from '../src/types';

const USER_ALICE = {
  id: 'usr_alice_live_log',
  email: 'alice@contriblens.dev',
  name: 'Alice Maintainer',
  createdAt: new Date().toISOString(),
};

const USER_BOB = {
  id: 'usr_bob_live_log',
  email: 'bob@contriblens.dev',
  name: 'Bob Contributor',
  createdAt: new Date().toISOString(),
};

function createAuthRequest(url: string, method: string, body?: any, user = USER_ALICE) {
  const token = signSessionToken({
    id: user.id,
    email: user.email,
    name: user.name,
  });

  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Cookie: `contriblens_session=${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function createUnauthRequest(url: string, method: string, body?: any) {
  return new Request(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('Live Action Log & Agent Event Streaming', () => {
  beforeEach(() => {
    clearAllAgentRunsForTesting();
    db.saveUser(USER_ALICE);
    db.saveUser(USER_BOB);
  });

  // ---------------------------------------------------------------------------
  // 1. Event Serialization & Schema Conformance
  // ---------------------------------------------------------------------------
  describe('1. Event Serialization', () => {
    it('serializes valid agent events matching AgentRunEventSchema', () => {
      const mockEvent: AgentRunEvent = {
        id: 'evt_run_123_1',
        runId: 'agt_run_123',
        type: 'tool_started',
        timestamp: new Date().toISOString(),
        stepNumber: 1,
        tool: 'rule_scan',
        toolPurpose: 'Run deterministic security rules in-memory.',
        status: 'running',
        startTime: new Date().toISOString(),
      };

      const parseResult = AgentRunEventSchema.safeParse(mockEvent);
      expect(parseResult.success).toBe(true);
      expect(parseResult.data?.tool).toBe('rule_scan');
    });

    it('rejects events with invalid or missing required fields', () => {
      const invalidEvent = {
        id: 'evt_1',
        // missing runId, type, timestamp
      };

      const parseResult = AgentRunEventSchema.safeParse(invalidEvent);
      expect(parseResult.success).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Secret Redaction in Events
  // ---------------------------------------------------------------------------
  describe('2. Secret Redaction Invariant', () => {
    it('redacts raw API keys and secrets from outputSummary and error fields', async () => {
      const rawSecret = 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const receivedEvents: AgentRunEvent[] = [];

      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/repo-secret-test',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'fetch_file',
            arguments: { repoUrl: 'https://github.com/org/repo-secret-test', path: 'config.env' },
            rationale: `Check config containing secret ${rawSecret}`,
          },
        ],
      });

      subscribeToRunEvents(run.runId, USER_ALICE.id, (evt) => {
        receivedEvents.push(evt);
      });

      // Allow async execution to process
      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(receivedEvents.length).toBeGreaterThan(0);
      for (const evt of receivedEvents) {
        if (evt.outputSummary) {
          expect(evt.outputSummary).not.toContain(rawSecret);
        }
        if (evt.reason) {
          expect(evt.reason).not.toContain(rawSecret);
        }
        if (evt.error) {
          expect(evt.error).not.toContain(rawSecret);
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Event Ordering & Causal Sequencing
  // ---------------------------------------------------------------------------
  describe('3. Event Ordering & Sequencing', () => {
    it('emits events in strict chronological order: run_started -> plan_created -> tool_started -> tool_completed', async () => {
      const eventTypes: string[] = [];

      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/sequencing-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'rule_scan',
            arguments: {
              repoUrl: 'https://github.com/org/sequencing-repo',
              files: [{ path: 'package.json', content: '{"name":"seq-pkg"}' }],
            },
            rationale: 'Scan in-memory manifest',
          },
        ],
      });

      subscribeToRunEvents(run.runId, USER_ALICE.id, (evt) => {
        eventTypes.push(evt.type);
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(eventTypes[0]).toBe('run_started');
      expect(eventTypes).toContain('plan_created');
      expect(eventTypes).toContain('tool_started');
      expect(eventTypes).toContain('tool_completed');
      expect(eventTypes[eventTypes.length - 1]).toBe('run_completed');
    });

    it('emits events with strictly monotonic sequence numbers (seq: 1, 2, 3...)', async () => {
      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/seq-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'rule_scan',
            arguments: {
              repoUrl: 'https://github.com/org/seq-repo',
              files: [{ path: 'package.json', content: '{"name":"seq-test"}' }],
            },
            rationale: 'Scan step',
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(run.events.length).toBeGreaterThan(1);

      let prevSeq = 0;
      for (const evt of run.events) {
        expect(evt.seq).toBeDefined();
        expect(evt.seq).toBeGreaterThan(prevSeq);
        expect(evt.runId).toBe(run.runId);
        prevSeq = evt.seq!;
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Reconnect & State Recovery
  // ---------------------------------------------------------------------------
  describe('4. Reconnection & State Recovery', () => {
    it('replays all existing events on reconnect without duplicating tool execution', async () => {
      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/reconnect-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'rule_scan',
            arguments: {
              repoUrl: 'https://github.com/org/reconnect-repo',
              files: [{ path: 'package.json', content: '{"name":"reconnect-pkg"}' }],
            },
            rationale: 'Initial scan',
          },
        ],
      });

      // Wait until run completes
      await new Promise((resolve) => setTimeout(resolve, 350));

      const firstPassCount = run.events.length;
      expect(firstPassCount).toBeGreaterThan(0);

      // Client connects later (reconnection)
      const { replayEvents, currentRun } = subscribeToRunEvents(run.runId, USER_ALICE.id, () => {});

      // All events replayed faithfully
      expect(replayEvents.length).toBe(firstPassCount);
      expect(currentRun.runId).toBe(run.runId);

      // Verify no extra tool executions took place
      expect(run.toolCalls.length).toBe(1);
    });

    it('replays events after sinceSeq cursor without duplicating tool execution', async () => {
      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/cursor-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'rule_scan',
            arguments: {
              repoUrl: 'https://github.com/org/cursor-repo',
              files: [{ path: 'package.json', content: '{"name":"cursor-pkg"}' }],
            },
            rationale: 'Cursor test',
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 350));
      expect(run.events.length).toBeGreaterThanOrEqual(3);

      // Reconnect with cursor sinceSeq = 2
      const { replayEvents } = subscribeToRunEvents(run.runId, USER_ALICE.id, () => {}, undefined, 2);

      // Should only replay events with seq > 2
      for (const evt of replayEvents) {
        expect(evt.seq).toBeGreaterThan(2);
      }
      expect(replayEvents.length).toBe(run.events.length - 2);

      // API snapshot route also respects ?sinceSeq=2
      const req = createAuthRequest(
        `http://localhost:3000/api/agent/run/${run.runId}?sinceSeq=2`,
        'GET',
        undefined,
        USER_ALICE
      );
      const res = await agentRunGet(req, {
        params: Promise.resolve({ runId: run.runId }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.run.events.length).toBe(replayEvents.length);
      expect(run.toolCalls.length).toBe(1);
    });

    it('returns accurate run snapshot via getAgentRunSnapshot', async () => {
      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/snapshot-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'rule_scan',
            arguments: {
              repoUrl: 'https://github.com/org/snapshot-repo',
              files: [{ path: 'package.json', content: '{"name":"snap-pkg"}' }],
            },
            rationale: 'Snapshot test',
          },
        ],
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      const snapshot = getAgentRunSnapshot(run.runId, USER_ALICE.id);
      expect(snapshot).toBeDefined();
      expect(snapshot?.runId).toBe(run.runId);
      expect(snapshot?.status).toBe('completed');
      expect(Array.isArray(snapshot?.events)).toBe(true);
      expect(Array.isArray(snapshot?.toolCalls)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Error States & Replan Reasons
  // ---------------------------------------------------------------------------
  describe('5. Error States & Replan Events', () => {
    it('emits tool_failed and replan_triggered without exposing stack traces', async () => {
      const events: AgentRunEvent[] = [];

      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/error-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'fetch_file',
            arguments: { repoUrl: 'https://github.com/org/error-repo', path: '../../traversal.txt' },
            rationale: 'Invalid path triggers error',
          },
        ],
      });

      subscribeToRunEvents(run.runId, USER_ALICE.id, (evt) => {
        events.push(evt);
      });

      await new Promise((resolve) => setTimeout(resolve, 350));

      const failedEvt = events.find((e) => e.type === 'tool_failed');
      expect(failedEvt).toBeDefined();
      expect(failedEvt?.status).toBe('failed');
      expect(failedEvt?.reason).toMatch(/traversal/i);
      // Stack traces must never leak into reasons
      expect(failedEvt?.reason).not.toContain('at Object.');
      expect(failedEvt?.reason).not.toContain('at process.');
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Per-User Run Ownership Checks
  // ---------------------------------------------------------------------------
  describe('6. Per-User Run Ownership Checks', () => {
    it('blocks User B from accessing User A run snapshot (403)', async () => {
      const runAlice = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/alice/private-repo',
      });

      const req = createAuthRequest(
        `http://localhost:3000/api/agent/run/${runAlice.runId}`,
        'GET',
        undefined,
        USER_BOB
      );

      const res = await agentRunGet(req, {
        params: Promise.resolve({ runId: runAlice.runId }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('blocks User B from cancelling User A run (403)', async () => {
      const runAlice = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/alice/private-repo-cancel',
      });

      const req = createAuthRequest(
        `http://localhost:3000/api/agent/run/${runAlice.runId}`,
        'POST',
        undefined,
        USER_BOB
      );

      const res = await agentRunCancelPost(req, {
        params: Promise.resolve({ runId: runAlice.runId }),
      });

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('rejects unauthenticated requests to run endpoint with 401', async () => {
      const req = createUnauthRequest('http://localhost:3000/api/agent/run/some_run_id', 'GET');
      const res = await agentRunGet(req, {
        params: Promise.resolve({ runId: 'some_run_id' }),
      });

      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Cancellation
  // ---------------------------------------------------------------------------
  describe('7. Run Cancellation', () => {
    it('cancels active run, sets status to cancelled, and emits run_cancelled event', async () => {
      const events: AgentRunEvent[] = [];

      const run = startAgentRun({
        userId: USER_ALICE.id,
        repoUrl: 'https://github.com/org/long-running-repo',
        initialPlan: [
          {
            stepNumber: 1,
            tool: 'fetch_file',
            arguments: { repoUrl: 'https://github.com/org/long-running-repo', path: 'file1.txt' },
            rationale: 'Step 1',
          },
          {
            stepNumber: 2,
            tool: 'fetch_file',
            arguments: { repoUrl: 'https://github.com/org/long-running-repo', path: 'file2.txt' },
            rationale: 'Step 2',
          },
        ],
      });

      subscribeToRunEvents(run.runId, USER_ALICE.id, (evt) => {
        events.push(evt);
      });

      // Cancel run immediately
      const cancelled = cancelAgentRun(run.runId, USER_ALICE.id);
      expect(cancelled).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 350));

      expect(run.status).toBe('cancelled');
      expect(events.some((e) => e.type === 'run_cancelled')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 8. End-to-End API Flow & Transport Reliability
  // ---------------------------------------------------------------------------
  describe('8. End-to-End API Flow & Transport Reliability', () => {
    it('creates single run via POST /api/agent/run, returns valid runId, and enables subscription', async () => {
      const postReq = createAuthRequest('http://localhost:3000/api/agent/run', 'POST', {
        repositoryUrl: 'https://github.com/org/e2e-repo',
        mode: 'stream',
      });
      const postRes = await agentRunPost(postReq);
      expect(postRes.status).toBe(200);
      const postData = await postRes.json();
      expect(postData.ok).toBe(true);
      expect(postData.runId).toMatch(/^agt_run_/);

      // Verify GET snapshot endpoint works for created run
      const getReq = createAuthRequest(`http://localhost:3000/api/agent/run/${postData.runId}`, 'GET');
      const getRes = await agentRunGet(getReq, {
        params: Promise.resolve({ runId: postData.runId }),
      });
      expect(getRes.status).toBe(200);
      const getData = await getRes.json();
      expect(getData.ok).toBe(true);
      expect(getData.run.runId).toBe(postData.runId);
    });

    it('returns structured 404 error when querying non-existent run ID', async () => {
      const getReq = createAuthRequest('http://localhost:3000/api/agent/run/agt_non_existent', 'GET');
      const getRes = await agentRunGet(getReq, {
        params: Promise.resolve({ runId: 'agt_non_existent' }),
      });
      expect(getRes.status).toBe(404);
      const getData = await getRes.json();
      expect(getData.ok).toBe(false);
      expect(getData.errorCode).toBe('NOT_FOUND');
    });

    it('returns structured 404 error when requesting SSE stream for non-existent run ID', async () => {
      const getReq = createAuthRequest('http://localhost:3000/api/agent/run/agt_non_existent?stream=true', 'GET');
      const getRes = await agentRunGet(getReq, {
        params: Promise.resolve({ runId: 'agt_non_existent' }),
      });
      expect(getRes.status).toBe(404);
      const getData = await getRes.json();
      expect(getData.ok).toBe(false);
      expect(getData.errorCode).toBe('NOT_FOUND');
    });
  });
});
