'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Play,
  RotateCw,
  XCircle,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Terminal,
  ChevronDown,
  ChevronRight,
  Shield,
  Layers,
  FileCode,
  Search,
  ExternalLink,
  Radio,
  RefreshCw,
  Copy,
  Check,
  Bot,
} from 'lucide-react';
import {
  type AgentRunStatus,
  type AgentRunEvent,
  type PlannedStep,
  type AgentToolName,
  AGENT_TOOL_PURPOSES,
} from '@/types';
import { LiveActionLogSkeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { useRepoUrlValidation } from '@/lib/debounce';
import LastUpdatedBadge from '@/components/ui/LastUpdatedBadge';

interface LiveActionLogProps {
  initialRepoUrl?: string;
  initialGoal?: string;
  initialBranch?: string;
  scanId?: string;
  findingId?: string;
}

const MAX_RENDERED_LOG_EVENTS = 100;

const TOOL_ICONS: Record<AgentToolName, React.ComponentType<{ className?: string }>> = {
  github_fetch_tree: Layers,
  fetch_file: FileCode,
  rule_scan: Shield,
  osv_lookup: Search,
  explain_finding: Bot,
  patch_preview: FileCode,
  draft_issue: ExternalLink,
};

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

export default function LiveActionLog({
  initialRepoUrl = '',
  initialGoal = 'Audit repository configuration, analyze vulnerabilities, and propose verified beginner fixes.',
  initialBranch = '',
  scanId,
  findingId,
}: LiveActionLogProps) {
  // Form Inputs
  const [repoUrl, setRepoUrl] = useState(initialRepoUrl);
  const repoValidation = useRepoUrlValidation(repoUrl, 400);
  const [branch, setBranch] = useState(initialBranch);
  const [goal, setGoal] = useState(initialGoal);

  // Sync form inputs when parent active scan or URL props update
  useEffect(() => {
    if (initialRepoUrl) {
      setRepoUrl((prev) => (prev !== initialRepoUrl ? initialRepoUrl : prev));
    }
  }, [initialRepoUrl]);

  useEffect(() => {
    if (initialBranch) {
      setBranch((prev) => (prev !== initialBranch ? initialBranch : prev));
    }
  }, [initialBranch]);

  // Run State
  const [runId, setRunId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<AgentRunStatus | 'idle' | 'reconnecting'>('idle');
  const [plan, setPlan] = useState<PlannedStep[]>([]);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [finalSummary, setFinalSummary] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [findingsCount, setFindingsCount] = useState<number | null>(null);

  // UI Controls
  const [expandedEvents, setExpandedEvents] = useState<Record<string, boolean>>({});
  const [autoScroll, setAutoScroll] = useState(true);
  const [copiedId, setCopiedId] = useState(false);
  const [announcement, setAnnouncement] = useState<string>('');
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Refs for network, batching & auto-scroll
  const logContainerRef = useRef<HTMLOListElement>(null);
  const logBottomRef = useRef<HTMLDivElement>(null);
  const isUserNearBottomRef = useRef(true);
  const eventBufferRef = useRef<AgentRunEvent[]>([]);
  const flushTimerRef = useRef<NodeJS.Timeout | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const isMountedRef = useRef(true);
  const isStartingRef = useRef(false);
  const terminalRef = useRef(false);
  const lastSeqRef = useRef<number>(0);

  // Screen reader announcer helper
  const announce = useCallback((message: string) => {
    setAnnouncement(message);
  }, []);

  // Copy run ID
  const handleCopyRunId = () => {
    if (!runId) return;
    navigator.clipboard.writeText(runId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // Toggle event details expansion
  const toggleExpand = (id: string) => {
    setExpandedEvents((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Batched event flushing: merges buffered events into state in batches (~8 flushes/sec)
  const flushEventBuffer = useCallback(() => {
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (eventBufferRef.current.length === 0) return;
    const queued = [...eventBufferRef.current];
    eventBufferRef.current = [];

    setEvents((prev) => {
      const existingIds = new Set(prev.map((e) => e.id));
      const additions = queued.filter((e) => !existingIds.has(e.id));
      if (additions.length === 0) return prev;
      return [...prev, ...additions];
    });
  }, []);

  // Smart scroll tracker: detect if user has manually scrolled up
  const handleContainerScroll = useCallback(() => {
    const el = logContainerRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // User is considered "near bottom" if within 60px of the end
    isUserNearBottomRef.current = distanceToBottom <= 60;
  }, []);

  // Toggle auto-scroll from checkbox: immediately scroll down if re-enabled
  const handleToggleAutoScroll = (checked: boolean) => {
    setAutoScroll(checked);
    if (checked) {
      isUserNearBottomRef.current = true;
      logBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Scroll to bottom when new events arrive ONLY if user has not scrolled up
  useEffect(() => {
    if (autoScroll && isUserNearBottomRef.current && logBottomRef.current) {
      logBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [events, autoScroll]);

  // Windowed events for DOM rendering (capped at MAX_RENDERED_LOG_EVENTS)
  const visibleEvents = useMemo(() => {
    if (events.length <= MAX_RENDERED_LOG_EVENTS) return events;
    return events.slice(-MAX_RENDERED_LOG_EVENTS);
  }, [events]);

  // Cleanup EventSource, polling, and timers on unmount
  const cleanupStreams = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (pollingTimerRef.current) {
      clearInterval(pollingTimerRef.current);
      pollingTimerRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    flushEventBuffer();
  }, [flushEventBuffer]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      cleanupStreams();
    };
  }, [cleanupStreams, flushEventBuffer]);

  // Process a real server event (buffered for high-throughput batching)
  const handleServerEvent = useCallback((event: AgentRunEvent) => {
    if (!isMountedRef.current) return;

    // Deduplication by seq and id
    const seq = event.seq ?? (event as any).sequence;
    if (seq !== undefined && seq > 0) {
      if (seq <= lastSeqRef.current) return;
      lastSeqRef.current = Math.max(lastSeqRef.current, seq);
    }

    // Buffer incoming event for batched flush
    eventBufferRef.current.push(event);

    if (event.plan && event.plan.length > 0) {
      setPlan(event.plan);
    }

    const isTerminal =
      event.type === 'run_completed' ||
      event.type === 'run_failed' ||
      event.type === 'run_cancelled';

    // Immediate flush on terminal events or large burst; otherwise schedule at 125ms (~8/sec)
    if (isTerminal || eventBufferRef.current.length >= 25) {
      flushEventBuffer();
    } else if (!flushTimerRef.current) {
      flushTimerRef.current = setTimeout(() => {
        flushTimerRef.current = null;
        flushEventBuffer();
      }, 125);
    }

    if (event.type === 'run_started') {
      setConnectionStatus('running');
      announce(`Agent run started for repository: ${repoUrl}`);
    } else if (event.type === 'tool_started') {
      setConnectionStatus('running');
      announce(`Step ${event.stepNumber || ''}: ${event.tool || ''} running`);
    } else if (event.type === 'tool_completed') {
      setConnectionStatus('running');
      announce(`Step ${event.stepNumber || ''}: ${event.tool || ''} succeeded in ${event.durationMs || 0} milliseconds`);
    } else if (event.type === 'tool_failed') {
      announce(`Step ${event.stepNumber || ''}: ${event.tool || ''} failed: ${event.reason || ''}`);
    } else if (event.type === 'replan_triggered') {
      announce(`Re-planning triggered: ${event.reason || ''}`);
    } else if (event.type === 'run_completed') {
      terminalRef.current = true;
      const finalSt: AgentRunStatus =
        event.runStatus || (event.status === 'needs_human_approval' ? 'needs_human_approval' : 'completed');
      setConnectionStatus(finalSt);
      setFinalSummary(event.outputSummary || 'Agent orchestration successfully completed.');
      cleanupStreams();
      announce(`Agent run completed with status ${finalSt}.`);
    } else if (event.type === 'run_failed') {
      terminalRef.current = true;
      setConnectionStatus('failed');
      setErrorMessage(event.error || event.reason || 'Agent run failed.');
      cleanupStreams();
      announce(`Agent run failed: ${event.error || ''}`);
    } else if (event.type === 'run_cancelled') {
      terminalRef.current = true;
      setConnectionStatus('cancelled');
      setFinalSummary('Run cancelled by user request.');
      cleanupStreams();
      announce('Agent run cancelled.');
    }
  }, [announce, cleanupStreams, flushEventBuffer, repoUrl]);

  // Bounded Polling Fallback & State Recovery
  const fetchRunSnapshot = useCallback(async (currentRunId: string): Promise<boolean> => {
    if (!isMountedRef.current) return false;
    try {
      const sinceParam = lastSeqRef.current > 0 ? `?sinceSeq=${lastSeqRef.current}` : '';
      const res = await fetch(`/api/agent/run/${encodeURIComponent(currentRunId)}${sinceParam}`);

      if (res.status === 404) {
        terminalRef.current = true;
        cleanupStreams();
        setConnectionStatus('failed');
        setErrorMessage('Agent run not found or has expired.');
        return false;
      }

      if (res.status === 401 || res.status === 403) {
        terminalRef.current = true;
        cleanupStreams();
        setConnectionStatus('failed');
        setErrorMessage('Authentication required or unauthorized access to agent run.');
        return false;
      }

      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.run) {
          const run = json.run;
          if (run.plan && run.plan.length > 0) setPlan(run.plan);

          if (Array.isArray(run.events) && run.events.length > 0) {
            for (const evt of run.events) {
              const s = evt.seq ?? evt.sequence;
              if (s !== undefined && s > lastSeqRef.current) {
                lastSeqRef.current = s;
              }
            }
            eventBufferRef.current.push(...run.events);
            flushEventBuffer();
          }

          if (run.summary) setFinalSummary(run.summary);
          if (run.error) setErrorMessage(run.error);
          if (run.findingsCount !== undefined) setFindingsCount(run.findingsCount);

          if (
            run.status === 'completed' ||
            run.status === 'failed' ||
            run.status === 'cancelled' ||
            run.status === 'needs_human_approval'
          ) {
            terminalRef.current = true;
            setConnectionStatus(run.status);
            cleanupStreams();
            return false;
          } else {
            // Still running
            setConnectionStatus(run.status || 'running');
            return true;
          }
        }
      }
      return false;
    } catch (err) {
      console.warn('Snapshot fetch failed:', err);
      return false;
    }
  }, [cleanupStreams, flushEventBuffer]);

  const startBoundedPolling = useCallback((currentRunId: string) => {
    cleanupStreams();
    let pollCount = 0;
    const maxPolls = 60; // 2 minutes at 2s interval

    pollingTimerRef.current = setInterval(async () => {
      pollCount++;
      if (pollCount > maxPolls) {
        cleanupStreams();
        if (!terminalRef.current) {
          setConnectionStatus('failed');
          setErrorMessage('Connection timed out after maximum polling attempts. Click "Resume" to retry.');
        }
        return;
      }
      await fetchRunSnapshot(currentRunId);
    }, 2000);
  }, [cleanupStreams, fetchRunSnapshot]);

  // Connect to SSE stream
  const connectSSE = useCallback((currentRunId: string) => {
    if (terminalRef.current || !isMountedRef.current) return;
    cleanupStreams();
    setConnectionStatus('connecting');

    const sinceParam = lastSeqRef.current > 0 ? `?sinceSeq=${lastSeqRef.current}` : '';
    const sseUrl = `/api/agent/run/${encodeURIComponent(currentRunId)}/events${sinceParam}`;
    const es = new EventSource(sseUrl);
    eventSourceRef.current = es;

    es.addEventListener('agent_event', (e) => {
      try {
        const parsed: AgentRunEvent = JSON.parse(e.data);
        handleServerEvent(parsed);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    });

    es.onerror = async () => {
      es.close();
      eventSourceRef.current = null;

      // If run reached terminal state, do not reconnect
      if (terminalRef.current || !isMountedRef.current) {
        return;
      }

      // Check server run state first before assuming network failure
      const isStillRunning = await fetchRunSnapshot(currentRunId);
      if (!isStillRunning || terminalRef.current) {
        return;
      }

      reconnectAttemptsRef.current += 1;

      if (reconnectAttemptsRef.current <= 5) {
        setConnectionStatus('reconnecting');
        announce('Connection interrupted. Reconnecting to live run state...');
        const backoffMs = Math.min(1000 * Math.pow(1.4, reconnectAttemptsRef.current), 5000);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (!terminalRef.current && isMountedRef.current) {
            connectSSE(currentRunId);
          }
        }, backoffMs);
      } else {
        // Switch to bounded polling
        startBoundedPolling(currentRunId);
      }
    };
  }, [cleanupStreams, handleServerEvent, announce, fetchRunSnapshot, startBoundedPolling]);

  // Start Agent Run
  const handleStartRun = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (
      isStartingRef.current ||
      connectionStatus === 'running' ||
      connectionStatus === 'connecting' ||
      connectionStatus === 'reconnecting'
    ) {
      return;
    }

    if (!repoUrl.trim()) {
      setErrorMessage('Please enter a valid GitHub repository URL.');
      return;
    }

    isStartingRef.current = true;
    terminalRef.current = false;
    lastSeqRef.current = 0;
    reconnectAttemptsRef.current = 0;
    setErrorMessage(null);
    setFinalSummary(null);
    eventBufferRef.current = [];
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    setEvents([]);
    setPlan([]);
    setConnectionStatus('connecting');
    cleanupStreams();

    try {
      const res = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repositoryUrl: repoUrl.trim(),
          branch: branch.trim() || undefined,
          goal: goal.trim() || undefined,
          scanId,
          findingId,
          mode: 'stream',
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        terminalRef.current = true;
        setConnectionStatus('failed');
        setErrorMessage(json.error || 'Failed to start agent run.');
        announce(`Run creation failed: ${json.error || ''}`);
        return;
      }

      setRunId(json.runId);
      if (json.plan) setPlan(json.plan);
      announce(`Run initiated with ID ${json.runId}. Connecting to live action stream.`);
      connectSSE(json.runId);
    } catch (err: any) {
      terminalRef.current = true;
      setConnectionStatus('failed');
      setErrorMessage(err?.message || 'Network error starting agent run.');
    } finally {
      isStartingRef.current = false;
    }
  };

  // Cancel Agent Run
  const handleCancelRun = async () => {
    if (!runId) return;
    setShowCancelConfirm(false);
    try {
      await fetch(`/api/agent/run/${encodeURIComponent(runId)}`, {
        method: 'POST',
      });
      setConnectionStatus('cancelled');
      setFinalSummary('Run cancelled by user request.');
      announce('Agent run cancelled.');
      cleanupStreams();
    } catch (err: any) {
      console.error('Cancel failed:', err);
    }
  };

  // Reconnect manually
  const handleManualReconnect = () => {
    if (!runId) return;
    reconnectAttemptsRef.current = 0;
    terminalRef.current = false;
    setErrorMessage(null);
    setConnectionStatus('reconnecting');
    connectSSE(runId);
  };

  // Compute live step status mapping based on real events
  const stepStatusMap = useMemo(() => {
    const map = new Map<number, { status: 'queued' | 'running' | 'succeeded' | 'failed' | 'skipped'; durationMs?: number }>();
    for (const evt of events) {
      if (evt.stepNumber !== undefined) {
        if (evt.type === 'tool_started') {
          map.set(evt.stepNumber, { status: 'running' });
        } else if (evt.type === 'tool_completed') {
          map.set(evt.stepNumber, { status: 'succeeded', durationMs: evt.durationMs });
        } else if (evt.type === 'tool_failed') {
          map.set(evt.stepNumber, { status: 'failed', durationMs: evt.durationMs });
        } else if (evt.type === 'tool_queued' && !map.has(evt.stepNumber)) {
          map.set(evt.stepNumber, { status: 'queued' });
        }
      }
    }
    return map;
  }, [events]);

  return (
    <section aria-labelledby="live-action-log-heading" className="w-full space-y-6">
      {/* Screen Reader Aria-Live Status Region */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      {/* Header & Connection Status Capsule */}
      <header className="rounded-2xl border border-white/10 bg-blackHole/80 backdrop-blur-md p-4 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-electricTangerine/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-electricTangerine" aria-hidden="true" />
              <h1 id="live-action-log-heading" className="text-lg sm:text-xl font-bold tracking-tight text-sustainableLinen">
                Live Action Log
              </h1>
            </div>
            <p className="text-xs text-textMuted">
              Real-time audit decisions and bounded tool executions. Zero simulated events.
            </p>
          </div>

          {/* Connection Status Pill with Explicit Text & Aria */}
          <div className="flex items-center gap-2">
            <div
              role="status"
              aria-label={`Agent status: ${connectionStatus}`}
              className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium flex items-center gap-2 border ${
                connectionStatus === 'running'
                  ? 'bg-electricTangerine/15 text-electricTangerine border-electricTangerine/40 shadow-[0_0_12px_rgba(255,109,31,0.2)]'
                  : connectionStatus === 'completed'
                  ? 'bg-green-500/15 text-green-400 border-green-500/30'
                  : connectionStatus === 'needs_human_approval'
                  ? 'bg-lemonChiffon/15 text-lemonChiffon border-lemonChiffon/40'
                  : connectionStatus === 'failed'
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : connectionStatus === 'reconnecting'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                  : 'bg-white/5 text-textMuted border-white/10'
              }`}
            >
              {connectionStatus === 'running' && <RotateCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {connectionStatus === 'connecting' && <Radio className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />}
              {connectionStatus === 'reconnecting' && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
              {connectionStatus === 'completed' && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
              {connectionStatus === 'needs_human_approval' && <Shield className="w-3.5 h-3.5 text-lemonChiffon" aria-hidden="true" />}
              {connectionStatus === 'failed' && <XCircle className="w-3.5 h-3.5" aria-hidden="true" />}
              {connectionStatus === 'cancelled' && <XCircle className="w-3.5 h-3.5" aria-hidden="true" />}

              <span className="uppercase tracking-wider">
                {connectionStatus === 'running' && '[RUNNING]'}
                {connectionStatus === 'connecting' && '[CONNECTING]'}
                {connectionStatus === 'reconnecting' && '[RECONNECTING]'}
                {connectionStatus === 'completed' && '[COMPLETED]'}
                {connectionStatus === 'needs_human_approval' && '[HUMAN REVIEW REQUIRED]'}
                {connectionStatus === 'failed' && '[FAILED]'}
                {connectionStatus === 'cancelled' && '[CANCELLED]'}
                {connectionStatus === 'idle' && '[IDLE - READY]'}
              </span>
            </div>

            {/* Run ID Pill */}
            {runId && (
              <button
                type="button"
                onClick={handleCopyRunId}
                className="min-h-[44px] px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-mono text-textMuted hover:text-sustainableLinen hover:border-white/20 transition-all flex items-center gap-1.5 press-spring touch-manipulation"
                title="Click to copy Run ID"
                aria-label={`Copy run ID: ${runId}`}
              >
                <span>{runId.slice(0, 14)}...</span>
                {copiedId ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Input Configuration Form */}
        <form onSubmit={handleStartRun} className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6 space-y-1">
            <div className="flex items-center justify-between">
              <label htmlFor="agent-repo-url" className="text-[11px] font-mono uppercase tracking-wider text-textMuted">
                Target Repository URL
              </label>
              {repoValidation.status === 'valid' && (
                <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1 animate-fade-in">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Valid format</span>
                </span>
              )}
              {repoValidation.status === 'invalid' && !repoValidation.isValidating && (
                <span className="text-[10px] font-mono text-red-400 flex items-center gap-1 animate-fade-in">
                  <AlertCircle className="w-3 h-3" />
                  <span>Invalid format</span>
                </span>
              )}
            </div>
            <div className="relative">
              <input
                id="agent-repo-url"
                type="url"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                placeholder="https://github.com/owner/repository"
                disabled={connectionStatus === 'running' || connectionStatus === 'connecting'}
                required
                className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-black/60 border text-base sm:text-xs text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-all ${
                  repoValidation.status === 'valid'
                    ? 'border-emerald-500/50 focus:border-emerald-400'
                    : repoValidation.status === 'invalid' && !repoValidation.isValidating
                    ? 'border-rosewood/70 focus:border-red-400'
                    : 'border-white/15 focus:border-electricTangerine'
                }`}
              />
            </div>
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="agent-branch" className="text-[11px] font-mono uppercase tracking-wider text-textMuted">
              Branch (Optional)
            </label>
            <input
              id="agent-branch"
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              disabled={connectionStatus === 'running' || connectionStatus === 'connecting'}
              className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-black/60 border border-white/15 text-base sm:text-xs text-sustainableLinen placeholder:text-textTertiary focus:outline-none focus:border-electricTangerine transition-all"
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            {connectionStatus === 'running' || connectionStatus === 'connecting' || connectionStatus === 'reconnecting' ? (
              <div className="w-full flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCancelConfirm(true)}
                  className="flex-1 min-h-[44px] px-4 py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-200 text-xs font-semibold flex items-center justify-center gap-2 transition-all press-spring touch-manipulation"
                  aria-label="Cancel current agent run"
                >
                  <XCircle className="w-4 h-4 text-red-400" aria-hidden="true" />
                  <span>Cancel Execution</span>
                </button>
                {connectionStatus === 'reconnecting' && (
                  <button
                    type="button"
                    onClick={handleManualReconnect}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-all touch-manipulation"
                    title="Reconnect to stream"
                    aria-label="Retry connecting to event stream"
                  >
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>Resume</span>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="submit"
                disabled={!repoUrl.trim() || isStartingRef.current}
                className="w-full min-h-[44px] px-5 py-2.5 rounded-xl bg-electricTangerine hover:bg-electricTangerine/90 text-black font-semibold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_rgba(255,109,31,0.3)] press-spring touch-manipulation disabled:opacity-50"
                aria-label="Start authorized agent run"
              >
                <Play className="w-4 h-4 fill-black" aria-hidden="true" />
                <span>Start Agent Run</span>
              </button>
            )}
          </div>
        </form>

        {errorMessage && (
          <div role="alert" className="mt-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" aria-hidden="true" />
              <span>{errorMessage}</span>
            </div>
            {runId && (connectionStatus === 'failed' || connectionStatus === 'reconnecting') && (
              <button
                type="button"
                onClick={handleManualReconnect}
                className="min-h-[36px] px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 border border-red-500/40 text-xs font-semibold flex items-center justify-center gap-1.5 shrink-0 transition-colors press-spring touch-manipulation"
                aria-label="Reconnect to live action log"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Reconnect Live Log</span>
              </button>
            )}
          </div>
        )}
      </header>

      {/* Validated Plan Overview Rail */}
      {plan.length > 0 && (
        <section aria-labelledby="plan-overview-heading" className="rounded-2xl border border-white/10 bg-blackHole/60 backdrop-blur-md p-4 sm:p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 id="plan-overview-heading" className="text-xs font-mono uppercase tracking-wider text-lemonChiffon flex items-center gap-2">
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Validated Execution Plan ({plan.length} Steps)</span>
            </h2>
            <span className="text-[11px] font-mono text-textMuted">Fixed Allowlist Enforced</span>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {plan.map((step, idx) => {
              const stepNum = step.stepNumber || idx + 1;
              const stepInfo = stepStatusMap.get(stepNum);
              const status = stepInfo?.status || 'queued';
              const Icon = TOOL_ICONS[step.tool] || Terminal;
              const purpose = AGENT_TOOL_PURPOSES[step.tool] || step.rationale || step.reasoning || 'Execute approved step';

              return (
                <li
                  key={`plan_step_${stepNum}`}
                  className={`p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                    status === 'running'
                      ? 'border-electricTangerine/60 bg-electricTangerine/10 shadow-[0_0_15px_rgba(255,109,31,0.15)]'
                      : status === 'succeeded'
                      ? 'border-green-500/30 bg-green-500/5'
                      : status === 'failed'
                      ? 'border-red-500/40 bg-red-500/10'
                      : 'border-white/10 bg-white/[0.02]'
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 font-mono font-semibold text-sustainableLinen">
                        <span className="w-4 h-4 rounded-full bg-white/10 text-[10px] flex items-center justify-center text-textMuted">
                          {stepNum}
                        </span>
                        <Icon className="w-3.5 h-3.5 text-botticelli" aria-hidden="true" />
                        <span className="truncate">{step.tool}</span>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase font-semibold ${
                          status === 'running'
                            ? 'text-electricTangerine bg-electricTangerine/20'
                            : status === 'succeeded'
                            ? 'text-green-400 bg-green-500/20'
                            : status === 'failed'
                            ? 'text-red-400 bg-red-500/20'
                            : 'text-textMuted bg-white/5'
                        }`}
                      >
                        {status}
                      </span>
                    </div>

                    <p className="text-[11px] text-textMuted leading-relaxed line-clamp-2">
                      {purpose}
                    </p>
                  </div>

                  {stepInfo?.durationMs !== undefined && (
                    <div className="mt-2 pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-textMuted">
                      <span>Duration:</span>
                      <span className="text-sustainableLinen">{formatDuration(stepInfo.durationMs)}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* Live Action Log Feed */}
      <section aria-labelledby="live-feed-heading" className="rounded-2xl border border-white/10 bg-black/60 backdrop-blur-md overflow-hidden shadow-2xl">
        <div className="px-4 py-3 bg-white/[0.03] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 id="live-feed-heading" className="text-xs font-mono uppercase tracking-wider text-sustainableLinen flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-electricTangerine" aria-hidden="true" />
              <span>Event Stream ({events.length} emitted)</span>
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <label className="min-h-[44px] text-[11px] font-mono text-textMuted flex items-center gap-2 cursor-pointer touch-manipulation">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => handleToggleAutoScroll(e.target.checked)}
                className="w-4 h-4 rounded bg-black border-white/20 text-electricTangerine focus:ring-0 cursor-pointer"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>

        {events.length === 0 ? (
          connectionStatus === 'connecting' ? (
            <div className="p-4">
              <LiveActionLogSkeleton />
            </div>
          ) : connectionStatus === 'failed' || errorMessage ? (
            <div className="p-6">
              <ErrorState
                title="Agent Run Failed"
                message={errorMessage || 'Agent run encountered an unexpected failure.'}
                onRetry={handleStartRun}
                retryLabel="Retry Agent Run"
                compact={true}
              />
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={Terminal}
                title="Awaiting Agent Launch"
                description="Enter a GitHub repository URL above and click Start Agent Run to launch the bounded deterministic audit stream."
                action={{
                  label: 'Start Agent Run',
                  onClick: handleStartRun,
                  icon: Play,
                }}
                compact={true}
              />
            </div>
          )
        ) : (
          <ol
            ref={logContainerRef}
            onScroll={handleContainerScroll}
            className="divide-y divide-white/5 font-mono text-xs max-h-[500px] overflow-y-auto p-2 sm:p-4 space-y-2"
          >
            {events.length > MAX_RENDERED_LOG_EVENTS && (
              <li
                key="truncated-banner"
                className="p-2.5 rounded-xl border border-lemonChiffon/20 bg-lemonChiffon/[0.04] text-[11px] font-mono text-sustainableLinen/90 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-lemonChiffon shrink-0" aria-hidden="true" />
                  <span className="font-semibold text-lemonChiffon">
                    Displaying latest {MAX_RENDERED_LOG_EVENTS} of {events.length} stream events
                  </span>
                </div>
                <span className="text-textMuted text-[10px]">
                  ({events.length - MAX_RENDERED_LOG_EVENTS} earlier events preserved in full run record)
                </span>
              </li>
            )}
            {visibleEvents.map((evt) => {
              const isExpanded = !!expandedEvents[evt.id];
              const isToolEvt = evt.tool !== undefined;
              const Icon = evt.tool ? TOOL_ICONS[evt.tool] || Terminal : Terminal;

              return (
                <li
                  key={evt.id}
                  className={`p-2.5 rounded-xl transition-all border ${
                    evt.type === 'tool_started'
                      ? 'border-electricTangerine/30 bg-electricTangerine/5'
                      : evt.type === 'tool_completed'
                      ? 'border-green-500/20 bg-green-500/[0.02]'
                      : evt.type === 'tool_failed' || evt.type === 'run_failed'
                      ? 'border-red-500/30 bg-red-500/10'
                      : evt.type === 'replan_triggered'
                      ? 'border-amber-500/30 bg-amber-500/10'
                      : 'border-white/5 bg-white/[0.01]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <time dateTime={evt.timestamp} className="text-[11px] text-textMuted shrink-0 pt-0.5">
                        {formatTimestamp(evt.timestamp)}
                      </time>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          {evt.stepNumber !== undefined && (
                            <span className="text-[10px] font-bold text-lemonChiffon px-1.5 py-0.5 rounded bg-lemonChiffon/10">
                              Step {evt.stepNumber}
                            </span>
                          )}

                          {isToolEvt && (
                            <span className="font-semibold text-sustainableLinen flex items-center gap-1">
                              <Icon className="w-3.5 h-3.5 text-botticelli" aria-hidden="true" />
                              <span>{evt.tool}</span>
                            </span>
                          )}

                          {/* Event Type / Status Badge */}
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${
                              evt.type === 'tool_started'
                                ? 'text-electricTangerine bg-electricTangerine/20'
                                : evt.type === 'tool_completed'
                                ? 'text-green-400 bg-green-500/20'
                                : evt.type === 'tool_failed' || evt.type === 'run_failed'
                                ? 'text-red-400 bg-red-500/20'
                                : evt.type === 'replan_triggered'
                                ? 'text-amber-300 bg-amber-500/20'
                                : evt.type === 'run_completed'
                                ? 'text-green-300 bg-green-500/20'
                                : 'text-textMuted bg-white/10'
                            }`}
                          >
                            {evt.type === 'tool_started' && '[RUNNING]'}
                            {evt.type === 'tool_completed' && '[SUCCEEDED]'}
                            {evt.type === 'tool_failed' && '[FAILED]'}
                            {evt.type === 'tool_queued' && '[QUEUED]'}
                            {evt.type === 'replan_triggered' && '[REPLANNING]'}
                            {evt.type === 'run_started' && '[RUN STARTED]'}
                            {evt.type === 'plan_created' && '[PLAN CREATED]'}
                            {evt.type === 'run_completed' && '[COMPLETED]'}
                            {evt.type === 'run_failed' && '[FAILED]'}
                            {evt.type === 'run_cancelled' && '[CANCELLED]'}
                          </span>

                          {evt.durationMs !== undefined && (
                            <span className="text-[11px] text-textMuted flex items-center gap-1">
                              <Clock className="w-3 h-3" aria-hidden="true" />
                              <span>{formatDuration(evt.durationMs)}</span>
                            </span>
                          )}
                        </div>

                        {/* Event Safe Output Summary or Reason */}
                        {evt.outputSummary && (
                          <p className="text-xs text-sustainableLinen/90 leading-relaxed break-words font-sans">
                            {evt.outputSummary}
                          </p>
                        )}

                        {evt.reason && (
                          <p className="text-xs text-amber-200/90 leading-relaxed break-words font-sans">
                            {evt.reason}
                          </p>
                        )}

                        {evt.error && (
                          <p className="text-xs text-red-300 leading-relaxed break-words font-sans">
                            {evt.error}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Expand Details Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(evt.id)}
                      className="min-w-[44px] min-h-[44px] p-2 rounded-xl text-textMuted hover:text-sustainableLinen hover:bg-white/10 transition-colors shrink-0 flex items-center justify-center touch-manipulation press-spring"
                      aria-expanded={isExpanded}
                      aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for event ${evt.id}`}
                    >
                      {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Expanded Sanitized Event Metadata */}
                  {isExpanded && (
                    <div className="mt-2.5 pt-2 border-t border-white/10 text-[11px] text-textMuted space-y-1 font-mono">
                      <div className="flex justify-between">
                        <span>Event ID:</span>
                        <span className="text-sustainableLinen">{evt.id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Timestamp:</span>
                        <span className="text-sustainableLinen">{evt.timestamp}</span>
                      </div>
                      {evt.toolPurpose && (
                        <div>
                          <span className="text-lemonChiffon">Purpose: </span>
                          <span className="text-sustainableLinen font-sans">{evt.toolPurpose}</span>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
            <div ref={logBottomRef} tabIndex={-1} aria-hidden="true" />
          </ol>
        )}

        {/* Final Execution Banner */}
        {finalSummary && (
          <div className="p-4 bg-white/[0.04] border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <span className="text-[11px] font-mono uppercase text-lemonChiffon font-semibold">
                Execution Outcome
              </span>
              <p className="text-xs text-sustainableLinen font-sans">
                {finalSummary}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Link
                href="/app/contributions"
                className="px-3 py-1.5 rounded-lg bg-electricTangerine hover:bg-electricTangerine/90 text-black text-xs font-semibold flex items-center gap-1.5 transition-all press-spring"
              >
                <span>View Contribution Routes</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        )}
      </section>

      {/* Confirmation Dialog: Cancel Active Agent Run */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        title="Cancel Active Agent Run?"
        description="Are you sure you want to cancel the currently executing agent analysis?"
        consequenceWarning="This terminates the execution stream and discards any uncompleted plan steps for this run."
        confirmLabel="Cancel Execution"
        cancelLabel="Keep Running"
        isDestructive={true}
        onConfirm={handleCancelRun}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </section>
  );
}
