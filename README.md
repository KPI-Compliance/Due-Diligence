# Due Diligence Platform

Vendor and partner due diligence platform for VTEX and Weni — intake, questionnaires, risk scoring, and operational integrations in one workspace.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in your values
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Login requires a Google account in the configured allowlist.

---

## Documentation

### Start here

| Document | Description |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | AI agent context: project overview, invariants, operating rules |
| [docs/spec/platform-spec.md](./docs/spec/platform-spec.md) | Full product specification: workflows, risk model, security architecture |
| [CHANGELOG.md](./CHANGELOG.md) | History of notable changes |

### Integrations

| Integration | Document |
|---|---|
| Typeform | [docs/integrations/typeform.md](./docs/integrations/typeform.md) |
| Jira | [docs/integrations/jira.md](./docs/integrations/jira.md) |
| Slack | [docs/integrations/slack.md](./docs/integrations/slack.md) |
| Google OAuth + Gmail | [docs/integrations/google-oauth.md](./docs/integrations/google-oauth.md) |
| Google Sheets | [docs/integrations/google-sheets.md](./docs/integrations/google-sheets.md) |

### Runbooks

| Runbook | Description |
|---|---|
| [docs/runbooks/deploy.md](./docs/runbooks/deploy.md) | Safe deploy procedure, rollback, post-deploy verification |
| [docs/runbooks/database-migration.md](./docs/runbooks/database-migration.md) | How to write and apply SQL migrations |
| [docs/runbooks/incident-response.md](./docs/runbooks/incident-response.md) | Step-by-step incident remediation for common failure scenarios |

### Architecture decisions

| ADR | Decision |
|---|---|
| [docs/adr/001-nextjs-app-router.md](./docs/adr/001-nextjs-app-router.md) | Why Next.js with App Router |
| [docs/adr/002-neon-postgres.md](./docs/adr/002-neon-postgres.md) | Why Neon PostgreSQL |

### System reference

| Document | Description |
|---|---|
| [docs/system/overview.md](./docs/system/overview.md) | Routes, flows, data sources |
| [docs/system/database.md](./docs/system/database.md) | Schema and table reference |
| [docs/system/jira-vendor-field-sync.md](./docs/system/jira-vendor-field-sync.md) | Jira field parsing rules (PDF + REST layers) |
| [docs/system/screens.md](./docs/system/screens.md) | UI screen inventory |
| [database/README.md](./database/README.md) | Migration list and database setup guide |

### Agents and engineering

| Document | Description |
|---|---|
| [AGENTS.md](./AGENTS.md) | Agent coordination: roles, rules, output format |
| [docs/agents/](./docs/agents/) | Per-agent instruction files |
| [docs/engineering/backlog.md](./docs/engineering/backlog.md) | Prioritized engineering backlog |
| [docs/security/hardening-checklist.md](./docs/security/hardening-checklist.md) | Security hardening checklist |

---

## Environment variables

Copy `.env.example` to `.env.local`. The critical ones:

```bash
DATABASE_URL="postgresql://..."           # Neon pooled connection
DD_AUTH_SECRET="..."                      # Session signing secret (always required)
GOOGLE_CLIENT_ID="..."                    # Google OAuth
GOOGLE_CLIENT_SECRET="..."               # Google OAuth
GOOGLE_OAUTH_REDIRECT_URI="http://localhost:3000/api/auth/callback/google"
ALLOWED_GOOGLE_DOMAINS="vtex.com"        # Login allowlist
JIRA_WEBHOOK_SECRET="..."                # Required in production
TYPEFORM_WEBHOOK_SECRET="..."            # Required in production
CRON_SECRET="..."                         # Bearer token for cron + health routes
```

See [.env.example](./.env.example) for the full list with descriptions.

---

## Key commands

```bash
npm run dev          # Development server
npm run build        # Production build
npm run typecheck    # TypeScript validation
npm run lint         # ESLint

# Backfill scripts
npm run backfill:vendor-jira-form-fields
npm run backfill:vendor-risk-scores
npm run backfill:partner-risk-scores
npm run backfill:partner-typeform
```

---

## Deployment

Deployed on Vercel. Push to `main` triggers an automatic production deploy.

Before deploying: run `npm run typecheck && npm run build`. After deploying: verify health endpoints and webhook connectivity. Full procedure: [docs/runbooks/deploy.md](./docs/runbooks/deploy.md).

---

## Security

- Webhook secrets (`JIRA_WEBHOOK_SECRET`, `TYPEFORM_WEBHOOK_SECRET`) are **required in production**.
- Cron and health endpoints require `Authorization: Bearer <CRON_SECRET>`.
- No dev auth bypass exists in any environment — login is always via Google OAuth.
- Full security checklist: [docs/security/hardening-checklist.md](./docs/security/hardening-checklist.md).
