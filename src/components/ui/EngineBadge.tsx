'use client';

import React, { useState } from 'react';
import { Info, Sparkles, Cpu, ShieldCheck, HelpCircle } from 'lucide-react';

export const ENGINE_BADGE_TOOLTIP =
  'ContribLens verifies findings with deterministic code. AI explains them. When AI is unavailable, the built-in deterministic engine explains instead — same facts, simpler wording.';

export interface EngineBadgeProps {
  engine?: 'gemma' | 'gemini' | 'deterministic' | string;
  fallback?: boolean;
  fallbackReason?: string;
  className?: string;
  compact?: boolean;
}

/**
 * F4 Task 4: Consistent engine badge everywhere explanations render.
 * "✦ Gemma explanation" / "Gemini explanation" / "Deterministic explanation"
 * Tooltip: "ContribLens verifies findings with deterministic code. AI explains them. When AI is unavailable, the built-in deterministic engine explains instead — same facts, simpler wording."
 */
export function EngineBadge({
  engine = 'deterministic',
  fallback = false,
  fallbackReason,
  className = '',
  compact = false,
}: EngineBadgeProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const normalizedEngine = String(engine || '').toLowerCase();
  const isGemma = !fallback && normalizedEngine.includes('gemma');
  const isGemini = !fallback && normalizedEngine.includes('gemini');

  return (
    <div
      className={`space-y-2 relative inline-block text-left ${className}`}
      data-testid="engine-badge"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <div
          className="relative inline-flex items-center group cursor-help"
          title={ENGINE_BADGE_TOOLTIP}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onFocus={() => setShowTooltip(true)}
          onBlur={() => setShowTooltip(false)}
          tabIndex={0}
          role="note"
          aria-label={ENGINE_BADGE_TOOLTIP}
        >
          {isGemma ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-electricTangerine/15 text-electricTangerine border border-electricTangerine/30 text-xs font-mono font-bold shadow-sm transition-all hover:bg-electricTangerine/25">
              <Sparkles className="w-3.5 h-3.5 text-electricTangerine" />
              <span>✦ Gemma explanation</span>
              <HelpCircle className="w-3 h-3 text-electricTangerine/70 ml-0.5" />
            </span>
          ) : isGemini ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-botticelli/15 text-botticelli border border-botticelli/30 text-xs font-mono font-bold shadow-sm transition-all hover:bg-botticelli/25">
              <Cpu className="w-3.5 h-3.5 text-botticelli" />
              <span>Gemini explanation</span>
              <HelpCircle className="w-3 h-3 text-botticelli/70 ml-0.5" />
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30 text-xs font-mono font-bold shadow-sm transition-all hover:bg-coffeeBean/80">
              <ShieldCheck className="w-3.5 h-3.5 text-lemonChiffon" />
              <span>Deterministic explanation</span>
              <HelpCircle className="w-3 h-3 text-lemonChiffon/70 ml-0.5" />
            </span>
          )}

          {/* Interactive Tooltip Card for hover/focus */}
          {showTooltip && (
            <div
              role="tooltip"
              className="absolute left-0 bottom-full mb-2 z-50 w-72 p-3 rounded-xl bg-black/95 text-sustainableLinen border border-lemonChiffon/40 text-[11px] leading-relaxed shadow-xl backdrop-blur-md pointer-events-none"
            >
              <div className="font-semibold text-lemonChiffon mb-1 flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-electricTangerine shrink-0" />
                <span>Verification &amp; Explanation Engine</span>
              </div>
              <p className="text-platinumSilver/90 font-sans">
                {ENGINE_BADGE_TOOLTIP}
              </p>
            </div>
          )}
        </div>

        {!compact && (
          <span className="text-[10px] font-mono text-platinumSilver/60">
            {fallback ? 'Rule Fallback' : 'Active Engine'}
          </span>
        )}
      </div>

      {!compact && fallback && (
        <div className="p-3 rounded-xl bg-coffeeBean/70 border border-lemonChiffon/20 text-xs text-lemonChiffon flex items-start gap-2.5">
          <Info className="w-4 h-4 text-electricTangerine shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <span className="font-semibold block text-[11px] uppercase tracking-wider text-electricTangerine">
              Deterministic Fallback Active
            </span>
            <p className="text-[11px] text-platinumSilver/80 leading-relaxed">
              {fallbackReason || 'Deterministic explanation — AI unavailable'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
