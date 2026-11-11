'use client';

import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'lemon' | 'glass';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      loading = false,
      icon,
      disabled,
      className = '',
      ...props
    },
    ref
  ) => {
    const baseStyles =
      'inline-flex items-center justify-center font-medium rounded-full transition-all press-spring touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:pointer-events-none select-none';

    const sizeStyles = {
      sm: 'px-3.5 py-2 min-h-[44px] sm:min-h-[36px] sm:py-1.5 text-xs gap-1.5',
      md: 'px-5 py-2.5 min-h-[44px] text-sm gap-2',
      lg: 'px-7 py-3 min-h-[48px] text-base gap-2.5',
    };

    const variantStyles = {
      // Primary: Warm Electric Tangerine fill with black text per DESIGN.md §1.1
      primary:
        'bg-electricTangerine hover:bg-electricTangerine-hover text-black font-bold shadow-glow-tangerine focus-visible:ring-electricTangerine active:scale-[0.97]',
      // Secondary: Dark card with subtle border (avoiding nested glass-on-glass backdrop-filter)
      secondary:
        'bg-blackHole hover:bg-black text-textPrimary border border-borderDark hover:border-lemonChiffon/30 focus-visible:ring-lemonChiffon active:scale-[0.97]',
      // Ghost: Borderless hover highlight
      ghost:
        'text-textMuted hover:text-textPrimary hover:bg-white/5 focus-visible:ring-lemonChiffon active:scale-[0.97]',
      // Danger: Rosewood critical state
      danger:
        'bg-rosewood hover:bg-rosewood/90 text-white border border-rosewood/50 shadow-md focus-visible:ring-rosewood active:scale-[0.97]',
      // Lemon: Lemon Chiffon safe-action accent
      lemon:
        'bg-lemonChiffon hover:bg-lemonChiffon-hover text-black font-bold shadow-md focus-visible:ring-lemonChiffon active:scale-[0.97]',
      // Glass: Liquid glass button with Platinum Silver specular rim and Pale Lavender hover
      glass:
        'glass-panel hover:bg-white/[0.12] text-platinumSilver border border-platinumSilver/30 hover:border-lemonChiffon/40 focus-visible:ring-lemonChiffon active:scale-[0.97]',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        ) : (
          icon && <span className="shrink-0">{icon}</span>
        )}
        <span>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
