# Platform Specification — Due Diligence Platform

**Version:** 1.0  
**Last updated:** 2026-05-12  
**Status:** Active

---

## 1. Purpose

The Due Diligence Platform is the system of record for vendor and partner due diligence at VTEX and Weni. It replaces ad-hoc spreadsheets and disconnected email threads with a structured, auditable workflow that connects intake (Jira), questionnaires (Typeform), notifications (Slack/Gmail), and risk decisioning in a single workspace.

---

## 2. Users and access groups

| Group | Description | Permissions |
|---|---|---|
| `ADMIN` | Platform administrators | All settings, user management, all entities, all assessments |
| `TECGRC` | Tech GRC analysts | Assess vendors/partners, review responses, record decisions, read settings |
| `COMPLIANCE` | Compliance reviewers | View and review assessments, read entities |
| `PRIVACY` | Privacy analysts | Review privacy sections, view entities |
| `PROCUREMENT` | Procurement team | View intake data, coordinate with focal points |

Access is enforced in [lib/access-control.ts](../../lib/access-control.ts). Group membership is stored in the `user_access_profiles` table. Authentication is exclusively via Google SSO — only domains or emails in the allowlist can log in.

---

## 3. Core entities

### 3.1 Entity (Vendor or Partner)

The primary object in the system. Each entity represents one external company undergoing due diligence.

| Field | Description |
|---|---|
| `slug` | URL-safe unique identifier (e.g., `acme-corp`) |
| `name` | Display name |
| `kind` | `VENDOR` or `PARTNER` |
| `company_group` | `VTEX` or `WENI` |
| `status` | Operational status label |
| `risk_level` | `LOW`, `MEDIUM`, or `HIGH` — derived from the latest completed assessment |
| `jira_issue_key` | Linked Jira ticket (e.g., `TPRM-123`) |

Entities are created via the Jira webhook (primary path) or manually via the UI.

### 3.2 Assessment

A single due diligence cycle for one entity. An entity can have multiple assessments over time (e.g., annual reviews).

| Field | Description |
|---|---|
| `status` | See state machine in section 5 |
| `risk_level` | Calculated risk outcome for this assessment cycle |
| `typeform_form_id` | The Typeform form used for this assessment |
| `typeform_response_token` | Unique token linking the Typeform response to this assessment |

### 3.3 Assessment Question Response

Individual question–answer pairs from the questionnaire, stored in `assessment_question_responses`. Each row belongs to one assessment and captures the answer text, domain/section, and analyst review status.

### 3.4 Assessment Decision

The final output of an assessment cycle. Stored in `assessment_decisions`. Captures security, privacy, and compliance scores; the final classification; and approval conditions if any.

---

## 4. Workflows

### 4.1 Vendor intake (Jira-driven)

```
Jira issue created
  → POST /api/jira/webhook
  → lib/jira.ts: extractEntityFromJiraIssue (webhook payload)
  → lib/jira.ts: enrichVendorFieldsFromJiraIssue (Jira REST API)
  → lib/jira.ts: enrichVendorFieldsFromJiraAttachments (PDF named "vendor request*.pdf")
  → UPSERT entities row with jira_issue_key, jira_form_data
  → Assessment row created with status PENDING
```

**Key constraint:** The PDF attachment must have a filename containing `vendor request` (case-insensitive) and end in `.pdf`. Other PDFs on the same ticket are ignored. See [docs/system/jira-vendor-field-sync.md](../system/jira-vendor-field-sync.md) for the full parsing specification.

### 4.2 External questionnaire (Typeform)

```
Analyst selects vendor → clicks "Send Questionnaire"
  → POST /api/vendors/external-questionnaire/send
  → Validates entitySlug + assessmentId ownership (IDOR prevention)
  → Validates questionnaireBaseUrl is HTTPS *.typeform.com with form ID
  → Creates vendor_questionnaire_dispatches row
  → Sends email via Gmail API with unique Typeform link
  → Assessment status → SENT

Vendor submits Typeform form
  → Typeform sends POST /api/typeform/webhook (signed)
  → lib/typeform-sync.ts: verifies signature, checks idempotency
  → Stores responses in assessment_question_responses
  → Assessment status → RESPONDED
  → Sends Slack alert to configured channel
```

### 4.3 Internal questionnaire (Slack + Google Forms)

```
Analyst dispatches internal questionnaire
  → POST /api/vendors/internal-questionnaire/send
  → Generates unique dispatchId
  → Sends Google Form link to focal point via Slack DM
  → Focal point opens /q/[dispatchId] → redirected to Google Form with pre-filled params
```

### 4.4 Analyst review

```
Analyst opens vendor/partner detail page → Review tab
  → Loads assessment_question_responses
  → Analyst sets review_status per question: NOT_EVALUATED | NA | DOES_NOT_MEET | PARTIALLY | FULLY
  → Analyst adds notes per section
  → Risk score is calculated on save
  → Assessment status → IN_REVIEW
```

### 4.5 Decision recording

```
Analyst completes review → Decision tab
  → Selects classification and decision option
  → Optionally adds conditions_for_approval, mitigation_plan, approval_expires_at
  → Saves to assessment_decisions
  → Assessment status → COMPLETED
  → Entity risk_level updated
```

### 4.6 Partner intake and questionnaire

Partners follow a parallel path to vendors:
- Intake via Jira webhook (same `/api/jira/webhook`) or manual creation.
- Questionnaires via Typeform (same `/api/typeform/webhook`), but stored in `partner_typeform_assessment_*_responses` tables (one per form language/version).
- Risk scoring via `lib/partner-risk-scoring.ts`.

---

## 5. Assessment status machine

```
PENDING ──→ SENT ──→ RESPONDED ──→ IN_REVIEW ──→ COMPLETED
```

| Status | Trigger |
|---|---|
| `PENDING` | Assessment created (from Jira intake or manual) |
| `SENT` | External questionnaire dispatched |
| `RESPONDED` | Typeform webhook received and stored |
| `IN_REVIEW` | Analyst opens and saves first response review |
| `COMPLETED` | Decision recorded in `assessment_decisions` |

---

## 6. Risk scoring

### 6.1 Vendor risk

Calculated by [lib/vendor-risk-scoring.ts](../../lib/vendor-risk-scoring.ts) across two domains:

- **Privacy** — responses to privacy-related questions, weighted per `typeform_form_question_mappings`.
- **Security** — responses to security-related questions, same weighting model.

Each analyst evaluation (`NOT_EVALUATED`, `NA`, `DOES_NOT_MEET`, `PARTIALLY`, `FULLY`) maps to a numeric score. The weighted sum is normalized to a 0–100 scale. Thresholds for `LOW`, `MEDIUM`, and `HIGH` are configurable via `platform_settings` (key `RISK_SCORING`).

### 6.2 Partner risk

Calculated by [lib/partner-risk-scoring.ts](../../lib/partner-risk-scoring.ts) using a simpler model applied to partner-specific questionnaire tables.

### 6.3 Score persistence

Section scores are stored in `assessment_decision_section_scores`. The combined score and final risk level are stored in `assessment_decisions` and mirrored to `entities.risk_level` after decision.

---

## 7. Integrations overview

| Integration | Direction | Purpose | Spec |
|---|---|---|---|
| Google OAuth | Inbound | User authentication | [google-oauth.md](../integrations/google-oauth.md) |
| Gmail API | Outbound | Send questionnaire emails | [google-oauth.md](../integrations/google-oauth.md) |
| Typeform | Bidirectional | Questionnaire distribution and response ingestion | [typeform.md](../integrations/typeform.md) |
| Jira | Bidirectional | Vendor/partner intake and operational sync | [jira.md](../integrations/jira.md) |
| Slack | Outbound | Risk alerts and questionnaire notifications | [slack.md](../integrations/slack.md) |
| Google Sheets | Inbound | Alternative questionnaire answer source (CSV) | [google-sheets.md](../integrations/google-sheets.md) |

---

## 8. Security model

### 8.1 Authentication

- Google SSO only. No username/password. No local bypass in any environment.
- Session is signed with `DD_AUTH_SECRET` and stored as an `httpOnly`, `Secure`, `SameSite` cookie.
- Allowlist enforced at OAuth callback: domain (`ALLOWED_GOOGLE_DOMAINS`) and/or email (`ALLOWED_GOOGLE_EMAILS`).

### 8.2 Authorization

- RBAC enforced server-side on every API route via `lib/access-control.ts`.
- Settings routes require `canManageSettings` permission (ADMIN only).
- Entity write operations require appropriate group membership.

### 8.3 Webhook security

- Typeform: HMAC-SHA256 signature over the raw request body. Production rejects unsigned mode.
- Jira: shared secret in `x-jira-webhook-secret` header. Required in production (missing → 503).

### 8.4 Bearer token routes

Cron jobs and health diagnostics require:

```
Authorization: Bearer <CRON_SECRET>
```

`INTERNAL_TOOL_SECRET` is accepted as an alternative. Query-string secrets are explicitly rejected.

### 8.5 URL validation

Questionnaire URLs must be HTTPS on `*.typeform.com` and include the form ID in the path or query. Validated in [lib/questionnaire-url.ts](../../lib/questionnaire-url.ts).

---

## 9. Scheduled jobs

| Job | Schedule | Endpoint | Purpose |
|---|---|---|---|
| Typeform response integrity | Daily (Vercel cron) | `POST /api/cron/typeform-response-integrity` | Detects and repairs assessments whose Typeform response was received but not fully stored |

---

## 10. Non-functional requirements

| Requirement | Target |
|---|---|
| Deployment | Vercel serverless (zero-downtime deploys) |
| Database | Neon PostgreSQL (pooled, serverless-compatible, auto-scaling) |
| Session storage | Signed cookies (no server-side session store) |
| Secrets | All secrets via environment variables, never in the database or repository |
| Webhook idempotency | `typeform_webhook_events` deduplicates by `event_id` |
| Request size | Typeform webhook bodies > 2 MiB are rejected (413) |

---

## 11. Known gaps and backlog

See [docs/engineering/backlog.md](../engineering/backlog.md) for the current prioritized list. Key gaps as of 2026-05-12:

- Dashboard metrics are not yet driven by live database queries.
- No CI pipeline (lint + typecheck + tests).
- No structured logging or observability for webhooks.
- `lib/data.ts` is large and mixes several domains; should be split.
