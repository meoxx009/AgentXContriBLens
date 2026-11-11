import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const revalidate = 300; // Cache ~5 minutes

export async function GET() {
  const stats = db.getPublicStats();

  return NextResponse.json(
    {
      ok: true,
      ...stats,
    },
    {
      status: 200,
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    }
  );
}
