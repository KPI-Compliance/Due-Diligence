# Jira vendor field sync (webhook + PDF)

This document describes how vendor intake fields (vendor email, VTEX responsible, scope, priority, CAP number, company, language, display name) reach the `entities` row and the vendor overview UI, and what must be true for parsing to succeed.

## Where it runs

- **Webhook:** `app/api/jira/webhook/route.ts` — on supported Jira issue events, after building the entity from the payload.
- **Core logic:** `lib/jira.ts` — `extractEntityFromJiraIssue`, `enrichVendorFieldsFromJiraIssue`, `enrichVendorFieldsFromJiraAttachments` (PDF path).
- **Backfill (optional):** `scripts/backfill-vendor-jira-form-fields.mjs` — re-reads Jira and merges PDF-derived fields for existing vendors.

## Three layers (in order of relevance for “missing fields”)

1. **Webhook payload** (`extractEntityFromJiraIssue`)  
   Walks the JSON for known labels and optional automation blocks (`vendor_intake`, etc.). Jira often sends a **slim** issue object: Proforma / request form values may not appear here in a shape the code recognizes.

2. **Jira REST + Service Desk request** (`enrichVendorFieldsFromJiraIssue`)  
   Loads the issue with expanded fields and tries `rest/servicedeskapi/request/...?expand=requestFieldValues`. Fills gaps when the API returns field values the heuristics can match.

3. **PDF attachments** (`enrichVendorFieldsFromJiraAttachments` → `extractVendorFieldsFromAttachmentPdf`)  
   Downloads PDFs from the issue, extracts text with `pdf.js`, and parses labels such as `Vendor e-mail address`, `VTEX e-mail responsible`, `Scope`, `Priority`, `CAP NUMBER`, etc. (`extractVendorFieldsFromPdfText`).

## PDF policy (source of truth for the parser)

Only PDFs that meet **all** of the following are considered for vendor form extraction:

- Filename contains **`vendor request`** (case-insensitive substring).
- Filename ends with **`.pdf`**.

Implementation: `isVendorRequestPdfFilename` in `lib/jira.ts`.

Rationale:

- Other PDFs on the same ticket (quotes, NDAs, scans with misleading text) are not the structured “Vendor request” export from JSM and can produce false or partial matches.
- Previously, any `.pdf` could be tried first; the code returned on the **first** PDF that produced any non-empty parse, which could skip the real **Vendor request** file. The pipeline now **only** processes matching filenames and, if there are several, keeps the extraction with the **highest score** across those files.

If no attachment matches the filename rule, the PDF path contributes **nothing** — fields must come from layers 1–2 or a later sync after a correctly named file exists.

## Webhook timing (attachments on `issue_created`)

On issue creation, the handler retries PDF enrichment with delays (see `app/api/jira/webhook/route.ts`) because Jira may attach the PDF **after** the first webhook delivery. If the PDF is still missing after the last retry, the first persist may lack PDF data until a later **`issue_updated`** (or similar) webhook runs again.

## Operational checklist when fields show “-” in the app but look filled in Jira

1. **Attachment name** — Does the PDF filename include `vendor request` and end with `.pdf`? If Jira only has a generically named export, the PDF parser will not run on that file by design.
2. **Selectable text** — Open the PDF and try copy/paste. If there is no real text layer, `pdf.js` cannot feed the label parser.
3. **Second sync** — After the PDF appears, ensure an update triggers the webhook again (or run the backfill script for historical rows).
4. **Integration user** — The Jira API user must be able to read the issue, attachments, and (when applicable) request field values.

## Did we “fix” the problem?

**Partially, and only for cases that match the rules above.**

- **Fixed:** Misleading or weak parses from **non–Vendor request** PDFs; wrong file “winning” because of early return; alignment with the rule that only **Vendor request** PDFs carry the structured layout we parse.
- **Not automatically fixed:** Tickets whose only PDF does **not** include `vendor request` in the filename; image-only PDFs; API/permission gaps; attachments arriving too late with no follow-up event.

For tickets already saved with empty `jira_form_data`, use the backfill script (same filename rules) or trigger a re-sync after correcting attachments / webhooks.
