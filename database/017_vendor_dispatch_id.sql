ALTER TABLE vendor_external_questionnaire_dispatches
  ADD COLUMN IF NOT EXISTS dispatch_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_dispatch_id
  ON vendor_external_questionnaire_dispatches (dispatch_id)
  WHERE dispatch_id IS NOT NULL;
