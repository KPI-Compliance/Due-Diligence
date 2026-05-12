# ADR 002: Neon PostgreSQL as the database

**Date:** 2024 (project inception)  
**Status:** Accepted  
**Deciders:** TecGRC engineering team

---

## Context

The platform needs a relational database that:
- Stores entities, assessments, responses, settings, and integration state.
- Works reliably within Vercel serverless functions (cold starts, connection limits).
- Requires minimal operational maintenance.
- Supports standard PostgreSQL features (UUIDs, JSONB, triggers, enums).

---

## Decision

Use **Neon PostgreSQL** with the **pooled connection string** for application queries and the **unpooled connection string** for migrations and tooling.

---

## Rationale

| Criterion | Neon |
|---|---|
| Serverless-compatible | Neon's connection pooler (PgBouncer-compatible) handles the ephemeral connection pattern of serverless functions without exhausting PostgreSQL connection limits |
| Standard PostgreSQL | Full PostgreSQL compatibility — all standard features (triggers, JSONB, enums, CTEs) work without modification |
| Zero-maintenance | Managed service: no server provisioning, patching, or backup configuration |
| Vercel integration | Neon has a native Vercel integration for automatic `DATABASE_URL` injection |
| Free tier | Sufficient for development and early production traffic without cost |
| Branching (future) | Neon's database branching feature allows schema testing on isolated copies — useful for migration testing |

---

## Connection model

```
Vercel serverless function
  → DATABASE_URL (pooled, e.g., pooler.neon.tech)
  → Neon PgBouncer
  → Neon PostgreSQL

Local tooling / migrations
  → DATABASE_URL_UNPOOLED (direct, e.g., ep-<name>.neon.tech)
  → Neon PostgreSQL (direct)
```

The pooled URL is used for all application queries (`lib/db.ts`). The unpooled URL is used for `psql`, schema migrations, and backfill scripts where a persistent direct connection is needed.

---

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Supabase | More features (auth, storage) but heavier and more opinionated than needed; Neon is leaner for a pure-database use case |
| PlanetScale (MySQL) | MySQL lacks PostgreSQL features (JSONB, array types, native UUID) needed for the schema |
| Railway (Postgres) | Viable but fewer Vercel-specific integrations and less community tooling |
| AWS RDS | Requires VPC configuration to work securely with Vercel serverless; significantly more operational overhead |
| SQLite | Not suitable for serverless multi-instance deployments |

---

## Consequences

- **Positive:** Zero-config connection pooling for serverless; no connection exhaustion under normal load.
- **Positive:** Full PostgreSQL — existing SQL skills and tooling apply directly.
- **Negative:** Cold starts in Neon's free tier may cause occasional slow first queries (compute resumes from idle). Acceptable for an internal tool with predictable usage patterns.
- **Negative:** DDL operations (schema changes) must use the unpooled connection; the pooled connection may reject certain DDL commands.
- **Watch:** Neon free tier limits (compute hours, storage). Monitor via the Neon console as data grows.
- **Watch:** Connection string rotation in Neon requires updating `DATABASE_URL` and `DATABASE_URL_UNPOOLED` in Vercel immediately to avoid downtime.
