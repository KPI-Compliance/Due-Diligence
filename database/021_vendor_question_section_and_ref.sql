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
-- Uses a subquery to avoid referencing the update target inside a FROM JOIN,
-- which silently matches 0 rows in PostgreSQL.
UPDATE assessment_question_responses
SET section = sub.mapping_section::typeform_question_section
FROM (
  SELECT
    aqr.id,
    m.section::text AS mapping_section
  FROM assessment_question_responses aqr
  JOIN assessments a
    ON a.id = aqr.assessment_id
  JOIN typeform_forms f
    ON f.form_id = a.typeform_form_id
  JOIN typeform_form_question_mappings m
    ON m.typeform_form_config_id = f.id
   AND lower(trim(m.question_text)) = lower(trim(aqr.question_text))
  WHERE aqr.section IS NULL
) sub
WHERE assessment_question_responses.id = sub.id;

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_question_ref
  ON assessment_question_responses (question_ref)
  WHERE question_ref IS NOT NULL;
