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

-- Prevent UPDATE and DELETE so the log is truly immutable
-- (revoke via: REVOKE UPDATE, DELETE ON audit_logs FROM <app_role>;)
-- NOTE: run the REVOKE against your Neon app role after applying this migration.
