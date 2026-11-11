'use client';

import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'glass' | 'widget' | 'warm' | 'linen' | 'cotton' | 'liquid-glass' | 'liquid-hero' | 'metric-card';
}

export function Card({
  children,
  variant = 'glass',
  className = '',
  ...props
}: CardProps) {
  const variantStyles = {
    // Glass card: dark translucent backdrop with fine border
    glass: 'bg-blackHole/75 backdrop-blur-md border border-borderDark text-textPrimary shadow-glass-card',
    // Open widget: spacious, high-contrast framing
    widget: 'bg-blackHole border border-borderDark/80 hover:border-lemonChiffon/30 text-textPrimary shadow-2xl transition-all',
    // Warm: Coffee Bean deep ambient card
    warm: 'bg-coffeeBean/70 backdrop-blur-lg border border-electricTangerine/25 text-textPrimary shadow-glow-tangerine',
    // Linen: Sustainable Linen document surface for drafts & reports
    linen: 'bg-sustainableLinen text-neutral-900 border border-neutral-300 shadow-md',
    // Cotton: Recycled Cotton warm tone
    cotton: 'bg-recycledCotton text-neutral-900 border border-neutral-300/80 shadow-md',
    // Liquid glass: high-translucency glass with Platinum Silver specular rim
    'liquid-glass': 'liquid-glass-card text-textPrimary',
    // Liquid hero: elevated multi-stop glass with deep blur
    'liquid-hero': 'liquid-glass-hero text-textPrimary',
    // Metric card: high-hierarchy metric panel with subtle glow
    'metric-card': 'liquid-glass-card border-platinumSilver/25 hover:border-lemonChiffon/40 text-textPrimary',
  };

  return (
    <div
      className={`rounded-2xl p-6 transition-colors ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
  className = '',
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 pb-4 border-b border-borderDark/60 mb-4 ${className}`}>
      <div>
        <h3 className="text-base font-semibold tracking-tight text-textPrimary">{title}</h3>
        {subtitle && <p className="text-xs text-textMuted mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
