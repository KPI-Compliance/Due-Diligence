-- Persistent settings for integrations and operational preferences

DO $$ BEGIN
  CREATE TYPE integration_provider AS ENUM ('TYPEFORM', 'JIRA', 'SLACK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS integration_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider integration_provider NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  validation_status TEXT,
  last_validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_settings_provider
  ON integration_settings(provider);

INSERT INTO integration_settings (provider, enabled, config)
VALUES
  ('TYPEFORM', false, jsonb_build_object('form_id', '', 'hidden_assessment_field', 'assessment_id', 'webhook_mode', 'signed')),
  ('JIRA', false, jsonb_build_object('base_url', '', 'project_key', '', 'issue_type', 'Task')),
  ('SLACK', false, jsonb_build_object('channel', '', 'notify_on_responded', true, 'notify_on_critical', true))
ON CONFLICT (provider) DO NOTHING;

-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_integration_settings_set_updated_at ON integration_settings;
CREATE TRIGGER trg_integration_settings_set_updated_at
BEFORE UPDATE ON integration_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
