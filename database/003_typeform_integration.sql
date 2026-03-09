-- Typeform integration support

ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS typeform_form_id TEXT,
  ADD COLUMN IF NOT EXISTS typeform_response_token TEXT,
  ADD COLUMN IF NOT EXISTS typeform_submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_assessments_typeform_response_token
  ON assessments(typeform_response_token);

CREATE TABLE IF NOT EXISTS typeform_webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT,
  form_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_typeform_webhook_events_received_at
  ON typeform_webhook_events(received_at DESC);
