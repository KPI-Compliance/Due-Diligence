-- Backfill support for analyst review fields on vendor external questionnaire responses.
-- This keeps assessment_question_responses aligned with the UI workflow that stores
-- analyst evaluation and observations per question.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'analyst_evaluation_status'
  ) THEN
    CREATE TYPE analyst_evaluation_status AS ENUM (
      'NOT_EVALUATED',
      'NA',
      'DOES_NOT_MEET',
      'PARTIALLY',
      'FULLY'
    );
  END IF;
END $$;

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS analyst_evaluation analyst_evaluation_status;

ALTER TABLE assessment_question_responses
  ALTER COLUMN analyst_evaluation SET DEFAULT 'NOT_EVALUATED';

UPDATE assessment_question_responses
SET analyst_evaluation = 'NOT_EVALUATED'
WHERE analyst_evaluation IS NULL;

ALTER TABLE assessment_question_responses
  ALTER COLUMN analyst_evaluation SET NOT NULL;

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS analyst_observations TEXT;

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS analyst_user_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'assessment_question_responses_analyst_user_fk'
  ) THEN
    ALTER TABLE assessment_question_responses
      ADD CONSTRAINT assessment_question_responses_analyst_user_fk
      FOREIGN KEY (analyst_user_id)
      REFERENCES users(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE assessment_question_responses
  ADD COLUMN IF NOT EXISTS analyzed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_analyst_user_id
  ON assessment_question_responses (analyst_user_id);
