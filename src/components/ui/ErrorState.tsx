'use client';

import React from 'react';
import Link from 'next/link';
import { useApp } from '@/components/AppContext';
import {
  AlertTriangle,
  Lock,
  WifiOff,
  RotateCw,
  LogIn,
  ShieldAlert,
  HelpCircle,
  LucideIcon,
} from 'lucide-react';

export type ErrorStateType =
  | 'session_expired'
  | 'forbidden'
  | 'server_error'
  | 'network_offline'
  | 'not_found'
  | 'generic';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  type?: ErrorStateType;
  onRetry?: () => void | Promise<any>;
  retryLabel?: string;
  retrying?: boolean;
  onAuthModal?: () => void;
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
  className?: string;
  compact?: boolean;
}

/**
 * Sanitizes an error message: strips any potential stack traces or leaked tokens.
 */
function sanitizeErrorMessage(msg?: string): string {
  if (!msg) return 'An unexpected error occurred. Please try again.';
  // Strip node / browser stack traces
  const firstLine = msg.split(/\r?\n|\sat\s/)[0];
  // Strip token / key patterns if present
  return firstLine.replace(/([a-zA-Z0-9_-]{24,})/g, '***');
}

/**
 * ErrorState
 * Shared error and session-expiry handler across all ContribLens views.
 * Replaces ad-hoc error messages with safe, accessible feedback and functional retry.
 */
export default function ErrorState({
  title,
  message,
  type,
  onRetry,
  retryLabel = 'Retry',
  retrying = false,
  onAuthModal,
  secondaryAction,
  className = '',
  compact = false,
}: ErrorStateProps) {
  let openAuthModal: ((opts?: any) => void) | undefined;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const app = useApp();
    openAuthModal = app?.openAuthModal;
  } catch {
    openAuthModal = undefined;
  }

  const safeMessage = sanitizeErrorMessage(message);

  // Auto-detect session expiry if message mentions session or token
  const isSessionExpired =
    type === 'session_expired' ||
    /session.*(expired|invalid)|sign in|unauthorized|log in/i.test(safeMessage);

  const isForbidden =
    type === 'forbidden' || /forbidden|authorization|permission/i.test(safeMessage);

  const isNetworkOffline =
    type === 'network_offline' || /offline|network|connection lost/i.test(safeMessage);

  const isNotFound =
    type === 'not_found' || /not found|could not be located/i.test(safeMessage);

  // Derive title
  const resolvedTitle =
    title ||
    (isSessionExpired
      ? 'Session Expired'
      : isForbidden
      ? 'Access Denied'
      : isNetworkOffline
      ? 'Connection Lost'
      : isNotFound
      ? 'Item Not Found'
      : 'Unable to Load Data');

  // Derive message
  const resolvedMessage = isSessionExpired
    ? 'Session expired — sign in again to access your workspace.'
    : safeMessage;

  // Icon
  let Icon: LucideIcon = AlertTriangle;
  let iconContainerStyle = 'bg-rosewood/25 border-rosewood/50 text-red-300';
  let cardBorder = 'border-rosewood/30 bg-rosewood/[0.04]';

  if (isSessionExpired) {
    Icon = Lock;
    iconContainerStyle = 'bg-electricTangerine/20 border-electricTangerine/40 text-electricTangerine';
    cardBorder = 'border-electricTangerine/30 bg-electricTangerine/[0.03]';
  } else if (isForbidden) {
    Icon = ShieldAlert;
    iconContainerStyle = 'bg-rosewood/25 border-rosewood/50 text-rose-300';
  } else if (isNetworkOffline) {
    Icon = WifiOff;
    iconContainerStyle = 'bg-botticelli/20 border-botticelli/40 text-botticelli';
    cardBorder = 'border-botticelli/30 bg-botticelli/[0.03]';
  } else if (isNotFound) {
    Icon = HelpCircle;
    iconContainerStyle = 'bg-platinumSilver/15 border-platinumSilver/30 text-lemonChiffon';
    cardBorder = 'border-platinumSilver/25 bg-white/[0.02]';
  }

  const [internalRetrying, setInternalRetrying] = React.useState(false);
  const isBusy = retrying || internalRetrying;

  const handleRetryClick = async () => {
    if (isBusy || !onRetry) return;
    setInternalRetrying(true);
    try {
      const result: unknown = onRetry();
      if (result && typeof (result as Record<string, any>).then === 'function') {
        await (result as Promise<any>);
      }
    } finally {
      setInternalRetrying(false);
    }
  };

  const handleSignIn = () => {
    if (onAuthModal) {
      onAuthModal();
    } else if (openAuthModal) {
      openAuthModal({
        initialMode: 'login',
        title: 'Session Expired',
        subtitle: 'Please sign in again to access your verified workspace.',
        onSuccess: onRetry,
      });
    } else if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`liquid-glass-card ${
        compact ? 'p-6 sm:p-7' : 'p-8 sm:p-10'
      } rounded-2xl border ${cardBorder} text-center space-y-4 max-w-xl mx-auto w-full ${className}`}
    >
      {/* Icon Capsule */}
      <div
        className={`${
          compact ? 'w-10 h-10' : 'w-12 h-12'
        } rounded-2xl border flex items-center justify-center mx-auto shadow-inner ${iconContainerStyle}`}
        aria-hidden="true"
      >
        <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
      </div>

      {/* Title & Message */}
      <div className="space-y-1.5">
        <h3 className="text-base sm:text-lg font-heading font-bold text-sustainableLinen tracking-tight">
          {resolvedTitle}
        </h3>
        <p className="text-xs sm:text-sm text-textMuted max-w-md mx-auto leading-relaxed">
          {resolvedMessage}
        </p>
      </div>

      {/* Actions */}
      <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
        {isSessionExpired ? (
          <button
            type="button"
            onClick={handleSignIn}
            className="min-h-[44px] px-6 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black text-xs font-bold transition-all shadow-glow-tangerine inline-flex items-center gap-2 press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
          >
            <LogIn className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Sign In Again</span>
          </button>
        ) : onRetry ? (
          <button
            type="button"
            onClick={handleRetryClick}
            disabled={isBusy}
            className="min-h-[44px] px-6 py-2.5 rounded-full bg-rosewood hover:bg-rosewood/80 text-sustainableLinen text-xs font-bold transition-all shadow-md inline-flex items-center gap-2 press-spring touch-manipulation disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rosewood"
          >
            <RotateCw
              className={`w-4 h-4 shrink-0 ${isBusy ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isBusy ? 'Retrying...' : retryLabel}</span>
          </button>
        ) : null}

        {secondaryAction && (
          <>
            {secondaryAction.href ? (
              <Link
                href={secondaryAction.href}
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-sustainableLinen text-xs font-semibold border border-platinumSilver/20 transition-all inline-flex items-center press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
              >
                {secondaryAction.label}
              </Link>
            ) : secondaryAction.onClick ? (
              <button
                type="button"
                onClick={secondaryAction.onClick}
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-white/5 hover:bg-white/10 text-sustainableLinen text-xs font-semibold border border-platinumSilver/20 transition-all inline-flex items-center press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
              >
                {secondaryAction.label}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
