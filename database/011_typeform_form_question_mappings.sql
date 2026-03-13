DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'typeform_question_section'
  ) THEN
    CREATE TYPE typeform_question_section AS ENUM (
      'COMMON',
      'COMPLIANCE',
      'PRIVACY',
      'SECURITY'
    );
  END IF;
END $$;

ALTER TYPE partner_questionnaire_section ADD VALUE IF NOT EXISTS 'COMMON';

CREATE TABLE IF NOT EXISTS typeform_form_question_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  typeform_form_config_id UUID NOT NULL REFERENCES typeform_forms(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  question_ref TEXT,
  question_text TEXT NOT NULL,
  question_order INTEGER NOT NULL,
  section typeform_question_section NOT NULL DEFAULT 'COMMON',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_typeform_form_question_mappings_unique_key
  ON typeform_form_question_mappings (typeform_form_config_id, question_key);

CREATE INDEX IF NOT EXISTS idx_typeform_form_question_mappings_order
  ON typeform_form_question_mappings (typeform_form_config_id, question_order);

DROP TRIGGER IF EXISTS trg_typeform_form_question_mappings_set_updated_at ON typeform_form_question_mappings;
CREATE TRIGGER trg_typeform_form_question_mappings_set_updated_at
BEFORE UPDATE ON typeform_form_question_mappings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
