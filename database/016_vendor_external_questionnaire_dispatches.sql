CREATE TABLE IF NOT EXISTS vendor_external_questionnaire_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID,
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  form_id TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_lookup
  ON vendor_external_questionnaire_dispatches (form_id, recipient_email, sent_at DESC);

CREATE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_assessment
  ON vendor_external_questionnaire_dispatches (assessment_id, sent_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_unique_send
  ON vendor_external_questionnaire_dispatches (assessment_id, form_id, recipient_email, sent_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_dispatch_id
  ON vendor_external_questionnaire_dispatches (dispatch_id)
  WHERE dispatch_id IS NOT NULL;
