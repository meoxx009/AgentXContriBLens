'use client';

import React from 'react';
import { Loader2, CheckCircle2, AlertCircle, Lock } from 'lucide-react';
import { AutosaveStatus } from '@/lib/useAutosave';

export interface AutosaveStatusBadgeProps {
  status: AutosaveStatus;
  lastSavedAt?: Date | null;
  errorMessage?: string | null;
  onRetry?: () => void;
  isAuthenticated?: boolean;
  className?: string;
}

export function AutosaveStatusBadge({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
  isAuthenticated = true,
  className = '',
}: AutosaveStatusBadgeProps) {
  const formatTime = (d: Date) => {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // If explicitly unauthenticated or status says unauthenticated
  if (!isAuthenticated || status === 'unauthenticated') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-lemonChiffon/30 text-[11px] text-lemonChiffon font-mono ${className}`}
        title="Changes are stored locally only. Sign in to save to your account."
      >
        <Lock className="w-3 h-3 text-lemonChiffon shrink-0" />
        <span>Sign in to save</span>
      </div>
    );
  }

  if (status === 'saving') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-borderDark text-[11px] text-textMuted font-mono animate-pulse ${className}`}
      >
        <Loader2 className="w-3 h-3 text-lemonChiffon animate-spin shrink-0" />
        <span>Saving…</span>
      </div>
    );
  }

  if (status === 'saved' && lastSavedAt) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/60 border border-emerald-500/30 text-[11px] text-emerald-400 font-mono transition-all ${className}`}
      >
        <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />
        <span>Saved ✓ {formatTime(lastSavedAt)}</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rosewood/30 border border-rosewood/60 text-[11px] text-red-300 font-mono ${className}`}
        title={errorMessage || 'Save failed'}
      >
        <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
        <span>Save failed —</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="text-lemonChiffon underline hover:text-sustainableLinen ml-0.5 font-semibold transition-colors focus:outline-none"
          >
            retry
          </button>
        )}
      </div>
    );
  }

  // Idle state
  if (lastSavedAt) {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] text-textMuted/70 font-mono ${className}`}
      >
        <span>Saved {formatTime(lastSavedAt)}</span>
      </div>
    );
  }

  return null;
}

export default AutosaveStatusBadge;
