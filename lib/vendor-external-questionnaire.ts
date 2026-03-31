import { randomUUID } from "node:crypto";
import { sql } from "@/lib/db";
import { sendExternalQuestionnaireEmail } from "@/lib/email";
import { recordVendorQuestionnaireDispatch } from "@/lib/vendor-questionnaire-dispatch";

function normalizeEmail(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidEmail(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

async function resolveVendorAssessmentId(input: { assessmentId?: string | null; entitySlug?: string | null }) {
  const directAssessmentId = (input.assessmentId ?? "").trim();
  if (directAssessmentId) {
    return directAssessmentId;
  }

  const entitySlug = (input.entitySlug ?? "").trim();
  if (!entitySlug) {
    throw new Error("Assessment não encontrado para este vendor.");
  }

  const entityRows = (await sql`
    SELECT id::text, name
    FROM entities
    WHERE slug = ${entitySlug}
      AND kind = 'VENDOR'
    LIMIT 1
  `) as Array<{ id: string; name: string }>;

  const entity = entityRows[0];
  if (!entity) {
    throw new Error("Vendor não encontrado.");
  }

  const latestAssessmentRows = (await sql`
    SELECT id::text
    FROM assessments
    WHERE entity_id = ${entity.id}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ id: string }>;

  if (latestAssessmentRows[0]?.id) {
    return latestAssessmentRows[0].id;
  }

  const insertedRows = (await sql`
    INSERT INTO assessments (entity_id, title, status)
    VALUES (
      ${entity.id}::uuid,
      ${`Vendor Assessment - ${entity.name}`},
      'PENDING'
    )
    RETURNING id::text
  `) as Array<{ id: string }>;

  const createdId = insertedRows[0]?.id;
  if (!createdId) {
    throw new Error("Não foi possível criar o assessment do vendor.");
  }

  return createdId;
}

export async function ensureVendorQuestionnaireSelection(input: {
  assessmentId?: string | null;
  entitySlug?: string | null;
  selectedFormId: string;
}) {
  const assessmentId = await resolveVendorAssessmentId(input);
  const availableForms = (await sql`
    SELECT id::text, form_id, name
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND (entity_kind = 'VENDOR' OR entity_kind IS NULL)
      AND form_id = ${input.selectedFormId}
    LIMIT 1
  `) as Array<{ id: string; form_id: string; name: string }>;

  if (availableForms.length === 0) {
    throw new Error("Selected Typeform form is not available for vendors.");
  }

  await sql`
    UPDATE assessments
    SET
      typeform_form_id = ${input.selectedFormId},
      updated_at = now()
    WHERE id = ${assessmentId}::uuid
  `;

  return {
    assessmentId,
    form: availableForms[0],
  };
}

export async function recordVendorExternalQuestionnaireSend(input: {
  assessmentId?: string | null;
  entitySlug?: string | null;
  selectedFormId: string;
  recipients: string[];
  hiddenAssessmentField?: string | null;
  questionnaireBaseUrl: string;
  questionnaireEntryBaseUrl?: string | null;
}) {
  const dispatchedAt = new Date().toISOString();
  const dispatchId = randomUUID();
  const { assessmentId, form: selectedForm } = await ensureVendorQuestionnaireSelection({
    assessmentId: input.assessmentId,
    entitySlug: input.entitySlug,
    selectedFormId: input.selectedFormId,
  });
  const directTypeformParams = new URLSearchParams({
    dispatch_id: dispatchId,
    assessment_id: assessmentId,
  });
  if (input.hiddenAssessmentField && input.hiddenAssessmentField.trim().length > 0) {
    directTypeformParams.set(input.hiddenAssessmentField, assessmentId);
  }
  const directTypeformUrl = `${input.questionnaireBaseUrl}?${directTypeformParams.toString()}`;
  const questionnaireUrl =
    input.questionnaireEntryBaseUrl && input.questionnaireEntryBaseUrl.trim().length > 0
      ? `${input.questionnaireEntryBaseUrl.replace(/\/$/, "")}/q/${dispatchId}`
      : directTypeformUrl;

  const entityRows = (await sql`
    SELECT
      a.entity_id::text AS entity_id,
      e.jira_form_data
    FROM assessments a
    JOIN entities e ON e.id = a.entity_id
    WHERE a.id = ${assessmentId}::uuid
    LIMIT 1
  `) as Array<{ entity_id: string; jira_form_data: Record<string, unknown> | null }>;

  const entityId = entityRows[0]?.entity_id ?? null;
  if (!entityId) {
    throw new Error("Assessment entity not found.");
  }

  const jiraFormData =
    entityRows[0]?.jira_form_data &&
    typeof entityRows[0].jira_form_data === "object" &&
    !Array.isArray(entityRows[0].jira_form_data)
      ? entityRows[0].jira_form_data
      : {};
  const reporterEmailRaw =
    typeof jiraFormData.reporterEmail === "string" ? jiraFormData.reporterEmail : null;
  const reporterEmail = isValidEmail(reporterEmailRaw) ? normalizeEmail(reporterEmailRaw) : null;
  const normalizedRecipients = Array.from(new Set(input.recipients.map((item) => normalizeEmail(item)).filter(isValidEmail)));
  const ccRecipients =
    reporterEmail && !normalizedRecipients.includes(reporterEmail)
      ? [reporterEmail]
      : [];

  await sendExternalQuestionnaireEmail({
    to: input.recipients,
    cc: ccRecipients,
    questionnaireUrl,
    formName: selectedForm.name,
    formId: selectedForm.form_id,
  });

  await sql`
    UPDATE assessments
    SET
      status = 'SENT',
      sent_at = COALESCE(sent_at, ${dispatchedAt}::timestamptz),
      completed_at = NULL,
      updated_at = ${dispatchedAt}::timestamptz
    WHERE id = ${assessmentId}::uuid
  `;

  await sql`
    UPDATE entities
    SET
      status = 'SENT',
      status_label = 'Waiting vendor',
      updated_at = ${dispatchedAt}::timestamptz
    WHERE id = ${entityId}::uuid
  `;

  await sql`
    UPDATE entity_timeline_events
    SET
      is_current = false,
      updated_at = ${dispatchedAt}::timestamptz
    WHERE entity_id = ${entityId}::uuid
  `;

  await sql`
    INSERT INTO entity_timeline_events (
      entity_id,
      title,
      note,
      event_at,
      sort_order,
      is_current
    )
    VALUES (
      ${entityId}::uuid,
      'Questionário externo enviado',
      ${`Formulário: ${selectedForm.name} (${selectedForm.form_id}). Destinatários: ${input.recipients.join(", ")}.${ccRecipients.length > 0 ? ` Cópia: ${ccRecipients.join(", ")}.` : ""} Token de envio: ${dispatchId}.`},
      ${dispatchedAt}::timestamptz,
      COALESCE((SELECT MAX(sort_order) + 1 FROM entity_timeline_events WHERE entity_id = ${entityId}::uuid), 1),
      true
    )
  `;

  await recordVendorQuestionnaireDispatch({
    dispatchId,
    entityId,
    assessmentId,
    formId: selectedForm.form_id,
    recipients: input.recipients,
    sentAt: dispatchedAt,
  });

  return {
    assessmentId,
    questionnaireUrl,
    form: selectedForm,
  };
}
