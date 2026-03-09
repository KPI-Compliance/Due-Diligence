-- Support multiple Typeform forms per workflow/entity

CREATE TABLE IF NOT EXISTS typeform_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  form_id TEXT NOT NULL UNIQUE,
  entity_kind entity_kind,
  workflow TEXT NOT NULL DEFAULT 'security_review',
  hidden_assessment_field TEXT NOT NULL DEFAULT 'assessment_id',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_typeform_forms_enabled ON typeform_forms(enabled);
CREATE INDEX IF NOT EXISTS idx_typeform_forms_entity_kind ON typeform_forms(entity_kind);
CREATE INDEX IF NOT EXISTS idx_typeform_forms_workflow ON typeform_forms(workflow);

-- keep updated_at fresh
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_typeform_forms_set_updated_at ON typeform_forms;
CREATE TRIGGER trg_typeform_forms_set_updated_at
BEFORE UPDATE ON typeform_forms
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
