ALTER TABLE typeform_form_question_mappings
  ADD COLUMN IF NOT EXISTS weight NUMERIC(8,2) NOT NULL DEFAULT 1;

ALTER TABLE typeform_form_question_mappings
  ADD CONSTRAINT typeform_form_question_mappings_weight_nonnegative
  CHECK (weight >= 0);
