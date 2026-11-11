'use client';

import React, { useState, useEffect } from 'react';
import { Clock, RotateCw } from 'lucide-react';

export interface LastUpdatedBadgeProps {
  timestamp?: string | number | Date | null;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
  prefix?: string;
}

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 15) return 'Just now';
  if (diffSec < 60) return `${diffSec}s ago`;

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * LastUpdatedBadge
 * Displays honest freshness timestamps for live lists (stats, scans, findings, routes).
 */
export default function LastUpdatedBadge({
  timestamp,
  onRefresh,
  refreshing = false,
  className = '',
  prefix = 'Last updated',
}: LastUpdatedBadgeProps) {
  const [formatted, setFormatted] = useState<string>('Live');

  useEffect(() => {
    if (!timestamp) {
      setFormatted('Live');
      return;
    }

    const d = new Date(timestamp);
    if (isNaN(d.getTime())) {
      setFormatted(String(timestamp));
      return;
    }

    const update = () => setFormatted(formatRelativeTime(d));
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, [timestamp]);

  return (
    <div
      className={`inline-flex items-center gap-2 text-xs font-mono text-textTertiary ${className}`}
      aria-label={`${prefix}: ${formatted}`}
    >
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-platinumSilver/15">
        <Clock className="w-3 h-3 text-lemonChiffon/70 shrink-0" aria-hidden="true" />
        <span>
          {prefix}: <strong className="text-sustainableLinen font-medium">{formatted}</strong>
        </span>
      </span>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Refresh data"
          aria-label="Refresh data"
          className="min-w-[32px] min-h-[32px] p-1.5 rounded-full text-textMuted hover:text-lemonChiffon hover:bg-white/5 border border-transparent hover:border-platinumSilver/20 transition-all disabled:opacity-50 press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-lemonChiffon"
        >
          <RotateCw
            className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-lemonChiffon' : ''}`}
            aria-hidden="true"
          />
        </button>
      )}
    </div>
  );
}
