import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Goal 10 — Mobile Responsiveness (360px → Tablet)', () => {
  const readComponent = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('1. Touch Targets (≥ 44×44px & touch-manipulation)', () => {
    it('verifies Navbar mobile nav rail and CTA tap targets are ≥ 44px', () => {
      const navbarSource = readComponent('src/components/Navbar.tsx');
      expect(navbarSource).toContain('min-h-[44px]');
      expect(navbarSource).toContain('touch-manipulation');
    });

    it('verifies Auth Modal tabs, submit buttons, and eye toggles are ≥ 44px', () => {
      const authModalSource = readComponent('src/components/auth/AuthModal.tsx');
      // Tabs and action buttons
      expect(authModalSource).toContain('min-h-[44px]');
      expect(authModalSource).toContain('touch-manipulation');
      // Password toggle button accessible bounding
      expect(authModalSource).toContain('min-w-[44px]');
      expect(authModalSource).toContain('min-h-[44px] flex items-center justify-center');
    });

    it('verifies ScanView action buttons, retry buttons, and inputs are ≥ 44px', () => {
      const scanSource = readComponent('src/components/views/ScanView.tsx');
      expect(scanSource).toContain('min-h-[48px]');
      expect(scanSource).toContain('min-h-[44px]');
      expect(scanSource).toContain('touch-manipulation');
    });

    it('verifies LiveActionLog buttons, inputs, chevrons, and autoscroll are ≥ 44px', () => {
      const logSource = readComponent('src/components/agent/LiveActionLog.tsx');
      expect(logSource).toContain('min-h-[44px]');
      expect(logSource).toContain('min-w-[44px]');
      expect(logSource).toContain('touch-manipulation');
    });

    it('verifies FindingsView filters, search clear, bulk actions, and checkbox have ≥ 44px tap targets', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('min-h-[44px]');
      expect(findingsSource).toContain('min-w-[44px]');
      expect(findingsSource).toContain('touch-manipulation');
    });

    it('verifies ProfileView retry, recovery, and form inputs meet touch target standards', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('min-h-[44px]');
      expect(profileSource).toContain('touch-manipulation');
    });

    it('verifies DashboardView search, pagination, and filter pills have ≥ 44px tap targets', () => {
      const dashboardSource = readComponent('src/components/views/DashboardView.tsx');
      expect(dashboardSource).toContain('min-h-[44px]');
      expect(dashboardSource).toContain('touch-manipulation');
    });

    it('verifies 404, Error, and Global Error pages have ≥ 44px touch-accessible actions', () => {
      const notFoundSource = readComponent('src/app/not-found.tsx');
      expect(notFoundSource).toContain('min-h-[44px]');
      expect(notFoundSource).toContain('touch-manipulation');

      const errorSource = readComponent('src/app/error.tsx');
      expect(errorSource).toContain('min-h-[44px]');
      expect(errorSource).toContain('touch-manipulation');

      const globalErrorSource = readComponent('src/app/global-error.tsx');
      expect(globalErrorSource).toContain('min-h-[44px]');
    });
  });

  describe('2. Mobile Keyboard & Auto-Zoom Prevention (iOS 16px font invariant)', () => {
    it('sets inputMode and text-base sm:text-* on Scan form inputs', () => {
      const scanSource = readComponent('src/components/views/ScanView.tsx');
      expect(scanSource).toContain('inputMode="url"');
      expect(scanSource).toContain('autoCapitalize="none"');
      expect(scanSource).toContain('autoCorrect="off"');
      expect(scanSource).toContain('text-base sm:text-sm');
    });

    it('sets inputMode and text-base sm:text-* on Auth Modal inputs', () => {
      const authSource = readComponent('src/components/auth/AuthModal.tsx');
      expect(authSource).toContain('inputMode="email"');
      expect(authSource).toContain('autoCapitalize="none"');
      expect(authSource).toContain('text-base sm:text-sm');
    });

    it('sets text-base sm:text-* on Findings search and path filter inputs', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('text-base sm:text-sm');
      expect(findingsSource).toContain('autoCapitalize="none"');
    });

    it('sets text-base sm:text-* on LiveActionLog repository inputs', () => {
      const logSource = readComponent('src/components/agent/LiveActionLog.tsx');
      expect(logSource).toContain('text-base sm:text-xs');
      expect(logSource).toContain('autoCapitalize="none"');
      expect(logSource).toContain('autoCorrect="off"');
    });

    it('sets text-base sm:text-* on ProfileView display name and bio inputs', () => {
      const profileSource = readComponent('src/components/views/ProfileView.tsx');
      expect(profileSource).toContain('text-base sm:text-sm');
      expect(profileSource).toContain('text-base sm:text-xs');
      expect(profileSource).toContain('inputMode="text"');
    });

    it('sets text-base sm:text-* on DashboardView search input', () => {
      const dashSource = readComponent('src/components/views/DashboardView.tsx');
      expect(dashSource).toContain('text-base sm:text-xs');
    });
  });

  describe('3. Auth Modal Mobile Full-Screen Container', () => {
    it('uses full-screen presentation on mobile with responsive rounded borders on desktop', () => {
      const authSource = readComponent('src/components/auth/AuthModal.tsx');
      expect(authSource).toContain('w-full h-full sm:h-auto min-h-screen sm:min-h-0');
      expect(authSource).toContain('rounded-none sm:rounded-2xl');
      expect(authSource).toContain('border-0 sm:border');
      expect(authSource).toContain('p-0 sm:p-6');
    });
  });

  describe('4. Horizontal Overflow Prevention & Responsive Flex-Wrapping', () => {
    it('ensures FindingsView bulk action bar and filter pills wrap without overflow', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('flex flex-wrap items-center');
      expect(findingsSource).toContain('max-w-full');
    });

    it('ensures ContributionsView graph and filter chips contain horizontal scrolling', () => {
      const contribSource = readComponent('src/components/views/ContributionsView.tsx');
      expect(contribSource).toContain('max-w-full overflow-x-auto');
      expect(contribSource).toContain('p-5 sm:p-8');
    });

    it('ensures StatsView cards use responsive padding for 360px screens', () => {
      const statsSource = readComponent('src/components/views/StatsView.tsx');
      expect(statsSource).toContain('p-5 sm:p-8 rounded-2xl sm:rounded-3xl');
      expect(statsSource).toContain('grid-cols-1 sm:grid-cols-2 lg:grid-cols-4');
    });

    it('ensures FindingsView scrolls mobile users to the detail panel upon card selection', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('id="finding-detail-panel"');
      expect(findingsSource).toContain("document.getElementById('finding-detail-panel')");
      expect(findingsSource).toContain("scrollIntoView({ behavior: 'smooth', block: 'start' })");
    });
  });

  describe('5. Desktop Invariants Maintained', () => {
    it('maintains desktop side-by-side split grid on FindingsView', () => {
      const findingsSource = readComponent('src/components/views/FindingsView.tsx');
      expect(findingsSource).toContain('grid-cols-1 lg:grid-cols-12');
      expect(findingsSource).toContain('lg:col-span-5');
      expect(findingsSource).toContain('lg:col-span-7');
    });

    it('maintains desktop 4-column metrics grid on StatsView', () => {
      const statsSource = readComponent('src/components/views/StatsView.tsx');
      expect(statsSource).toContain('lg:grid-cols-4');
    });
  });
});
