/**
 * ContribLens v2 — Post-Auth Redirect Helper
 * Authoritative destination sanitization ensuring users land on the
 * correct authenticated entry page (/app/scan) after successful login/signup.
 */

export const DEFAULT_AUTH_DESTINATION = '/app/scan';

/**
 * Validates and sanitizes post-auth redirect destinations.
 *
 * Rules:
 * 1. Must be a non-empty string starting with a single '/'
 * 2. Rejects protocol-relative URLs ('//malicious.com')
 * 3. Rejects Windows/UNC backslash bypasses ('/\\malicious.com')
 * 4. Rejects explicit URI schemes ('javascript:', 'data:', 'https:', etc.)
 * 5. Normalizes '/app' or '/app/' to the correct entry route (/app/scan)
 * 6. Returns fallback (/app/scan) for invalid or external inputs
 */
export function getSafeAuthRedirect(
  target: string | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION
): string {
  if (!target || typeof target !== 'string') {
    return fallback;
  }

  const trimmed = target.trim();

  // Must begin with a single '/' and not '//'
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) {
    return fallback;
  }

  // Reject backslashes which can be abused for scheme-less redirects in some browsers
  if (trimmed.includes('\\')) {
    return fallback;
  }

  // Reject embedded protocol schemes
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    return fallback;
  }

  // Normalize bare /app or /app/ to the primary entry route
  if (trimmed === '/app' || trimmed === '/app/') {
    return fallback;
  }

  // Reject auth pages to prevent bounce loops (e.g., ?next=/login or ?next=/signup)
  const pathWithoutQuery = trimmed.split('?')[0].replace(/\/+$/, '') || '/';
  if (
    pathWithoutQuery === '/login' ||
    pathWithoutQuery === '/signup' ||
    pathWithoutQuery === '/forgot-password'
  ) {
    return fallback;
  }

  return trimmed;
}

/**
 * Extracts and sanitizes the post-auth destination from URL query parameters.
 * Checks 'next', 'returnTo', and 'callbackUrl' in priority order.
 */
export function getAuthRedirectFromParams(
  searchParams: URLSearchParams | { get: (key: string) => string | null } | null | undefined,
  fallback = DEFAULT_AUTH_DESTINATION
): string {
  if (!searchParams) return fallback;
  const target =
    searchParams.get('next') ||
    searchParams.get('returnTo') ||
    searchParams.get('callbackUrl');
  return getSafeAuthRedirect(target, fallback);
}
