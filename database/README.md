# Database Setup (Neon)

## 1) Run initial schema

Open your Neon project SQL Editor and execute:

- `database/001_initial_schema.sql`

## 2) Seed mock data

Execute:

- `database/002_seed_mock_data.sql`

The seed is idempotent (`ON CONFLICT`) and aligns with current UI mock data.

## 3) Enable Typeform integration

Execute:

- `database/003_typeform_integration.sql`

This migration adds:
- Typeform tracking fields in `assessments`
- Idempotency table `typeform_webhook_events`

## 4) Enable persistent Settings configuration

Execute:

- `database/004_settings_configuration.sql`

This migration adds:
- `integration_settings` table (Typeform, Jira, Slack)
- JSON config persistence per provider
- `enabled` flag and validation metadata

## 5) Typeform webhook flow

Endpoint:
- `POST /api/typeform/webhook`

Required env var:
- `TYPEFORM_WEBHOOK_SECRET`

Expected hidden field in Typeform form:
- `assessment_id` (UUID of the assessment)

## 6) Enable multiple Typeform forms (recommended)

Execute:

- `database/005_typeform_multiple_forms.sql`

This migration adds:
- `typeform_forms` table to map multiple forms by `form_id`
- optional `entity_kind` restriction (`VENDOR`/`PARTNER`)
- per-form `workflow` and `hidden_assessment_field`
- `enabled` flag per form mapping

## 7) Persist Settings tabs (General, Risk Scoring, Notifications)

Execute:

- `database/006_platform_settings.sql`

This migration adds:
- `platform_settings` key/value table (`GENERAL`, `RISK_SCORING`, `NOTIFICATIONS`)
- default values for the new Settings tabs
- `updated_at` trigger

Webhook behavior:
1. Validates `Typeform-Signature`
2. Stores event in `typeform_webhook_events` (idempotency)
3. Resolves active form configuration from `typeform_forms` by payload `form_id`
4. Reads the assessment hidden field name from the mapped form (`hidden_assessment_field`)
5. Updates assessment to `RESPONDED`
6. Sets `responded_at` and Typeform tracking columns
7. Replaces `assessment_question_responses` with payload answers (`NEEDS_REVIEW`)

Status mapping used in the app:
- `PENDING`: not sent yet
- `SENT`: sent, waiting response
- `RESPONDED`: questionnaire answered, waiting review
- `IN_REVIEW`: internal analysis in progress
- `COMPLETED`: final decision done

## 8) Settings strategy (important)

- Secrets stay in environment variables (`.env.local` / Vercel envs)
- Operational configs stay in `integration_settings` table

Examples:
- Typeform (global): default hidden field name, webhook mode, enable/disable
- Typeform (per form): form id mapping, entity restriction, workflow, hidden field
- Settings tabs: GENERAL / RISK_SCORING / NOTIFICATIONS saved in `platform_settings`
- Jira: base URL, project key, issue type
- Slack: default channel and notification toggles

## 9) Optional quick validation

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

```sql
SELECT provider, enabled, config
FROM integration_settings
ORDER BY provider;
```

```sql
SELECT name, form_id, entity_kind, workflow, hidden_assessment_field, enabled
FROM typeform_forms
ORDER BY created_at DESC;
```

```sql
SELECT key, value
FROM platform_settings
ORDER BY key;
```

```sql
SELECT status, count(*)
FROM assessments
GROUP BY status
ORDER BY status;
```
