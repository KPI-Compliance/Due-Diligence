# Integration: Jira

**Direction:** Bidirectional (webhook inbound + REST API outbound)  
**Status:** Active  
**Owner:** TecGRC

---

## Overview

Jira (Atlassian) is the primary intake channel for vendors and partners. When a new vendor or partner is onboarded, a Jira issue is created in the TPRM project (or equivalent). The platform receives a webhook from Jira, extracts the entity data, enriches it via the Jira REST API and PDF attachments, and creates or updates the entity in the database.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `JIRA_WEBHOOK_SECRET` | Yes (production) | Shared secret sent in `x-jira-webhook-secret` header |
| `JIRA_BASE_URL` | Yes | Jira instance URL (e.g., `https://your-company.atlassian.net`) |
| `JIRA_API_EMAIL` | Yes | Service account email for Jira REST API |
| `JIRA_API_TOKEN` | Yes | Jira API token (generated in Atlassian account settings) |
| `JIRA_PROJECT_KEY` | Yes | Project key (e.g., `TPRM`) |

---

## Webhook endpoint

```
POST /api/jira/webhook
```

**Implementation:** [app/api/jira/webhook/route.ts](../../app/api/jira/webhook/route.ts)  
**Core logic:** [lib/jira.ts](../../lib/jira.ts)

### Request requirements

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `x-jira-webhook-secret` | Must equal `JIRA_WEBHOOK_SECRET` |

**Production policy:** If `JIRA_WEBHOOK_SECRET` is not set in the environment, the route returns **HTTP 503** and rejects all events. This prevents unprotected processing.

### Supported events

The webhook handles `issue_created`, `issue_updated`, and related Jira automation events. On each event, the platform:

1. Validates the secret header.
2. Extracts entity fields from the webhook payload (layer 1).
3. Calls the Jira REST API to enrich missing fields (layer 2).
4. Downloads and parses PDF attachments named `vendor request*.pdf` (layer 3).
5. Upserts the entity in `entities` and updates `jira_form_data`.

### Three-layer enrichment

The entity fields (vendor email, VTEX responsible, scope, priority, CAP number, display name, language) are assembled from three sources in priority order:

| Layer | Source | How |
|---|---|---|
| 1 | Webhook payload | `extractEntityFromJiraIssue` — walks JSON for known labels and automation blocks |
| 2 | Jira REST API | `enrichVendorFieldsFromJiraIssue` — fetches expanded issue fields + Service Desk request values |
| 3 | PDF attachments | `enrichVendorFieldsFromJiraAttachments` — downloads, parses, and labels fields from the "Vendor request" PDF |

See [docs/system/jira-vendor-field-sync.md](../system/jira-vendor-field-sync.md) for the complete parsing specification.

### PDF policy

Only PDFs that satisfy **both** conditions are processed:

- Filename contains `vendor request` (case-insensitive).
- Filename ends with `.pdf`.

If multiple matching PDFs exist, the one producing the highest parse score wins. PDFs that do not match the filename rule are ignored entirely.

### Attachment timing (retries)

On `issue_created`, Jira sometimes delivers the webhook before the PDF attachment is fully committed. The handler retries PDF enrichment with delays. If the PDF is still absent after all retries, the entity is saved with available data; the next `issue_updated` webhook triggers another enrichment pass.

### Response codes

| Code | Condition |
|---|---|
| 200 | Event processed (or recognized but no-op) |
| 400 | Malformed payload |
| 503 | `JIRA_WEBHOOK_SECRET` not configured in production |
| 500 | Internal error (logged) |

---

## Jira REST API usage

**Implementation:** [lib/jira.ts](../../lib/jira.ts)

The platform calls Jira REST API (v3) and Service Desk API for:

- Fetching expanded issue fields (`GET /rest/api/3/issue/{issueKey}?expand=names,renderedFields`).
- Fetching Service Desk request field values (`GET /rest/servicedeskapi/request/{issueKey}?expand=requestFieldValues`).
- Downloading attachments (`GET /rest/api/3/attachment/content/{attachmentId}`).

Authentication: HTTP Basic with `JIRA_API_EMAIL:JIRA_API_TOKEN` (Base64-encoded).

---

## Backfill scripts

For entities already created before a fix or re-enrichment is needed:

```bash
npm run backfill:vendor-jira-form-fields   # Re-reads Jira and merges PDF-derived fields
npm run backfill:vendor-jira-reporter      # Backfills Jira reporter information
```

Both scripts apply the same filename rules as the live webhook. They do not overwrite fields that already have values unless the new parse is more complete.

---

## Troubleshooting

### Fields show "-" in the app but look filled in Jira

1. **Check the PDF filename** — Does it contain `vendor request` and end in `.pdf`? If the PDF has a generic name, the parser will not run.
2. **Check for selectable text** — Open the PDF and try copy-paste. Image-only PDFs cannot be parsed.
3. **Trigger a re-sync** — Edit the Jira issue to fire an `issue_updated` event, or run `npm run backfill:vendor-jira-form-fields`.
4. **Check API permissions** — The Jira service account must have read access to the issue, attachments, and request fields.

### Webhook not received

1. Confirm the Jira webhook URL points to the correct environment.
2. Confirm the `x-jira-webhook-secret` header value matches `JIRA_WEBHOOK_SECRET`.
3. Check the Vercel function logs for 503 (missing secret) or 500 (processing error).

### Entity created but assessment not created

The Jira webhook creates the entity row. A corresponding assessment is created as part of the same transaction if a valid assessment context can be derived from the payload. If the assessment is missing, check the Jira payload for the required fields and re-trigger with a dummy update.

---

## Security notes

- `JIRA_WEBHOOK_SECRET` is the sole authentication mechanism for the inbound webhook. If compromised, rotate it immediately in both the Jira webhook configuration and the Vercel environment.
- `JIRA_API_TOKEN` grants read access to the Jira project. Use a dedicated service account with minimum required scopes.
- `jira_form_data` stores a snapshot of intake fields — it is not live Jira data. Do not treat it as authoritative for audit purposes; always cross-reference with the Jira issue.
