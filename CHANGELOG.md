# Changelog

All notable changes to the Due Diligence Platform are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Full SDD documentation structure: `docs/spec/`, `docs/integrations/`, `docs/runbooks/`, `docs/adr/`
- `CLAUDE.md` — primary AI agent context file with project overview, invariants, and operating rules
- `docs/spec/platform-spec.md` — complete product specification including workflows, risk model, and security architecture
- `docs/integrations/typeform.md` — Typeform webhook and Admin API integration contract
- `docs/integrations/jira.md` — Jira webhook, REST API, and PDF enrichment contract
- `docs/integrations/slack.md` — Slack notification integration contract
- `docs/integrations/google-oauth.md` — Google OAuth and Gmail API integration contract
- `docs/integrations/google-sheets.md` — Google Sheets intake source integration contract
- `docs/runbooks/deploy.md` — safe deploy procedure with pre/post-deploy checklists
- `docs/runbooks/database-migration.md` — SQL migration conventions and procedures
- `docs/runbooks/incident-response.md` — P1/P2/P3 incident scenarios with step-by-step remediation
- `docs/adr/001-nextjs-app-router.md` — ADR for Next.js App Router adoption
- `docs/adr/002-neon-postgres.md` — ADR for Neon PostgreSQL adoption

---

## [2026-05] — Security and partner sync improvements

### Fixed
- Typeform sync: no longer blocks match by email when company name differs from registration (`904cd64`)
- Jira: do not use assignee as vendor VTEX email (`287c9ef`)

### Security
- Webhooks, health endpoints, and vendor send routes hardened (`88ddd1b`)
- Dev auth bypass removed; no local login shortcut in any environment (`af83d01`)

### Added
- `typeform_forbidden` status with diagnostic body when Typeform returns 403 (`5b294e9`)
- Partner Typeform: scan all mapped forms after the four official ones (`5a9b62d`)
- Partner Typeform: manual sync, official match, and database linking (`92d41be`)

---

## [2026-04] — Vendor request PDF and sync improvements

### Fixed
- Auth: use `<a>` tag for Google login to avoid Next.js RSC/CORS prefetch issues (`df6ff95`)
- Jira: vendor PDF sync, display name, and config cleanup (`ff2f181`)
- Vendor external review hydration and risk scoring recalculation (`d9ab9a3`)
- Vendor external questionnaire review editing and persistence (`3b1d763`)
- Vendor detail 500 caused by lazy-loading pdf parser (`4ef5042`)

### Changed
- Vendor request PDF: only process correctly named PDFs; keep highest-score attachment among matches (`799b377`)
- Export and New buttons removed from vendors and partners pages (`4343f1c`)

---

## [2026-03] — Assessment workflow and observability

### Added
- Automate internal questionnaire dispatch and harden vendor Jira sync (`b6ddf50`)
- Track logged analyst on partner section reviews; show email in timeline (`3e2bcfb`)
- Typeform response integrity alerts and daily auto-repair cron (`ce6a42e`)
- Store Typeform question titles in webhook responses (`cdf5115`)
- Rehydrate linked Typeform answers and auto-select populated section (`4ef5042`)

### Changed
- Vendor detail risk display refined; decision workflow auto-save improved (`eabd6b9`)

---

## [Initial release] — Platform foundation

### Added
- Next.js 16 App Router application with Google SSO authentication
- Vendor and partner entity management with Jira intake webhook
- Typeform external questionnaire distribution and response ingestion
- Internal questionnaire dispatch via Slack DM + Google Forms
- Google Sheets as alternative questionnaire answer source
- Vendor and partner risk scoring with weighted question model
- Assessment decision recording with security/privacy/compliance scores
- Settings UI: integrations, Typeform form catalog, risk scoring thresholds, notifications
- Health diagnostic endpoints: `/api/health/db`, `/api/health/google-sheets`, `/api/health/typeform-responses`, `/api/health/typeform-hidden`
- RBAC: ADMIN, TECGRC, COMPLIANCE, PRIVACY, PROCUREMENT groups
- Neon PostgreSQL schema with 19+ incremental migrations
- Vercel deployment with cron support
- Backfill scripts for historical data recovery
