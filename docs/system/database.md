# Database

## Overview

The database is built around entities, assessments, questionnaire responses, decisions, settings, and integration configuration.

## Core Tables

### `users`

Purpose:
- stores application users and owners/analysts referenced by other tables.

Important columns:
- `id`
- `full_name`
- `email`
- `role_title`
- `created_at`
- `updated_at`

### `entities`

Purpose:
- stores vendors and partners.

Important columns:
- `id`
- `slug`
- `name`
- `kind` (`VENDOR` or `PARTNER`)
- `company_group` (`VTEX` or `WENI`)
- `domain`
- `segment`
- `category`
- `hq_location`
- `website`
- `contact_email`
- `description`
- `status`
- `risk_level`
- `risk_score`
- `subtitle`
- `status_label`
- `owner_user_id`
- `last_review_at`
- `jira_issue_key`
- `jira_issue_url`
- `jira_synced_at`
- `jira_form_data`

Notes:
- `segment` is still stored and used by the detail pages even though it is hidden from the Vendors table.
- `jira_form_data` stores raw Jira form payload data for detail views.

### `internal_focal_points`

Purpose:
- one internal focal point per entity.

Important columns:
- `entity_id`
- `full_name`
- `role_title`
- `area`
- `email`
- `phone`

### `assessments`

Purpose:
- stores assessment instances linked to entities.

Important columns:
- `entity_id`
- `analyst_user_id`
- `title`
- `status`
- `risk_level`
- `progress_percent`
- `sent_at`
- `responded_at`
- `due_at`
- `completed_at`
- `typeform_form_id`
- `typeform_response_token`
- `typeform_submitted_at`

### `assessment_question_responses`

Purpose:
- stores questionnaire answers at the assessment level.

Important columns:
- `assessment_id`
- `domain`
- `question_text`
- `answer_text`
- `review_status`

### `assessment_decisions`

Purpose:
- stores consolidated security, privacy, and compliance scoring and the final classification.

Important columns:
- `assessment_id`
- `security_score`
- `security_level`
- `privacy_score`
- `privacy_level`
- `compliance_score`
- `compliance_level`
- `combined_score`
- `classification`
- `selected_option`
- `conditions_for_approval`
- `mitigation_plan`
- `approval_expires_at`
- `finalized_at`
- `finalized_by_user_id`

### `assessment_notes`

Purpose:
- stores analyst notes by section.

Important columns:
- `assessment_id`
- `section`
- `notes`
- `recommendations`
- `author_user_id`

### `entity_risk_breakdowns`

Purpose:
- stores risk breakdown per entity and dimension.

Important columns:
- `entity_id`
- `dimension`
- `level`
- `score`

### `entity_timeline_events`

Purpose:
- stores entity lifecycle events shown on detail pages.

Important columns:
- `entity_id`
- `title`
- `note`
- `event_at`
- `sort_order`
- `is_current`

## Integration Tables

### `integration_settings`

Purpose:
- stores operational settings per provider.

Providers:
- `TYPEFORM`
- `JIRA`
- `SLACK`
- `GOOGLE_SHEETS`

Important columns:
- `provider`
- `enabled`
- `config`
- `validation_status`
- `last_validated_at`

### `typeform_webhook_events`

Purpose:
- idempotency store for Typeform webhooks.

Important columns:
- `event_id`
- `event_type`
- `form_id`
- `received_at`
- `payload`

### `typeform_forms`

Purpose:
- maps multiple Typeform forms to workflows and entity types.

Important columns:
- `name`
- `form_id`
- `entity_kind`
- `workflow`
- `hidden_assessment_field`
- `section_rules`
- `enabled`

### `typeform_form_question_mappings`

Purpose:
- maps individual Typeform questions to sections and weights.

Important columns:
- `typeform_form_config_id`
- `question_key`
- `question_ref`
- `question_text`
- `question_order`
- `section`
- `weight`

### `platform_settings`

Purpose:
- stores app-level settings by key.

Keys:
- `GENERAL`
- `RISK_SCORING`
- `NOTIFICATIONS`

Important columns:
- `key`
- `value`

### `partner_typeform_assessment_*_responses`

Purpose:
- stores partner questionnaire answers and analyst evaluations in multiple language/version variants.

Tables:
- `partner_typeform_assessment_en_responses`
- `partner_typeform_assessment_ptbr_responses`
- `partner_typeform_assessment_en_v2_responses`
- `partner_typeform_assessment_pt_v2_responses`

Important columns:
- `entity_id`
- `assessment_id`
- `jira_issue_key`
- `typeform_form_id`
- `typeform_response_token`
- `response_submitted_at`
- `respondent_email`
- `company_name`
- `question_order`
- `question_key`
- `question_text`
- `answer_text`
- `section`
- `analyst_evaluation`
- `analyst_observations`
- `analyst_user_id`
- `analyzed_at`
- `raw_answer`

## Seed Data

The file `database/002_seed_mock_data.sql` seeds mock users, entities, focal points, assessments, responses, risk breakdowns, timeline events, decisions, and notes.

## Observations

- The schema uses `updated_at` triggers across most operational tables.
- `entities.kind` separates vendors and partners.
- `assessment_status`, `risk_level`, `review_status`, `decision_option`, and other enums are the main domain vocabulary.
- Some tables are currently used mainly by the UI and integration flows; others are present for future expansion or historical compatibility.

## Hypotheses / Gaps

- The dashboard currently appears to rely on mock data, so no single table is the source of truth for its counters yet.
- Some partner response tables may represent migration history or form-version compatibility rather than a single canonical storage model.

