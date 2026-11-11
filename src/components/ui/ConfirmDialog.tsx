'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, AlertOctagon, X, Loader2 } from 'lucide-react';

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  consequenceWarning?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  isBusy?: boolean;
  requireTypedConfirmation?: boolean;
  typedConfirmationPhrase?: string;
  typedConfirmationPrompt?: string;
  typedInputPlaceholder?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  confirmRef?: string;
}

/**
 * ContribLens — Reusable Accessible Confirmation Dialog
 *
 * Requirements:
 * - Links to destructive-action protection across the application.
 * - WCAG AA accessible: focus trap, Escape to cancel, aria-modal, role="alertdialog".
 * - 12-token smoky palette + liquid glass styling.
 * - Focus defaults to Cancel button on destructive actions to prevent accidental Enter triggers.
 * - Typed confirmation option for high-severity actions (e.g. DELETE account or database wipe).
 */
export default function ConfirmDialog({
  isOpen,
  title,
  description,
  consequenceWarning,
  confirmLabel = 'Confirm Action',
  cancelLabel = 'Cancel',
  isDestructive = true,
  isBusy = false,
  requireTypedConfirmation = false,
  typedConfirmationPhrase = 'DELETE',
  typedConfirmationPrompt,
  typedInputPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElementRef = useRef<HTMLElement | null>(null);
  const [typedValue, setTypedValue] = useState('');

  // Reset typed confirmation value when opening/closing
  useEffect(() => {
    if (isOpen) {
      setTypedValue('');
    }
  }, [isOpen]);

  const isTypedConfirmationValid =
    !requireTypedConfirmation ||
    typedValue.trim().toUpperCase() === typedConfirmationPhrase.trim().toUpperCase();

  // Focus management & Escape key handling
  useEffect(() => {
    if (!isOpen) return;

    if (typeof document !== 'undefined') {
      previousActiveElementRef.current = document.activeElement as HTMLElement | null;
    }

    const timer = setTimeout(() => {
      // If typed confirmation is required, focus input first; otherwise focus Cancel for safety
      if (requireTypedConfirmation && typedInputRef.current) {
        typedInputRef.current.focus();
      } else if (cancelButtonRef.current) {
        cancelButtonRef.current.focus();
      }
    }, 40);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) {
        e.preventDefault();
        onCancel();
        return;
      }

      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
      if (previousActiveElementRef.current && typeof previousActiveElementRef.current.focus === 'function') {
        previousActiveElementRef.current.focus();
      }
    };
  }, [isOpen, isBusy, onCancel, requireTypedConfirmation]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isBusy) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-description"
        className={`w-full max-w-md p-6 sm:p-7 rounded-2xl glass-panel shadow-2xl relative border space-y-5 animate-in fade-in zoom-in-95 duration-150 ${
          isDestructive
            ? 'border-rosewood/60 bg-black/90'
            : 'border-lemonChiffon/30 bg-black/90'
        }`}
      >
        {/* Top Dismiss Button */}
        <button
          type="button"
          onClick={onCancel}
          disabled={isBusy}
          aria-label="Close dialog"
          className="min-w-[44px] min-h-[44px] absolute right-3 top-3 p-2 text-textMuted hover:text-sustainableLinen transition-colors disabled:opacity-40 rounded-lg press-spring touch-manipulation flex items-center justify-center"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header Icon + Title */}
        <div className="flex items-start gap-3.5 pr-8">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isDestructive
                ? 'bg-rosewood/25 border-rosewood/60 text-red-300'
                : 'bg-lemonChiffon/15 border-lemonChiffon/40 text-lemonChiffon'
            }`}
          >
            {isDestructive ? (
              <AlertOctagon className="w-5 h-5 text-red-400" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-lemonChiffon" />
            )}
          </div>
          <div>
            <h2
              id="confirm-dialog-title"
              className="text-base sm:text-lg font-heading font-bold text-sustainableLinen tracking-tight leading-snug"
            >
              {title}
            </h2>
            <p
              id="confirm-dialog-description"
              className="mt-1 text-xs sm:text-sm text-textMuted leading-relaxed"
            >
              {description}
            </p>
          </div>
        </div>

        {/* Optional Consequence Warning Callout Box */}
        {consequenceWarning && (
          <div
            role="note"
            className="p-3.5 rounded-xl bg-rosewood/20 border border-rosewood/40 text-xs text-sustainableLinen flex items-start gap-2.5 animate-in fade-in duration-150"
          >
            <AlertTriangle className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
            <p className="leading-relaxed text-red-200">
              {consequenceWarning}
            </p>
          </div>
        )}

        {/* Typed Confirmation Field for High Severity Actions */}
        {requireTypedConfirmation && (
          <div className="space-y-2 pt-1">
            <label
              htmlFor="typed-confirm-input"
              className="block text-xs font-semibold text-textPrimary"
            >
              {typedConfirmationPrompt || (
                <span>
                  Type <strong className="text-red-400 font-mono tracking-wider">{typedConfirmationPhrase}</strong> to proceed:
                </span>
              )}
            </label>
            <input
              ref={typedInputRef}
              id="typed-confirm-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder={typedInputPlaceholder || `Type "${typedConfirmationPhrase}"`}
              className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-black/70 border border-borderDark focus:border-red-400 focus:ring-1 focus:ring-red-400 text-sm font-mono text-sustainableLinen placeholder:text-textTertiary focus:outline-none transition-colors"
            />
          </div>
        )}

        {/* Action Buttons: Cancel defaults to safe action */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            ref={cancelButtonRef}
            type="button"
            onClick={onCancel}
            disabled={isBusy}
            className="min-h-[44px] px-5 py-2.5 rounded-xl bg-black/60 hover:bg-blackHole border border-borderDark text-sustainableLinen text-xs font-semibold transition-all disabled:opacity-50 press-spring touch-manipulation flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lemonChiffon"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isBusy || !isTypedConfirmationValid}
            className={`min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed press-spring touch-manipulation flex items-center justify-center gap-2 shadow-md ${
              isDestructive
                ? 'bg-rosewood hover:bg-rosewood/80 text-cotton focus-visible:ring-2 focus-visible:ring-red-400'
                : 'bg-lemonChiffon hover:bg-sustainableLinen text-black focus-visible:ring-2 focus-visible:ring-lemonChiffon'
            }`}
          >
            {isBusy ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{confirmLabel}</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
