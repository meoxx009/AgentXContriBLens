'use client';

import React from 'react';
import { Layers, CheckCircle2 } from 'lucide-react';

export interface EvidenceTrustStep {
  step: number;
  label: string;
  detail: string;
  verifiedBy: string;
}

export const DEFAULT_TRUST_STEPS: EvidenceTrustStep[] = [
  {
    step: 1,
    label: 'URL validated',
    detail: 'Verified public GitHub repository format, access permissions, and branch',
    verifiedBy: 'scanner',
  },
  {
    step: 2,
    label: 'Bounded tree fetched',
    detail: 'Retrieved bounded repository tree (60 configuration files / 15 MB cap)',
    verifiedBy: 'scanner',
  },
  {
    step: 3,
    label: 'Redaction applied (in-memory)',
    detail: 'In-memory secret regex masking before any persistence, model, or logs',
    verifiedBy: 'redaction-guard',
  },
  {
    step: 4,
    label: 'SHA-256 evidence hash',
    detail: 'Cryptographically hashed raw evidence snippet for immutable audit trail',
    verifiedBy: 'crypto-engine',
  },
  {
    step: 5,
    label: 'Deterministic rule match',
    detail: 'Verified deterministic AST & manifest security analyzer triggered',
    verifiedBy: 'scanner-rules',
  },
  {
    step: 6,
    label: 'OSV cross-check',
    detail: 'Cross-checked against open OSV.dev batch vulnerability database',
    verifiedBy: 'osv-api',
  },
  {
    step: 7,
    label: 'Evidence normalization',
    detail: 'Normalized finding schema and separated urgency priority from contributor readiness',
    verifiedBy: 'validator',
  },
  {
    step: 8,
    label: 'Redacted persistence',
    detail: 'Persisted to disk database with foreign keys and session isolation',
    verifiedBy: 'database',
  },
];

export interface EvidenceChainViewProps {
  steps?: EvidenceTrustStep[];
  evidenceHash?: string;
  className?: string;
}

/**
 * P8 Task 3: Evidence chain rendering the 8 trust steps
 * per EVIDENCE_AND_SCHEMAS.md §9.
 */
export function EvidenceChainView({
  steps = DEFAULT_TRUST_STEPS,
  evidenceHash,
  className = '',
}: EvidenceChainViewProps) {
  return (
    <div className={`space-y-3 ${className}`}>
      <div className="flex items-center justify-between pb-1 border-b border-platinumSilver/15">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-botticelli" />
          <h4 className="text-xs font-bold text-textPrimary uppercase tracking-wider font-mono">
            Evidence Chain — 8 Trust Steps
          </h4>
        </div>
        {evidenceHash && (
          <span className="text-[10px] font-mono text-lemonChiffon/80 truncate max-w-[200px]">
            SHA-256: {evidenceHash.slice(0, 10)}...
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        {steps.map((st) => (
          <div
            key={st.step}
            className="p-3 rounded-xl bg-black/80 border border-platinumSilver/15 flex items-start gap-2.5 hover:border-lemonChiffon/30 transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-coffeeBean border border-lemonChiffon/30 text-lemonChiffon text-[10px] font-mono font-bold flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
              {st.step}
            </div>

            <div className="space-y-0.5 min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-textPrimary text-xs truncate">
                  {st.label}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>
              <p className="text-[10px] text-platinumSilver/70 line-clamp-2 leading-relaxed">
                {st.detail}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
