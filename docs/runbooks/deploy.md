# Runbook: Deploy

**Platform:** Vercel  
**Branch model:** `main` is production  
**Deploy trigger:** Push to `main` (auto-deploy via Vercel GitHub integration)

---

## Pre-deploy checklist

Run through this list before merging to `main`.

### Code quality

```bash
npm run typecheck   # TypeScript — must pass with zero errors
npm run lint        # ESLint — must pass with zero errors
npm run build       # Next.js production build — must succeed
```

If any of these fail, **do not merge**.

### Environment variables

Confirm all required secrets are set in the Vercel project for the target environment:

| Variable | Required in production |
|---|---|
| `DATABASE_URL` | Yes |
| `DD_AUTH_SECRET` | Yes |
| `GOOGLE_CLIENT_ID` | Yes |
| `GOOGLE_CLIENT_SECRET` | Yes |
| `GOOGLE_OAUTH_REDIRECT_URI` | Yes |
| `ALLOWED_GOOGLE_DOMAINS` or `ALLOWED_GOOGLE_EMAILS` | Yes (at least one) |
| `JIRA_WEBHOOK_SECRET` | Yes |
| `TYPEFORM_WEBHOOK_SECRET` | Yes |
| `CRON_SECRET` | Yes (if crons are enabled) |
| `JIRA_BASE_URL`, `JIRA_API_EMAIL`, `JIRA_API_TOKEN` | Yes |
| `SLACK_BOT_TOKEN`, `SLACK_ALERT_CHANNEL` | Yes (if Slack is used) |
| `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` | Yes (if email delivery is used) |

If any required variable is missing, the deploy may succeed but features will fail silently or with 503s.

### Database migrations

If this deploy includes new SQL migrations, run them **before** the new code goes live (backward-compatible first). See [database-migration.md](./database-migration.md).

---

## Deploy process

### 1. Merge to main

```bash
git checkout main
git merge --no-ff <your-branch>
git push origin main
```

Vercel picks up the push and starts a deployment automatically.

### 2. Monitor the Vercel build

- Open the Vercel dashboard → project → Deployments.
- Watch for build errors. A failed build does not update production.

### 3. Post-deploy verification

Once the deployment is promoted to production, verify the following:

#### Health checks (run with Bearer token)

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/db
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/typeform-responses
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/google-sheets
```

All should return 200 with a `status: ok` body.

#### Login test

1. Open the app URL in a private browser window.
2. Click "Sign in with Google".
3. Authenticate with an allowed account.
4. Confirm you land on `/dashboard` with a valid session.

#### Webhook connectivity

- Confirm the Jira webhook URL in the Jira automation rule still points to the production URL.
- Confirm the Typeform webhook URL in the Typeform workspace still points to production.
- Trigger a test webhook from each and confirm the app processes it without errors.

---

## Rollback

Vercel supports instant rollback to any previous successful deployment.

1. Open Vercel dashboard → project → Deployments.
2. Find the last known-good deployment.
3. Click the `...` menu → **Promote to Production**.

This is instant and does not require a new build.

**Note:** Rollback does not undo database migrations. If the new migration caused a schema incompatibility with the rolled-back code, you may need to apply a compensating migration manually.

---

## Environment-specific notes

### Production

- `JIRA_WEBHOOK_SECRET` is **required**. Missing → webhook returns 503 for all events.
- `TYPEFORM_WEBHOOK_SECRET` + signed mode is **required**. Unsigned mode → 403.
- `DD_AUTH_SECRET` must never change between deploys without planning for session invalidation.

### Preview deployments (Vercel branch deploys)

- Vercel creates a preview URL for every branch push.
- Use preview deployments to test migrations and integration changes before merging to `main`.
- Set `GOOGLE_OAUTH_REDIRECT_URI` to the preview URL if testing OAuth in preview (or use a dedicated preview OAuth client).
- Webhook secrets in preview may be different from production — use separate Jira/Typeform webhook configurations for preview.

---

## Cron jobs

Cron jobs are defined in `vercel.json`. After deploy, confirm:

- `CRON_SECRET` is set in Vercel project settings.
- The cron schedule is correct in `vercel.json`.
- Test the cron endpoint manually with Bearer auth to confirm it runs without error.

```bash
curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
  https://your-app.vercel.app/api/cron/typeform-response-integrity
```
