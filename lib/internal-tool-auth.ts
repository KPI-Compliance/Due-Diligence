import { resolveUserAccess } from "@/lib/access-control";
import { getAuthenticatedSessionResult } from "@/lib/auth";

/**
 * Shared secret for cron jobs and internal health/diagnostic routes.
 * Set INTERNAL_TOOL_SECRET (preferred) or reuse CRON_SECRET.
 */
export function getInternalToolSecret() {
  return (
    process.env.INTERNAL_TOOL_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ""
  );
}

/**
 * Authorizes internal maintenance requests via Authorization: Bearer only
 * (query-string secrets are not supported — they leak via logs and Referer).
 */
export function isInternalToolRequestAuthorized(request: Request): boolean {
  const secret = getInternalToolSecret();
  if (!secret) {
    // No secret configured — deny all non-local environments to prevent information disclosure.
    // In local development (NODE_ENV === "development") allow through only if no secret is set.
    return process.env.NODE_ENV === "development";
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  return bearer.length > 0 && bearer === secret;
}

/**
 * Health/diagnostic GET endpoints: Bearer secret (for automation) or
 * authenticated session with settings access (browser links from the app).
 */
export async function isHealthDiagnosticRequestAuthorized(request: Request): Promise<boolean> {
  if (isInternalToolRequestAuthorized(request)) {
    return true;
  }

  const sessionResult = await getAuthenticatedSessionResult();
  if (!sessionResult.session) {
    return false;
  }

  const access = await resolveUserAccess(sessionResult.session.email);
  return access.permissions.canManageSettings;
}
