-- Persist raw Jira form fields used by Vendor/Partner detail pages

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS jira_form_data JSONB NOT NULL DEFAULT '{}'::jsonb;
