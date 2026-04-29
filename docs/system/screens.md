# Screens

## Login

Route:
- `/`

Purpose:
- authenticate the user with Google SSO (allowlisted domains/emails).

Visible features:
- Google login button
- active session card when already authenticated

## Dashboard

Route:
- `/dashboard`

Purpose:
- provide a high-level operational snapshot.

Visible features:
- summary cards
- risk distribution chart
- assessment completion chart
- recent activity table

Notes:
- current implementation is largely static mock data.

## Vendors List

Route:
- `/vendors`

Purpose:
- list vendors and allow operational filtering.

Visible features:
- search by vendor or Jira ticket
- filters for questionnaire status, risk level, and company group
- summary cards for pending/reviewed/critical counts
- table with company, Jira ticket, company group, workflow statuses, red team status, final risk, and last review

## Vendor Detail

Route:
- `/vendors/[id]`

Tabs:
- `Overview`
- `Internal Questionnaire`
- `External Questionnaire`
- `Decision`

Visible features:
- overview block with vendor metadata
- internal focal point block
- timeline
- vendor external questionnaire card
- questionnaire response cards
- decision summary and final verdict controls

## Partners List

Route:
- `/partners`

Purpose:
- list partners and allow operational filtering.

Visible features:
- search by partner or Jira ticket
- filters for assessment status, risk level, and owner
- summary cards for pending/completed/critical counts
- table with company, Jira ticket, company group, assessment status, red team status, final risk, and last review

## Partner Detail

Route:
- `/partners/[id]`

Tabs:
- `Overview`
- `External Questionnaire`
- `Decision`

Visible features:
- overview block with partner metadata
- internal focal point block
- timeline
- external questionnaire sections
- analyst evaluation controls
- decision summary and final verdict controls

## Settings

Route:
- `/settings`

Tabs:
- `Geral`
- `Usuários e Perfis`
- `Integrações`
- `Pontuação de Risco`
- `Notificações`

Visible features:
- organization and SLA settings
- user/profile placeholder table
- integration status cards and configuration modals
- risk scoring configuration for partners and vendors
- notification settings

## Typeform Forms Settings

Route:
- `/settings/typeform-forms`

Purpose:
- manage Typeform form mappings and question sections.

Visible features:
- form catalog
- form activation/deletion
- form metadata and workflow selection
- hidden field configuration
- question range mapping by section
- question-to-section mapping
- weight configuration

## Redirected Routes

- `/assessments`
  Redirects to `/dashboard`.
- `/reviews`
  Redirects to `/dashboard`.

## API-Oriented Flows Visible in the UI

- `Typeform webhook`
  Configuration and webhook URL are exposed in settings.
- `Jira webhook`
  Configuration and queue URLs are exposed in settings.
- `Google Sheets`
  Configuration screens expose service accounts and spreadsheet routing.

## Notes

- Most pages are workspace-style screens built from `PageContainer`, `SectionCard`, `EntityWorkspace`, and related UI primitives.
- Detail views are data-rich and switch behavior based on `kind` and active tab.
