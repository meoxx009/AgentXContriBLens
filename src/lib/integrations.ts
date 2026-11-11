/**
 * ContribLens — Integration Status Verifier
 * 
 * Reports non-sensitive connectivity and configuration status:
 * - Supabase: configured / not configured / connection failed
 * - GitHub: token configured / public-only mode
 * - OSV: reachable / unavailable
 * - Gemini: configured / fallback mode
 * - Database: reachable / unavailable
 * 
 * Invariant: NEVER returns or prints raw secrets, API keys, or tokens.
 */

import { isSupabaseConfigured, getSupabaseBrowserClient } from './supabase-browser.ts';
import { getSanitizedGitHubToken } from './scanner/github.ts';
import { db } from './db.ts';

export interface IntegrationReport {
  supabase: 'configured' | 'not configured' | 'connection failed';
  github: 'token configured' | 'public-only mode';
  osv: 'reachable' | 'unavailable';
  gemini: 'configured' | 'fallback mode';
  database: 'reachable' | 'unavailable';
}

export async function checkIntegrations(): Promise<IntegrationReport> {
  const report: IntegrationReport = {
    supabase: 'not configured',
    github: 'public-only mode',
    osv: 'unavailable',
    gemini: 'fallback mode',
    database: 'unavailable',
  };

  // 1. Supabase Check
  if (isSupabaseConfigured()) {
    try {
      const client = getSupabaseBrowserClient();
      if (client) {
        const { error } = await client.from('profiles').select('id').limit(1);
        if (error && error.code !== 'PGRST116') {
          report.supabase = 'configured';
        } else {
          report.supabase = 'configured';
        }
      } else {
        report.supabase = 'not configured';
      }
    } catch {
      report.supabase = 'connection failed';
    }
  } else {
    report.supabase = 'not configured';
  }

  // 2. GitHub Token Check (server-only)
  const ghToken = getSanitizedGitHubToken();
  if (ghToken) {
    report.github = 'token configured';
  } else {
    report.github = 'public-only mode';
  }

  // 3. OSV API Reachability Check
  try {
    const osvRes = await fetch('https://api.osv.dev/v1/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        package: { name: 'express', ecosystem: 'npm' },
        version: '4.17.1',
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (osvRes.status === 200 || osvRes.status === 404) {
      report.osv = 'reachable';
    } else {
      report.osv = 'unavailable';
    }
  } catch {
    report.osv = 'unavailable';
  }

  // 4. Gemini Configuration Check
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey.trim() !== '' && geminiKey !== 'your_gemini_api_key_here') {
    report.gemini = 'configured';
  } else {
    report.gemini = 'fallback mode';
  }

  // 5. Database Check
  try {
    const users = db.getUsers();
    if (Array.isArray(users)) {
      report.database = 'reachable';
    } else {
      report.database = 'unavailable';
    }
  } catch {
    report.database = 'unavailable';
  }

  return report;
}
