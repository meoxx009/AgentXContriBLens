import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { redactSecrets } from '@/lib/redaction';
import { apiError, requireAuth } from '@/lib/api-guard';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const isExport = searchParams.get('export') === 'true';

    const exportData = db.exportUserData(user.id);
    if (!exportData) {
      return apiError('User data not found', 404, 'GITHUB_NOT_FOUND');
    }

    if (isExport) {
      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="contriblens-export-${user.id}.json"`,
        },
      });
    }

    return NextResponse.json(exportData);
  } catch (error: any) {
    console.error('Error in GET /api/profile:', error?.message || error);
    return apiError(
      error?.message || 'Failed to retrieve profile',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return apiError('Invalid JSON request payload.', 400, 'AUTH_INVALID_INPUT');
    }

    const { name, bio, settings } = body || {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return apiError('Name cannot be empty.', 400, 'AUTH_INVALID_INPUT');
      }
      user.name = name.trim();
    }
    if (bio !== undefined) {
      if (bio !== null && typeof bio !== 'string') {
        return apiError('Bio must be a string or null.', 400, 'AUTH_INVALID_INPUT');
      }
      if (typeof bio === 'string' && bio.length > 2000) {
        return apiError('Bio must not exceed 2000 characters.', 400, 'AUTH_INVALID_INPUT');
      }
      user.bio = typeof bio === 'string' ? redactSecrets(bio) : null;
    }
    if (settings && typeof settings === 'object') {
      user.settings = {
        ...user.settings,
        ...settings,
      };
    }

    db.saveUser(user);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        phone: user.phone,
        name: user.name,
        bio: user.bio ?? null,
        githubUsername: user.githubUsername,
        githubId: user.githubId,
        settings: user.settings,
      },
    });
  } catch (error: any) {
    console.error('Error in PUT /api/profile:', error?.message || error);
    const isPersistence = error?.name === 'PersistenceError' || error?.errorCode === 'PERSISTENCE_FAILED';
    return apiError(
      error?.message || 'Failed to update profile',
      500,
      isPersistence ? 'PERSISTENCE_FAILED' : 'AUTH_INVALID_INPUT',
      { retryable: Boolean(isPersistence) }
    );
  }
}

export const PATCH = PUT;

export async function DELETE(req: Request) {
  try {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const user = auth.user;

    const { searchParams } = new URL(req.url);
    const isAccountDeletion = searchParams.get('account') === 'true';

    if (isAccountDeletion) {
      db.deleteUserAccount(user.id);
      const res = NextResponse.json({
        success: true,
        message: 'User account and associated records deleted permanently.',
      });
      res.cookies.set('contriblens_session', '', {
        httpOnly: true,
        expires: new Date(0),
        path: '/',
      });
      return res;
    }

    db.clearUserData(user.id);
    return NextResponse.json({
      success: true,
      message: 'All user scan records and activities cleared successfully.',
    });
  } catch (error: any) {
    console.error('Error in DELETE /api/profile:', error?.message || error);
    return apiError(
      error?.message || 'Failed to clear user data',
      500,
      'PERSISTENCE_FAILED'
    );
  }
}
