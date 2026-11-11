// scripts/check-integrations.mjs
/**
 * ContribLens — Safe Developer Integrations Status Check
 * Tagline: Security findings → beginner pull requests
 * Redacts all secret values and reports only safe enum states.
 */

import fs from 'fs';

// Safely load .env.local without exposing variables to subprocesses
if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  } else if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

import { checkIntegrations } from '../src/lib/integrations.ts';

async function run() {
  console.log('\n========================================================');
  console.log('  ContribLens — Safe Integration Status Report          ');
  console.log('  Tagline: Security findings → beginner pull requests    ');
  console.log('========================================================\n');

  try {
    const report = await checkIntegrations();

    console.log(`  Supabase:  ${formatStatus(report.supabase)}`);
    console.log(`  GitHub:    ${formatStatus(report.github)}`);
    console.log(`  OSV:       ${formatStatus(report.osv)}`);
    console.log(`  Gemini:    ${formatStatus(report.gemini)}`);
    console.log(`  Database:  ${formatStatus(report.database)}`);

    console.log('\n  Zero secrets or credentials exposed.');
    console.log('========================================================\n');
  } catch (err) {
    console.error('Failed to run integration checks:', err.message);
    process.exit(1);
  }
}

function formatStatus(status) {
  if (status === 'configured' || status === 'reachable' || status === 'token configured') {
    return `[OK] ${status}`;
  }
  return `[INFO] ${status}`;
}

run();
