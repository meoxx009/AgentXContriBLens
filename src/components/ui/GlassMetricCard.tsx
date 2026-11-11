'use client';

import React from 'react';

export interface GlassMetricCardProps extends React.HTMLAttributes<HTMLDivElement> {
  value: React.ReactNode;
  label: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  isPrimary?: boolean;
}

export function GlassMetricCard({
  value,
  label,
  icon,
  badge,
  isPrimary = false,
  className = '',
  ...props
}: GlassMetricCardProps) {
  return (
    <div
      className={`liquid-glass-card p-4 rounded-2xl flex items-center justify-between gap-3 ${
        isPrimary
          ? 'border-lemonChiffon/40 bg-gradient-to-br from-blackHole to-coffeeBean/70 shadow-liquid-glow'
          : 'border-platinumSilver/20'
      } ${className}`}
      {...props}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {icon && (
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${
            isPrimary
              ? 'bg-coffeeBean border border-lemonChiffon/40 text-lemonChiffon'
              : 'bg-white/5 border border-platinumSilver/25 text-platinumSilver'
          }`}>
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className={`text-xl font-extrabold truncate ${isPrimary ? 'text-lemonChiffon' : 'text-textPrimary'}`}>
            {value}
          </div>
          <div className="text-[11px] text-platinumSilver/70 leading-tight truncate">
            {label}
          </div>
        </div>
      </div>
      {badge && <div className="shrink-0">{badge}</div>}
    </div>
  );
}
