# Integration: Google Sheets

**Direction:** Inbound (Google Sheets → platform)  
**Status:** Optional (disabled by default)  
**Owner:** TecGRC

---

## Overview

Google Sheets provides an alternative source for questionnaire answers. When enabled, the platform reads a published CSV export of a Google Sheet and merges the answers into assessments. This path is used when questionnaire responses are collected outside of Typeform — for example, via a Google Form whose responses are stored in a Sheet, or for legacy data migration.

This integration is complementary, not a replacement for Typeform. When Typeform webhooks are the primary path, Google Sheets is typically disabled.

---

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOGLE_SHEETS_ENABLED` | No | `false` | Set to `true` to enable |
| `GOOGLE_SHEETS_CSV_URL` | Yes (if enabled) | — | URL to the published CSV of the external questionnaire sheet |
| `GOOGLE_SHEETS_INTERNAL_CSV_URL` | No | — | URL to the published CSV of the internal questionnaire sheet |
| `GOOGLE_SHEETS_STRICT_MATCH` | No | `true` | If `true`, match rows only by exact UUID; if `false`, also fall back to entity slug |
| `GOOGLE_SHEETS_IMPERSONATED_USER` | No | — | Google Workspace user to impersonate for authenticated sheet reads (domain-wide delegation) |

### Column name mapping

The column headers in the Sheet must match these variable values (defaults shown):

| Variable | Default column name | Purpose |
|---|---|---|
| `GOOGLE_SHEETS_COLUMN_ASSESSMENT_ID` | `assessment_id` | UUID linking row to an assessment |
| `GOOGLE_SHEETS_COLUMN_ENTITY_SLUG` | `entity_slug` | Entity slug (fallback match when `GOOGLE_SHEETS_STRICT_MATCH=false`) |
| `GOOGLE_SHEETS_COLUMN_ENTITY_NAME` | `entity_name` | Entity display name |
| `GOOGLE_SHEETS_COLUMN_DOMAIN` | `domain` | Question domain/section |
| `GOOGLE_SHEETS_COLUMN_QUESTION` | `question_text` | Question text |
| `GOOGLE_SHEETS_COLUMN_ANSWER` | `answer_text` | Answer text |
| `GOOGLE_SHEETS_COLUMN_REVIEW_STATUS` | `review_status` | Pre-populated review status (optional) |
| `GOOGLE_SHEETS_COLUMN_EVIDENCE_URL` | `evidence_url` | Link to evidence document (optional) |

### Internal questionnaire sheet columns

| Variable | Default column name | Purpose |
|---|---|---|
| `GOOGLE_SHEETS_INTERNAL_COLUMN_VENDOR` | `VENDOR` | Vendor name |
| `GOOGLE_SHEETS_INTERNAL_COLUMN_TICKET` | `TICKET` | Jira ticket key |
| `GOOGLE_SHEETS_INTERNAL_COLUMN_REQUESTER` | `Solicitado por` | Name of the internal requester |
| `GOOGLE_SHEETS_INTERNAL_COLUMN_STATUS` | `Status Mini Questionário` | Status of the internal questionnaire |

---

## How it works

**Implementation:** [lib/google-sheets.ts](../../lib/google-sheets.ts)

```
1. Platform triggers a Google Sheets read (on demand or during data load)
2. Fetches the published CSV URL via HTTP GET
3. Parses CSV rows using configured column mappings
4. Matches each row to an assessment by:
   a. Exact UUID match on assessment_id (always attempted)
   b. Entity slug match (if GOOGLE_SHEETS_STRICT_MATCH=false)
5. Merges matched answers into assessment_question_responses
   - Does not overwrite existing Typeform-sourced answers (Typeform takes precedence)
```

### Sheet setup requirements

1. The Google Sheet must be published as CSV ("File → Share → Publish to web → CSV").
2. The first row must be a header row with column names matching the configured mappings.
3. Each data row represents one question-answer pair (not one vendor per row).

---

## Health endpoint

```
GET /api/health/google-sheets
Authorization: Bearer <CRON_SECRET>
```

Returns the availability and row count of the configured CSV URL. Useful for confirming the sheet is accessible before troubleshooting data issues.

---

## Troubleshooting

### Answers not appearing in assessments

1. Confirm `GOOGLE_SHEETS_ENABLED=true` in the environment.
2. Confirm the CSV URL is publicly accessible (or that `GOOGLE_SHEETS_IMPERSONATED_USER` has access).
3. Check that the `assessment_id` column contains valid UUIDs matching rows in the `assessments` table.
4. If using slug-based matching, confirm `GOOGLE_SHEETS_STRICT_MATCH=false` and check slug values.

### CSV fetch fails

1. Confirm the Google Sheet is published to the web as CSV.
2. If using impersonation, confirm the service account has domain-wide delegation for Google Sheets read scope.
3. Check the health endpoint: `GET /api/health/google-sheets` with Bearer auth.

### Column not found

1. The column name in the sheet must exactly match the configured variable (case-sensitive, including spaces).
2. Re-check the header row in the published CSV by downloading it directly.

---

## Security notes

- Published CSV URLs are publicly accessible. Do not include sensitive data in sheet columns beyond what is needed for the questionnaire.
- If the sheet contains confidential answers, use impersonated access (`GOOGLE_SHEETS_IMPERSONATED_USER`) instead of publishing publicly.
- `GOOGLE_SHEETS_STRICT_MATCH=true` (the default) prevents cross-entity answer contamination by requiring exact UUID matches.
