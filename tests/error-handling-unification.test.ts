import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Goal 12 — Error Handling Unification & Truthful Failure States', () => {
  const readSource = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('1. Audit of Swallowed Catch Blocks', () => {
    it('verifies that zero empty catch blocks or empty promise catch callbacks exist in src/', () => {
      const srcDir = path.join(process.cwd(), 'src');
      const files: string[] = [];

      function walk(dir: string) {
        const list = fs.readdirSync(dir);
        for (const item of list) {
          const fullPath = path.join(dir, item);
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory()) {
            walk(fullPath);
          } else if (item.endsWith('.ts') || item.endsWith('.tsx')) {
            files.push(fullPath);
          }
        }
      }
      walk(srcDir);

      const emptyCatchPattern = /catch\s*\{\s*\}/;
      const emptyPromiseCatchPattern = /\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/;

      const violations: string[] = [];

      for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        if (emptyCatchPattern.test(content) || emptyPromiseCatchPattern.test(content)) {
          violations.push(path.relative(process.cwd(), file));
        }
      }

      expect(violations).toEqual([]);
    });
  });

  describe('2. Global Client-Side Offline Handling (AppContext)', () => {
    it('verifies AppContext tracks connectivity and displays sticky non-blocking offline banner', () => {
      const source = readSource('src/components/AppContext.tsx');

      // Offline state tracking
      expect(source).toContain('const [isOffline, setIsOffline] = useState(false)');
      expect(source).toContain("window.addEventListener('online'");
      expect(source).toContain("window.addEventListener('offline'");
      expect(source).toContain('isOffline: boolean');

      // Non-blocking persistent banner at top
      expect(source).toContain('{isOffline && (');
      expect(source).toContain('role="status"');
      expect(source).toContain('aria-live="polite"');
      expect(source).toContain('WifiOff');
      expect(source).toContain('You are currently offline. Changes are saved locally and will sync when connection is restored.');
      expect(source).toContain('Check Connection');
    });
  });

  describe('3. Route-Level Error Boundary (src/app/error.tsx)', () => {
    it('verifies error boundary implements in-app reset, full reload fallback, and safe error reference', () => {
      const source = readSource('src/app/error.tsx');

      // reset() recovery
      expect(source).toContain('onClick={() => reset()}');
      expect(source).toContain('Try Again');

      // window.location.reload() fallback
      expect(source).toContain('handleReload');
      expect(source).toContain('window.location.reload()');
      expect(source).toContain('Reload Page');

      // Webpack chunk mismatch self-healing
      expect(source).toContain('isWebpackDesync');
      expect(source).toContain('Loading chunk');

      // Never leaking raw stack traces to production UI
      expect(source).toContain('error?.digest');
      expect(source).toContain('Reference ID:');
      expect(source).not.toContain('{error.stack}');

      // Safe navigation routes
      expect(source).toContain('href="/app/dashboard"');
      expect(source).toContain('href="/app/scan"');
      expect(source).toContain('href="/"');
    });
  });

  describe('4. Live Action Log Reconnect & Bounded Retries', () => {
    it('verifies LiveActionLog implements bounded SSE retries, polling fallback, and manual reconnect', () => {
      const source = readSource('src/components/agent/LiveActionLog.tsx');

      // Bounded SSE reconnect attempts (max 5)
      expect(source).toContain('reconnectAttemptsRef.current += 1');
      expect(source).toContain('reconnectAttemptsRef.current <= 5');
      expect(source).toContain("setConnectionStatus('reconnecting')");

      // Bounded polling fallback after 5 SSE failures
      expect(source).toContain('startBoundedPolling(currentRunId)');
      expect(source).toContain('const maxPolls = 60');

      // Honest connection lost state when bounds exhausted
      expect(source).toContain("setConnectionStatus('failed')");
      expect(source).toContain('Connection timed out after maximum polling attempts');

      // Manual reconnect trigger and handler
      expect(source).toContain('handleManualReconnect');
      expect(source).toContain('Reconnect Live Log');
      expect(source).toContain('terminalRef.current = false');
    });
  });

  describe('5. Shared ErrorState Component Verification', () => {
    it('verifies ErrorState classifies error states and sanitizes output', () => {
      const source = readSource('src/components/ui/ErrorState.tsx');

      // Supported error states
      expect(source).toContain("'session_expired'");
      expect(source).toContain("'forbidden'");
      expect(source).toContain("'server_error'");
      expect(source).toContain("'network_offline'");
      expect(source).toContain("'not_found'");
      expect(source).toContain("'generic'");

      // Token and stack trace sanitization
      expect(source).toContain('sanitizeErrorMessage');

      // Actionable recovery triggers
      expect(source).toContain('onRetry');
      expect(source).toContain('onAuthModal');
      expect(source).toContain('secondaryAction');
    });
  });

  describe('6. View-Level Truthful Error Surface Mapping', () => {
    it('verifies ScanView classifies rate limits, branch mismatches, and offline states', () => {
      const source = readSource('src/components/views/ScanView.tsx');

      expect(source).toContain('classifyError');
      expect(source).toContain('Estimated Rate Limit Reset');
      expect(source).toContain('defaultBranch');
      expect(source).toContain('setSessionExpired(true)');
    });

    it('verifies FindingsView handles stale scan self-healing, session expiry, and offline states', () => {
      const source = readSource('src/components/views/FindingsView.tsx');

      expect(source).toContain("setErrorType('network_offline')");
      expect(source).toContain("setErrorType('session_expired')");
      expect(source).toContain('setActiveScan(null)'); // Self-healing on 404
    });

    it('verifies ContributionsView and DraftsView guard against stale scan 404s and offline failures', () => {
      const contribSource = readSource('src/components/views/ContributionsView.tsx');
      const draftsSource = readSource('src/components/views/DraftsView.tsx');

      expect(contribSource).toContain("setErrorType('network_offline')");
      expect(contribSource).toContain("setErrorType('session_expired')");
      expect(contribSource).toContain('setActiveScan(null)');

      expect(draftsSource).toContain("setErrorType('network_offline')");
      expect(draftsSource).toContain("setErrorType('not_found')");
      expect(draftsSource).toContain('setActiveScan(null)');
    });
  });
});
