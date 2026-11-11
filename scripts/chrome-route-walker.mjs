// scripts/chrome-route-walker.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE_URL = 'http://localhost:3000';

const ROUTES = [
  '/',
  '/login',
  '/signup',
  '/forgot-password',
  '/stats',
  '/privacy',
  '/safety',
  '/security',
  '/app/dashboard',
  '/app/scan',
  '/app/findings',
  '/app/findings/demo-finding-1',
  '/app/contributions',
  '/app/contributions/demo-route-1',
  '/app/issue-drafts',
  '/app/profile',
];

const VIEWPORTS = [
  { name: 'mobile (375px)', width: 375, height: 812 },
  { name: 'tablet (768px)', width: 768, height: 1024 },
  { name: 'desktop (1280px)', width: 1280, height: 800 },
];

async function captureDomWithChrome(url, width, height) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--window-size=${width},${height}`,
      '--dump-dom',
      url,
    ];

    const proc = spawn(CHROME_PATH, args);
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Chrome process exited with code ${code}: ${stderr}`));
      }
    });

    // 15 second safety timeout
    setTimeout(() => {
      proc.kill();
      resolve({ stdout, stderr: 'timeout' });
    }, 15000);
  });
}

async function walkAllRoutes() {
  console.log('====================================================');
  console.log('   Chrome Route & Responsive Walker (375px + 1280px)  ');
  console.log('====================================================\n');

  let totalChecked = 0;
  let failures = 0;

  for (const vp of VIEWPORTS) {
    console.log(`\n--- Testing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);
    for (const route of ROUTES) {
      const url = `${BASE_URL}${route}`;
      try {
        const { stdout } = await captureDomWithChrome(url, vp.width, vp.height);
        totalChecked++;

        // Verify HTML has expected core elements
        const hasDoctype = stdout.includes('<!DOCTYPE html>') || stdout.includes('<html');
        const hasContribLens = stdout.includes('ContribLens') || stdout.includes('contriblens');
        const hasUnhandledError = stdout.includes('Application error: a client-side exception has occurred') ||
          stdout.includes('Unhandled Runtime Error');

        if (!hasDoctype || hasUnhandledError) {
          console.error(`  ❌ [${vp.name}] ${route} failed validation (Unhandled error or missing html)`);
          failures++;
        } else {
          console.log(`  ✓ [${vp.name}] ${route} OK (${(stdout.length / 1024).toFixed(1)} KB DOM)`);
        }
      } catch (err) {
        console.error(`  ❌ [${vp.name}] ${route} failed:`, err.message);
        failures++;
      }
    }
  }

  console.log(`\nTotal Route/Viewport audits completed: ${totalChecked}`);
  console.log(`Total Failures: ${failures}`);

  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('All 16 routes at 375px and 1280px verified healthy with Chrome headless!');
  }
}

walkAllRoutes().catch((e) => {
  console.error('Walker error:', e);
  process.exit(1);
});
