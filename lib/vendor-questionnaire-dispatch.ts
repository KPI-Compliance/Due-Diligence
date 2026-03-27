import { sql } from "@/lib/db";

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const MATCH_WINDOW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const MATCH_WINDOW_AFTER_MS = 120 * 24 * 60 * 60 * 1000;

let dispatchesTableReady = false;

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function parseEmails(value: string | null | undefined) {
  const source = value ?? "";
  const matched = source.match(EMAIL_REGEX) ?? [];
  return Array.from(new Set(matched.map((item) => normalizeEmail(item)).filter(Boolean)));
}

function escapeLikePattern(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

function isWithinMatchWindow(submittedTimestamp: number, referenceTimestamp: number) {
  return (
    submittedTimestamp >= referenceTimestamp - MATCH_WINDOW_BEFORE_MS &&
    submittedTimestamp <= referenceTimestamp + MATCH_WINDOW_AFTER_MS
  );
}

export function extractEmailsFromTimelineNote(note: string | null | undefined) {
  if (!note) return [];

  const recipientChunkMatch = note.match(/destinat[aá]rios:\s*([^.]*)/i);
  if (recipientChunkMatch?.[1]) {
    const chunkEmails = parseEmails(recipientChunkMatch[1]);
    if (chunkEmails.length > 0) return chunkEmails;
  }

  return parseEmails(note);
}

async function ensureDispatchesTable() {
  if (dispatchesTableReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS vendor_external_questionnaire_dispatches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
      assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      form_id TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_lookup
    ON vendor_external_questionnaire_dispatches (form_id, recipient_email, sent_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_assessment
    ON vendor_external_questionnaire_dispatches (assessment_id, sent_at DESC)
  `;

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vendor_external_questionnaire_dispatches_unique_send
    ON vendor_external_questionnaire_dispatches (assessment_id, form_id, recipient_email, sent_at)
  `;

  dispatchesTableReady = true;
}

export async function recordVendorQuestionnaireDispatch(input: {
  entityId: string;
  assessmentId: string;
  formId: string;
  recipients: string[];
  sentAt: string;
}) {
  await ensureDispatchesTable();

  const normalizedRecipients = Array.from(
    new Set(input.recipients.map((item) => normalizeEmail(item)).filter((item) => item.includes("@"))),
  );
  if (normalizedRecipients.length === 0) return;

  for (const recipientEmail of normalizedRecipients) {
    await sql`
      INSERT INTO vendor_external_questionnaire_dispatches (
        entity_id,
        assessment_id,
        form_id,
        recipient_email,
        sent_at
      )
      VALUES (
        ${input.entityId}::uuid,
        ${input.assessmentId}::uuid,
        ${input.formId},
        ${recipientEmail},
        ${input.sentAt}::timestamptz
      )
      ON CONFLICT DO NOTHING
    `;
  }
}

async function findVendorAssessmentByStructuredDispatch(input: {
  formId: string;
  respondentEmail: string;
  submittedAt: string | null;
}) {
  try {
    await ensureDispatchesTable();
  } catch {
    return null;
  }

  const submittedTimestamp = toTimestamp(input.submittedAt);
  const rows = (await sql`
    SELECT
      d.assessment_id::text AS assessment_id,
      d.entity_id::text AS entity_id,
      e.name AS entity_name,
      d.sent_at::text AS sent_at
    FROM vendor_external_questionnaire_dispatches d
    INNER JOIN entities e ON e.id = d.entity_id
    WHERE e.kind = 'VENDOR'
      AND d.form_id = ${input.formId}
      AND d.recipient_email = ${normalizeEmail(input.respondentEmail)}
      AND (
        ${input.submittedAt ?? null}::timestamptz IS NULL
        OR d.sent_at BETWEEN (${input.submittedAt ?? null}::timestamptz - INTERVAL '3 days')
          AND (${input.submittedAt ?? null}::timestamptz + INTERVAL '120 days')
      )
    ORDER BY
      CASE
        WHEN ${input.submittedAt ?? null}::timestamptz IS NULL THEN 1
        ELSE ABS(EXTRACT(EPOCH FROM (d.sent_at - ${input.submittedAt ?? null}::timestamptz)))
      END ASC,
      d.sent_at DESC
    LIMIT 1
  `) as Array<{
    assessment_id: string;
    entity_id: string;
    entity_name: string;
    sent_at: string;
  }>;

  const found = rows[0];
  if (!found) return null;

  if (!Number.isNaN(submittedTimestamp)) {
    const sentTimestamp = toTimestamp(found.sent_at);
    if (!Number.isNaN(sentTimestamp) && !isWithinMatchWindow(submittedTimestamp, sentTimestamp)) {
      return null;
    }
  }

  return {
    assessmentId: found.assessment_id,
    entityId: found.entity_id,
    entityName: found.entity_name,
  };
}

async function findVendorAssessmentByTimelineDispatch(input: {
  formId: string;
  respondentEmail: string;
  submittedAt: string | null;
}) {
  const escapedFormId = escapeLikePattern(input.formId);
  const escapedEmail = escapeLikePattern(normalizeEmail(input.respondentEmail));
  const submittedTimestamp = toTimestamp(input.submittedAt);

  const rows = (await sql`
    SELECT
      a.id::text AS assessment_id,
      e.id::text AS entity_id,
      e.name AS entity_name,
      t.note,
      t.event_at::text AS event_at
    FROM entities e
    INNER JOIN assessments a ON a.entity_id = e.id
    INNER JOIN entity_timeline_events t ON t.entity_id = e.id
    WHERE e.kind = 'VENDOR'
      AND lower(trim(t.title)) = lower(trim('Questionário externo enviado'))
      AND t.note ILIKE ${`%(${escapedFormId})%`} ESCAPE '\\'
      AND lower(COALESCE(t.note, '')) LIKE ${`%${escapedEmail}%`} ESCAPE '\\'
      AND (
        ${input.submittedAt ?? null}::timestamptz IS NULL
        OR t.event_at BETWEEN (${input.submittedAt ?? null}::timestamptz - INTERVAL '3 days')
          AND (${input.submittedAt ?? null}::timestamptz + INTERVAL '120 days')
      )
    ORDER BY
      CASE
        WHEN ${input.submittedAt ?? null}::timestamptz IS NULL THEN 1
        ELSE ABS(EXTRACT(EPOCH FROM (t.event_at - ${input.submittedAt ?? null}::timestamptz)))
      END ASC,
      t.event_at DESC
    LIMIT 10
  `) as Array<{
    assessment_id: string;
    entity_id: string;
    entity_name: string;
    note: string | null;
    event_at: string | null;
  }>;

  for (const row of rows) {
    const noteEmails = extractEmailsFromTimelineNote(row.note);
    if (!noteEmails.includes(normalizeEmail(input.respondentEmail))) continue;

    if (!Number.isNaN(submittedTimestamp)) {
      const eventTimestamp = toTimestamp(row.event_at);
      if (!Number.isNaN(eventTimestamp) && !isWithinMatchWindow(submittedTimestamp, eventTimestamp)) {
        continue;
      }
    }

    return {
      assessmentId: row.assessment_id,
      entityId: row.entity_id,
      entityName: row.entity_name,
    };
  }

  return null;
}

export async function findVendorAssessmentByRecipientDispatch(input: {
  formId: string;
  respondentEmail: string;
  submittedAt: string | null;
}) {
  const respondentEmail = normalizeEmail(input.respondentEmail);
  if (!respondentEmail.includes("@")) return null;

  const byStructuredDispatch = await findVendorAssessmentByStructuredDispatch({
    formId: input.formId,
    respondentEmail,
    submittedAt: input.submittedAt,
  });
  if (byStructuredDispatch) return byStructuredDispatch;

  return await findVendorAssessmentByTimelineDispatch({
    formId: input.formId,
    respondentEmail,
    submittedAt: input.submittedAt,
  });
}

export async function getVendorQuestionnaireSignals(input: {
  entityId: string;
  assessmentId: string;
  formId: string;
}) {
  const recipientEmails = new Set<string>();
  const sentTimestamps = new Set<number>();

  try {
    await ensureDispatchesTable();
    const dispatchRows = (await sql`
      SELECT recipient_email, sent_at::text
      FROM vendor_external_questionnaire_dispatches
      WHERE assessment_id = ${input.assessmentId}::uuid
        AND form_id = ${input.formId}
      ORDER BY sent_at DESC
    `) as Array<{ recipient_email: string; sent_at: string | null }>;

    for (const row of dispatchRows) {
      const email = normalizeEmail(row.recipient_email);
      if (email) recipientEmails.add(email);
      const sentTimestamp = toTimestamp(row.sent_at);
      if (!Number.isNaN(sentTimestamp)) sentTimestamps.add(sentTimestamp);
    }
  } catch {
    // Table might not exist yet in older environments. Timeline fallback below remains active.
  }

  const timelineRows = (await sql`
    SELECT note, event_at::text
    FROM entity_timeline_events
    WHERE entity_id = ${input.entityId}::uuid
      AND lower(trim(title)) = lower(trim('Questionário externo enviado'))
      AND note ILIKE ${`%(${escapeLikePattern(input.formId)})%`} ESCAPE '\\'
    ORDER BY event_at DESC NULLS LAST, created_at DESC
    LIMIT 50
  `) as Array<{ note: string | null; event_at: string | null }>;

  for (const row of timelineRows) {
    for (const email of extractEmailsFromTimelineNote(row.note)) {
      recipientEmails.add(email);
    }
    const eventTimestamp = toTimestamp(row.event_at);
    if (!Number.isNaN(eventTimestamp)) sentTimestamps.add(eventTimestamp);
  }

  const assessmentRows = (await sql`
    SELECT sent_at::text
    FROM assessments
    WHERE id = ${input.assessmentId}::uuid
    LIMIT 1
  `) as Array<{ sent_at: string | null }>;

  const assessmentSentTimestamp = toTimestamp(assessmentRows[0]?.sent_at ?? null);
  if (!Number.isNaN(assessmentSentTimestamp)) sentTimestamps.add(assessmentSentTimestamp);

  const entityRows = (await sql`
    SELECT contact_email
    FROM entities
    WHERE id = ${input.entityId}::uuid
    LIMIT 1
  `) as Array<{ contact_email: string | null }>;

  const contactEmail = normalizeEmail(entityRows[0]?.contact_email ?? null);
  if (contactEmail) recipientEmails.add(contactEmail);

  return {
    recipientEmails: Array.from(recipientEmails),
    sentTimestamps: Array.from(sentTimestamps),
  };
}

