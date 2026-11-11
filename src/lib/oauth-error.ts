export const GITHUB_PROVIDER_DISABLED_MESSAGE =
  "GitHub sign-in is not enabled yet. Enable the GitHub provider in your Supabase dashboard (Authentication → Providers → GitHub) and try again.";

/**
 * Checks whether an OAuth error indicates that the GitHub provider is disabled
 * in the Supabase project configuration (e.g. error code 400, validation_failed,
 * or message containing "provider is not enabled" / "unsupported provider").
 */
export function isProviderDisabledError(err: any): boolean {
  if (!err) return false;

  const msg = String(err.message || err.msg || err.error_description || "").toLowerCase();
  const code = String(err.code || err.status || "");
  const errorCode = String(err.error_code || "");
  const raw = typeof err === "string" ? err.toLowerCase() : "";

  // 1. Direct text matches
  if (
    msg.includes("provider is not enabled") ||
    msg.includes("unsupported provider") ||
    raw.includes("provider is not enabled") ||
    raw.includes("unsupported provider")
  ) {
    return true;
  }

  // 2. Specific Supabase error codes for disabled/unconfigured provider
  if (
    errorCode === "validation_failed" ||
    code === "validation_failed" ||
    (code === "400" && (msg.includes("provider") || raw.includes("provider") || errorCode.includes("validation_failed")))
  ) {
    return true;
  }

  // 3. Serialized JSON inspect
  try {
    const jsonStr = JSON.stringify(err).toLowerCase();
    if (
      jsonStr.includes("provider is not enabled") ||
      jsonStr.includes("unsupported provider") ||
      (jsonStr.includes("validation_failed") && jsonStr.includes("provider"))
    ) {
      return true;
    }
  } catch {
    // ignore JSON circular error
  }

  return false;
}

/**
 * Formats an OAuth error for user-facing display.
 * If the provider is disabled, returns the friendly actionable instruction.
 * Otherwise returns a formatted error or fallback ref ID.
 */
export function formatOAuthError(err: any, fallbackRefId?: string): string {
  if (isProviderDisabledError(err)) {
    return GITHUB_PROVIDER_DISABLED_MESSAGE;
  }

  if (typeof err === "string" && err.trim().length > 0) {
    return err;
  }

  const message = err?.message || err?.msg || err?.error_description;
  if (message && typeof message === "string" && message.trim().length > 0) {
    return message;
  }

  const ref = fallbackRefId || "ERR-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  return `Unable to complete GitHub sign-in (Ref: ${ref}). Please retry.`;
}
