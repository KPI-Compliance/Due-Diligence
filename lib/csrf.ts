/**
 * CSRF protection via Origin header validation.
 *
 * sameSite=lax on session cookies already blocks cross-site cookie submission
 * on POST requests. This adds an explicit Origin check as defense-in-depth.
 *
 * Requests with no Origin header (server-to-server, CLI tools) are allowed
 * through because browsers always set Origin on cross-origin requests.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");

  // No Origin = not a browser cross-site request — allow through
  if (!origin) return true;

  // Local development: allow any localhost/127.0.0.1 origin
  if (process.env.NODE_ENV === "development") {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return true;
    }
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");

  // No app URL configured and not in dev — fail closed
  if (!appUrl) return process.env.NODE_ENV === "development";

  return origin === appUrl;
}
