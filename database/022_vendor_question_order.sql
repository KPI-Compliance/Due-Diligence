-- Add question_order to assessment_question_responses so vendor questions
-- are displayed in the same order as defined in typeform_form_question_mappings,
-- matching the behaviour already in place for partner tables.

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS question_order INTEGER;

-- Backfill order for existing rows via text match through the mapping table.
UPDATE assessment_question_responses aqr
SET question_order = m.question_order
FROM assessments a
JOIN typeform_forms f
  ON f.form_id = a.typeform_form_id
JOIN typeform_form_question_mappings m
  ON m.typeform_form_config_id = f.id
  AND lower(trim(m.question_text)) = lower(trim(aqr.question_text))
WHERE aqr.assessment_id = a.id
  AND aqr.question_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_question_order
  ON assessment_question_responses (assessment_id, question_order)
  WHERE question_order IS NOT NULL;
