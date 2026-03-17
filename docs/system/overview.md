# System Overview

## Product

Due Diligence VTEX is a Next.js application for vendor and partner due diligence. It centralizes intake, questionnaire review, risk scoring, decisioning, and operational integrations in one workspace.

## Main Areas

- `Login`
  Google SSO for production and a local bypass for development only.
- `Dashboard`
  High-level risk and activity overview. In the current codebase, this screen is mostly static sample data.
- `Vendors`
  Entity list, filtering, detail view, internal questionnaire, external questionnaire, and decision tabs.
- `Partners`
  Entity list, filtering, detail view, external questionnaire, and decision tabs.
- `Settings`
  Global settings, integrations, Typeform form mapping, risk scoring, and notifications.

## Core Flows

1. A user authenticates through Google SSO or local dev bypass.
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
- `/api/auth/dev-login`
  Development-only bypass login.
- `/api/typeform/webhook`
  Receives Typeform webhooks.
- `/api/typeform/file`
  Proxies Typeform file downloads.
- `/api/jira/webhook`
  Receives Jira payloads and syncs entities.
- `/api/vendors/external-questionnaire/send`
  Sends vendor external questionnaire.
- `/api/health/db`
  Database health check.
- `/api/health/google-sheets`
  Google Sheets health check.

## Integrations

- Google OAuth
  Used for authentication.
- Typeform
  Used for external questionnaires and questionnaire mapping.
- Google Sheets
  Used as questionnaire source for internal and external data when enabled.
- Jira
  Used to sync and route vendor/partner operational work.
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

