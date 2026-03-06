# Database Setup (Neon)

## 1) Run initial schema

Open your Neon project SQL Editor and execute:

- `database/001_initial_schema.sql`

## 2) Seed mock data

Execute:

- `database/002_seed_mock_data.sql`

The seed is idempotent (`ON CONFLICT`) and aligns with current UI mock data.

## 3) Optional quick validation

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

```sql
SELECT kind, company_group, status, count(*)
FROM entities
GROUP BY kind, company_group, status
ORDER BY kind, company_group, status;
```
