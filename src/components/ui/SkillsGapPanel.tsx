'use client';

import React from 'react';
import { Sparkles, ExternalLink, Award } from 'lucide-react';
import type { LearningResource } from '@/types';

export interface SkillsGapPanelProps {
  skills?: string[];
  learningResources?: LearningResource[];
  contributorImpact?: number;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | string;
  category?: string;
  className?: string;
}

const DEFAULT_LEARNING_RESOURCES: Record<string, LearningResource[]> = {
  'github-actions': [
    {
      title: 'GitHub Actions Workflow Security Hardening',
      url: 'https://docs.github.com/en/actions/security-guides/security-hardening-for-github-actions',
      provider: 'docs',
    },
    {
      title: 'Understanding Least Privilege in CI/CD',
      url: 'https://www.freecodecamp.org/news/devops-security-best-practices/',
      provider: 'freeCodeCamp',
    },
  ],
  dependency: [
    {
      title: 'npm Dependency Auditing & Security Fixes',
      url: 'https://docs.npmjs.com/auditing-package-dependencies-for-security-vulnerabilities',
      provider: 'docs',
    },
    {
      title: 'MDN Web Docs: Package Management Basics',
      url: 'https://developer.mozilla.org/en-US/docs/Learn/Tools_and_testing/Understanding_client-side_tools/Package_management',
      provider: 'MDN',
    },
  ],
  secret: [
    {
      title: 'About Secret Scanning and Token Revocation',
      url: 'https://docs.github.com/en/code-security/secret-scanning/about-secret-scanning',
      provider: 'docs',
    },
    {
      title: 'Git History Scrubbing & Credentials Protection',
      url: 'https://www.freecodecamp.org/news/how-to-remove-sensitive-data-from-a-git-repository/',
      provider: 'freeCodeCamp',
    },
  ],
  'repository-health': [
    {
      title: 'Adding a Security Policy to Your Repository',
      url: 'https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository',
      provider: 'docs',
    },
    {
      title: 'freeCodeCamp: How to Make Your First Pull Request',
      url: 'https://www.freecodecamp.org/news/how-to-make-your-first-pull-request-on-github/',
      provider: 'freeCodeCamp',
    },
  ],
};

/**
 * P8 Task 5: Skills Gap panel with Pale Lavender accents,
 * skills list, 2-3 free learning links, and contributor impact.
 */
export function SkillsGapPanel({
  skills = ['Git', 'Code Review', 'Principle of least privilege'],
  learningResources,
  contributorImpact = 15,
  difficulty = 'beginner',
  category = 'github-actions',
  className = '',
}: SkillsGapPanelProps) {
  const activeResources =
    learningResources && learningResources.length > 0
      ? learningResources
      : DEFAULT_LEARNING_RESOURCES[category] || DEFAULT_LEARNING_RESOURCES['github-actions'];

  return (
    <div
      className={`p-5 rounded-2xl bg-paleLavender/[0.04] border border-paleLavender/30 space-y-4 shadow-sm ${className}`}
    >
      <div className="flex items-center justify-between pb-3 border-b border-paleLavender/20">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-paleLavender/15 border border-paleLavender/30 flex items-center justify-center text-paleLavender shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-sustainableLinen uppercase tracking-wider font-mono">
              Skills Gap &amp; What You Will Learn
            </h4>
            <span className="text-[10px] text-paleLavender/70 capitalize">
              {difficulty} Contributor Track
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-coffeeBean border border-paleLavender/30 text-paleLavender font-mono text-xs font-bold shadow-sm">
          <Award className="w-3.5 h-3.5 text-lemonChiffon" />
          <span>+{contributorImpact} Points</span>
        </div>
      </div>

      {/* Skills pills */}
      <div className="space-y-1.5">
        <span className="text-[10px] font-mono uppercase text-paleLavender/80 font-bold block">
          Required Competencies:
        </span>
        <div className="flex flex-wrap gap-1.5">
          {skills.map((skill) => (
            <span
              key={skill}
              className="px-2.5 py-1 rounded-full bg-black/80 text-paleLavender border border-paleLavender/25 text-xs font-mono"
            >
              {skill}
            </span>
          ))}
        </div>
      </div>

      {/* 2-3 Free Learning Links */}
      <div className="space-y-2 pt-1 border-t border-paleLavender/15">
        <span className="text-[10px] font-mono uppercase text-paleLavender/80 font-bold block">
          Free Curated Learning Resources:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {activeResources.slice(0, 3).map((res, idx) => (
            <a
              key={idx}
              href={res.url}
              target="_blank"
              rel="noopener noreferrer"
              className="p-3 rounded-xl bg-black/70 border border-paleLavender/20 hover:border-paleLavender/60 text-xs text-platinumSilver hover:text-white flex items-center justify-between gap-2 transition-all group active:scale-[0.98]"
            >
              <span className="truncate group-hover:text-paleLavender font-medium">
                {res.title}
              </span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-paleLavender/10 text-paleLavender border border-paleLavender/20 uppercase font-semibold">
                  {res.provider}
                </span>
                <ExternalLink className="w-3.5 h-3.5 text-platinumSilver/40 group-hover:text-paleLavender transition-colors" />
              </div>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
