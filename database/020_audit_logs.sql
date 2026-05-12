-- Migration 020: audit_logs table
-- Provides an immutable, append-only record of authentication and access events.
-- Required for LGPD Art. 10 (accountability) and ISO 27001:2022 A.8.15 (logging).

CREATE TABLE IF NOT EXISTS audit_logs (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type    TEXT        NOT NULL,
  actor_email   TEXT,
  actor_ip      TEXT,
  actor_ua      TEXT,
  result        TEXT        NOT NULL CHECK (result IN ('success', 'failure')),
  failure_reason TEXT,
  metadata      JSONB,
  occurred_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query patterns: by actor, by event type, and by time window
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email  ON audit_logs (actor_email, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type   ON audit_logs (event_type,  occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_occurred_at  ON audit_logs (occurred_at DESC);

-- Immutability: trigger blocks UPDATE and DELETE at the database level.
-- REVOKE is ineffective when the app role owns the table (PostgreSQL implicit owner privileges).
-- The trigger approach works regardless of role.
CREATE OR REPLACE FUNCTION audit_logs_prevent_modification()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs rows are immutable — modifications are not allowed';
END;
$$;

DROP TRIGGER IF EXISTS audit_logs_immutable ON audit_logs;
CREATE TRIGGER audit_logs_immutable
  BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_modification();
