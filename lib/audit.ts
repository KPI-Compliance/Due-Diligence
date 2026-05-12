import { sql } from "@/lib/db";

export type AuditEventType =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "LOGOUT"
  | "SESSION_EXPIRED"
  | "ACCESS_DENIED";

export type AuditResult = "success" | "failure";

export interface AuditEntry {
  event_type: AuditEventType;
  actor_email?: string | null;
  actor_ip?: string | null;
  actor_ua?: string | null;
  result: AuditResult;
  failure_reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Writes one row to audit_logs. Never throws — auth flows must not break on
 * a logging failure. Any DB error is logged to stderr for observability.
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    await sql`
      INSERT INTO audit_logs (event_type, actor_email, actor_ip, actor_ua, result, failure_reason, metadata)
      VALUES (
        ${entry.event_type},
        ${entry.actor_email ?? null},
        ${entry.actor_ip ?? null},
        ${entry.actor_ua ?? null},
        ${entry.result},
        ${entry.failure_reason ?? null},
        ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb
      )
    `;
  } catch (error) {
    console.error("[audit] failed to write audit log", {
      event_type: entry.event_type,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Extracts the real client IP from Vercel/proxy forwarding headers. */
export function getClientIp(request: Request): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  );
}

/** Extracts the User-Agent header value. */
export function getClientUserAgent(request: Request): string | null {
  return request.headers.get("user-agent") ?? null;
}
