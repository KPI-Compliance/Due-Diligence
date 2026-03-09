-- Generic key/value settings for platform configuration tabs

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_settings_updated_at
  ON platform_settings(updated_at DESC);

-- Seed defaults for current settings tabs
INSERT INTO platform_settings (key, value)
VALUES
  (
    'GENERAL',
    jsonb_build_object(
      'organization_name', 'Due Diligence VTEX',
      'primary_business_unit', 'VTEX',
      'platform_domain', 'https://due-diligence-eight.vercel.app',
      'sla_response_days', 10,
      'sla_review_days', 5,
      'default_risk_level', 'MEDIUM',
      'auto_create_assessment', true,
      'require_security_review', true
    )
  ),
  (
    'RISK_SCORING',
    jsonb_build_object(
      'security_weight', 50,
      'privacy_weight', 30,
      'compliance_weight', 20,
      'low_min', 80,
      'medium_min', 60,
      'high_min', 40,
      'critical_min', 0
    )
  ),
  (
    'NOTIFICATIONS',
    jsonb_build_object(
      'notify_on_responded', true,
      'notify_on_critical', true,
      'notify_on_overdue', false,
      'slack_channel', '#risk-alerts',
      'escalation_emails', 'risk@vtex.com, compliance@vtex.com'
    )
  )
ON CONFLICT (key) DO NOTHING;

-- Keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platform_settings_set_updated_at ON platform_settings;
CREATE TRIGGER trg_platform_settings_set_updated_at
BEFORE UPDATE ON platform_settings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
