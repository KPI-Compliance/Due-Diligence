# Integration: Google OAuth and Gmail

**Direction:** Both (OAuth inbound + Gmail outbound)  
**Status:** Active  
**Owner:** TecGRC / Engineering

---

## Overview

This document covers two related Google integrations:

1. **Google OAuth** — User authentication (SSO). All login is via Google OAuth 2.0. No username/password auth exists.
2. **Gmail API** — Email delivery. The platform sends questionnaire emails to vendors through a Google Workspace service account impersonating a designated sender.

---

## Part 1: Google OAuth (Authentication)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Yes | OAuth 2.0 client ID (`.apps.googleusercontent.com`) |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth 2.0 client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes | Must match an authorized redirect URI in Google Cloud Console |
| `DD_AUTH_SECRET` | Yes | Secret for signing session cookies (unrelated to Google; app-specific) |
| `ALLOWED_GOOGLE_DOMAINS` | Yes* | Comma-separated domain allowlist (e.g., `vtex.com,weni.ai`) |
| `ALLOWED_GOOGLE_EMAILS` | Yes* | Comma-separated email allowlist (use if domains alone are insufficient) |
| `RBAC_ADMIN_EMAILS` | No | Emails to bootstrap as ADMIN (fallback: first entry of `ALLOWED_GOOGLE_EMAILS`) |

*At least one of `ALLOWED_GOOGLE_DOMAINS` or `ALLOWED_GOOGLE_EMAILS` must be set.

### OAuth flow

```
1. User clicks "Sign in with Google"
   → GET /api/auth/google
   → Redirects to Google's OAuth 2.0 authorization endpoint
   → State parameter is HMAC-signed to prevent CSRF

2. Google redirects to callback with authorization code
   → GET /api/auth/callback/google
   → Validates state parameter
   → Exchanges code for tokens (id_token + access_token)
   → Validates id_token (signature, audience, expiry)
   → Checks email/domain against allowlist
   → Creates session cookie (signed with DD_AUTH_SECRET)
   → Redirects to /dashboard

3. Session validation on every protected route
   → Server reads and verifies session cookie
   → Loads user profile + RBAC group from database
   → Unauthorized → redirect to /
```

**Implementation:** [lib/auth.ts](../../lib/auth.ts)

### Session cookie

- Stored as an `httpOnly`, `Secure`, `SameSite=Lax` cookie.
- Signed with `DD_AUTH_SECRET` using Node.js crypto.
- No server-side session store — the session payload is embedded and signed in the cookie itself.
- No explicit expiration beyond browser session (TTL can be added if needed).

### Allowlist enforcement

At the OAuth callback, the platform validates:

1. The Google account's email domain is in `ALLOWED_GOOGLE_DOMAINS`, **or**
2. The exact email is in `ALLOWED_GOOGLE_EMAILS`.

If neither check passes, login is rejected with a 403. This check cannot be bypassed by OAuth state or any other mechanism.

### Logout

```
POST /api/auth/logout
```

Clears the session cookie. Does not revoke the Google token (no server-side token store).

---

## Part 2: Gmail API (Email delivery)

### Environment variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` | Yes* | JSON content of the service account key (preferred for Vercel) |
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE` | Yes* | Path to the service account JSON file (fallback for local dev) |
| `GOOGLE_WORKSPACE_IMPERSONATED_USER` | Yes | Google Workspace user to impersonate for sending emails |
| `EMAIL_FROM` | Yes | Sender email address (must match or be authorized by the impersonated user) |
| `EMAIL_REPLY_TO` | No | Reply-to address for outbound emails |

*One of `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` or `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE` is required.

### How it works

The platform uses a **Google Workspace service account** with **domain-wide delegation** to impersonate a designated sender (e.g., `secgrc.integrations@vtex.com`) and send emails via the Gmail API.

```
Platform → Service account (impersonates sender) → Gmail API → Recipient inbox
```

**Implementation:** [lib/email.ts](../../lib/email.ts)

### Required Google Workspace configuration

1. Create a service account in Google Cloud Console.
2. Download the JSON key file.
3. In Google Workspace Admin → Security → API Controls → Domain-wide Delegation:
   - Add the service account client ID.
   - Grant the `https://www.googleapis.com/auth/gmail.send` scope.
4. Set `GOOGLE_WORKSPACE_IMPERSONATED_USER` to the email of the user to impersonate.

### Triggering email delivery

Emails are sent via:

```
POST /api/vendors/external-questionnaire/send
```

The request body must include `entitySlug` and `questionnaireBaseUrl`. The platform builds the email with the Typeform link and sends it to the vendor contact email on record.

---

## Troubleshooting

### OAuth login fails (403 or redirect loop)

1. Confirm `GOOGLE_OAUTH_REDIRECT_URI` exactly matches one of the authorized redirect URIs in Google Cloud Console.
2. Confirm the email or domain is in the allowlist (`ALLOWED_GOOGLE_DOMAINS` / `ALLOWED_GOOGLE_EMAILS`).
3. Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set in the environment.

### Session cookie not set after login

1. Confirm `DD_AUTH_SECRET` is set. If missing, session creation will fail silently.
2. In local development, ensure the cookie `Secure` flag is not enforced on `http://localhost`.

### Emails not delivered

1. Confirm the service account JSON is valid and the service account exists in Google Cloud.
2. Confirm domain-wide delegation is configured for the `gmail.send` scope.
3. Confirm `GOOGLE_WORKSPACE_IMPERSONATED_USER` is a valid Google Workspace user in the authorized domain.
4. Check Vercel function logs for Gmail API errors.

---

## Security notes

- `DD_AUTH_SECRET` signs session cookies. If it changes, all existing sessions are invalidated immediately. Rotate only during a planned maintenance window.
- `GOOGLE_CLIENT_SECRET` and `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` are credentials. Never commit them to the repository or log them.
- The service account JSON key grants impersonation rights to the configured user. Treat it as equivalent to that user's password for Gmail.
- Domain-wide delegation grants broad access. Keep the service account's authorized scopes minimal (`gmail.send` only).
