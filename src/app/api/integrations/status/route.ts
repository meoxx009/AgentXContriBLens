import { NextResponse } from 'next/server';
import { checkIntegrations } from '@/lib/integrations';
import { apiError } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await checkIntegrations();
    return NextResponse.json({
      success: true,
      status,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error in GET /api/integrations/status:', error?.message || error);
    return apiError(
      'Integration health check temporarily unavailable',
      500,
      'AUTH_PROVIDER_UNAVAILABLE'
    );
  }
}
