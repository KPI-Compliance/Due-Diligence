/**
 * Shared input validation utilities for API route boundary checks.
 * These functions validate at the system boundary (user input / external APIs).
 * Internal data that has already been validated does not need re-checking.
 */

/** RFC 5322 simplified — rejects obviously invalid email addresses. */
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Accepts UUID v4 in canonical hyphenated form (case-insensitive). */
export function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

/**
 * Validates entity slugs produced by lib/jira.ts slugify():
 * lowercase alphanumeric + hyphens, no leading/trailing hyphens, max 100 chars.
 * Rejects path traversal patterns (.., /, \).
 */
export function isValidSlug(value: string): boolean {
  return value.length <= 100 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(value);
}

/**
 * Validates a Typeform form ID (alphanumeric + underscores/hyphens, 3–64 chars).
 * Typeform IDs look like "A1b2C3d4" or "abc123xyz".
 */
export function isValidTypeformFormId(value: string): boolean {
  return value.length >= 3 && value.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(value);
}

/**
 * Returns a trimmed, valid email address or null.
 * Accepts unknown input (useful when sanitizing values from JSONB/external payloads).
 */
export function sanitizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return isValidEmail(trimmed) ? trimmed : null;
}

/**
 * Returns a trimmed string capped at maxLength, or null if the input is empty.
 * Accepts unknown input (useful when sanitizing values from JSONB/external payloads).
 */
export function truncateText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}
