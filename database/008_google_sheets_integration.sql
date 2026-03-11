DO $$ BEGIN
  ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'GOOGLE_SHEETS';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO integration_settings (provider, enabled, config)
VALUES (
  'GOOGLE_SHEETS',
  false,
  jsonb_build_object(
    'service_account_email', '',
    'spreadsheet_url', '',
    'worksheet_name', 'Página 1'
  )
)
ON CONFLICT (provider) DO NOTHING;
