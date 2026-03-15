ALTER TABLE assessment_decisions
  ADD COLUMN IF NOT EXISTS security_score NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS privacy_score NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS compliance_score NUMERIC(4,1);
