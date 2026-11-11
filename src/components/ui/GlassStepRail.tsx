'use client';

import React from 'react';
import {
  Search,
  CheckCircle2,
  Cpu,
  Compass,
  GitBranch,
  Layers,
  Shield,
  Lock,
  Zap,
} from 'lucide-react';

export interface StepItem {
  num: string;
  title: string;
  tagline: string;
  badge?: string;
  icon?: React.ElementType;
}

export interface GlassStepRailProps {
  steps?: StepItem[];
  currentStep: number;
  onStepChange?: (index: number) => void;
  className?: string;
}

export const DEFAULT_STEPS: StepItem[] = [
  {
    num: '01',
    title: 'Scan',
    tagline: 'Deterministic static analysis',
    badge: 'Zero Code Execution',
    icon: Search,
  },
  {
    num: '02',
    title: 'Verify',
    tagline: 'Evidence & OSV verification',
    badge: 'Zero AI Hallucination',
    icon: CheckCircle2,
  },
  {
    num: '03',
    title: 'Understand',
    tagline: 'Grounded Gemini explanations',
    badge: 'Strict Server Adapter',
    icon: Cpu,
  },
  {
    num: '04',
    title: 'Contribute',
    tagline: 'Actionable routes & drafts',
    badge: 'Maintainer Safe',
    icon: Compass,
  },
];

export const SCAN_PIPELINE_STEPS: StepItem[] = [
  {
    num: '01',
    title: 'Validate URL',
    tagline: 'Format & public permissions',
    badge: 'Safe Guard',
    icon: Search,
  },
  {
    num: '02',
    title: 'Fetch Tree',
    tagline: 'Bounded tree (60 files max)',
    badge: 'Size Bounds',
    icon: GitBranch,
  },
  {
    num: '03',
    title: 'Parse Manifests & Workflows',
    tagline: 'AST parser & dependency graph',
    badge: 'Deterministic',
    icon: Layers,
  },
  {
    num: '04',
    title: 'OSV Query',
    tagline: 'Batch vulnerability lookup',
    badge: 'OSV.dev',
    icon: Shield,
  },
  {
    num: '05',
    title: 'Actions Audit',
    tagline: 'Permissions & supply-chain check',
    badge: 'Least Privilege',
    icon: Lock,
  },
  {
    num: '06',
    title: 'Readiness Score',
    tagline: 'Suitability & beginner routes',
    badge: 'Deterministic',
    icon: Zap,
  },
];

export function GlassStepRail({
  steps = DEFAULT_STEPS,
  currentStep,
  onStepChange,
  className = '',
}: GlassStepRailProps) {
  const currentStepInfo =
    currentStep >= 0 && currentStep < steps.length
      ? `Stage ${currentStep + 1} of ${steps.length}: ${steps[currentStep].title}`
      : currentStep >= steps.length
      ? 'All pipeline stages completed'
      : 'Pipeline idle';

  // Dynamic grid column class based on steps count
  const desktopGridCols =
    steps.length === 6
      ? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6'
      : steps.length === 4
      ? 'grid-cols-2 md:grid-cols-4'
      : 'grid-cols-1 md:grid-cols-3';

  return (
    <div className={`w-full ${className}`}>
      {/* Screen reader live region for announcing pipeline stage changes */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {currentStepInfo}
      </div>

      {/* Horizontal Stepper Rail for Desktop / Tablets */}
      <div className={`hidden md:grid ${desktopGridCols} gap-3 relative`}>
        {/* Connecting Progress Line behind nodes */}
        <div className="absolute top-1/2 left-6 right-6 h-0.5 bg-platinumSilver/15 -translate-y-1/2 z-0" />
        <div
          className="absolute top-1/2 left-6 h-0.5 bg-gradient-to-r from-electricTangerine to-lemonChiffon -translate-y-1/2 z-0 transition-all duration-500"
          style={{
            width: `${
              steps.length > 1
                ? Math.min(100, Math.max(0, (currentStep / (steps.length - 1)) * 88))
                : 0
            }%`,
          }}
        />

        {steps.map((step, idx) => {
          const Icon = step.icon || Search;
          const isCurrent = currentStep === idx;
          const isPassed = currentStep > idx;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onStepChange?.(idx)}
              disabled={!onStepChange}
              aria-current={isCurrent ? 'step' : undefined}
              className={`relative z-10 p-3.5 rounded-2xl text-left transition-all flex flex-col justify-between ${
                isCurrent
                  ? 'liquid-glass-card border-electricTangerine/60 shadow-liquid-glow scale-[1.02]'
                  : isPassed
                  ? 'bg-black/85 border border-lemonChiffon/30 text-platinumSilver'
                  : 'bg-black/40 border border-platinumSilver/10 text-platinumSilver/40'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <span
                  className={`text-lg font-mono font-bold ${
                    isCurrent
                      ? 'text-electricTangerine'
                      : isPassed
                      ? 'text-lemonChiffon'
                      : 'text-platinumSilver/30'
                  }`}
                >
                  {step.num}
                </span>

                <div
                  className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                    isCurrent
                      ? 'bg-electricTangerine/20 text-electricTangerine border border-electricTangerine/60 animate-pulse'
                      : isPassed
                      ? 'bg-coffeeBean/70 text-lemonChiffon border border-lemonChiffon/40'
                      : 'bg-white/[0.03] text-platinumSilver/30 border border-white/5'
                  }`}
                >
                  {isPassed ? (
                    <CheckCircle2 className="w-4 h-4 text-lemonChiffon" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                </div>
              </div>

              <div>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <h4
                    className={`text-xs font-bold leading-tight ${
                      isCurrent
                        ? 'text-textPrimary'
                        : isPassed
                        ? 'text-lemonChiffon'
                        : 'text-platinumSilver/50'
                    }`}
                  >
                    {step.title}
                  </h4>
                </div>
                <p className="text-[10px] text-platinumSilver/60 leading-snug line-clamp-2">
                  {step.tagline}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Vertical Stepper Rail for Mobile */}
      <div className="md:hidden space-y-2">
        {steps.map((step, idx) => {
          const Icon = step.icon || Search;
          const isCurrent = currentStep === idx;
          const isPassed = currentStep > idx;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => onStepChange?.(idx)}
              disabled={!onStepChange}
              aria-current={isCurrent ? 'step' : undefined}
              className={`w-full min-h-[44px] p-3 rounded-xl text-left transition-all press-spring touch-manipulation flex items-center justify-between gap-3 ${
                isCurrent
                  ? 'liquid-glass-card border-electricTangerine/60 shadow-sm'
                  : isPassed
                  ? 'bg-black/85 border border-lemonChiffon/30 text-platinumSilver'
                  : 'bg-black/40 border border-platinumSilver/10 text-platinumSilver/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`text-sm font-mono font-bold ${
                    isCurrent
                      ? 'text-electricTangerine'
                      : isPassed
                      ? 'text-lemonChiffon'
                      : 'text-platinumSilver/30'
                  }`}
                >
                  {step.num}
                </span>
                <div>
                  <h4
                    className={`text-xs font-bold ${
                      isCurrent
                        ? 'text-textPrimary'
                        : isPassed
                        ? 'text-lemonChiffon'
                        : 'text-platinumSilver/50'
                    }`}
                  >
                    {step.title}
                  </h4>
                  <p className="text-[10px] text-platinumSilver/60">{step.tagline}</p>
                </div>
              </div>

              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                  isCurrent
                    ? 'bg-electricTangerine/20 text-electricTangerine border border-electricTangerine/60 animate-pulse'
                    : isPassed
                    ? 'bg-coffeeBean/70 text-lemonChiffon border border-lemonChiffon/40'
                    : 'bg-white/[0.03] text-platinumSilver/30 border border-white/5'
                }`}
              >
                {isPassed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-lemonChiffon" />
                ) : (
                  <Icon className="w-3.5 h-3.5" />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
