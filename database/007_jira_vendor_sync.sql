-- Jira issue -> entity sync support

ALTER TABLE entities
  ADD COLUMN IF NOT EXISTS jira_issue_key TEXT,
  ADD COLUMN IF NOT EXISTS jira_issue_url TEXT,
  ADD COLUMN IF NOT EXISTS jira_synced_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entities_jira_issue_key
  ON entities(jira_issue_key);
