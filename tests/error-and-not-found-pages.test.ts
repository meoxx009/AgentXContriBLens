import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'fs';
import path from 'path';

// Mock next/navigation before importing pages
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock next/link to render regular anchor tags in static markup
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: any) =>
    React.createElement('a', { href, ...props }, children),
}));

import NotFound from '../src/app/not-found';
import ErrorBoundary from '../src/app/error';
import GlobalError from '../src/app/global-error';

describe('Error Boundaries, 404 Pages, and Route Integrity', () => {
  describe('1. Branded 404 Not Found Page (src/app/not-found.tsx)', () => {
    it('renders ContribLens branding, HTTP 404 badge, and honest copy', () => {
      const html = renderToStaticMarkup(React.createElement(NotFound));

      // Brand & status indicator
      expect(html).toContain('HTTP 404 • Not Found');
      expect(html).toContain('Contrib');
      expect(html).toContain('Lens');

      // Honest copy
      expect(html).toContain("This page doesn&#x27;t exist");
      expect(html).toContain('No repository data or verified findings were affected.');
    });

    it('contains no dead ends — provides Start a Scan, Home, and Go Back actions', () => {
      const html = renderToStaticMarkup(React.createElement(NotFound));

      // Primary CTA: Start a Scan
      expect(html).toContain('href="/app/scan"');
      expect(html).toContain('Start a Scan');

      // Return Home
      expect(html).toContain('href="/"');
      expect(html).toContain('Home');

      // Interactive Back button
      expect(html).toContain('Go Back');
      expect(html).toContain('aria-label="Navigate to previous page"');
    });

    it('provides quick links to popular destinations (Dashboard, Findings, Stats)', () => {
      const html = renderToStaticMarkup(React.createElement(NotFound));

      expect(html).toContain('href="/app/dashboard"');
      expect(html).toContain('Workspace Dashboard');

      expect(html).toContain('href="/app/findings"');
      expect(html).toContain('Verified Findings');

      expect(html).toContain('href="/stats"');
      expect(html).toContain('Platform Stats');
    });

    it('uses liquid-glass styling and smoky ambient background structure', () => {
      const html = renderToStaticMarkup(React.createElement(NotFound));

      expect(html).toContain('liquid-glass-card');
      expect(html).toContain('blur-[120px]');
      expect(html).toContain('blur-[100px]');
    });
  });

  describe('2. Branded Error Boundary (src/app/error.tsx)', () => {
    it('renders honest explanation without raw stack traces in production', () => {
      const rawErrorWithStack = new Error('Database connection timeout\n    at query (db.ts:12:34)\n    at Object.run');
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(ErrorBoundary, {
          error: rawErrorWithStack,
          reset: resetMock,
        })
      );

      // Honest copy
      expect(html).toContain('Something went wrong on our side');
      expect(html).toContain('No repository data or security findings were compromised.');

      // Invariant: raw stack traces must NEVER be exposed in the UI
      expect(html).not.toContain('at query (db.ts:12:34)');
      expect(html).not.toContain('at Object.run');
    });

    it('renders safe Reference ID when error.digest is provided', () => {
      const errorWithDigest = Object.assign(new Error('Internal error'), { digest: 'NEXT_DIGEST_XYZ_123' });
      const html = renderToStaticMarkup(
        React.createElement(ErrorBoundary, {
          error: errorWithDigest,
          reset: vi.fn(),
        })
      );

      expect(html).toContain('Reference ID:');
      expect(html).toContain('NEXT_DIGEST_XYZ_123');
    });

    it('provides functional Try Again, Reload Page, and Back to Home actions', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorBoundary, {
          error: new Error('Simulated failure'),
          reset: vi.fn(),
        })
      );

      expect(html).toContain('Try Again');
      expect(html).toContain('Reload Page');
      expect(html).toContain('href="/"');
      expect(html).toContain('Back to Home');
    });

    it('provides quick navigation to workspace dashboard and scanner', () => {
      const html = renderToStaticMarkup(
        React.createElement(ErrorBoundary, {
          error: new Error('Simulated failure'),
          reset: vi.fn(),
        })
      );

      expect(html).toContain('href="/app/dashboard"');
      expect(html).toContain('href="/app/scan"');
    });
  });

  describe('3. Global Error Page (src/app/global-error.tsx)', () => {
    it('renders full-app fallback with html, body, and dark theme', () => {
      const html = renderToStaticMarkup(
        React.createElement(GlobalError, {
          error: new Error('Root layout failure'),
          reset: vi.fn(),
        })
      );

      expect(html).toContain('<html');
      expect(html).toContain('<body');
      expect(html).toContain('Contrib');
      expect(html).toContain('Lens');
      expect(html).toContain('Critical System Error');
      expect(html).toContain('Something went wrong on our side');
      expect(html).toContain('Reload Application');
      expect(html).toContain('Back to Home');
    });
  });

  describe('4. Comprehensive Route Audit & Broken Link Prevention', () => {
    it('verifies all internal navigation links in src/ map to valid Next.js App Router routes', () => {
      const srcDir = path.resolve(process.cwd(), 'src');
      const appDir = path.resolve(srcDir, 'app');

      // Discover all valid routes in Next.js App Router
      const validRoutes = new Set<string>();
      validRoutes.add('/');

      function discoverRoutes(dir: string, currentRoute = '') {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory()) {
            const nextRoute = currentRoute + '/' + entry.name;
            // Check for page.tsx or route.ts in this directory
            const hasPage = fs.existsSync(path.join(dir, entry.name, 'page.tsx')) ||
                            fs.existsSync(path.join(dir, entry.name, 'page.ts'));
            const hasRoute = fs.existsSync(path.join(dir, entry.name, 'route.ts')) ||
                             fs.existsSync(path.join(dir, entry.name, 'route.js'));
            if (hasPage || hasRoute) {
              validRoutes.add(nextRoute);
            }
            discoverRoutes(path.join(dir, entry.name), nextRoute);
          }
        }
      }
      discoverRoutes(appDir);

      // Dynamic route regex patterns (e.g. /app/findings/[id], /app/scan/[id])
      const routePatterns: RegExp[] = Array.from(validRoutes).map((r) => {
        const escaped = r
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\\\[[^\]]+\\\]/g, '[^/]+');
        return new RegExp(`^${escaped}$`);
      });

      function routeMatches(candidate: string): boolean {
        // Normalize: strip query string and hash
        const cleanPath = candidate.split('?')[0].split('#')[0] || '/';
        if (cleanPath === '' || cleanPath === '/') return true;
        return routePatterns.some((pattern) => pattern.test(cleanPath));
      }

      // Collect all internal link targets across .tsx / .ts files in src
      const internalLinks: { file: string; link: string }[] = [];
      const linkRegexes = [
        /href=["'](\/[^"'#?]*(?:\?[^"']*)?)["']/g,
        /router\.(?:push|replace)\(["'](\/[^"'#?]*(?:\?[^"']*)?)["']\)/g,
      ];

      function scanFilesForLinks(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanFilesForLinks(fullPath);
          } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            for (const rx of linkRegexes) {
              let match;
              while ((match = rx.exec(content)) !== null) {
                const target = match[1];
                // Ignore API endpoints, static assets, or template literals
                if (!target.startsWith('/api') && !target.startsWith('/_next') && !target.includes('${')) {
                  internalLinks.push({
                    file: path.relative(process.cwd(), fullPath),
                    link: target,
                  });
                }
              }
            }
          }
        }
      }
      scanFilesForLinks(srcDir);

      const brokenLinks: { file: string; link: string }[] = [];
      for (const { file, link } of internalLinks) {
        if (!routeMatches(link)) {
          brokenLinks.push({ file, link });
        }
      }

      // Invariant: zero internal links should lead to 404
      expect(brokenLinks).toEqual([]);
      expect(internalLinks.length).toBeGreaterThan(50);
    });
  });

  describe('5. Dead-End 404 Remediation in Data Views', () => {
    it('FindingsView maps 404 responses to not_found error state rather than throwing raw HTTP 404 string', () => {
      const findingsViewSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/FindingsView.tsx'),
        'utf-8'
      );

      // Must catch 404 before generic !res.ok throw
      expect(findingsViewSource).toContain("if (res.status === 404)");
      expect(findingsViewSource).toContain("setErrorType('not_found')");
      // Must not throw raw unhandled string
      expect(findingsViewSource).not.toContain("Failed to load findings (HTTP 404)");
    });

    it('ContributionsView maps 404 responses to not_found error state with return link', () => {
      const contribViewSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/ContributionsView.tsx'),
        'utf-8'
      );

      expect(contribViewSource).toContain("if (routeRes.status === 404)");
      expect(contribViewSource).toContain("setErrorType('not_found')");
      expect(contribViewSource).toContain("Routes Not Found");
    });

    it('DraftsView maps 404 responses to not_found error state with return to dashboard', () => {
      const draftsViewSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/DraftsView.tsx'),
        'utf-8'
      );

      expect(draftsViewSource).toContain("if (res.status === 404)");
      expect(draftsViewSource).toContain("setErrorType('not_found')");
      expect(draftsViewSource).toContain("Drafts Not Found");
      expect(draftsViewSource).toContain("Back to Dashboard");
    });

    it('ScanView handles 404 in recent scans safely without breaking the scan form', () => {
      const scanViewSource = fs.readFileSync(
        path.resolve(process.cwd(), 'src/components/views/ScanView.tsx'),
        'utf-8'
      );

      expect(scanViewSource).toContain("} else if (res.status === 404) {");
      expect(scanViewSource).toContain("setRecentScans([]);");
      expect(scanViewSource).toContain("setRecentScansError(null);");
    });
  });
});
