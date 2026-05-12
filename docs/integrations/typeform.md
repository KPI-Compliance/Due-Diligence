# Integration: Typeform

**Direction:** Bidirectional (webhook inbound + Admin API outbound)  
**Status:** Active  
**Owner:** TecGRC

---

## Overview

Typeform is the primary external questionnaire platform. The integration has two sides:

1. **Outbound (Admin API):** The platform fetches form definitions (fields, question references) to build the question catalog in Settings.
2. **Inbound (Webhook):** Typeform delivers response submissions to the platform in real time after a vendor or partner completes a questionnaire.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `TYPEFORM_WEBHOOK_SECRET` | Yes (production) | Shared secret for HMAC-SHA256 webhook signature verification |

Integration settings (form IDs, webhook mode, enabled state) are persisted in the `integration_settings` table (provider `TYPEFORM`) and managed via the Settings UI.

---

## Webhook endpoint

```
POST /api/typeform/webhook
```

**Implementation:** [app/api/typeform/webhook/route.ts](../../app/api/typeform/webhook/route.ts)  
**Core processing:** [lib/typeform-sync.ts](../../lib/typeform-sync.ts)

### Request requirements

| Header | Value |
|---|---|
| `Content-Type` | `application/json` |
| `Typeform-Signature` | `sha256=<HMAC-SHA256 hex of raw body>` |

Requests larger than **2 MiB** are rejected with HTTP 413.

### Signature verification

The platform verifies the `Typeform-Signature` header against `TYPEFORM_WEBHOOK_SECRET` using HMAC-SHA256 over the raw request body. Verification is implemented in [lib/typeform.ts](../../lib/typeform.ts).

**Production policy:** Unsigned mode (`webhook_mode: unsigned` in integration settings) is rejected with HTTP 403 in production environments. Use signed mode only.

### Idempotency

Each Typeform response has a unique `event_id`. The platform checks `typeform_webhook_events` before processing. If the `event_id` already exists, the webhook returns 200 without reprocessing (safe replay).

### Processing flow

```
1. Parse raw body (before JSON decode) for signature verification
2. Verify Typeform-Signature header
3. Decode JSON payload
4. Look up matching typeform_forms row by form_id
5. Check typeform_webhook_events for existing event_id (idempotency)
6. Insert into typeform_webhook_events
7. Find or create assessment row linked to the form response token
8. Store responses in assessment_question_responses
9. Update assessment status → RESPONDED
10. Send Slack alert (if configured)
```

### Response codes

| Code | Condition |
|---|---|
| 200 | Successfully processed (or already processed — idempotent) |
| 400 | Malformed payload |
| 403 | Signature invalid, or unsigned mode in production |
| 413 | Body exceeds 2 MiB |
| 500 | Internal error (logged) |

---

## Form configuration (Admin API)

**Implementation:** [lib/typeform-admin.ts](../../lib/typeform-admin.ts)

The platform reads form definitions from the Typeform API to populate question catalogs. Forms are configured in Settings → Typeform Forms.

### Form table: `typeform_forms`

| Column | Description |
|---|---|
| `form_id` | Typeform form ID |
| `entity_kind` | `VENDOR` or `PARTNER` |
| `workflow` | The questionnaire workflow this form belongs to |
| `hidden_assessment_field` | Name of the Typeform hidden field carrying the assessment ID |
| `enabled` | Whether this form is active |

### Question mapping: `typeform_form_question_mappings`

Each question in a form is mapped to a section and weight. This drives:
- Section grouping in the review UI
- Risk score calculation

---

## File proxy

```
GET /api/typeform/file
```

Proxies Typeform file-type answers (uploaded files) on behalf of authenticated users.

**Authorization:** Requires a valid session. For standard file URLs under `/forms/{formId}/responses/{responseId}/...`, the platform validates that:
1. `typeform_form_id` matches an assessment owned by this session's accessible entities.
2. `typeform_response_token` matches the assessment row.

---

## Response integrity cron

```
POST /api/cron/typeform-response-integrity
```

**Schedule:** Daily (configured in `vercel.json`)  
**Authorization:** `Authorization: Bearer <CRON_SECRET>`  
**Implementation:** [lib/typeform-response-integrity.ts](../../lib/typeform-response-integrity.ts)

Detects and repairs assessments where the Typeform response was received but question responses were not fully stored (e.g., due to a transient error during webhook processing). Fetches missing responses from the Typeform API and re-stores them.

---

## Typeform hidden fields

Typeform forms use **hidden fields** to carry context from the platform into each questionnaire submission:

| Hidden field | Purpose |
|---|---|
| Assessment ID field (name configured per form) | Links the Typeform response to the correct assessment in the database |

If the hidden field is missing or mismatched, the webhook cannot link the response to an entity. Check [health/typeform-hidden](../../app/api/health/typeform-hidden/route.ts) for diagnostics.

---

## Troubleshooting

### Webhook not received

1. Confirm the Typeform webhook URL points to the correct environment (`NEXT_PUBLIC_APP_URL`).
2. Confirm `TYPEFORM_WEBHOOK_SECRET` matches what is configured in Typeform.
3. Check `/api/health/typeform-responses` (Bearer auth) for integrity status.

### Responses received but not linked to an assessment

1. Check that the form's hidden field carries the correct assessment ID.
2. Check `typeform_forms` to confirm the `form_id` is registered and `enabled`.
3. Run or wait for the next integrity cron cycle (`/api/cron/typeform-response-integrity`).

### `typeform_forbidden` status

Typeform returned 403 when the platform tried to fetch form definitions. Check that the Typeform integration token in Settings has the required scopes and has not expired.

---

## Security notes

- Signature verification must be performed against the raw (pre-JSON-decode) request body. Do not use a re-serialized version.
- `TYPEFORM_WEBHOOK_SECRET` must be rotated if compromised. Update both `integration_settings` and the Typeform webhook configuration simultaneously.
- Never expose `typeform_response_token` values outside the file proxy validation path.
