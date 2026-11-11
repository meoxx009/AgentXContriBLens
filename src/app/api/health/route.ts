import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(
    {
      status: 'healthy',
      app: 'ContribLens',
      tagline: 'Security findings → beginner pull requests',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '2.0.0',
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}
