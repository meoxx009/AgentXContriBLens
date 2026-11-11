'use client';

import React from 'react';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  disabled?: boolean;
  id?: string;
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
  id = 'toggle-switch',
}: ToggleProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      {(label || description) && (
        <div className="space-y-0.5">
          {label && (
            <label
              htmlFor={id}
              className="text-sm font-medium text-textPrimary cursor-pointer select-none"
            >
              {label}
            </label>
          )}
          {description && <p className="text-xs text-textMuted">{description}</p>}
        </div>
      )}
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed press-spring touch-manipulation before:absolute before:-inset-2.5 before:content-[''] ${
          checked ? 'bg-electricTangerine' : 'bg-blackHole border-borderDark'
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}
