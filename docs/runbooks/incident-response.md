# Runbook: Incident Response

**Severity levels:** P1 (critical) | P2 (high) | P3 (medium)  
**On-call contact:** TecGRC engineering team

---

## Severity definitions

| Level | Description | Example |
|---|---|---|
| P1 | Platform completely unavailable or critical data loss | Login broken, webhooks silently discarded, database down |
| P2 | Core workflow degraded for all or most users | Vendor assessments not loading, Slack alerts not sending |
| P3 | Non-critical feature broken or degraded for some users | Dashboard stats wrong, a single integration partially broken |

---

## First-response steps (any severity)

1. **Check Vercel status** — [vercel.com/status](https://vercel.com/status). If Vercel is down, wait; there is nothing to fix on the platform side.
2. **Check Neon status** — [status.neon.tech](https://status.neon.tech). Database outages cause 500s across all pages.
3. **Run health checks:**

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/db
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/typeform-responses
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/google-sheets
```

4. **Check Vercel function logs** — Vercel dashboard → project → Functions → look for errors in the last 15 minutes.

---

## Scenario: Login is broken

**Symptoms:** Users cannot log in; OAuth callback returns error or blank page.

**Checklist:**

- [ ] `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set and correct.
- [ ] `GOOGLE_OAUTH_REDIRECT_URI` exactly matches an authorized URI in Google Cloud Console.
- [ ] `DD_AUTH_SECRET` is set (missing → session creation silently fails).
- [ ] Google OAuth service is up (check [status.cloud.google.com](https://status.cloud.google.com)).
- [ ] The user's email/domain is in the allowlist.

**Fix:** Update environment variables in Vercel dashboard → redeploy (or the change takes effect on the next request without redeploy for env-var-only changes).

---

## Scenario: Jira webhook not processing

**Symptoms:** New vendors or partners created in Jira do not appear in the platform.

**Checklist:**

- [ ] `JIRA_WEBHOOK_SECRET` is set in the Vercel environment (missing → 503).
- [ ] The Jira automation rule is active and pointing to the correct URL.
- [ ] The `x-jira-webhook-secret` header in the Jira rule matches `JIRA_WEBHOOK_SECRET`.
- [ ] Check Vercel function logs for `/api/jira/webhook` errors.
- [ ] Confirm the Jira project key matches `JIRA_PROJECT_KEY`.

**Fix:**
1. If the secret is wrong: update it in both Jira and Vercel, then re-trigger by editing a Jira issue.
2. If an issue was missed: re-trigger by editing the Jira issue to fire an `issue_updated` event.
3. For bulk recovery: run `npm run backfill:vendor-jira-form-fields`.

---

## Scenario: Typeform webhook not processing

**Symptoms:** Vendor submits questionnaire but the assessment status stays `SENT`.

**Checklist:**

- [ ] `TYPEFORM_WEBHOOK_SECRET` is set and matches the Typeform workspace configuration.
- [ ] Typeform webhook mode is `signed` (not `unsigned`) in Settings.
- [ ] The webhook URL in Typeform points to the correct environment.
- [ ] Check Vercel function logs for `/api/typeform/webhook` errors (403 = signature mismatch; 413 = body too large).
- [ ] Check `typeform_webhook_events` to see if the event_id was received but failed processing.

**Fix:**
1. If signature mismatch: re-sync the secret between Typeform and Vercel.
2. If processing failed mid-way: the integrity cron (`/api/cron/typeform-response-integrity`) will repair it on the next run, or trigger it manually:

```bash
curl -X POST -H "Authorization: Bearer <CRON_SECRET>" \
  https://your-app.vercel.app/api/cron/typeform-response-integrity
```

---

## Scenario: Email delivery failing

**Symptoms:** "Send questionnaire" action succeeds in the UI but vendor receives no email.

**Checklist:**

- [ ] `GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON` is set and the JSON is valid.
- [ ] `GOOGLE_WORKSPACE_IMPERSONATED_USER` is a valid Google Workspace user.
- [ ] Domain-wide delegation is configured in Google Workspace Admin for the `gmail.send` scope.
- [ ] The vendor contact email in the database is correct.
- [ ] Check Vercel function logs for Gmail API errors in `/api/vendors/external-questionnaire/send`.

---

## Scenario: Database health check fails

**Symptoms:** `/api/health/db` returns non-200.

**Checklist:**

- [ ] Neon service is up (check [status.neon.tech](https://status.neon.tech)).
- [ ] `DATABASE_URL` in Vercel is correct and the connection string has not been rotated.
- [ ] Neon project has not been suspended (check Neon Console).

**Fix:** If `DATABASE_URL` was rotated in Neon, update the Vercel environment variable and redeploy.

---

## Scenario: Risk scores wrong or not updating

**Symptoms:** Vendor/partner shows incorrect risk level after review.

**Checklist:**

- [ ] `platform_settings` (key `RISK_SCORING`) has correct score thresholds.
- [ ] `typeform_form_question_mappings` has correct question weights.
- [ ] Analyst evaluations are saved in `assessment_question_responses`.

**Fix:**

```bash
npm run backfill:vendor-risk-scores    # Recalculate all vendor scores
npm run backfill:partner-risk-scores   # Recalculate all partner scores
```

---

## Post-incident

After resolving any P1 or P2 incident:

1. Write a brief post-mortem (what broke, why, how it was fixed, what prevents recurrence).
2. Add any missing environment variables to [.env.example](../../.env.example).
3. Update [docs/security/hardening-checklist.md](../security/hardening-checklist.md) if a security gap was found.
4. Create a backlog item in [docs/engineering/backlog.md](../engineering/backlog.md) for structural fixes.

---

## Useful commands

```bash
# Health checks
curl -H "Authorization: Bearer <TOKEN>" https://app.vercel.app/api/health/db
curl -H "Authorization: Bearer <TOKEN>" https://app.vercel.app/api/health/typeform-responses
curl -H "Authorization: Bearer <TOKEN>" https://app.vercel.app/api/health/google-sheets
curl -H "Authorization: Bearer <TOKEN>" https://app.vercel.app/api/health/typeform-hidden

# Trigger integrity cron manually
curl -X POST -H "Authorization: Bearer <TOKEN>" \
  https://app.vercel.app/api/cron/typeform-response-integrity

# Backfill scripts (run locally with production DATABASE_URL_UNPOOLED)
npm run backfill:vendor-jira-form-fields
npm run backfill:vendor-risk-scores
npm run backfill:partner-risk-scores
npm run backfill:partner-typeform
```
