'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { parseGitHubUrl } from './scanner/github';

/**
 * ContribLens — Centralized Debounce Engine
 *
 * Single source of truth for debouncing rapid user/server interactions:
 * - Trailing-edge execution
 * - Clean `.cancel()` and `.flush()` methods
 * - Unmount timer cleanup to avoid setState-after-unmount
 * - Sequence/versioning for last-write-wins on async operations
 */

export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  waitMs: number
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (lastArgs !== null) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, waitMs);
  };

  debounced.cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    if (lastArgs !== null) {
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return debounced;
}

/**
 * Hook to debounce any rapid state/prop value (e.g. search query).
 * Cleans up pending timers on unmount to prevent memory leaks and state updates on unmounted components.
 */
export function useDebounceValue<T>(value: T, delayMs: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      if (isMountedRef.current) {
        setDebouncedValue(value);
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return debouncedValue;
}

/**
 * Hook to create a stable debounced callback with automatic unmount cancellation.
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delayMs: number = 300
): ((...args: Parameters<T>) => void) & { cancel: () => void; flush: () => void } {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const debouncedRef = useRef(
    debounce((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, delayMs)
  );

  useEffect(() => {
    debouncedRef.current = debounce((...args: Parameters<T>) => {
      callbackRef.current(...args);
    }, delayMs);

    return () => {
      debouncedRef.current.cancel();
    };
  }, [delayMs]);

  return debouncedRef.current;
}

/**
 * Parse and validate repository URLs synchronously.
 */
export function parseAndValidateRepoUrl(rawUrl: string): {
  valid: boolean;
  owner?: string;
  repo?: string;
  branch?: string;
  error?: string;
} {
  const clean = rawUrl?.trim();
  if (!clean) {
    return { valid: false, error: 'Repository URL is required.' };
  }

  // Shorthand owner/repo
  const isShorthand = /^[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.]+$/.test(clean);
  if (!clean.includes('github.com') && !isShorthand && !clean.startsWith('git@github.com:')) {
    return {
      valid: false,
      error: 'Must be a GitHub repository (e.g. https://github.com/owner/repo or owner/repo).',
    };
  }

  const parsed = parseGitHubUrl(clean);
  if (!parsed || !parsed.owner || !parsed.repo) {
    return {
      valid: false,
      error: 'Invalid GitHub repository format. Expected https://github.com/owner/repo or owner/repo.',
    };
  }

  return {
    valid: true,
    owner: parsed.owner,
    repo: parsed.repo,
    branch: parsed.branch,
  };
}

export type RepoUrlValidationStatus = 'neutral' | 'valid' | 'invalid';

export interface RepoUrlValidationResult {
  status: RepoUrlValidationStatus;
  owner?: string;
  repo?: string;
  branch?: string;
  error?: string | null;
  isValidating: boolean;
}

/**
 * Hook for debounced repository URL validation.
 * Displays inline validation state (valid/invalid/neutral) only after the user pauses typing.
 */
export function useRepoUrlValidation(
  url: string,
  delayMs: number = 400
): RepoUrlValidationResult {
  const [result, setResult] = useState<RepoUrlValidationResult>(() => {
    const trimmed = (url || '').trim();
    if (!trimmed) {
      return { status: 'neutral', error: null, isValidating: false };
    }
    const val = parseAndValidateRepoUrl(trimmed);
    return val.valid
      ? { status: 'valid', owner: val.owner, repo: val.repo, branch: val.branch, error: null, isValidating: false }
      : { status: 'invalid', error: val.error, isValidating: false };
  });

  const isMountedRef = useRef(true);
  const sequenceRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    const trimmed = (url || '').trim();

    if (!trimmed) {
      setResult({ status: 'neutral', error: null, isValidating: false });
      return;
    }

    const currentSeq = ++sequenceRef.current;
    setResult((prev) => ({ ...prev, isValidating: true }));

    const timer = setTimeout(() => {
      if (!isMountedRef.current || currentSeq !== sequenceRef.current) return;
      const res = parseAndValidateRepoUrl(trimmed);
      if (res.valid) {
        setResult({
          status: 'valid',
          owner: res.owner,
          repo: res.repo,
          branch: res.branch,
          error: null,
          isValidating: false,
        });
      } else {
        setResult({
          status: 'invalid',
          error: res.error || 'Invalid repository URL.',
          isValidating: false,
        });
      }
    }, delayMs);

    return () => {
      clearTimeout(timer);
    };
  }, [url, delayMs]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return result;
}

/**
 * Hook for debounced async operations with sequence-based last-write-wins protection.
 * Automatically discards responses from stale / superseded requests.
 */
export function useDebouncedAsync<TArgs extends any[], TResult>(
  asyncFn: (...args: TArgs) => Promise<TResult>,
  delayMs: number = 300
) {
  const [data, setData] = useState<TResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const sequenceRef = useRef(0);
  const isMountedRef = useRef(true);
  const fnRef = useRef(asyncFn);
  fnRef.current = asyncFn;

  const debouncedRef = useRef(
    debounce(async (...args: TArgs) => {
      const currentSeq = ++sequenceRef.current;
      setLoading(true);
      setError(null);

      try {
        const result = await fnRef.current(...args);
        // Stale check: ensure this sequence is still the latest
        if (isMountedRef.current && currentSeq === sequenceRef.current) {
          setData(result);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMountedRef.current && currentSeq === sequenceRef.current) {
          setError(err?.message || 'Error executing request');
          setLoading(false);
        }
      }
    }, delayMs)
  );

  useEffect(() => {
    isMountedRef.current = true;
    const debouncedInstance = debouncedRef.current;
    return () => {
      isMountedRef.current = false;
      debouncedInstance.cancel();
    };
  }, []);

  const execute = useCallback((...args: TArgs) => {
    debouncedRef.current(...args);
  }, []);

  const cancel = useCallback(() => {
    sequenceRef.current++;
    debouncedRef.current.cancel();
    setLoading(false);
  }, []);

  return {
    execute,
    data,
    error,
    loading,
    cancel,
    getSequence: () => sequenceRef.current,
  };
}
