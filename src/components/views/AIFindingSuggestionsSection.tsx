'use client';

import React from 'react';
import {
  Sparkles,
  AlertTriangle,
  AlertOctagon,
  AlertCircle,
  Info,
  HelpCircle,
  FileCode,
  ArrowDown,
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  BookOpen,
  Compass,
} from 'lucide-react';
import type { AIFindingSuggestion, Severity } from '@/types';
import { EngineBadge } from '@/components/ui/EngineBadge';

interface AIFindingSuggestionsSectionProps {
  suggestions: AIFindingSuggestion[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  isPartial: boolean;
  totalFindings: number;
  hasScan: boolean;
  onSelectFinding: (findingId: string) => void;
}

function SuggestionSeverityBadge({ severity }: { severity?: Severity | string }) {
  const sev = (severity || 'INFO').toUpperCase();
  let colorStyles = 'bg-blackHole text-platinumSilver border-borderDark';
  let Icon = HelpCircle;

  switch (sev) {
    case 'CRITICAL':
      colorStyles = 'bg-rosewood/40 text-red-200 border-rosewood/80';
      Icon = AlertOctagon;
      break;
    case 'HIGH':
      colorStyles = 'bg-electricTangerine/20 text-[#FFB082] border-electricTangerine/50';
      Icon = AlertTriangle;
      break;
    case 'MEDIUM':
      colorStyles = 'bg-lemonChiffon/15 text-lemonChiffon border-lemonChiffon/40';
      Icon = AlertCircle;
      break;
    case 'LOW':
      colorStyles = 'bg-botticelli/15 text-botticelli border-botticelli/40';
      Icon = Info;
      break;
    case 'INFO':
    default:
      colorStyles = 'bg-white/10 text-platinumSilver border-platinumSilver/30';
      Icon = HelpCircle;
      break;
  }

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider border ${colorStyles}`}
    >
      <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
      <span>{sev}</span>
    </span>
  );
}

export default function AIFindingSuggestionsSection({
  suggestions,
  loading,
  error,
  onRetry,
  isPartial,
  totalFindings,
  hasScan,
  onSelectFinding,
}: AIFindingSuggestionsSectionProps) {
  // If no scan is selected yet and not loading, show nothing or calm prompt
  if (!hasScan && !loading && !error) {
    return null;
  }

  // Derive engine used for the banner badge (from first suggestion or deterministic default)
  const primaryEngine = suggestions[0]?.generatedBy || 'deterministic';
  const hasFallback = suggestions.some((s) => s.fallback);
  const fallbackReason = suggestions.find((s) => s.fallbackReason)?.fallbackReason;

  return (
    <section
      role="region"
      aria-label="AI Finding Suggestions"
      data-testid="ai-finding-suggestions-section"
      className="glass-panel p-5 sm:p-6 rounded-2xl border border-lemonChiffon/30 shadow-liquid-glow space-y-4"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-borderDark/60">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="p-1.5 rounded-lg bg-lemonChiffon/10 border border-lemonChiffon/30 text-lemonChiffon">
              <Sparkles className="w-4 h-4 text-lemonChiffon" />
            </span>
            <h2 className="text-lg font-heading font-bold text-textPrimary tracking-tight">
              AI Finding Suggestions
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-lemonChiffon/15 text-lemonChiffon border border-lemonChiffon/30">
              Beginner Friendly
            </span>
            {isPartial && (
              <span
                data-testid="partial-scan-badge"
                className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-coffeeBean text-lemonChiffon border border-lemonChiffon/40"
              >
                Partial Scan Notice
              </span>
            )}
          </div>
          <p className="text-xs text-textMuted leading-relaxed">
            AI-generated explanations and safe next steps grounded strictly in verified scan findings · Advisory only
          </p>
          {isPartial && (
            <p className="text-[11px] font-mono text-lemonChiffon/90">
              Notice: Suggestions are based only on the findings currently available from this partial repository scan.
            </p>
          )}
        </div>

        {/* Engine Badge */}
        {!loading && !error && suggestions.length > 0 && (
          <div className="self-start sm:self-auto shrink-0">
            <EngineBadge
              engine={primaryEngine}
              fallback={hasFallback}
              fallbackReason={fallbackReason}
            />
          </div>
        )}
      </div>

      {/* State 1: Loading Skeleton */}
      {loading && (
        <div
          data-testid="ai-suggestions-loading"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          aria-busy="true"
          aria-label="Loading AI finding suggestions"
        >
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="p-4 rounded-xl bg-blackHole/60 border border-borderDark/70 space-y-3 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-20 bg-white/10 rounded" />
                <div className="h-4 w-28 bg-white/5 rounded" />
              </div>
              <div className="h-4 w-3/4 bg-white/10 rounded" />
              <div className="space-y-1.5 pt-2">
                <div className="h-3 w-full bg-white/5 rounded" />
                <div className="h-3 w-5/6 bg-white/5 rounded" />
              </div>
              <div className="h-14 bg-black/80 rounded border border-white/5" />
              <div className="h-8 w-full bg-white/10 rounded-xl" />
            </div>
          ))}
        </div>
      )}

      {/* State 2: Error State (Recoverable & Non-blocking) */}
      {!loading && error && (
        <div
          data-testid="ai-suggestions-error"
          role="alert"
          className="p-4 rounded-xl bg-rosewood/25 border border-rosewood/60 text-xs text-sustainableLinen flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
            <div>
              <p className="font-semibold text-red-200">AI Suggestions Temporarily Unavailable</p>
              <p className="text-[11px] text-textMuted mt-0.5">{error}</p>
              <p className="text-[10px] text-textTertiary mt-0.5">
                Your verified findings below are completely safe and unaffected.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onRetry}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-lemonChiffon hover:bg-sustainableLinen text-black text-xs font-bold transition-colors flex items-center gap-1.5 shrink-0 press-spring touch-manipulation"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Suggestions</span>
          </button>
        </div>
      )}

      {/* State 3: Confirmed Zero Findings */}
      {!loading && !error && totalFindings === 0 && (
        <div
          data-testid="ai-suggestions-zero"
          className="p-6 rounded-xl bg-blackHole/40 border border-borderDark text-center space-y-2"
        >
          <div className="inline-flex p-2.5 rounded-full bg-emerald-950/60 border border-emerald-500/40 text-emerald-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-sm font-semibold text-sustainableLinen">
            No Verified Findings in This Scan
          </h3>
          <p className="text-xs text-textMuted max-w-md mx-auto">
            The deterministic scanner found zero security, configuration, or health issues in this scan. No remediation suggestions are required.
          </p>
        </div>
      )}

      {/* State 4: Suggestions Available */}
      {!loading && !error && suggestions.length > 0 && (
        <div
          data-testid="ai-suggestions-list"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {suggestions.map((sug) => {
            return (
              <article
                key={sug.id}
                data-testid={`ai-suggestion-card-${sug.findingId}`}
                className="p-4 rounded-xl bg-blackHole/70 border border-platinumSilver/20 hover:border-lemonChiffon/50 transition-all flex flex-col justify-between space-y-3 shadow-inner"
              >
                <div className="space-y-3">
                  {/* Top Row: Scanner-Confirmed Badges */}
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-[11px]">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <SuggestionSeverityBadge severity={sug.severity} />
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-black/60 border border-borderDark text-botticelli">
                        {sug.ruleId}
                      </span>
                    </div>

                    {!sug.hasSufficientEvidence && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-coffeeBean text-lemonChiffon border border-lemonChiffon/30">
                        Limited evidence
                      </span>
                    )}
                  </div>

                  {/* Title & Verified Location */}
                  <div>
                    <h3 className="text-sm font-semibold text-textPrimary leading-snug line-clamp-2">
                      {sug.title}
                    </h3>
                    {sug.file && (
                      <div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-botticelli">
                        <FileCode className="w-3 h-3 text-lemonChiffon shrink-0" />
                        <span className="truncate">
                          {sug.file}
                          {sug.lineStart ? `:${sug.lineStart}` : ''}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* 1. What it means */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-lemonChiffon uppercase font-mono tracking-wider">
                      1. What this means
                    </p>
                    <p className="text-xs text-sustainableLinen leading-relaxed">
                      {sug.whatHappened}
                    </p>
                  </div>

                  {/* 2. Why it matters */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-electricTangerine uppercase font-mono tracking-wider">
                      2. Why it matters
                    </p>
                    <p className="text-xs text-textMuted leading-relaxed">
                      {sug.whyItMatters}
                    </p>
                  </div>

                  {/* 3. Verified Evidence */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-botticelli uppercase font-mono tracking-wider">
                      3. Verified Scan Evidence
                    </p>
                    {sug.hasSufficientEvidence ? (
                      <div className="p-2 rounded bg-black/90 border border-botticelli/30 text-[11px] font-mono text-botticelli overflow-x-auto whitespace-pre-wrap break-all max-h-20">
                        <code>{sug.evidenceSnippet}</code>
                      </div>
                    ) : (
                      <div className="p-2 rounded bg-black/50 border border-borderDark text-[11px] text-textMuted italic">
                        Available scan evidence is insufficient; manual repository file inspection recommended.
                      </div>
                    )}
                  </div>

                  {/* 4. Safe Next Step */}
                  <div className="space-y-1">
                    <p className="text-[11px] font-bold text-emerald-400 uppercase font-mono tracking-wider">
                      4. Safe Next Step (Advisory)
                    </p>
                    <p className="text-xs text-sustainableLinen/90 leading-relaxed bg-emerald-950/20 p-2 rounded border border-emerald-500/20">
                      {sug.howToFix}
                    </p>
                  </div>

                  {/* 5. What you will learn */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-textMuted">
                      <span>5. Skills you&apos;ll learn:</span>
                      <span className="capitalize text-lemonChiffon">{sug.difficulty} · {sug.estimatedEffort}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sug.skills.slice(0, 3).map((skill, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-[10px] font-mono bg-white/5 border border-borderDark text-textMuted"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Card Action: Jump to Verified Finding */}
                <div className="pt-2 border-t border-borderDark/40">
                  <button
                    type="button"
                    onClick={() => onSelectFinding(sug.findingId)}
                    className="w-full min-h-[44px] px-3.5 py-2 rounded-xl bg-white/5 hover:bg-lemonChiffon hover:text-black text-sustainableLinen border border-borderDark text-xs font-semibold flex items-center justify-center gap-1.5 transition-all press-spring touch-manipulation focus:ring-1 focus:ring-lemonChiffon"
                    aria-label={`Jump to verified finding: ${sug.title}`}
                  >
                    <ArrowDown className="w-3.5 h-3.5 shrink-0" />
                    <span>Jump to Verified Finding</span>
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Grounding & Human Approval Guardrail Note */}
      <div className="pt-2 border-t border-borderDark/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono text-textMuted">
        <span>Code verifies · AI explains · Human approves</span>
        <span>Advisory suggestions only — test all changes before committing.</span>
      </div>
    </section>
  );
}
