# CLAUDE.md — Due Diligence Platform

This file is the primary context for AI agents operating in this repository. Read it before touching any code, spec, or configuration.

## What this project is

A Next.js application used by VTEX and Weni to manage vendor and partner due diligence. It centralizes intake, questionnaire review, risk scoring, and decisioning for third-party relationships, and wires into the company's operational tools (Jira, Typeform, Slack, Gmail).

## Who uses it

| Role | What they do in the platform |
|---|---|
| `ADMIN` | Full access: settings, user management, all entities |
| `TECGRC` | Tech GRC analysts: assess vendors, review responses, record decisions |
| `COMPLIANCE` | Compliance reviewers: view and review assessments |
| `PRIVACY` | Privacy analysts: focused on privacy-related sections |
| `PROCUREMENT` | Procurement team: intake and operational coordination |

RBAC is defined in [lib/access-control.ts](lib/access-control.ts). Group membership is stored in `user_access_profiles`.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, SSR) |
| Language | TypeScript 5 (strict mode) |
| Database | PostgreSQL via Neon (pooled, serverless-compatible) |
| Frontend | React 19, TailwindCSS 4 |
| Session | Signed cookies (`DD_AUTH_SECRET`) |
| Deployment | Vercel (serverless functions + cron) |

## Critical files to understand first

| File | What it does |
|---|---|
| [lib/data.ts](lib/data.ts) | Central data layer — all entity/assessment queries |
| [lib/typeform-sync.ts](lib/typeform-sync.ts) | Processes Typeform webhook payloads into DB |
| [lib/jira.ts](lib/jira.ts) | Jira webhook parsing + REST enrichment + PDF extraction |
| [lib/access-control.ts](lib/access-control.ts) | RBAC: roles, permissions, group resolution |
| [lib/auth.ts](lib/auth.ts) | Google OAuth flow, session creation, allowlist enforcement |
| [lib/vendor-risk-scoring.ts](lib/vendor-risk-scoring.ts) | Vendor risk score calculation |
| [lib/partner-risk-scoring.ts](lib/partner-risk-scoring.ts) | Partner risk score calculation |
| [app/api/typeform/webhook/route.ts](app/api/typeform/webhook/route.ts) | Typeform inbound webhook |
| [app/api/jira/webhook/route.ts](app/api/jira/webhook/route.ts) | Jira inbound webhook |
| [database/](database/) | All SQL migrations, numbered 001–019+ |

## SDD documentation structure

```
docs/
├── spec/
│   └── platform-spec.md          # Full product specification (start here)
├── integrations/
│   ├── typeform.md                # Typeform webhook + Admin API contract
│   ├── jira.md                    # Jira webhook + REST + PDF enrichment
│   ├── slack.md                   # Slack notification contract
│   ├── google-oauth.md            # Google OAuth + Gmail API contract
│   └── google-sheets.md           # Google Sheets intake source contract
├── runbooks/
│   ├── deploy.md                  # Safe deploy procedure
│   ├── database-migration.md      # How to run SQL migrations
│   └── incident-response.md       # What to do when things break
├── adr/
│   ├── 001-nextjs-app-router.md   # Why Next.js App Router
│   └── 002-neon-postgres.md       # Why Neon PostgreSQL
├── system/
│   ├── overview.md                # Routes, flows, data sources
│   ├── database.md                # Schema details and table reference
│   ├── jira-vendor-field-sync.md  # Jira field parsing rules (detailed)
│   └── screens.md                 # UI screen inventory
├── agents/
│   ├── documentation-specialist.md
│   ├── engineering-specialist.md
│   └── security-remediation-specialist.md
├── engineering/
│   ├── backlog.md                 # Prioritized engineering backlog
│   └── review.md                  # Engineering review notes
└── security/
    ├── hardening-checklist.md     # Security hardening checklist
    ├── next-phase-plan.md         # Security roadmap
    └── review.md                  # Security review notes
```

## Agent operating rules (all agents)

1. **Read before writing.** Validate conclusions against real code before asserting behavior. Do not guess.
2. **Reference files.** When explaining a finding or decision, cite the exact file and line.
3. **Distinguish facts from hypotheses.** Use "confirmed:", "hypothesis:", or "recommendation:" prefixes when the distinction matters.
4. **No destructive changes without explicit request.** Never drop tables, delete files, or force-push without being explicitly asked.
5. **Think cross-cutting.** A change to `lib/data.ts` can affect frontend, API routes, cron jobs, and backfill scripts simultaneously.
6. **Secrets are sensitive.** Never log, echo, or embed real credentials. Treat `DD_AUTH_SECRET`, `TYPEFORM_WEBHOOK_SECRET`, `JIRA_WEBHOOK_SECRET`, `CRON_SECRET`, and OAuth tokens as confidential.
7. **Production-safe defaults.** When in doubt, write code that is safe in production (signed webhooks, Bearer auth, HTTPS-only URLs).

## Key invariants

- `JIRA_WEBHOOK_SECRET` is **required** in production. Missing → 503, no event processing.
- `TYPEFORM_WEBHOOK_SECRET` + signed mode is **required** in production. Unsigned mode → 403.
- `DD_AUTH_SECRET` is **required** at all times for session signing.
- Cron and health routes require `Authorization: Bearer <CRON_SECRET>` (or `INTERNAL_TOOL_SECRET`). No anonymous access, no query-string secrets.
- External questionnaire URLs must be HTTPS on a `*.typeform.com` host and include the form ID.
- Typeform file proxy validates session + form/response ownership before proxying.

## Assessment status machine

```
PENDING → SENT → RESPONDED → IN_REVIEW → COMPLETED
```

- `PENDING`: Entity exists, no questionnaire sent.
- `SENT`: External questionnaire dispatched to vendor/partner.
- `RESPONDED`: Typeform webhook received and stored.
- `IN_REVIEW`: Analyst is reviewing responses (evaluation in progress).
- `COMPLETED`: Decision recorded.

## Risk levels

`LOW` | `MEDIUM` | `HIGH` — calculated from weighted section scores in `vendor-risk-scoring.ts` and `partner-risk-scoring.ts`. Thresholds are configurable via `platform_settings` (`RISK_SCORING` key).

## Environment variables

See [.env.example](.env.example) for the full list with descriptions. The most critical ones:

```
DD_AUTH_SECRET            # Session signing (always required)
DATABASE_URL              # Neon pooled connection (always required)
JIRA_WEBHOOK_SECRET       # Jira webhook auth (required in production)
TYPEFORM_WEBHOOK_SECRET   # Typeform webhook signing (required in production)
CRON_SECRET               # Bearer token for cron + health routes
GOOGLE_CLIENT_ID          # Google OAuth
GOOGLE_CLIENT_SECRET      # Google OAuth
```

## Output format for agents

Every agent response should include:

1. **Summary** — what was analyzed or changed (2–5 sentences).
2. **Affected files** — list with file paths.
3. **Remaining risks or gaps** — what was not addressed.
4. **Next steps** — concrete, ordered recommendations.
