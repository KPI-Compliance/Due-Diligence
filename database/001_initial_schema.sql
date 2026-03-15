-- Due Diligence VTEX - Initial schema
-- Target: Neon Postgres
-- Safe to run multiple times (uses IF NOT EXISTS guards where possible)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE company_group AS ENUM ('VTEX', 'WENI');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE entity_kind AS ENUM ('VENDOR', 'PARTNER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE assessment_status AS ENUM ('PENDING', 'SENT', 'RESPONDED', 'IN_REVIEW', 'COMPLETED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE risk_level AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE review_status AS ENUM ('COMPLIANT', 'NEEDS_REVIEW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE decision_option AS ENUM ('APPROVED', 'APPROVED_WITH_RESTRICTIONS', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT UNIQUE,
  role_title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  kind entity_kind NOT NULL,
  company_group company_group NOT NULL,
  domain TEXT,
  segment TEXT,
  category TEXT,
  hq_location TEXT,
  website TEXT,
  contact_email TEXT,
  description TEXT,
  status assessment_status NOT NULL DEFAULT 'PENDING',
  risk_level risk_level,
  risk_score INTEGER,
  subtitle TEXT,
  status_label TEXT,
  owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  last_review_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entities_risk_score_range CHECK (risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100))
);

CREATE INDEX IF NOT EXISTS idx_entities_kind ON entities(kind);
CREATE INDEX IF NOT EXISTS idx_entities_company_group ON entities(company_group);
CREATE INDEX IF NOT EXISTS idx_entities_status ON entities(status);
CREATE INDEX IF NOT EXISTS idx_entities_risk_level ON entities(risk_level);

CREATE TABLE IF NOT EXISTS internal_focal_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL UNIQUE REFERENCES entities(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  role_title TEXT,
  area TEXT,
  email TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  analyst_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  status assessment_status NOT NULL DEFAULT 'PENDING',
  risk_level risk_level,
  progress_percent INTEGER NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessments_progress_range CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_assessments_entity_id ON assessments(entity_id);
CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
CREATE INDEX IF NOT EXISTS idx_assessments_analyst_user_id ON assessments(analyst_user_id);

CREATE TABLE IF NOT EXISTS assessment_question_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  question_text TEXT NOT NULL,
  answer_text TEXT,
  review_status review_status NOT NULL DEFAULT 'COMPLIANT',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_question_responses_assessment_id
  ON assessment_question_responses(assessment_id);

CREATE TABLE IF NOT EXISTS entity_risk_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  dimension TEXT NOT NULL,
  level risk_level NOT NULL,
  score INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT entity_risk_breakdowns_dimension_unique UNIQUE (entity_id, dimension),
  CONSTRAINT entity_risk_breakdowns_score_range CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_entity_risk_breakdowns_entity_id ON entity_risk_breakdowns(entity_id);

CREATE TABLE IF NOT EXISTS entity_timeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT,
  event_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entity_timeline_events_entity_id ON entity_timeline_events(entity_id);
CREATE INDEX IF NOT EXISTS idx_entity_timeline_events_sort_order ON entity_timeline_events(sort_order);

CREATE TABLE IF NOT EXISTS assessment_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  security_score NUMERIC(4,1),
  security_level risk_level,
  security_note TEXT,
  privacy_score NUMERIC(4,1),
  privacy_level risk_level,
  privacy_note TEXT,
  compliance_score NUMERIC(4,1),
  compliance_level risk_level,
  compliance_note TEXT,
  combined_score NUMERIC(4,1),
  classification TEXT,
  selected_option decision_option,
  conditions_for_approval TEXT,
  mitigation_plan TEXT,
  approval_expires_at DATE,
  finalized_at TIMESTAMPTZ,
  finalized_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT assessment_decisions_combined_score_range
    CHECK (combined_score IS NULL OR (combined_score >= 0 AND combined_score <= 10))
);

CREATE INDEX IF NOT EXISTS idx_assessment_decisions_finalized_by_user_id
  ON assessment_decisions(finalized_by_user_id);

CREATE TABLE IF NOT EXISTS assessment_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  notes TEXT,
  recommendations TEXT,
  author_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_notes_assessment_id ON assessment_notes(assessment_id);

-- Generic updated_at trigger
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND column_name = 'updated_at'
      AND table_name IN (
        'users',
        'entities',
        'internal_focal_points',
        'assessments',
        'assessment_question_responses',
        'entity_risk_breakdowns',
        'entity_timeline_events',
        'assessment_decisions',
        'assessment_notes'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_set_updated_at ON %I', t.table_name, t.table_name);
    EXECUTE format('CREATE TRIGGER trg_%I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t.table_name, t.table_name);
  END LOOP;
END $$;
