ALTER TABLE typeform_forms
ADD COLUMN IF NOT EXISTS section_rules JSONB NOT NULL DEFAULT '{}'::jsonb;
