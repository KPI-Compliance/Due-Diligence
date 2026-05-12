# ADR 001: Next.js with App Router

**Date:** 2024 (project inception)  
**Status:** Accepted  
**Deciders:** TecGRC engineering team

---

## Context

The platform needs to be a full-stack web application that:
- Serves a multi-page authenticated UI (vendors, partners, settings, dashboard).
- Exposes API endpoints for webhooks (Jira, Typeform), cron jobs, health checks, and internal operations.
- Deploys as a serverless application (Vercel).
- Has no separate backend service — all logic runs in the same deployment unit.

---

## Decision

Use **Next.js 16 with the App Router** as the full-stack framework.

---

## Rationale

| Criterion | Next.js App Router |
|---|---|
| Full-stack in one project | API routes (`app/api/`) and UI pages coexist in the same codebase and deploy |
| SSR by default | Server components reduce client bundle size and allow server-side data fetching with no separate API call |
| Vercel-native | Zero-config deployment; Vercel handles serverless functions, cron, CDN, and environment variables automatically |
| TypeScript-first | Excellent TypeScript support out of the box; no additional configuration needed |
| Webhook hosting | API route handlers work as serverless functions — each webhook is isolated and independently scalable |
| No separate API service | Eliminates the need to deploy and maintain a separate Express/Fastify server |

---

## Alternatives considered

| Alternative | Why rejected |
|---|---|
| Next.js Pages Router | App Router is the current standard and has better streaming, layouts, and server component support |
| Express.js + React SPA | Requires two deployment units (API server + static site host); more operational overhead |
| Remix | Similar full-stack model but less mature on Vercel and smaller ecosystem |
| Plain Express + no UI framework | Too much boilerplate for a data-heavy internal tool; no SSR |

---

## Consequences

- **Positive:** Single deployment, shared types between API and UI, Vercel cron native support, easy environment variable management.
- **Positive:** Server components eliminate client-side data fetching complexity for most pages.
- **Negative:** App Router patterns (server vs. client components, layouts, `use server` actions) require discipline to avoid accidental client-side data leaks or over-rendering.
- **Negative:** Large `lib/data.ts` file is a natural consequence of centralizing all server-side queries — plan to split it as the codebase grows (see backlog).
- **Watch:** Next.js major version upgrades may introduce breaking changes in the App Router API.
