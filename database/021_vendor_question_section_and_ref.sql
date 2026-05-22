-- Add question_ref and section to assessment_question_responses.
-- Enables explicit section classification for vendor questionnaire responses,
-- matching the behaviour already in place for partner tables.
-- New syncs will populate both columns from typeform_form_question_mappings.
-- The backfill below covers existing rows via text match.

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS question_ref TEXT;

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS section typeform_question_section;

-- Backfill section for existing rows using the question mapping table.
-- Joins through assessments → typeform_forms → typeform_form_question_mappings
-- on normalised question text. Rows with no match stay NULL (falls back to
-- keyword matching at query time, same as before).
UPDATE assessment_question_responses aqr
SET section = m.section
FROM assessments a
JOIN typeform_forms f
  ON f.form_id = a.typeform_form_id
JOIN typeform_form_question_mappings m
  ON m.typeform_form_config_id = f.id
  AND lower(trim(m.question_text)) = lower(trim(aqr.question_text))
WHERE aqr.assessment_id = a.id
  AND aqr.section IS NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_question_ref
  ON assessment_question_responses (question_ref)
  WHERE question_ref IS NOT NULL;
