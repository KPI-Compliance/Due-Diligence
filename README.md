# Due Diligence Platform

Next.js app for vendor and partner due diligence: intake, questionnaires, risk scoring, and integrations (Jira, Typeform, Google, Slack).

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Copy `.env.example` to `.env.local` and fill values for your environment.

## Google SSO and session

Configure OAuth and session signing (session always uses `DD_AUTH_SECRET`; it is required when the auth code path runs):

```bash
NEXT_PUBLIC_APP_URL="http://localhost:3000"
GOOGLE_CLIENT_ID="your_google_client_id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"
DD_AUTH_SECRET="replace_with_a_long_random_secret"
ALLOWED_GOOGLE_DOMAINS="your-company.com"
ALLOWED_GOOGLE_EMAILS=""
```

Optional: `RBAC_ADMIN_EMAILS` for bootstrap admins (see `lib/access-control.ts`). In Vercel, prefer env vars over a local `client_secret_*.json` file (still supported as fallback if env is omitted).

## Webhooks and integration secrets

### Jira (`POST /api/jira/webhook`)

- In **production**, `JIRA_WEBHOOK_SECRET` is **required**. If it is missing, the route returns **503** and events are not processed.
- Jira automation must send the same value in the **`x-jira-webhook-secret`** header.
- In non-production, the secret is optional; when set, requests must still match.

### Typeform (`POST /api/typeform/webhook`)

- Use **`TYPEFORM_WEBHOOK_SECRET`** and Typeform’s signed webhook payload.
- In **production**, **`webhook_mode: unsigned`** in integration settings is **rejected** (403). Unsigned mode is only for controlled non-production use.
- Request bodies larger than **2 MiB** are rejected with **413**.

## Cron (Typeform response integrity)

`vercel.json` schedules:

- `GET` or `POST` **`/api/cron/typeform-response-integrity`**

Authorization:

- Send **`Authorization: Bearer <CRON_SECRET>`** (or the same value in **`INTERNAL_TOOL_SECRET`** if you use that instead of `CRON_SECRET` for this check).
- **Query-string secrets are not supported** (they leak via logs and `Referer`).

On [Vercel](https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs), define **`CRON_SECRET`** in the project; Vercel adds the `Authorization` header automatically to cron invocations.

## Health and diagnostic APIs

These routes respond only if **either**:

1. **`Authorization: Bearer`** matches `INTERNAL_TOOL_SECRET` or `CRON_SECRET`, or  
2. The caller has a valid **session** and **`canManageSettings`** (so “open in new tab” from Settings works for admins).

Endpoints:

- `GET /api/health/db`
- `GET /api/health/google-sheets`
- `GET /api/health/typeform-responses`
- `GET /api/health/typeform-hidden`

Monitoring probes must use the **Bearer** header, not anonymous `GET`.

## Vendor external questionnaire (`POST /api/vendors/external-questionnaire/send`)

- **`entitySlug`** is required. **`assessmentId`** is optional but, if sent, must belong to that vendor (prevents cross-vendor IDOR).
- **`questionnaireBaseUrl`** must be **HTTPS** on a **Typeform** host (`*.typeform.com`) and must **include the selected form id** in the path or query (anti-phishing).

## Typeform file proxy (`GET /api/typeform/file`)

Requires a logged-in user. For standard API file URLs under `/forms/{formId}/responses/{responseId}/...`, the app checks that **`assessments`** has a matching **`typeform_form_id`** and **`typeform_response_token`**.

## Google Sheets (questionnaire source)

See `.env.example` for `GOOGLE_SHEETS_*` variables. When enabled, answers can be merged into assessments as documented in `database/README.md`.

## Internal questionnaire (Slack + Google Forms)

See `.env.example` for `SLACK_BOT_TOKEN`, `INTERNAL_QUESTIONNAIRE_FORM_URL`, and optional form parameter names.

## Scripts

- `npm run lint` — ESLint  
- `npm run typecheck` — TypeScript  
- `npm run build` / `npm run start` — production build  

Backfill scripts are listed in `package.json` under `scripts`.

## Documentation

- `AGENTS.md` — agent roles for this repo  
- `docs/system/overview.md` — routes and flows  
- `database/README.md` — schema and data notes  
- `docs/security/hardening-checklist.md` — security checklist  

## Deploy (Vercel)

Set all production secrets in the Vercel dashboard (never commit `.env.local`). After deploy, confirm:

1. `JIRA_WEBHOOK_SECRET` and Jira header match.  
2. `CRON_SECRET` is set if crons are enabled.  
3. `TYPEFORM_WEBHOOK_SECRET` and Typeform signing mode are **signed** in production.
