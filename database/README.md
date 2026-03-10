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

## 8) Enable Jira -> Vendors sync

Execute:

- `database/007_jira_vendor_sync.sql`

This migration adds:
- `jira_issue_key`, `jira_issue_url` and `jira_synced_at` to `entities`
- unique index for idempotent upsert by Jira issue

Endpoint:
- `POST /api/jira/webhook`

Recommended env var:
- `JIRA_WEBHOOK_SECRET`

Expected behavior:
1. Accepts Jira issue created/updated payloads
2. Maps summary/status/priority and structured description fields into `entities`
3. Upserts the matching vendor/partner row by `jira_issue_key`
4. Vendors page starts showing the new entity automatically

### Recommended Jira Automation rule

Use Jira Automation instead of the native Jira webhook when you need to send values from the attached JSM form.

Why:
- form smart values are available only when the rule uses the `Form submitted` trigger
- custom headers are supported in the `Send web request` action

Suggested rule:
1. Trigger: `Form submitted`
2. Select the `Vendor request` form attached to the `Vendor assessment` request type
3. Condition: restrict to the desired request type if needed
4. Action: `Send web request`

Suggested request:
- URL: `https://<YOUR_APP_URL>/api/jira/webhook`
- Method: `POST`
- Headers:
  - `Content-Type: application/json`
  - `x-jira-webhook-secret: <YOUR_JIRA_WEBHOOK_SECRET>`

Important:
- each form field must have a stable field key in Jira Forms
- the smart values below assume these exact field keys:
  - `name-of-vendor`
  - `vendor-e-mail-address`
  - `vtex-e-mail-responsible`
  - `vendor-language-preferences`
  - `priority`
  - `cap-number`
  - `scope`

Custom data example:

```json
{
  "webhookEvent": "jira:issue_updated",
  "issue_event_type_name": "issue_updated",
  "issue": {
    "key": {{issue.key.asJsonString}},
    "self": {{issue.self.asJsonString}},
    "fields": {
      "summary": {{issue.summary.asJsonString}},
      "description": {{issue.description.asJsonString}},
      "status": {
        "name": {{issue.status.name.asJsonString}}
      },
      "priority": {
        "name": {{issue.priority.name.asJsonString}}
      },
      "issuetype": {
        "name": {{issue.issueType.name.asJsonString}}
      },
      "project": {
        "key": {{issue.project.key.asJsonString}}
      },
      "assignee": {
        "emailAddress": {{issue.assignee.emailAddress.asJsonString}}
      }
    }
  },
  "name-of-vendor": {{forms.last.name-of-vendor.asJsonString}},
  "vendor-e-mail-address": {{forms.last.vendor-e-mail-address.asJsonString}},
  "vtex-e-mail-responsible": {{forms.last.vtex-e-mail-responsible.asJsonString}},
  "vendor-language-preferences": {{forms.last.vendor-language-preferences.label.asJsonString}},
  "priority": {{forms.last.priority.label.asJsonString}},
  "cap-number": {{forms.last.cap-number.asJsonString}},
  "scope": {{forms.last.scope.asJsonString}}
}
```

Fallback if your form fields are linked to Jira fields:
- you may also use `{{issue.customfield_xxxxx}}` or linked system fields
- this is useful if the form field key names are not yet standardized

Validation tip:
- first send the same payload to a temporary webhook inspector
- once the payload shape is confirmed, point the rule to `/api/jira/webhook`

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

## 9) Settings strategy (important)

- Secrets stay in environment variables (`.env.local` / Vercel envs)
- Operational configs stay in `integration_settings` table

Examples:
- Typeform (global): default hidden field name, webhook mode, enable/disable
- Typeform (per form): form id mapping, entity restriction, workflow, hidden field
- Settings tabs: GENERAL / RISK_SCORING / NOTIFICATIONS saved in `platform_settings`
- Jira: base URL, project key, issue type
- Slack: default channel and notification toggles

## 10) Optional quick validation

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
SELECT slug, name, kind, jira_issue_key, jira_synced_at
FROM entities
WHERE jira_issue_key IS NOT NULL
ORDER BY jira_synced_at DESC;
```

```sql
SELECT status, count(*)
FROM assessments
GROUP BY status
ORDER BY status;
```

## 11) Google Sheets as questionnaire source (no new migration)

If you decide not to use Typeform paid webhooks, the app can read answers from Google Sheets CSV directly at runtime.

Environment variables:
- `GOOGLE_SHEETS_ENABLED=true`
- `GOOGLE_SHEETS_CSV_URL=https://docs.google.com/spreadsheets/d/<SHEET_ID>/export?format=csv&gid=0`
- `GOOGLE_SHEETS_STRICT_MATCH=true` (default)

Optional column mapping vars (defaults):
- `GOOGLE_SHEETS_COLUMN_ASSESSMENT_ID=assessment_id`
- `GOOGLE_SHEETS_COLUMN_ENTITY_SLUG=entity_slug`
- `GOOGLE_SHEETS_COLUMN_ENTITY_NAME=entity_name`
- `GOOGLE_SHEETS_COLUMN_DOMAIN=domain`
- `GOOGLE_SHEETS_COLUMN_QUESTION=question_text`
- `GOOGLE_SHEETS_COLUMN_ANSWER=answer_text`
- `GOOGLE_SHEETS_COLUMN_REVIEW_STATUS=review_status`
- `GOOGLE_SHEETS_COLUMN_EVIDENCE_URL=evidence_url`

Matching priority used by the app:
1. `assessment_id` equal to current assessment UUID
2. fallback to `entity_slug` or `entity_name`
3. fallback to exact company-name question column (Typeform export wide PT/EN)

Health endpoint:
- `GET /api/health/google-sheets`
