-- Add question_order to assessment_question_responses so vendor questions
-- are displayed in the same order as defined in typeform_form_question_mappings,
-- matching the behaviour already in place for partner tables.

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS question_order INTEGER;

-- Backfill order for existing rows via text match through the mapping table.
-- Uses a subquery to avoid referencing the update target inside a FROM JOIN,
-- which silently matches 0 rows in PostgreSQL.
UPDATE assessment_question_responses
SET question_order = sub.mapping_order
FROM (
  SELECT
    aqr.id,
    m.question_order AS mapping_order
  FROM assessment_question_responses aqr
  JOIN assessments a
    ON a.id = aqr.assessment_id
  JOIN typeform_forms f
    ON f.form_id = a.typeform_form_id
  JOIN typeform_form_question_mappings m
    ON m.typeform_form_config_id = f.id
   AND lower(trim(m.question_text)) = lower(trim(aqr.question_text))
  WHERE aqr.question_order IS NULL
) sub
WHERE assessment_question_responses.id = sub.id;

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_question_order
  ON assessment_question_responses (assessment_id, question_order)
  WHERE question_order IS NOT NULL;
