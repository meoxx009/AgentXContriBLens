import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { redactSecrets } from '@/lib/redaction';
import type { User, ContribLensErrorCode } from '@/types';

/**
 * Maps standard HTTP status codes to ContribLens error codes.
 */
export function defaultCodeForStatus(statusCode: number): ContribLensErrorCode | string {
  switch (statusCode) {
    case 400:
      return 'AUTH_INVALID_INPUT';
    case 401:
      return 'AUTH_INVALID_CREDENTIALS';
    case 403:
      return 'AUTH_INVALID_CREDENTIALS';
    case 404:
      return 'GITHUB_NOT_FOUND';
    case 413:
      return 'GITHUB_FILE_LIMIT';
    case 422:
      return 'GITHUB_TREE_TRUNCATED';
    case 429:
      return 'GITHUB_RATE_LIMITED';
    case 503:
      return 'OSV_UNAVAILABLE';
    case 500:
    default:
      return 'PERSISTENCE_FAILED';
  }
}

/**
 * Single unified error response helper across all API routes.
 *
 * Guarantees:
 * 1. Safe in-memory redaction of any tokens, passwords, or secrets before serialization.
 * 2. Never exposes stack traces or upstream raw errors to clients.
 * 3. Provides backwards-compatible `error` string (for existing tests & UI toasts)
 *    AND structured `errorObject` / `errorDetails` ({ code, message }) for modern consumers.
 * 4. Appends a unique correlation ID for server-side log correlation.
 */
export function apiError(
  message: string,
  statusCode: number = 500,
  code?: ContribLensErrorCode | string,
  extra?: Record<string, any>
): NextResponse {
  const correlationId = `CL-ERR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const errorCode = code || defaultCodeForStatus(statusCode);
  const safeMessage = redactSecrets(message || 'An unexpected server error occurred.');

  // Structured error representation
  const errorStructure = {
    code: errorCode,
    message: safeMessage,
  };

  return NextResponse.json(
    {
      ok: false,
      error: safeMessage,
      errorCode,
      errorObject: errorStructure,
      errorDetails: errorStructure,
      correlationId,
      ...extra,
    },
    {
      status: statusCode,
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    }
  );
}

/**
 * Shared session-guard wrapper for authenticated routes.
 * Validates session ownership and returns a typed 401 if missing or expired.
 */
export async function requireAuth(req: Request): Promise<
  | { user: User; error: null }
  | { user: null; error: NextResponse }
> {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return {
        user: null,
        error: apiError(
          'Authentication required. Please sign in to ContribLens.',
          401,
          'AUTH_INVALID_CREDENTIALS'
        ),
      };
    }
    return { user, error: null };
  } catch (err: any) {
    return {
      user: null,
      error: apiError(
        'Authentication verification failed. Please sign in again.',
        401,
        'AUTH_INVALID_CREDENTIALS'
      ),
    };
  }
}

/**
 * High-order wrapper for protected routes.
 */
export function withAuth<T = any>(
  handler: (req: Request, context: { user: User; params?: T }) => Promise<Response>
) {
  return async (req: Request, props?: { params?: Promise<T> | T }) => {
    const auth = await requireAuth(req);
    if (auth.error) return auth.error;
    const params = props?.params ? await props.params : undefined;
    return handler(req, { user: auth.user, params });
  };
}

/**
 * Safely parses and validates request bodies using Zod schemas.
 * Returns 400 with a clean user-safe error message if JSON is malformed or invalid.
 */
export async function validateBody<T>(
  req: Request,
  schema: z.ZodSchema<T>
): Promise<{ data: T; error: null } | { data: null; error: NextResponse }> {
  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return {
      data: null,
      error: apiError(
        'Invalid JSON request payload.',
        400,
        'AUTH_INVALID_INPUT'
      ),
    };
  }

  const result = schema.safeParse(rawBody);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    const fieldPath = firstIssue?.path?.join('.') || 'field';
    const message = firstIssue?.message || 'Invalid input parameters';
    const detailedMessage = fieldPath && fieldPath !== 'field' ? `${fieldPath}: ${message}` : message;

    return {
      data: null,
      error: apiError(
        detailedMessage,
        400,
        'AUTH_INVALID_INPUT',
        {
          validationErrors: result.error.flatten(),
        }
      ),
    };
  }

  return { data: result.data, error: null };
}

/**
 * In-memory sliding-window rate limiter (Vercel-native, zero dependencies).
 */
interface RateLimitTracker {
  timestamps: number[];
}

const rateLimitBuckets = new Map<string, RateLimitTracker>();

export function checkRateLimit(
  key: string,
  options: { windowMs?: number; max?: number } = {}
): { allowed: boolean; remaining: number; resetTime: number } {
  const windowMs = options.windowMs || 60 * 1000; // default 1 minute
  const max = options.max || 30; // default 30 requests per minute
  const now = Date.now();
  const windowStart = now - windowMs;

  let bucket = rateLimitBuckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    rateLimitBuckets.set(key, bucket);
  }

  // Prune expired timestamps
  bucket.timestamps = bucket.timestamps.filter((ts) => ts > windowStart);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0];
    const resetTime = oldest + windowMs;
    return { allowed: false, remaining: 0, resetTime };
  }

  bucket.timestamps.push(now);
  return { allowed: true, remaining: max - bucket.timestamps.length, resetTime: now + windowMs };
}
