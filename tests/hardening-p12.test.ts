import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('P12 — Performance, Hardening & Security Isolation', () => {
  const readProjectFile = (relPath: string) => {
    return fs.readFileSync(path.join(process.cwd(), relPath), 'utf-8');
  };

  describe('1. GPU Animation & Framerate Safety', () => {
    it('animates transform and opacity only (no layout-shifting width/height/top/left transitions)', () => {
      const tailwindConfig = readProjectFile('tailwind.config.ts');
      // Float keyframes only animate translateY
      expect(tailwindConfig).toContain("transform: 'translateY(0px)'");
      expect(tailwindConfig).toContain("transform: 'translateY(-12px)'");
      expect(tailwindConfig).not.toContain("height:");
      expect(tailwindConfig).not.toContain("width:");

      const tokensCss = readProjectFile('src/styles/tokens.css');
      expect(tokensCss).toContain('transition: transform');
      expect(tokensCss).toContain('transform: scale(0.97)');
    });

    it('neutralizes all transitions and animations when prefers-reduced-motion is active', () => {
      const globalsCss = readProjectFile('src/app/globals.css');
      expect(globalsCss).toContain('prefers-reduced-motion: reduce');
      expect(globalsCss).toContain('animation-duration: 0.01ms !important');
      expect(globalsCss).toContain('transition-duration: 0.01ms !important');
      expect(globalsCss).toContain('.reduce-motion .animate-float-slow');
    });
  });

  describe('2. Blur Radius Cap (<= 40px) & Nested Glass Elimination', () => {
    it('ensures backdrop blur radii in tokens.css are capped <= 40px', () => {
      const tokensCss = readProjectFile('src/styles/tokens.css');
      const backdropBlurMatches = tokensCss.match(/backdrop-filter:\s*blur\((\d+)px\)/g);
      expect(backdropBlurMatches).not.toBeNull();
      for (const match of backdropBlurMatches!) {
        const px = parseInt(match.replace(/[^0-9]/g, ''), 10);
        expect(px).toBeLessThanOrEqual(40);
      }
    });

    it('ensures ambient background glows across all views are capped at blur <= 40px', () => {
      const filesWithAmbientGlow = [
        'src/app/page.tsx',
        'src/app/login/page.tsx',
        'src/app/signup/page.tsx',
        'src/app/forgot-password/page.tsx',
        'src/app/privacy/page.tsx',
        'src/components/views/SafetyView.tsx',
        'src/components/views/SecurityView.tsx',
        'src/components/views/StatsView.tsx',
      ];

      for (const file of filesWithAmbientGlow) {
        const content = readProjectFile(file);
        // Any blur-[Npx] in ambient glows must not exceed 40px
        const blurMatches = content.match(/blur-\[(\d+)px\]/g);
        if (blurMatches) {
          for (const m of blurMatches) {
            const px = parseInt(m.replace(/[^0-9]/g, ''), 10);
            expect(px).toBeLessThanOrEqual(40);
          }
        }
      }
    });

    it('Button UI primitive avoids nested glass backdrop-filter stacking in secondary variant', () => {
      const buttonSource = readProjectFile('src/components/ui/Button.tsx');
      // Secondary button avoids stacking .glass-panel
      expect(buttonSource).toContain("bg-blackHole hover:bg-black text-textPrimary");
      expect(buttonSource).not.toContain("backdrop-blur-xl");
    });
  });

  describe('3. Strict Client-Side Quarantine (Server-Only Secrets)', () => {
    it('ensures client components never import @google/genai or reference server keys', () => {
      const srcDir = path.join(process.cwd(), 'src');

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            scanDir(fullPath);
          } else if (/\.(tsx|ts)$/.test(entry.name)) {
            const content = fs.readFileSync(fullPath, 'utf-8');
            if (content.startsWith("'use client'") || content.startsWith('"use client"')) {
              expect(content).not.toContain('@google/genai');
              expect(content).not.toContain('GEMINI_API_KEY');
              expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
              expect(content).not.toContain('process.env.GITHUB_TOKEN');
            }
          }
        }
      }

      scanDir(srcDir);
    });

    it('confirms static build output contains zero secret tokens', () => {
      const staticDir = path.join(process.cwd(), '.next', 'static');
      if (fs.existsSync(staticDir)) {
        function scanStatic(dir: string) {
          const entries = fs.readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              scanStatic(fullPath);
            } else if (/\.js$/.test(entry.name)) {
              const content = fs.readFileSync(fullPath, 'utf-8');
              expect(content).not.toContain('GEMINI_API_KEY');
              expect(content).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
              expect(content).not.toContain('@google/genai');
            }
          }
        }
        scanStatic(staticDir);
      }
    });
  });

  describe('4. Security Headers in next.config.mjs', () => {
    it('configures strict frame-ancestors, nosniff, and referrer-policy', () => {
      const nextConfig = readProjectFile('next.config.mjs');
      expect(nextConfig).toContain("'X-Content-Type-Options'");
      expect(nextConfig).toContain("'nosniff'");
      expect(nextConfig).toContain(`"frame-ancestors 'none';"`);
      expect(nextConfig).toContain("'X-Frame-Options'");
      expect(nextConfig).toContain("'DENY'");
      expect(nextConfig).toContain("'strict-origin-when-cross-origin'");
    });
  });
});
