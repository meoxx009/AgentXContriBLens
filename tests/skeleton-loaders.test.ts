import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import {
  Skeleton,
  SkeletonText,
  SkeletonBlock,
  SkeletonCard,
  SkeletonRow,
  ScanListSkeleton,
  FindingsListSkeleton,
  FindingDetailsSkeleton,
  ContributionsStackSkeleton,
  RouteDetailsSkeleton,
  StatsPageSkeleton,
  LiveActionLogSkeleton,
  ProfileSkeleton,
  AuthModalSkeleton,
} from '../src/components/ui/Skeleton';

describe('Skeleton Loaders Component System', () => {
  describe('1. Primitive Skeletons', () => {
    it('renders a base Skeleton with skeleton-shimmer class and aria-hidden', () => {
      const html = renderToStaticMarkup(React.createElement(Skeleton, { className: 'test-skeleton' }));
      expect(html).toContain('skeleton-shimmer');
      expect(html).toContain('test-skeleton');
      expect(html).toContain('aria-hidden="true"');
    });

    it('renders SkeletonText with specified number of lines', () => {
      const html = renderToStaticMarkup(React.createElement(SkeletonText, { lines: 4, gap: 'space-y-3' }));
      expect(html).toContain('aria-hidden="true"');
      const count = (html.match(/skeleton-shimmer/g) || []).length;
      expect(count).toBe(4);
      expect(html).toContain('space-y-3');
    });

    it('renders SkeletonBlock with responsive surface styling', () => {
      const html = renderToStaticMarkup(React.createElement(SkeletonBlock, { height: 'h-24' }));
      expect(html).toContain('h-24');
      expect(html).toContain('skeleton-shimmer');
    });

    it('renders SkeletonCard with title, badge, and body structure', () => {
      const html = renderToStaticMarkup(React.createElement(SkeletonCard));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('liquid-glass-card');
      const count = (html.match(/skeleton-shimmer/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(3);
    });

    it('renders SkeletonRow matching list item layout', () => {
      const html = renderToStaticMarkup(React.createElement(SkeletonRow));
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain('flex');
      expect(html).toContain('rounded-2xl');
      const count = (html.match(/skeleton-shimmer/g) || []).length;
      expect(count).toBeGreaterThanOrEqual(4);
    });
  });

  describe('2. Scoped Layout Skeletons (Matching Real View Layouts)', () => {
    it('renders ScanListSkeleton with accessible status role, polite announcement, and rows', () => {
      const html = renderToStaticMarkup(React.createElement(ScanListSkeleton, { count: 3, label: 'scan queue' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading scan queue...');
      expect(html).toContain('sr-only');
    });

    it('renders FindingsListSkeleton mirroring severity tabs, summary metrics, and finding rows', () => {
      const html = renderToStaticMarkup(React.createElement(FindingsListSkeleton, { label: 'security findings' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading security findings...');
      expect(html).toContain('grid');
    });

    it('renders FindingDetailsSkeleton mirroring detail view (hero, patch, timeline)', () => {
      const html = renderToStaticMarkup(React.createElement(FindingDetailsSkeleton, { label: 'vulnerability details' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading vulnerability details...');
      expect(html).toContain('glass-panel');
      expect(html).toContain('max-w-4xl');
    });

    it('renders ContributionsStackSkeleton mirroring stack cards and PR blueprint cards', () => {
      const html = renderToStaticMarkup(React.createElement(ContributionsStackSkeleton, { label: 'stack and blueprints' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading stack and blueprints...');
      expect(html).toContain('glass-panel');
    });

    it('renders RouteDetailsSkeleton mirroring blueprint stepper, diff, and verification list', () => {
      const html = renderToStaticMarkup(React.createElement(RouteDetailsSkeleton, { label: 'blueprint route' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading blueprint route...');
      expect(html).toContain('grid');
    });

    it('renders StatsPageSkeleton mirroring public ecosystem metrics grid', () => {
      const html = renderToStaticMarkup(React.createElement(StatsPageSkeleton, { label: 'ecosystem stats' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading ecosystem stats...');
    });

    it('renders LiveActionLogSkeleton mirroring agent execution rail and terminal lines', () => {
      const html = renderToStaticMarkup(React.createElement(LiveActionLogSkeleton, { label: 'agent orchestrator' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading agent orchestrator...');
      expect(html).toContain('font-mono');
    });

    it('renders ProfileSkeleton mirroring user account and settings panels', () => {
      const html = renderToStaticMarkup(React.createElement(ProfileSkeleton, { label: 'user profile settings' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading user profile settings...');
    });

    it('renders AuthModalSkeleton mirroring auth modal form inputs and oauth button', () => {
      const html = renderToStaticMarkup(React.createElement(AuthModalSkeleton, { label: 'auth modal' }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-busy="true"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('Loading auth modal...');
    });
  });

  describe('3. Reduced Motion & Shimmer Token Accessibility', () => {
    const tokensCss = fs.readFileSync(path.resolve(process.cwd(), 'src/styles/tokens.css'), 'utf8');

    it('defines keyframes skeleton-shimmer with 400% background-size sweep', () => {
      expect(tokensCss).toContain('@keyframes skeleton-shimmer');
      expect(tokensCss).toContain('background-position: 200% 0');
      expect(tokensCss).toContain('background-position: -200% 0');
    });

    it('defines .skeleton-shimmer using existing neutral palette tokens', () => {
      expect(tokensCss).toContain('.skeleton-shimmer');
      expect(tokensCss).toContain('linear-gradient(');
    });

    it('respects prefers-reduced-motion media query with animation: none !important', () => {
      expect(tokensCss).toContain('@media (prefers-reduced-motion: reduce)');
      expect(tokensCss).toContain('animation: none !important;');
    });

    it('respects .reduce-motion user accessibility class with animation: none !important', () => {
      expect(tokensCss).toContain('.reduce-motion .skeleton-shimmer');
      expect(tokensCss).toContain('animation: none !important;');
    });
  });

  describe('4. Scoped Views Audit (No Blank Spinner Waits in Main Content)', () => {
    const views = [
      { name: 'DashboardView.tsx', path: 'src/components/views/DashboardView.tsx', expected: ['Skeleton', 'useDelayedLoading'] },
      { name: 'ScanView.tsx', path: 'src/components/views/ScanView.tsx', expected: ['ScanListSkeleton', 'useDelayedLoading'] },
      { name: 'FindingsView.tsx', path: 'src/components/views/FindingsView.tsx', expected: ['FindingsListSkeleton', 'useDelayedLoading'] },
      { name: 'FindingDetailsView.tsx', path: 'src/components/views/FindingDetailsView.tsx', expected: ['FindingDetailsSkeleton', 'useDelayedLoading'] },
      { name: 'ContributionsView.tsx', path: 'src/components/views/ContributionsView.tsx', expected: ['ContributionsStackSkeleton', 'useDelayedLoading'] },
      { name: 'RouteDetailsView.tsx', path: 'src/components/views/RouteDetailsView.tsx', expected: ['RouteDetailsSkeleton', 'useDelayedLoading'] },
      { name: 'StatsView.tsx', path: 'src/components/views/StatsView.tsx', expected: ['StatsPageSkeleton', 'useDelayedLoading'] },
      { name: 'LiveActionLog.tsx', path: 'src/components/agent/LiveActionLog.tsx', expected: ['LiveActionLogSkeleton'] },
      { name: 'ProfileView.tsx', path: 'src/components/views/ProfileView.tsx', expected: ['ProfileSkeleton', 'useDelayedLoading'] },
      { name: 'AuthModal.tsx', path: 'src/components/auth/AuthModal.tsx', expected: ['AuthModalSkeleton'] },
    ];

    views.forEach(({ name, path: filePath, expected }) => {
      it(`${name} integrates content-matched skeleton loader instead of spinner-only wait`, () => {
        const fullPath = path.resolve(process.cwd(), filePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const code = fs.readFileSync(fullPath, 'utf8');

        expected.forEach((term) => {
          expect(code).toContain(term);
        });

        // Verify that the view does not contain a full-page solitary Loader2 or spinner wait
        expect(code).not.toMatch(/<div[^>]*min-h-\[60vh\][^>]*>\s*<Loader2[^>]*\/>\s*<\/div>/);
      });
    });
  });
});
