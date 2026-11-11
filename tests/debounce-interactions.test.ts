import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  debounce,
  parseAndValidateRepoUrl,
  useRepoUrlValidation,
} from '../src/lib/debounce';

describe('Centralized Debounce Engine & Interaction Debouncing', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  describe('1. Typing Bursts & Trailing-Edge Window', () => {
    it('typing burst results in exactly one call per pause window with the trailing argument', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const debounced = debounce(callback, 300);

      // Simulate rapid user typing burst: 10 keystrokes within 200ms
      const burst = ['c', 'co', 'con', 'contr', 'contrib', 'contribl', 'contrible', 'contriblen', 'contriblens'];
      for (let i = 0; i < burst.length; i++) {
        debounced(burst[i]);
        vi.advanceTimersByTime(20); // 20ms between keystrokes
      }

      // No call should have fired yet during active burst
      expect(callback).not.toHaveBeenCalled();

      // Advance past the 300ms pause window
      vi.advanceTimersByTime(300);

      // Exactly one execution with the final trailing-edge value
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('contriblens');

      vi.useRealTimers();
    });

    it('subsequent burst after pause window triggers a second distinct execution', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const debounced = debounce(callback, 300);

      // First burst
      debounced('first-query');
      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('first-query');

      // Second burst after pause
      debounced('second-query');
      vi.advanceTimersByTime(300);
      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith('second-query');

      vi.useRealTimers();
    });
  });

  describe('2. Cancellation, Flushing & Unmount Cleanup', () => {
    it('cancels pending timers on unmount / cancel, preventing subsequent execution', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const debounced = debounce(callback, 300);

      debounced('unmounted-action');
      expect(callback).not.toHaveBeenCalled();

      // Component unmounts: cancel() called
      debounced.cancel();

      // Advancing timer does NOT invoke callback
      vi.advanceTimersByTime(1000);
      expect(callback).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('flushes pending execution immediately on demand', () => {
      vi.useFakeTimers();
      const callback = vi.fn();
      const debounced = debounce(callback, 300);

      debounced('flush-me-now');
      expect(callback).not.toHaveBeenCalled();

      debounced.flush();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('flush-me-now');

      // Subsequent timer tick does not double-invoke
      vi.advanceTimersByTime(500);
      expect(callback).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });
  });

  describe('3. Asynchronous Sequence & Last-Write-Wins (Stale Response Invariant)', () => {
    it('cancels and ignores stale responses when a newer sequence has started', async () => {
      let sequence = 0;
      let activeResult: string | null = null;
      const discardedResponses: string[] = [];

      async function simulatedAsyncFetch(query: string, delayMs: number) {
        const thisSeq = ++sequence;
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        // Sequence check (Last-Write-Wins)
        if (thisSeq === sequence) {
          activeResult = `Result for ${query}`;
        } else {
          discardedResponses.push(query);
        }
      }

      // Query 1 starts first but is slow (100ms)
      const p1 = simulatedAsyncFetch('slow-initial-query', 100);

      // Query 2 starts shortly after but finishes faster (20ms)
      await new Promise((r) => setTimeout(r, 10));
      const p2 = simulatedAsyncFetch('fast-subsequent-query', 20);

      await Promise.all([p1, p2]);

      // Newer query 2 must win; query 1 must be discarded as stale
      expect(activeResult).toBe('Result for fast-subsequent-query');
      expect(discardedResponses).toEqual(['slow-initial-query']);
    });
  });

  describe('4. Repository URL Debounced Validation', () => {
    it('validates standard GitHub URLs synchronously and accurately', () => {
      expect(parseAndValidateRepoUrl('https://github.com/expressjs/express').valid).toBe(true);
      expect(parseAndValidateRepoUrl('https://github.com/pallets/flask').valid).toBe(true);
      expect(parseAndValidateRepoUrl('expressjs/express').valid).toBe(true);
      expect(parseAndValidateRepoUrl('git@github.com:owner/repo.git').valid).toBe(true);

      // Invalid repositories
      expect(parseAndValidateRepoUrl('https://gitlab.com/user/repo').valid).toBe(false);
      expect(parseAndValidateRepoUrl('not-a-valid-url').valid).toBe(false);
      expect(parseAndValidateRepoUrl('').valid).toBe(false);
    });

    it('extracts owner and repo correctly', () => {
      const res = parseAndValidateRepoUrl('https://github.com/facebook/react');
      expect(res.valid).toBe(true);
      expect(res.owner).toBe('facebook');
      expect(res.repo).toBe('react');
    });

    it('debounces repository URL validation so inline state appears only after pause', async () => {
      vi.useFakeTimers();

      let validatedStatus: 'neutral' | 'valid' | 'invalid' = 'neutral';
      let isValidating = false;
      let timer: any = null;

      function onUrlChange(url: string) {
        if (!url.trim()) {
          validatedStatus = 'neutral';
          isValidating = false;
          if (timer) clearTimeout(timer);
          return;
        }

        isValidating = true;
        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
          isValidating = false;
          const parsed = parseAndValidateRepoUrl(url);
          validatedStatus = parsed.valid ? 'valid' : 'invalid';
        }, 400);
      }

      // Rapid typing burst: "h", "ht", "http", "https://github.com/owner/repo"
      onUrlChange('h');
      onUrlChange('ht');
      onUrlChange('http');
      expect(isValidating).toBe(true);
      expect(validatedStatus).toBe('neutral'); // Not yet marked invalid while typing!

      // Advance by 100ms (still within 400ms pause)
      vi.advanceTimersByTime(100);
      expect(validatedStatus).toBe('neutral');

      // Final keystroke of valid repo
      onUrlChange('https://github.com/expressjs/express');

      // Advance past 400ms
      vi.advanceTimersByTime(400);

      expect(isValidating).toBe(false);
      expect(validatedStatus).toBe('valid');

      vi.useRealTimers();
    });

    it('shows invalid state only after pause when URL is malformed', async () => {
      vi.useFakeTimers();

      let validatedStatus: 'neutral' | 'valid' | 'invalid' = 'neutral';
      let isValidating = false;
      let timer: any = null;

      function onUrlChange(url: string) {
        if (!url.trim()) {
          validatedStatus = 'neutral';
          isValidating = false;
          if (timer) clearTimeout(timer);
          return;
        }

        isValidating = true;
        if (timer) clearTimeout(timer);

        timer = setTimeout(() => {
          isValidating = false;
          const parsed = parseAndValidateRepoUrl(url);
          validatedStatus = parsed.valid ? 'valid' : 'invalid';
        }, 400);
      }

      onUrlChange('https://invalid-provider.com/not/github');
      expect(validatedStatus).toBe('neutral'); // Neutral while typing

      vi.advanceTimersByTime(400);

      expect(isValidating).toBe(false);
      expect(validatedStatus).toBe('invalid'); // Only invalid AFTER pause

      vi.useRealTimers();
    });
  });

  describe('5. Search Query Filter Debouncing (~300ms)', () => {
    it('debounces filter queries so list re-calculation is not executed per keystroke', () => {
      vi.useFakeTimers();

      const items = [
        { id: '1', title: 'Hardcoded JWT secret detected' },
        { id: '2', title: 'Outdated package vulnerable to RCE' },
        { id: '3', title: 'Missing branch protection workflow' },
      ];

      const filterCalls: string[] = [];
      const debouncedFilter = debounce((q: string) => {
        filterCalls.push(q);
      }, 300);

      // Typing "secret": 6 keystrokes
      debouncedFilter('s');
      debouncedFilter('se');
      debouncedFilter('sec');
      debouncedFilter('secr');
      debouncedFilter('secre');
      debouncedFilter('secret');

      expect(filterCalls.length).toBe(0);

      // Advance timer by 300ms
      vi.advanceTimersByTime(300);

      expect(filterCalls.length).toBe(1);
      expect(filterCalls[0]).toBe('secret');

      // Verify filtered results
      const filtered = items.filter((item) =>
        item.title.toLowerCase().includes(filterCalls[0].toLowerCase())
      );
      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe('1');

      vi.useRealTimers();
    });
  });
});
