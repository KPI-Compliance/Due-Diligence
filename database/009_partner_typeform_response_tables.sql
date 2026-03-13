DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'partner_questionnaire_section'
  ) THEN
    CREATE TYPE partner_questionnaire_section AS ENUM (
      'COMPLIANCE',
      'PRIVACY',
      'SECURITY',
      'UNCLASSIFIED'
    );
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS partner_typeform_assessment_en_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  jira_issue_key TEXT,
  typeform_form_id TEXT NOT NULL,
  typeform_response_token TEXT NOT NULL,
  response_submitted_at TIMESTAMPTZ,
  respondent_email TEXT,
  company_name TEXT,
  question_order INTEGER NOT NULL,
  question_key TEXT,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  section partner_questionnaire_section NOT NULL DEFAULT 'UNCLASSIFIED',
  analyst_evaluation analyst_evaluation_status NOT NULL DEFAULT 'NOT_EVALUATED',
  analyst_observations TEXT,
  analyst_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  raw_answer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_typeform_assessment_ptbr_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  jira_issue_key TEXT,
  typeform_form_id TEXT NOT NULL,
  typeform_response_token TEXT NOT NULL,
  response_submitted_at TIMESTAMPTZ,
  respondent_email TEXT,
  company_name TEXT,
  question_order INTEGER NOT NULL,
  question_key TEXT,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  section partner_questionnaire_section NOT NULL DEFAULT 'UNCLASSIFIED',
  analyst_evaluation analyst_evaluation_status NOT NULL DEFAULT 'NOT_EVALUATED',
  analyst_observations TEXT,
  analyst_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  raw_answer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_typeform_assessment_en_v2_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  jira_issue_key TEXT,
  typeform_form_id TEXT NOT NULL,
  typeform_response_token TEXT NOT NULL,
  response_submitted_at TIMESTAMPTZ,
  respondent_email TEXT,
  company_name TEXT,
  question_order INTEGER NOT NULL,
  question_key TEXT,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  section partner_questionnaire_section NOT NULL DEFAULT 'UNCLASSIFIED',
  analyst_evaluation analyst_evaluation_status NOT NULL DEFAULT 'NOT_EVALUATED',
  analyst_observations TEXT,
  analyst_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  raw_answer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_typeform_assessment_pt_v2_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID REFERENCES entities(id) ON DELETE SET NULL,
  assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
  jira_issue_key TEXT,
  typeform_form_id TEXT NOT NULL,
  typeform_response_token TEXT NOT NULL,
  response_submitted_at TIMESTAMPTZ,
  respondent_email TEXT,
  company_name TEXT,
  question_order INTEGER NOT NULL,
  question_key TEXT,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  section partner_questionnaire_section NOT NULL DEFAULT 'UNCLASSIFIED',
  analyst_evaluation analyst_evaluation_status NOT NULL DEFAULT 'NOT_EVALUATED',
  analyst_observations TEXT,
  analyst_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  analyzed_at TIMESTAMPTZ,
  raw_answer JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_assessment_en_token
  ON partner_typeform_assessment_en_responses (typeform_response_token);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_ptbr_token
  ON partner_typeform_assessment_ptbr_responses (typeform_response_token);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_en_v2_token
  ON partner_typeform_assessment_en_v2_responses (typeform_response_token);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_pt_v2_token
  ON partner_typeform_assessment_pt_v2_responses (typeform_response_token);

CREATE INDEX IF NOT EXISTS idx_partner_assessment_en_assessment
  ON partner_typeform_assessment_en_responses (assessment_id, section, question_order);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_ptbr_assessment
  ON partner_typeform_assessment_ptbr_responses (assessment_id, section, question_order);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_en_v2_assessment
  ON partner_typeform_assessment_en_v2_responses (assessment_id, section, question_order);
CREATE INDEX IF NOT EXISTS idx_partner_assessment_pt_v2_assessment
  ON partner_typeform_assessment_pt_v2_responses (assessment_id, section, question_order);

DROP TRIGGER IF EXISTS trg_partner_typeform_assessment_en_set_updated_at ON partner_typeform_assessment_en_responses;
CREATE TRIGGER trg_partner_typeform_assessment_en_set_updated_at
BEFORE UPDATE ON partner_typeform_assessment_en_responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_typeform_assessment_ptbr_set_updated_at ON partner_typeform_assessment_ptbr_responses;
CREATE TRIGGER trg_partner_typeform_assessment_ptbr_set_updated_at
BEFORE UPDATE ON partner_typeform_assessment_ptbr_responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_typeform_assessment_en_v2_set_updated_at ON partner_typeform_assessment_en_v2_responses;
CREATE TRIGGER trg_partner_typeform_assessment_en_v2_set_updated_at
BEFORE UPDATE ON partner_typeform_assessment_en_v2_responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_partner_typeform_assessment_pt_v2_set_updated_at ON partner_typeform_assessment_pt_v2_responses;
CREATE TRIGGER trg_partner_typeform_assessment_pt_v2_set_updated_at
BEFORE UPDATE ON partner_typeform_assessment_pt_v2_responses
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
