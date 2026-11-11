'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon, Sparkles } from 'lucide-react';

export interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
}

export interface EmptyStateProps {
  icon?: LucideIcon | React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: EmptyStateAction;
  secondaryHint?: React.ReactNode;
  className?: string;
  compact?: boolean;
}

/**
 * EmptyState
 * Shared first-use guidance and empty list component across ContribLens.
 * Strictly shown ONLY when the server confirms zero items (never on fetch failure).
 */
export default function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  action,
  secondaryHint,
  className = '',
  compact = false,
}: EmptyStateProps) {
  const ActionIcon = action?.icon;

  return (
    <div
      role="region"
      aria-label={title}
      className={`liquid-glass-card ${
        compact ? 'p-6 sm:p-7' : 'p-8 sm:p-10'
      } rounded-2xl border border-platinumSilver/15 text-center space-y-4 max-w-xl mx-auto w-full ${className}`}
    >
      {/* Icon Capsule */}
      <div
        className={`${
          compact ? 'w-10 h-10' : 'w-12 h-12'
        } rounded-2xl bg-white/[0.04] border border-platinumSilver/20 flex items-center justify-center mx-auto text-lemonChiffon shadow-inner`}
        aria-hidden="true"
      >
        <Icon className={compact ? 'w-5 h-5' : 'w-6 h-6'} />
      </div>

      {/* Title & Description */}
      <div className="space-y-1.5">
        <h3 className="text-base sm:text-lg font-heading font-bold text-sustainableLinen tracking-tight">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-textMuted max-w-md mx-auto leading-relaxed">
          {description}
        </p>
      </div>

      {/* Primary Honest Next-Step Action */}
      {action && (
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          {action.href ? (
            <Link
              href={action.href}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black text-xs font-bold transition-all shadow-glow-tangerine inline-flex items-center gap-2 press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
            >
              {ActionIcon && <ActionIcon className="w-4 h-4 shrink-0" aria-hidden="true" />}
              <span>{action.label}</span>
            </Link>
          ) : action.onClick ? (
            <button
              type="button"
              onClick={action.onClick}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-electricTangerine hover:bg-electricTangerine-hover text-black text-xs font-bold transition-all shadow-glow-tangerine inline-flex items-center gap-2 press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
            >
              {ActionIcon && <ActionIcon className="w-4 h-4 shrink-0" aria-hidden="true" />}
              <span>{action.label}</span>
            </button>
          ) : null}
        </div>
      )}

      {/* Optional Secondary Hint */}
      {secondaryHint && (
        <div className="pt-1 text-xs text-textTertiary font-mono flex flex-wrap items-center justify-center gap-2">
          {typeof secondaryHint === 'string' ? (
            <span className="leading-relaxed">{secondaryHint}</span>
          ) : (
            secondaryHint
          )}
        </div>
      )}
    </div>
  );
}
