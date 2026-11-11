'use client';

import React from 'react';
import { AlertCircle } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  monospace?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, monospace = false, className = '', id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold uppercase tracking-wider text-textMuted"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            className={`w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-black/60 backdrop-blur-md border text-textPrimary placeholder:text-textTertiary text-sm transition-all focus:outline-none focus:ring-1 ${
              monospace ? 'font-mono' : 'font-sans'
            } ${
              error
                ? 'border-rosewood/70 focus:border-red-400 focus:ring-red-400/50 bg-rosewood/15'
                : 'border-borderDark focus:border-lemonChiffon/60 focus:ring-lemonChiffon/60 hover:border-borderDark/80'
            } ${className}`}
            {...props}
          />
        </div>
        {error && (
          <p className="flex items-center gap-1.5 text-xs text-red-300 font-medium">
            <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
            <span>{error}</span>
          </p>
        )}
        {hint && !error && <p className="text-xs text-textMuted">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
