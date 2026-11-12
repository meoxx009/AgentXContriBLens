import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseActive = isSupabaseConfigured();
  const geminiKeySet = !!process.env.GEMINI_API_KEY;
  const configuredModel = process.env.GEMINI_MODEL || 'gemma-4-31b-it';

  return NextResponse.json(
    {
      status: 'healthy',
      app: 'ContribLens',
      tagline: 'Security findings → beginner pull requests',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
      durableStorage: {
        provider: supabaseActive ? 'supabase' : 'local-json',
        status: supabaseActive ? 'connected' : 'unconfigured_local_fallback',
      },
      aiEngine: {
        model: configuredModel,
        tier: geminiKeySet ? 'gemini-active' : 'deterministic-fallback',
      },
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
