# System Overview

## Product

Due Diligence VTEX is a Next.js application for vendor and partner due diligence. It centralizes intake, questionnaire review, risk scoring, decisioning, and operational integrations in one workspace.

## Main Areas

- `Login`
  Google SSO only (no local auth bypass in the codebase).
- `Dashboard`
  High-level risk and activity overview. In the current codebase, this screen is mostly static sample data.
- `Vendors`
  Entity list, filtering, detail view, internal questionnaire, external questionnaire, and decision tabs.
- `Partners`
  Entity list, filtering, detail view, external questionnaire, and decision tabs.
- `Settings`
  Global settings, integrations, Typeform form mapping, risk scoring, and notifications.

## Core Flows

1. A user authenticates through Google SSO (allowlist via `ALLOWED_GOOGLE_DOMAINS` / `ALLOWED_GOOGLE_EMAILS`).
2. Vendors and partners are loaded from the database through `lib/data.ts`.
3. Detail pages aggregate entity metadata, focal point data, questionnaire responses, and decision data.
4. Typeform and Google Sheets provide questionnaire data.
5. Jira and Slack handle operational routing and alerts through settings-driven integrations.

## Main Routes

- `/`
  Login screen.
- `/dashboard`
  Consolidated dashboard.
- `/vendors`
  Vendors table with filters.
- `/vendors/[id]`
  Vendor detail workspace.
- `/partners`
  Partners table with filters.
- `/partners/[id]`
  Partner detail workspace.
- `/settings`
  Platform settings and integration management.
- `/settings/typeform-forms`
  Typeform form catalog and question mapping.

## API Routes

- `/api/auth/google`
  Starts Google OAuth.
- `/api/auth/callback/google`
  Handles Google OAuth callback and creates session cookie.
- `/api/auth/logout`
  Clears the session.
- `/api/typeform/webhook`
  Receives Typeform webhooks (signed; unsigned mode blocked in production).
- `/api/typeform/file`
  Proxies Typeform file downloads (requires session; validates form/response against `assessments` when the URL shape allows it).
- `/api/jira/webhook`
  Receives Jira payloads and syncs entities (`JIRA_WEBHOOK_SECRET` required in production).
- `/api/vendors/external-questionnaire/send`
  Sends vendor external questionnaire (authenticated; requires `entitySlug`; questionnaire URL must be Typeform HTTPS with form id).
- `/api/cron/typeform-response-integrity`
  Scheduled repair for Typeform response integrity (`Authorization: Bearer` + `CRON_SECRET` or `INTERNAL_TOOL_SECRET`).
- `/api/health/db`
  Database health (Bearer secret or admin session with settings access).
- `/api/health/google-sheets`
  Google Sheets health (same auth as other health routes).
- `/api/health/typeform-responses`
  Typeform response integrity summary (same auth; response items omit response tokens).
- `/api/health/typeform-hidden`
  Typeform hidden-field diagnostics (same auth).

## Integrations

- Google OAuth
  Used for authentication.
- Typeform
  Used for external questionnaires and questionnaire mapping.
- Google Sheets
  Used as questionnaire source for internal and external data when enabled.
- Jira
  Used to sync and route vendor/partner operational work. Vendor intake fields from Jira follow webhook + API + PDF rules documented in [Jira vendor field sync](./jira-vendor-field-sync.md).
- Slack
  Used for alerts and notifications.

## Data Sources

- PostgreSQL/Neon
  Primary system of record.
- Typeform webhooks
  Populate assessments and response rows.
- Google Sheets CSV
  Alternative questionnaire source.
- Jira webhooks
  Sync entity metadata and ticket data.

## Notes

- The app shell is protected by a server-side session cookie.
- `assessments` and `reviews` currently redirect to `/dashboard`.
- The dashboard view is not yet fully driven by live database queries.

