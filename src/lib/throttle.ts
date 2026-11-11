'use client';

import { useRef, useEffect, useCallback } from 'react';

/**
 * ContribLens — Centralized Throttling & Batching Utilities
 *
 * Provides deterministic rate-limiting and animation-frame scheduling:
 * 1. `throttle`: Invokes at most once per `waitMs`. Supports leading and trailing edges.
 * 2. `throttleRaf`: Throttles function executions to the browser's animation-frame cadence.
 * 3. `useThrottledCallback`: React hook for rate-limiting callbacks with unmount safety.
 * 4. `useRafThrottledCallback`: React hook for rAF throttling with unmount safety.
 * 5. `createBatcher`: High-throughput event buffer that flushes at a fixed cadence.
 */

export interface ThrottleOptions {
  leading?: boolean;
  trailing?: boolean;
}

/**
 * Throttles an arbitrary function to fire at most once every `waitMs`.
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number,
  options: ThrottleOptions = {}
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;
  let lastCallTime = 0;
  const leading = options.leading !== false;
  const trailing = options.trailing !== false;

  const throttled = (...args: Parameters<T>) => {
    const now = Date.now();
    if (!lastCallTime && !leading) {
      lastCallTime = now;
    }

    const remaining = waitMs - (now - lastCallTime);

    if (remaining <= 0 || remaining > waitMs) {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCallTime = now;
      fn(...args);
    } else if (trailing) {
      lastArgs = args;
      if (timeoutId === null) {
        timeoutId = setTimeout(() => {
          lastCallTime = leading ? Date.now() : 0;
          timeoutId = null;
          if (lastArgs !== null) {
            fn(...lastArgs);
            lastArgs = null;
          }
        }, remaining);
      }
    }
  };

  throttled.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastCallTime = 0;
    lastArgs = null;
  };

  throttled.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs !== null) {
      lastCallTime = Date.now();
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return throttled;
}

/**
 * Throttles execution to the browser's animation frame (`requestAnimationFrame`).
 * Multiple rapid calls within the same frame are collapsed into a single execution
 * with the latest arguments. Falls back safely to setTimeout if rAF is unavailable (e.g. SSR/Node).
 */
export function throttleRaf<T extends (...args: any[]) => any>(
  fn: T
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  let rafId: number | null = null;
  let lastArgs: Parameters<T> | null = null;

  const throttled = (...args: Parameters<T>) => {
    lastArgs = args;

    if (rafId === null) {
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        rafId = window.requestAnimationFrame(() => {
          rafId = null;
          if (lastArgs !== null) {
            const currentArgs = lastArgs;
            lastArgs = null;
            fn(...currentArgs);
          }
        });
      } else {
        // Fallback for non-browser environments
        rafId = (setTimeout(() => {
          rafId = null;
          if (lastArgs !== null) {
            const currentArgs = lastArgs;
            lastArgs = null;
            fn(...currentArgs);
          }
        }, 16) as unknown) as number;
      }
    }
  };

  throttled.cancel = () => {
    if (rafId !== null) {
      if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
        window.cancelAnimationFrame(rafId);
      } else {
        clearTimeout(rafId);
      }
      rafId = null;
    }
    lastArgs = null;
  };

  return throttled;
}

/**
 * Hook to throttle a callback to a fixed interval, cleaning up timers on unmount.
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  waitMs: number = 200,
  options: ThrottleOptions = {}
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const throttledRef = useRef(
    throttle((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, waitMs, options)
  );

  useEffect(() => {
    const throttled = throttledRef.current;
    return () => {
      throttled.cancel();
    };
  }, []);

  return throttledRef.current;
}

/**
 * Hook to throttle a callback to animation frames (`requestAnimationFrame`),
 * automatically cleaning up pending frames on unmount.
 */
export function useRafThrottledCallback<T extends (...args: any[]) => any>(
  callback: T
): ((...args: Parameters<T>) => void) & { cancel: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const rafThrottledRef = useRef(
    throttleRaf((...args: Parameters<T>) => {
      callbackRef.current(...args);
    })
  );

  useEffect(() => {
    const throttled = rafThrottledRef.current;
    return () => {
      throttled.cancel();
    };
  }, []);

  return rafThrottledRef.current;
}

/**
 * Batcher instance for high-throughput stream events (e.g. SSE logs).
 * Buffers items and flushes them in batches at a fixed interval or max batch size.
 */
export interface EventBatcher<T> {
  push: (item: T) => void;
  pushMany: (items: T[]) => void;
  flush: () => void;
  clear: () => void;
  size: () => number;
  destroy: () => void;
}

export function createBatcher<T>(
  flushFn: (items: T[]) => void,
  intervalMs: number = 125,
  maxBatchSize: number = 100
): EventBatcher<T> {
  let buffer: T[] = [];
  let timerId: ReturnType<typeof setTimeout> | null = null;

  const scheduleFlush = () => {
    if (timerId === null) {
      timerId = setTimeout(() => {
        timerId = null;
        flush();
      }, intervalMs);
    }
  };

  const flush = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    if (buffer.length === 0) return;
    const itemsToFlush = buffer;
    buffer = [];
    flushFn(itemsToFlush);
  };

  const push = (item: T) => {
    buffer.push(item);
    if (buffer.length >= maxBatchSize) {
      flush();
    } else {
      scheduleFlush();
    }
  };

  const pushMany = (items: T[]) => {
    if (items.length === 0) return;
    buffer.push(...items);
    if (buffer.length >= maxBatchSize) {
      flush();
    } else {
      scheduleFlush();
    }
  };

  const clear = () => {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    buffer = [];
  };

  const size = () => buffer.length;

  const destroy = () => {
    flush();
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
    buffer = [];
  };

  return {
    push,
    pushMany,
    flush,
    clear,
    size,
    destroy,
  };
}
