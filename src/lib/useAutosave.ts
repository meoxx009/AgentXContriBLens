'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { debounce } from './debounce';

export type AutosaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'unauthenticated';

export interface UseAutosaveOptions<T> {
  id: string;
  value: T;
  onSave: (val: T) => Promise<{ success: boolean; error?: string } | boolean | void>;
  onRestore?: (val: T) => void;
  isAuthenticated?: boolean;
  delayMs?: number;
  storageKey?: string;
  enabled?: boolean;
  isEqual?: (a: T, b: T) => boolean;
}

export interface AutosaveRecovery<T> {
  hasRecovery: boolean;
  recoveredValue: T | null;
  recoveredAt: string | null;
  restore: () => void;
  discard: () => void;
}

export interface UseAutosaveResult<T> {
  status: AutosaveStatus;
  lastSavedAt: Date | null;
  errorMessage: string | null;
  isDirty: boolean;
  hasUnsavedChanges: boolean;
  retry: () => void;
  flush: () => void;
  handleBlur: () => void;
  recovery: AutosaveRecovery<T>;
}

function defaultIsEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

export function useAutosave<T>({
  id,
  value,
  onSave,
  onRestore,
  isAuthenticated = true,
  delayMs = 850,
  storageKey: customStorageKey,
  enabled = true,
  isEqual = defaultIsEqual,
}: UseAutosaveOptions<T>): UseAutosaveResult<T> {
  const [status, setStatus] = useState<AutosaveStatus>(isAuthenticated ? 'idle' : 'unauthenticated');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Recovery state
  const [recovery, setRecovery] = useState<{
    hasRecovery: boolean;
    recoveredValue: T | null;
    recoveredAt: string | null;
  }>({
    hasRecovery: false,
    recoveredValue: null,
    recoveredAt: null,
  });

  const storageKey = customStorageKey || `contriblens_autosave_${id}`;

  // Keep latest refs for callbacks to avoid stale closures
  const valueRef = useRef<T>(value);
  valueRef.current = value;

  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const lastSavedValueRef = useRef<T>(value);
  const sequenceRef = useRef(0);
  const inFlightRef = useRef(false);
  const pendingValueRef = useRef<T | null>(null);
  const isInitialMount = useRef(true);

  // Check for local recovery on initial mount or id change
  useEffect(() => {
    if (typeof window === 'undefined' || !storageKey) return;

    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && parsed.id === id && parsed.value !== undefined) {
          // If the cached value differs from initial server value, prompt recovery
          if (!isEqual(parsed.value, value)) {
            setRecovery({
              hasRecovery: true,
              recoveredValue: parsed.value,
              recoveredAt: parsed.savedAt
                ? new Date(parsed.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : 'earlier',
            });
          }
        }
      }
    } catch {
      // Storage parsing failed; ignore silently
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, storageKey]);

  // Execute Save with in-flight deduplication and sequence versioning
  const executeSave = useCallback(
    async (targetVal: T) => {
      if (!enabled) return;

      if (!isAuthenticated) {
        setStatus('unauthenticated');
        // Persist to local storage even when unauthenticated so user doesn't lose text
        if (typeof window !== 'undefined' && storageKey) {
          try {
            localStorage.setItem(
              storageKey,
              JSON.stringify({ id, value: targetVal, savedAt: new Date().toISOString() })
            );
          } catch (err) {
            console.debug('Autosave unauthenticated storage backup write suppressed:', err);
          }
        }
        return;
      }

      // If a save is already in-flight, queue targetVal and return
      if (inFlightRef.current) {
        pendingValueRef.current = targetVal;
        return;
      }

      inFlightRef.current = true;
      const currentSeq = ++sequenceRef.current;
      setStatus('saving');
      setErrorMessage(null);

      try {
        const result = await onSaveRef.current(targetVal);

        // Discard stale responses if a newer save was triggered
        if (currentSeq !== sequenceRef.current) {
          return;
        }

        const isSuccess =
          result === undefined ||
          result === true ||
          (typeof result === 'object' && result !== null && result.success !== false);

        if (isSuccess) {
          lastSavedValueRef.current = targetVal;
          setLastSavedAt(new Date());
          setStatus('saved');

          // Update local storage backup with confirmed save
          if (typeof window !== 'undefined' && storageKey) {
            try {
              localStorage.setItem(
                storageKey,
                JSON.stringify({ id, value: targetVal, savedAt: new Date().toISOString() })
              );
            } catch (err) {
              console.debug('Autosave storage backup write suppressed:', err);
            }
          }
        } else {
          // Failure invariant: keep local content intact, never overwrite
          setStatus('error');
          const err =
            typeof result === 'object' && result?.error
              ? result.error
              : 'Failed to save changes to server.';
          setErrorMessage(err);
        }
      } catch (err: any) {
        // Stale check
        if (currentSeq !== sequenceRef.current) return;

        setStatus('error');
        setErrorMessage(err?.message || 'Network error while saving.');
      } finally {
        inFlightRef.current = false;

        // If another value was queued while saving, dispatch it next
        if (pendingValueRef.current !== null) {
          const nextVal = pendingValueRef.current;
          pendingValueRef.current = null;
          if (!isEqual(nextVal, lastSavedValueRef.current)) {
            executeSave(nextVal);
          }
        }
      }
    },
    [enabled, id, isAuthenticated, isEqual, storageKey]
  );

  // Debounced save runner
  const debouncedSaveRef = useRef(
    debounce((val: T) => {
      executeSave(val);
    }, delayMs)
  );

  // Update debounced function when delay changes
  useEffect(() => {
    debouncedSaveRef.current = debounce((val: T) => {
      executeSave(val);
    }, delayMs);
    return () => {
      debouncedSaveRef.current.cancel();
    };
  }, [delayMs, executeSave]);

  // Value change trigger: debounces save after user pauses typing
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      lastSavedValueRef.current = value;
      return;
    }

    if (!enabled) return;

    // Check if value actually differs from last server-confirmed value
    if (isEqual(value, lastSavedValueRef.current)) {
      debouncedSaveRef.current.cancel();
      return;
    }

    // Always immediately write to local storage on keystroke as backup
    if (typeof window !== 'undefined' && storageKey) {
      try {
        localStorage.setItem(
          storageKey,
          JSON.stringify({ id, value, savedAt: new Date().toISOString() })
        );
      } catch (err) {
        console.debug('Autosave keystroke storage backup write suppressed:', err);
      }
    }

    if (!isAuthenticated) {
      setStatus('unauthenticated');
      return;
    }

    // Debounce network save
    debouncedSaveRef.current(value);
  }, [value, enabled, id, isAuthenticated, isEqual, storageKey]);

  // Tab close & visibility change handlers
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBeforeUnload = () => {
      if (!isEqual(valueRef.current, lastSavedValueRef.current) && storageKey) {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({ id, value: valueRef.current, savedAt: new Date().toISOString() })
          );
        } catch (err) {
          console.debug('Autosave unload storage backup write suppressed:', err);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (!isEqual(valueRef.current, lastSavedValueRef.current)) {
          debouncedSaveRef.current.flush();
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      debouncedSaveRef.current.cancel();
    };
  }, [id, isEqual, storageKey]);

  // Manual flush (e.g. on blur)
  const handleBlur = useCallback(() => {
    if (!enabled) return;
    if (!isEqual(valueRef.current, lastSavedValueRef.current)) {
      debouncedSaveRef.current.flush();
    }
  }, [enabled, isEqual]);

  const flush = useCallback(() => {
    debouncedSaveRef.current.flush();
  }, []);

  const retry = useCallback(() => {
    executeSave(valueRef.current);
  }, [executeSave]);

  // Recovery actions
  const restore = useCallback(() => {
    if (recovery.recoveredValue !== null && onRestoreRef.current) {
      onRestoreRef.current(recovery.recoveredValue);
    }
    setRecovery({ hasRecovery: false, recoveredValue: null, recoveredAt: null });
  }, [recovery.recoveredValue]);

  const discard = useCallback(() => {
    if (typeof window !== 'undefined' && storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch (err) {
        console.debug('Autosave discard storage removal suppressed:', err);
      }
    }
    setRecovery({ hasRecovery: false, recoveredValue: null, recoveredAt: null });
  }, [storageKey]);

  const isDirty = !isEqual(value, lastSavedValueRef.current) || status === 'saving' || status === 'error';

  return {
    status,
    lastSavedAt,
    errorMessage,
    isDirty,
    hasUnsavedChanges: isDirty,
    retry,
    flush,
    handleBlur,
    recovery: {
      ...recovery,
      restore,
      discard,
    },
  };
}
