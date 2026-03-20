ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS jira_issue_created_at TIMESTAMPTZ;
