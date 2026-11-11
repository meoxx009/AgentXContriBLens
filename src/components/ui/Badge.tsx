'use client';

import React from 'react';
import type { Severity } from '@/types';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'critical' | 'high' | 'medium' | 'low' | 'info' | 'lemon' | 'tech' | 'neutral' | 'chrome' | 'lavender' | 'silver';
  size?: 'sm' | 'md';
}

export function Badge({
  children,
  variant = 'neutral',
  size = 'md',
  className = '',
  ...props
}: BadgeProps) {
  const sizeStyles = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
  };

  const variantStyles = {
    // Critical: Rosewood with clear light-red text and high-contrast border
    critical: 'bg-rosewood/35 text-red-200 border border-rosewood/70 font-semibold',
    // High: Electric Tangerine with bright warm accent
    high: 'bg-electricTangerine/20 text-[#FFB082] border border-electricTangerine/50 font-semibold',
    // Medium: Lemon Chiffon
    medium: 'bg-lemonChiffon/15 text-lemonChiffon border border-lemonChiffon/40 font-semibold',
    // Low: Subtle Neutral
    low: 'bg-white/10 text-textMuted border border-white/20 font-medium',
    // Info: Muted Blue / Botticelli
    info: 'bg-botticelli/15 text-botticelli border border-botticelli/40 font-medium',
    // Lemon: Lemon Chiffon
    lemon: 'bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 font-medium',
    // Tech: Botticelli Muted
    tech: 'bg-botticelli/15 text-botticelli border border-botticelli/30 font-mono font-medium',
    // Neutral: Black Hole glass
    neutral: 'bg-blackHole text-textPrimary border border-borderDark font-medium',
    // Chrome: Metallic liquid chrome pill
    chrome: 'liquid-chrome-pill text-platinumSilver font-semibold',
    // Lavender: Pale Lavender accent for AI & learning cues
    lavender: 'bg-paleLavender/15 text-paleLavender border border-paleLavender/35 font-medium',
    // Silver: Platinum Silver reflective chip
    silver: 'bg-white/10 text-platinumSilver border border-platinumSilver/30 font-medium',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full select-none tracking-wide ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const normalized = severity.toLowerCase() as 'critical' | 'high' | 'medium' | 'low' | 'info';
  const map: Record<'critical' | 'high' | 'medium' | 'low' | 'info', 'critical' | 'high' | 'medium' | 'low' | 'info'> = {
    critical: 'critical',
    high: 'high',
    medium: 'medium',
    low: 'low',
    info: 'info',
  };
  return <Badge variant={map[normalized] || 'neutral'}>{severity.toUpperCase()}</Badge>;
}
