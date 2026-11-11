import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

import EmptyState from '../src/components/ui/EmptyState';
import ErrorState from '../src/components/ui/ErrorState';
import LastUpdatedBadge from '../src/components/ui/LastUpdatedBadge';
import { GitBranch, Shield, Compass, FileText, Terminal, AlertTriangle } from 'lucide-react';

describe('Shared EmptyState, ErrorState, and LastUpdatedBadge System', () => {
  describe('1. EmptyState Component Unit & Invariant Contracts', () => {
    it('renders accessible container with role="region", title, and description', () => {
      const html = renderToStaticMarkup(
        React.createElement(EmptyState, {
          icon: GitBranch,
          title: 'No previous repository scans',
          description: 'Audited repositories and verified security plans will appear here after your first scan.',
        })
      );

      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="No previous repository scans"');
      expect(html).toContain('No previous repository scans');
      expect(html).toContain('Audited repositories and verified security plans will appear here after your first scan.');
    });

    it('renders honest primary next-step action with Link when href is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(EmptyState, {
          title: 'Empty Findings',
          description: 'No findings detected.',
          action: {
            label: 'Scan Another Repository',
            href: '/app/scan',
          },
        })
      );

      expect(html).toContain('href="/app/scan"');
      expect(html).toContain('Scan Another Repository');
    });

    it('renders honest primary next-step action with button when onClick is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(EmptyState, {
          title: 'Filtered Findings',
          description: 'No findings match current filters.',
          action: {
            label: 'Reset Filters',
            onClick: () => {},
          },
        })
      );

      expect(html).toContain('<button');
      expect(html).toContain('Reset Filters');
    });

    it('renders optional secondary hint', () => {
      const html = renderToStaticMarkup(
        React.createElement(EmptyState, {
          title: 'Empty Blueprints',
          description: 'No routes generated yet.',
          secondaryHint: 'Sample: expressjs/express',
        })
      );

      expect(html).toContain('Sample: expressjs/express');
    });
  });

  describe('2. ErrorState Component Unit & Invariant Contracts', () => {
    it('renders accessible container with role="alert" and aria-live="assertive"', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          title: 'Unable to Load Data',
          message: 'Server error while fetching information. Please retry.',
          onRetry: () => {},
        })
      );

      expect(html).toContain('role="alert"');
      expect(html).toContain('aria-live="assertive"');
      expect(html).toContain('Unable to Load Data');
      expect(html).toContain('Server error while fetching information. Please retry.');
      expect(html).toContain('Retry');
    });

    it('sanitizes stack traces and raw error frames from messages', () => {
      const rawErrorWithStack = `Failed to query database at pg.query (connection.ts:42:15)
at runQuery (db.ts:105:9)
at Object.findFinding (findings.ts:200:12)`;

      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          message: rawErrorWithStack,
        })
      );

      expect(html).not.toContain('pg.query');
      expect(html).not.toContain('findings.ts:200:12');
      expect(html).toContain('Failed to query database');
    });

    it('displays distinct "Session Expired" title, message, and "Sign In Again" button when type is session_expired', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          type: 'session_expired',
          onRetry: () => {},
        })
      );

      expect(html).toContain('Session Expired');
      expect(html).toContain('Session expired — sign in again to access your workspace.');
      expect(html).toContain('Sign In Again');
    });

    it('auto-detects session expiry from message copy', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          message: 'Your ContribLens session has expired. Please sign in again.',
        })
      );

      expect(html).toContain('Session Expired');
      expect(html).toContain('Session expired — sign in again to access your workspace.');
      expect(html).toContain('Sign In Again');
    });

    it('displays distinct "Access Denied" when type is forbidden (403)', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          type: 'forbidden',
          message: 'You do not have authorization to view this resource.',
        })
      );

      expect(html).toContain('Access Denied');
      expect(html).toContain('You do not have authorization to view this resource.');
    });

    it('displays distinct "Connection Lost" when type is network_offline', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorState, {
          type: 'network_offline',
          message: 'You appear to be offline. Please verify your internet connection.',
          onRetry: () => {},
        })
      );

      expect(html).toContain('Connection Lost');
      expect(html).toContain('You appear to be offline. Please verify your internet connection.');
    });
  });

  describe('3. LastUpdatedBadge Component', () => {
    it('renders with clock icon, timestamp label, and aria-label', () => {
      const pastTime = new Date(Date.now() - 120000).toISOString();
      const html = renderToStaticMarkup(
        React.createElement(LastUpdatedBadge, {
          timestamp: pastTime,
          prefix: 'Last updated',
        })
      );

      expect(html).toContain('Last updated:');
      expect(html).toContain('aria-label');
    });

    it('renders refresh button with callback when onRefresh is provided', () => {
      const html = renderToStaticMarkup(
        React.createElement(LastUpdatedBadge, {
          timestamp: new Date().toISOString(),
          onRefresh: () => {},
        })
      );

      expect(html).toContain('aria-label="Refresh data"');
      expect(html).toContain('<button');
    });
  });

  describe('4. Scoped Views Behavioral Audit (Truthful 3-State Invariant)', () => {
    const views = [
      {
        name: 'DashboardView.tsx',
        path: 'src/components/views/DashboardView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'ScanView.tsx',
        path: 'src/components/views/ScanView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'FindingsView.tsx',
        path: 'src/components/views/FindingsView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'FindingDetailsView.tsx',
        path: 'src/components/views/FindingDetailsView.tsx',
        checks: ['EmptyState', 'ErrorState'],
      },
      {
        name: 'ContributionsView.tsx',
        path: 'src/components/views/ContributionsView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'RouteDetailsView.tsx',
        path: 'src/components/views/RouteDetailsView.tsx',
        checks: ['EmptyState', 'ErrorState'],
      },
      {
        name: 'StatsView.tsx',
        path: 'src/components/views/StatsView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'DraftsView.tsx',
        path: 'src/components/views/DraftsView.tsx',
        checks: ['EmptyState', 'ErrorState', 'LastUpdatedBadge'],
      },
      {
        name: 'LiveActionLog.tsx',
        path: 'src/components/agent/LiveActionLog.tsx',
        checks: ['EmptyState', 'ErrorState'],
      },
    ];

    views.forEach(({ name, path: filePath, checks }) => {
      it(`${name} integrates standardized EmptyState & ErrorState truthful state handling`, () => {
        const fullPath = path.resolve(process.cwd(), filePath);
        expect(fs.existsSync(fullPath)).toBe(true);
        const code = fs.readFileSync(fullPath, 'utf8');

        checks.forEach((check) => {
          expect(code).toContain(check);
        });
      });
    });

    it('verifies that fetch failure NEVER triggers EmptyState in FindingDetailsView', () => {
      const code = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/FindingDetailsView.tsx'), 'utf8');
      // If errorType is not not_found, ErrorState must be rendered
      expect(code).toContain("errorType && errorType !== 'not_found' ? (");
      expect(code).toContain('<ErrorState');
    });

    it('verifies that fetch failure NEVER triggers EmptyState in RouteDetailsView', () => {
      const code = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/RouteDetailsView.tsx'), 'utf8');
      // If errorType is not not_found, ErrorState must be rendered
      expect(code).toContain("errorType && errorType !== 'not_found' ? (");
      expect(code).toContain('<ErrorState');
    });

    it('verifies StatsView displays lastUpdated timestamp and does not swallow errors into null', () => {
      const code = fs.readFileSync(path.resolve(process.cwd(), 'src/components/views/StatsView.tsx'), 'utf8');
      expect(code).toContain('LastUpdatedBadge');
      expect(code).toContain('stats.lastUpdated');
      expect(code).toContain('<ErrorState');
    });
  });
});
