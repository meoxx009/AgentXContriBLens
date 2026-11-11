import type { ContribLensErrorCode } from '@/types';

export type ScanFailureType =
  | 'auth_required'
  | 'invalid_url'
  | 'not_found'
  | 'branch_not_found'
  | 'private_or_unavailable'
  | 'rate_limited'
  | 'tree_too_large'
  | 'network_error'
  | 'dependency_lookup_unavailable'
  | 'persist_failed';

export interface FailureDetails {
  type: ScanFailureType;
  userMessage: string;
  correlationId: string;
  resetTime?: string;
  defaultBranch?: string;
}

/**
 * Classifies raw server errors or exceptions into safe, typed user errors
 * with support correlation IDs and action hints.
 * Never displays raw server stack traces or uncensored provider errors.
 */
export function classifyError(
  rawMessage: string,
  errorCode?: ContribLensErrorCode | string,
  correlationIdParam?: string,
  resetTime?: string,
  defaultBranch?: string
): FailureDetails {
  const correlationId =
    correlationIdParam ||
    `CL-ERR-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  const lower = (rawMessage || '').toLowerCase();

  // 1. Session missing or expired
  if (
    errorCode === 'AUTH_INVALID_CREDENTIALS' ||
    lower.includes('sign in') ||
    lower.includes('session') ||
    (lower.includes('authentication') && lower.includes('required'))
  ) {
    return {
      type: 'auth_required',
      userMessage:
        'Your ContribLens session has expired or authentication is required. Please sign in to scan repositories.',
      correlationId,
    };
  }

  // 2. Invalid repository URL
  if (
    errorCode === 'GITHUB_INVALID_URL' ||
    lower.includes('invalid') ||
    lower.includes('format') ||
    lower.includes('url')
  ) {
    return {
      type: 'invalid_url',
      userMessage:
        rawMessage ||
        'The provided URL is not a recognized public GitHub repository format. Please verify the URL.',
      correlationId,
    };
  }

  // 3. Branch not found
  if (
    errorCode === 'GITHUB_BRANCH_NOT_FOUND' ||
    (lower.includes('branch') && (lower.includes('not found') || lower.includes('failed to load')))
  ) {
    return {
      type: 'branch_not_found',
      userMessage: rawMessage || 'The specified branch was not found in this repository.',
      correlationId,
      defaultBranch,
    };
  }

  // 4. Rate limited
  if (
    errorCode === 'GITHUB_RATE_LIMITED' ||
    lower.includes('rate limit') ||
    lower.includes('403') ||
    lower.includes('429')
  ) {
    return {
      type: 'rate_limited',
      userMessage:
        rawMessage ||
        'GitHub API rate limit reached. Configure a read-only token in .env.local or retry later.',
      correlationId,
      resetTime,
    };
  }

  // 5. Repository not found
  if (
    errorCode === 'GITHUB_NOT_FOUND' ||
    (lower.includes('not found') && !lower.includes('branch'))
  ) {
    return {
      type: 'not_found',
      userMessage:
        rawMessage ||
        'Repository could not be found. Check for typos or verify the repository exists on GitHub.',
      correlationId,
    };
  }

  // 6. Private or unavailable
  if (
    errorCode === 'GITHUB_PRIVATE_OR_UNAVAILABLE' ||
    lower.includes('private') ||
    lower.includes('forbidden')
  ) {
    return {
      type: 'private_or_unavailable',
      userMessage:
        rawMessage ||
        'The requested repository appears to be private or unavailable for public auditing.',
      correlationId,
    };
  }

  // 7. Tree too large / file bounds
  if (
    errorCode === 'GITHUB_TREE_TRUNCATED' ||
    errorCode === 'GITHUB_FILE_LIMIT' ||
    lower.includes('tree') ||
    lower.includes('truncate') ||
    lower.includes('bounds') ||
    lower.includes('too large')
  ) {
    return {
      type: 'tree_too_large',
      userMessage:
        rawMessage ||
        'Repository file tree exceeds bounded safety constraints (60 files max).',
      correlationId,
    };
  }

  // 8. Dependency lookup unavailable (OSV)
  if (
    errorCode === 'OSV_UNAVAILABLE' ||
    lower.includes('osv') ||
    lower.includes('advisory') ||
    lower.includes('dependency lookup')
  ) {
    return {
      type: 'dependency_lookup_unavailable',
      userMessage:
        rawMessage ||
        'OSV.dev vulnerability lookup was temporarily unavailable. Deterministic analysis was preserved.',
      correlationId,
    };
  }

  // 9. Persistence failed
  if (
    errorCode === 'PERSISTENCE_FAILED' ||
    lower.includes('persist') ||
    lower.includes('database') ||
    lower.includes('storage')
  ) {
    return {
      type: 'persist_failed',
      userMessage:
        rawMessage ||
        'Failed to write scan results to disk store. Please retry the scan.',
      correlationId,
    };
  }

  // 10. Generic network error fallback
  return {
    type: 'network_error',
    userMessage:
      rawMessage ||
      'A temporary network interruption occurred while connecting to GitHub. Your input has been preserved.',
    correlationId,
  };
}
