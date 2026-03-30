-- User access profiles for RBAC (admin and team-based permissions)

CREATE TABLE IF NOT EXISTS user_access_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  access_group TEXT NOT NULL CHECK (access_group IN ('ADMIN', 'TECGRC', 'COMPLIANCE', 'PRIVACY', 'PROCUREMENT')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_access_profiles_email_lower
  ON user_access_profiles (lower(email));

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_group
  ON user_access_profiles (access_group);

CREATE INDEX IF NOT EXISTS idx_user_access_profiles_active
  ON user_access_profiles (is_active);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE proname = 'set_updated_at'
  ) THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_user_access_profiles_set_updated_at ON user_access_profiles';
    EXECUTE 'CREATE TRIGGER trg_user_access_profiles_set_updated_at BEFORE UPDATE ON user_access_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at()';
  END IF;
END
$$;

