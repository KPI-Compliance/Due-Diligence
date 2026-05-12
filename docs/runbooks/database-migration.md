# Runbook: Database Migration

**Database:** Neon PostgreSQL  
**Migration style:** Numbered SQL files, manually applied  
**Migration directory:** `database/`

---

## Overview

Migrations are plain SQL files named sequentially (`001_initial_schema.sql`, `002_seed_mock_data.sql`, ...). There is no migration framework — scripts are applied manually using `psql` or Neon's SQL editor. The numbering order determines the application order and must be respected.

---

## Migration file conventions

| Convention | Rule |
|---|---|
| Naming | `NNN_descriptive_name.sql` where `NNN` is zero-padded (e.g., `020_add_...`) |
| Idempotency | Always use `IF NOT EXISTS`, `IF EXISTS`, `OR REPLACE`, or explicit guards |
| Additive only | Never drop columns or tables that are still referenced by code |
| Backward-compatible | Code that will be deployed must run correctly against both old and new schema |

---

## How to apply a migration

### Option 1: Neon SQL Editor (recommended for production)

1. Open [Neon Console](https://console.neon.tech) → your project → SQL Editor.
2. Paste the migration SQL.
3. Run it.
4. Verify by inspecting the affected table with a `SELECT` or `\d table_name`.

### Option 2: psql via DATABASE_URL_UNPOOLED

Use the **unpooled** connection string for direct schema operations (pooled connections don't support DDL reliably in some contexts).

```bash
psql "$DATABASE_URL_UNPOOLED" -f database/020_your_migration.sql
```

### Option 3: Neon CLI

```bash
neon sql --project-id <project-id> < database/020_your_migration.sql
```

---

## Migration order

Apply files in ascending numeric order. Never skip or reorder.

```
001_initial_schema.sql
002_seed_mock_data.sql
003_typeform_integration.sql
004_settings_configuration.sql
005_typeform_multiple_forms.sql
006_platform_settings.sql
007_jira_vendor_sync.sql
008_google_sheets_integration.sql
009_partner_typeform_response_tables.sql
010 … 019 (incremental changes)
```

Check the current highest number in `database/` before creating a new one.

---

## Writing a new migration

1. Create the file: `database/NNN_what_it_does.sql` (next available number).
2. Add a comment block at the top:

```sql
-- Migration: NNN_what_it_does
-- Date: YYYY-MM-DD
-- Purpose: <one-line description>
```

3. Write idempotent SQL:

```sql
-- Adding a column (safe to re-run)
ALTER TABLE entities ADD COLUMN IF NOT EXISTS new_field TEXT;

-- Adding a table (safe to re-run)
CREATE TABLE IF NOT EXISTS new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adding an index (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_entities_new_field ON entities (new_field);
```

4. Test against a development database before applying to production.

---

## Pre-migration checklist

- [ ] The SQL is idempotent (safe to re-run if something fails mid-way).
- [ ] The change is backward-compatible with the current deployed code.
- [ ] If dropping a column or table: confirm nothing in the codebase references it.
- [ ] If adding a NOT NULL column: provide a default or backfill existing rows.
- [ ] The migration has been tested against a copy of the production schema.

---

## Post-migration verification

After applying a migration:

```bash
# Check health
curl -H "Authorization: Bearer <CRON_SECRET>" https://your-app.vercel.app/api/health/db

# Verify the table/column exists (via psql)
psql "$DATABASE_URL_UNPOOLED" -c "\d entities"
```

---

## Backfill scripts

For data migrations (not schema changes), use the scripts in `scripts/`:

```bash
npm run backfill:partner-typeform      # Sync historical Typeform responses for partners
npm run backfill:partner-risk-scores   # Recalculate partner risk scores
npm run backfill:vendor-risk-scores    # Recalculate vendor risk scores
npm run backfill:vendor-jira-form-fields  # Re-read Jira and merge PDF fields
npm run backfill:vendor-jira-reporter  # Backfill Jira reporter info
```

Backfill scripts use `DATABASE_URL_UNPOOLED` (or `DATABASE_URL` as fallback) and can be run locally with production credentials if needed.

---

## Emergency rollback

There is no automatic migration rollback. If a migration must be reversed:

1. Write a compensating migration that undoes the change (e.g., drop the added column).
2. Apply the compensating migration immediately.
3. Document what happened in the migration file as a comment.

Do not delete migration files that have already been applied in production — they are a historical record.

---

## Access control

Only engineers with production database credentials should apply migrations. Credentials are:

- `DATABASE_URL` — pooled connection (Vercel env var, do not use for migrations).
- `DATABASE_URL_UNPOOLED` — direct connection (for tooling and migrations).

Neither should be committed to the repository. Retrieve them from Vercel project settings or the Neon console.
