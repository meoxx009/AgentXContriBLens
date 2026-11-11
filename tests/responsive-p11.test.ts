import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('P11 — Responsive & Mobile Pass Verifications', () => {
  const readComponent = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('1. Mobile Touch Targets (≥ 44×44px & touch-manipulation)', () => {
    it('applies min-h-[44px] or tap target bounding to UI primitives', () => {
      const buttonSource = readComponent('src/components/ui/Button.tsx');
      expect(buttonSource).toContain('touch-manipulation');
      expect(buttonSource).toContain('min-h-[44px]');

      const toggleSource = readComponent('src/components/ui/Toggle.tsx');
      expect(toggleSource).toContain('press-spring');
      expect(toggleSource).toContain('touch-manipulation');
      expect(toggleSource).toContain('before:-inset-2.5');

      const tabsSource = readComponent('src/components/ui/Tabs.tsx');
      expect(tabsSource).toContain('min-h-[44px]');
      expect(tabsSource).toContain('press-spring');

      const accordionSource = readComponent('src/components/ui/Accordion.tsx');
      expect(accordionSource).toContain('min-h-[44px]');
      expect(accordionSource).toContain('press-spring');
    });

    it('ensures core view action buttons have mobile touch target sizes', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('min-h-[44px]');
      expect(findingsSource).toContain('min-w-[44px]');

      const findingDetailsSource = readComponent('src/components/views/FindingDetailsView.tsx');
      expect(findingDetailsSource).toContain('min-h-[44px]');

      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('min-h-[44px]');

      const contributionsSource = readComponent('src/components/views/ContributionsView.tsx');
      expect(contributionsSource).toContain('min-h-[44px]');

      const routeDetailsSource = readComponent('src/components/views/RouteDetailsView.tsx');
      expect(routeDetailsSource).toContain('min-h-[44px]');

      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('min-h-[44px]');

      const scanSource = readComponent('src/components/views/ScanView.tsx');
      expect(scanSource).toContain('min-h-[44px]');

      const dashboardSource = readComponent('src/components/views/DashboardView.tsx');
      expect(dashboardSource).toContain('min-h-[44px]');
    });
  });

  describe('2. Safe Area Insets (env(safe-area-inset-*))', () => {
    it('applies safe-area insets to top navigation capsules and headers', () => {
      const navbarSource = readComponent('src/components/Navbar.tsx');
      expect(navbarSource).toContain('safe-area-inset-top');

      const appLayoutSource = readComponent('src/app/app/layout.tsx');
      expect(appLayoutSource).toContain('safe-area-inset-top');
      expect(appLayoutSource).toContain('safe-area-inset-bottom');
    });

    it('applies safe-area insets to global toast notifications', () => {
      const appContextSource = readComponent('src/components/AppContext.tsx');
      expect(appContextSource).toContain('safe-area-inset-bottom');
      expect(appContextSource).toContain('safe-area-inset-right');
      expect(appContextSource).toContain('safe-area-inset-left');
    });
  });

  describe('3. Horizontal Overflow & Code Scroller Containment', () => {
    it('provides wrap and break-all containment for markdown and raw code blocks', () => {
      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('whitespace-pre-wrap');
      expect(draftsSource).toContain('break-all');
      expect(draftsSource).toContain('overflow-x-auto');

      const findingDetailsSource = readComponent('src/components/views/FindingDetailsView.tsx');
      expect(findingDetailsSource).toContain('overflow-x-auto');
    });

    it('globals.css configures touch scrolling and coarse pointer behavior', () => {
      const cssSource = readComponent('src/app/globals.css');
      expect(cssSource).toContain('-webkit-overflow-scrolling: touch');
      expect(cssSource).toContain('pointer: coarse');
      expect(cssSource).toContain('tap-target-44');
    });
  });

  describe('4. Responsive Split Views & Breakpoint Transitions', () => {
    it('collapses split view grids into single-column layouts on mobile', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('grid-cols-1 lg:grid-cols-12');

      const draftsSource = readComponent('src/components/views/DraftsView.tsx');
      expect(draftsSource).toContain('grid-cols-1 lg:grid-cols-4');

      const contributionsSource = readComponent('src/components/views/ContributionsView.tsx');
      expect(contributionsSource).toContain('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4');

      const dashboardSource = readComponent('src/components/views/DashboardView.tsx');
      expect(dashboardSource).toContain('grid-cols-1 lg:grid-cols-3');
    });
  });
});
