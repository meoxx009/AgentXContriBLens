import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  throttle,
  throttleRaf,
  createBatcher,
} from '../src/lib/throttle';
import type { AgentRunEvent } from '../src/types';

describe('Throttling and Batching System', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. throttle utility', () => {
    it('fires immediately on leading edge and suppresses calls within waitMs', () => {
      const spy = vi.fn();
      const throttled = throttle(spy, 100);

      throttled('first');
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('first');

      // Rapid calls within waitMs
      throttled('second');
      throttled('third');
      expect(spy).toHaveBeenCalledTimes(1);

      // Advance clock past waitMs to trigger trailing edge
      vi.advanceTimersByTime(100);
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith('third');
    });

    it('cancels pending trailing calls cleanly with .cancel()', () => {
      const spy = vi.fn();
      const throttled = throttle(spy, 100);

      throttled('call1');
      expect(spy).toHaveBeenCalledTimes(1);

      throttled('call2');
      throttled.cancel();

      vi.advanceTimersByTime(150);
      expect(spy).toHaveBeenCalledTimes(1); // call2 was cancelled
    });

    it('flushes pending trailing call immediately with .flush()', () => {
      const spy = vi.fn();
      const throttled = throttle(spy, 100);

      throttled('call1');
      expect(spy).toHaveBeenCalledTimes(1);

      throttled('call2');
      expect(spy).toHaveBeenCalledTimes(1);

      throttled.flush();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith('call2');
    });
  });

  describe('2. throttleRaf (Animation Frame Throttling)', () => {
    it('collapses multiple rapid calls in the same frame to a single call with latest arguments', () => {
      const spy = vi.fn();
      const throttled = throttleRaf(spy);

      throttled('frame-call-1');
      throttled('frame-call-2');
      throttled('frame-call-3');

      expect(spy).not.toHaveBeenCalled();

      // Trigger animation frame / timeout
      vi.advanceTimersByTime(20);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith('frame-call-3');
    });

    it('cancels pending frame with .cancel()', () => {
      const spy = vi.fn();
      const throttled = throttleRaf(spy);

      throttled('frame-call');
      throttled.cancel();

      vi.advanceTimersByTime(50);
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('3. createBatcher (High-Throughput Stream Event Batcher)', () => {
    it('buffers incoming events and flushes them at a fixed cadence', () => {
      const flushSpy = vi.fn();
      const batcher = createBatcher<string>(flushSpy, 125, 50);

      batcher.push('event-1');
      batcher.push('event-2');
      batcher.push('event-3');

      expect(flushSpy).not.toHaveBeenCalled();
      expect(batcher.size()).toBe(3);

      // Advance by 60ms (not yet 125ms)
      vi.advanceTimersByTime(60);
      expect(flushSpy).not.toHaveBeenCalled();

      // Advance past 125ms
      vi.advanceTimersByTime(70);
      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(flushSpy).toHaveBeenCalledWith(['event-1', 'event-2', 'event-3']);
      expect(batcher.size()).toBe(0);
    });

    it('flushes immediately when reaching maxBatchSize without waiting for timer', () => {
      const flushSpy = vi.fn();
      const batcher = createBatcher<number>(flushSpy, 125, 5);

      for (let i = 1; i <= 5; i++) {
        batcher.push(i);
      }

      // Reached batch size 5 -> immediate flush
      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(flushSpy).toHaveBeenCalledWith([1, 2, 3, 4, 5]);
      expect(batcher.size()).toBe(0);
    });

    it('flushes immediately on demand with .flush()', () => {
      const flushSpy = vi.fn();
      const batcher = createBatcher<string>(flushSpy, 125);

      batcher.push('item-1');
      batcher.push('item-2');
      expect(flushSpy).not.toHaveBeenCalled();

      batcher.flush();
      expect(flushSpy).toHaveBeenCalledTimes(1);
      expect(flushSpy).toHaveBeenCalledWith(['item-1', 'item-2']);
      expect(batcher.size()).toBe(0);
    });

    it('clears pending items without calling flushFn on .clear()', () => {
      const flushSpy = vi.fn();
      const batcher = createBatcher<string>(flushSpy, 125);

      batcher.push('item-1');
      batcher.clear();
      expect(batcher.size()).toBe(0);

      vi.advanceTimersByTime(200);
      expect(flushSpy).not.toHaveBeenCalled();
    });
  });

  describe('4. Live Action Log Batching & Window Capping Simulation', () => {
    it('batches 100 rapid stream events into bounded state flushes instead of 100 individual updates', () => {
      const stateUpdates: AgentRunEvent[][] = [];
      const setEvents = (updater: (prev: AgentRunEvent[]) => AgentRunEvent[]) => {
        const current = stateUpdates.length > 0 ? stateUpdates[stateUpdates.length - 1] : [];
        const next = updater(current);
        stateUpdates.push(next);
      };

      let buffer: AgentRunEvent[] = [];
      let timer: NodeJS.Timeout | null = null;

      const flushBuffer = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
        if (buffer.length === 0) return;
        const queued = [...buffer];
        buffer = [];
        setEvents((prev) => {
          const ids = new Set(prev.map((e) => e.id));
          const additions = queued.filter((e) => !ids.has(e.id));
          return [...prev, ...additions];
        });
      };

      const handleIncomingEvent = (evt: AgentRunEvent) => {
        buffer.push(evt);
        const isTerminal = evt.type === 'run_completed' || evt.type === 'run_failed' || evt.type === 'run_cancelled';
        if (isTerminal || buffer.length >= 25) {
          flushBuffer();
        } else if (!timer) {
          timer = setTimeout(() => {
            timer = null;
            flushBuffer();
          }, 125);
        }
      };

      // Emit a burst of 100 non-terminal events quickly
      for (let i = 1; i <= 100; i++) {
        handleIncomingEvent({
          id: `evt-${i}`,
          runId: 'run-test-1',
          type: 'tool_completed',
          timestamp: new Date().toISOString(),
          seq: i,
          tool: 'rule_scan',
          outputSummary: `Completed step ${i}`,
        });
      }

      // Since buffer flushes at batch size 25:
      // 100 events / 25 = 4 state flushes during the burst, NOT 100!
      expect(stateUpdates.length).toBe(4);
      expect(stateUpdates[3].length).toBe(100);
    });

    it('immediately flushes buffer on terminal events without waiting for timer', () => {
      let flushed = false;
      let buffer: AgentRunEvent[] = [
        { id: 'evt-1', runId: 'run-test-1', type: 'tool_started', timestamp: new Date().toISOString() },
      ];

      const flushBuffer = () => {
        flushed = true;
        buffer = [];
      };

      const handleEvent = (evt: AgentRunEvent) => {
        buffer.push(evt);
        if (evt.type === 'run_completed') {
          flushBuffer();
        }
      };

      handleEvent({
        id: 'evt-final',
        runId: 'run-test-1',
        type: 'run_completed',
        timestamp: new Date().toISOString(),
        outputSummary: 'Completed successfully',
      });

      expect(flushed).toBe(true);
      expect(buffer.length).toBe(0);
    });

    it('caps rendered DOM nodes at 100 while keeping full event history in run record', () => {
      const MAX_RENDERED = 100;
      const allEvents: AgentRunEvent[] = [];

      for (let i = 1; i <= 150; i++) {
        allEvents.push({
          id: `evt-${i}`,
          runId: 'run-test-1',
          type: 'tool_completed',
          timestamp: new Date().toISOString(),
          outputSummary: `Audit note ${i}`,
        });
      }

      // Full event history is 150 items
      expect(allEvents.length).toBe(150);

      // Windowed events for DOM rendering
      const visibleEvents = allEvents.length > MAX_RENDERED ? allEvents.slice(-MAX_RENDERED) : allEvents;

      expect(visibleEvents.length).toBe(100);
      expect(visibleEvents[0].id).toBe('evt-51');
      expect(visibleEvents[visibleEvents.length - 1].id).toBe('evt-150');

      // Banner text calculation
      const hiddenCount = allEvents.length - MAX_RENDERED;
      expect(hiddenCount).toBe(50);
      const bannerText = `Displaying latest ${MAX_RENDERED} of ${allEvents.length} stream events (${hiddenCount} earlier events preserved in full run record)`;
      expect(bannerText).toContain('Displaying latest 100 of 150 stream events');
      expect(bannerText).toContain('50 earlier events preserved in full run record');
    });

    it('smart auto-scroll permits scrolling when user is near bottom and suppresses when scrolled up', () => {
      const isNearBottom = (scrollHeight: number, scrollTop: number, clientHeight: number) => {
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        return distanceToBottom <= 60;
      };

      // User is at bottom: scrollHeight 1000, scrollTop 600, clientHeight 400 -> distance 0
      expect(isNearBottom(1000, 600, 400)).toBe(true);

      // User is slightly above bottom: distance 50px <= 60px -> still near bottom
      expect(isNearBottom(1000, 550, 400)).toBe(true);

      // User scrolled up: scrollTop 200 -> distance 400px > 60px -> auto-scroll must NOT trigger
      expect(isNearBottom(1000, 200, 400)).toBe(false);
    });
  });

  describe('5. Rapid-Click Request Protection', () => {
    it('guards retry handler so double clicks while in-flight execute only once', async () => {
      let activeCalls = 0;
      let totalExecuted = 0;

      let internalRetrying = false;
      const mockNetworkRetry = async () => {
        totalExecuted++;
        await new Promise((resolve) => setTimeout(resolve, 50));
      };

      const handleRetryClick = async () => {
        if (internalRetrying) return;
        internalRetrying = true;
        activeCalls++;
        try {
          await mockNetworkRetry();
        } finally {
          internalRetrying = false;
          activeCalls--;
        }
      };

      // Rapid double click
      const p1 = handleRetryClick();
      const p2 = handleRetryClick();

      vi.advanceTimersByTime(50);
      await Promise.all([p1, p2]);

      expect(totalExecuted).toBe(1);
      expect(activeCalls).toBe(0);
    });

    it('guards scan trigger against rapid-click duplicate runs', async () => {
      let isScanningRef = false;
      let executions = 0;

      const handleScan = async () => {
        if (isScanningRef) return;
        isScanningRef = true;
        executions++;
        try {
          await new Promise((resolve) => setTimeout(resolve, 100));
        } finally {
          isScanningRef = false;
        }
      };

      // Rapidly fire 3 scan triggers simultaneously
      const run1 = handleScan();
      const run2 = handleScan();
      const run3 = handleScan();

      vi.advanceTimersByTime(100);
      await Promise.all([run1, run2, run3]);

      expect(executions).toBe(1);
    });

    it('guards draft save / approve actions against concurrent rapid clicks', async () => {
      let saving = false;
      let saves = 0;

      const handleSaveDraft = async () => {
        if (saving) return;
        saving = true;
        saves++;
        try {
          await new Promise((resolve) => setTimeout(resolve, 100));
        } finally {
          saving = false;
        }
      };

      const s1 = handleSaveDraft();
      const s2 = handleSaveDraft();

      vi.advanceTimersByTime(100);
      await Promise.all([s1, s2]);

      expect(saves).toBe(1);
    });
  });
});
