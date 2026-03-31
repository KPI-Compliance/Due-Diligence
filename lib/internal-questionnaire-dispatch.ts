import { sql } from "@/lib/db";
import { sendInternalQuestionnaireSlackMessage } from "@/lib/slack";

function normalizeText(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function normalizeEmail(value: string | null | undefined) {
  return normalizeText(value).toLowerCase();
}

function isValidEmail(value: string | null | undefined) {
  const normalized = normalizeEmail(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
}

function renderTemplate(template: string, values: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, rawKey) => {
    const key = String(rawKey);
    return values[key] ?? "";
  });
}

function buildInternalQuestionnaireUrl(input: {
  entitySlug: string;
  vendorName: string;
  jiraTicket: string;
  focalEmail: string;
}) {
  const template = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_URL_TEMPLATE);
  if (template) {
    return renderTemplate(template, {
      entity_slug: encodeURIComponent(input.entitySlug),
      vendor: encodeURIComponent(input.vendorName),
      ticket: encodeURIComponent(input.jiraTicket),
      focal_email: encodeURIComponent(input.focalEmail),
    });
  }

  const baseUrl = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_URL);
  if (!baseUrl) {
    throw new Error("Defina INTERNAL_QUESTIONNAIRE_FORM_URL (ou ..._TEMPLATE) no ambiente.");
  }

  const url = new URL(baseUrl);
  const ticketKey = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_PARAM_TICKET) || "ticket";
  const vendorKey = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_PARAM_VENDOR) || "vendor";
  const entitySlugKey = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_PARAM_ENTITY_SLUG) || "entity_slug";
  const focalEmailKey = normalizeText(process.env.INTERNAL_QUESTIONNAIRE_FORM_PARAM_FOCAL_EMAIL) || "focal_email";

  url.searchParams.set(ticketKey, input.jiraTicket);
  url.searchParams.set(vendorKey, input.vendorName);
  url.searchParams.set(entitySlugKey, input.entitySlug);
  if (isValidEmail(input.focalEmail)) {
    url.searchParams.set(focalEmailKey, input.focalEmail);
  }

  return url.toString();
}

function extractJiraFormText(jiraFormData: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = jiraFormData[key];
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (normalized) return normalized;
  }
  return null;
}

export async function sendVendorInternalQuestionnaire(input: {
  entitySlug: string;
  focalEmail?: string | null;
}) {
  const entitySlug = normalizeText(input.entitySlug);
  if (!entitySlug) {
    throw new Error("Vendor inválido para envio do questionário interno.");
  }

  const rows = (await sql`
    SELECT
      e.id::text,
      e.slug,
      e.name,
      e.jira_issue_key,
      e.jira_form_data,
      owner.email AS owner_email,
      fp.email AS focal_email
    FROM entities e
    LEFT JOIN users owner ON owner.id = e.owner_user_id
    LEFT JOIN internal_focal_points fp ON fp.entity_id = e.id
    WHERE e.slug = ${entitySlug}
      AND e.kind = 'VENDOR'
    LIMIT 1
  `) as Array<{
    id: string;
    slug: string;
    name: string;
    jira_issue_key: string | null;
    jira_form_data: Record<string, unknown> | null;
    owner_email: string | null;
    focal_email: string | null;
  }>;

  const entity = rows[0];
  if (!entity) {
    throw new Error("Vendor não encontrado.");
  }

  const jiraFormData =
    entity.jira_form_data && typeof entity.jira_form_data === "object" && !Array.isArray(entity.jira_form_data)
      ? entity.jira_form_data
      : {};

  const resolvedFocalEmail =
    normalizeEmail(input.focalEmail) ||
    normalizeEmail(
      extractJiraFormText(jiraFormData, [
        "reporterEmail",
        "reporter-email",
        "reporter_email",
        "email-relator",
      ]) ??
        extractJiraFormText(jiraFormData, [
        "vtexResponsibleEmail",
        "vtex-e-mail-responsible",
        "vtex_email_responsible",
      ]) ??
        entity.focal_email ??
        entity.owner_email,
    );

  const jiraTicket = normalizeText(entity.jira_issue_key) || `vendor-${entity.slug}`;

  const formUrl = buildInternalQuestionnaireUrl({
    entitySlug: entity.slug,
    vendorName: entity.name,
    jiraTicket,
    focalEmail: resolvedFocalEmail,
  });

  const slackMessage = [
    `Due Diligence interno - Vendor *${entity.name}*`,
    `Ticket Jira: ${jiraTicket}`,
    `Por favor, preencha o formulário interno de triagem de risco: ${formUrl}`,
  ].join("\n");

  const slackResult = await sendInternalQuestionnaireSlackMessage({
    focalEmail: resolvedFocalEmail || null,
    message: slackMessage,
  });

  const dispatchedAt = new Date().toISOString();
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
      ${entity.id}::uuid,
      'Mini questionário interno enviado',
      ${`Canal: ${slackResult.mode === "dm" ? "Slack DM" : "Slack Channel"}. Ticket: ${jiraTicket}. Formulário: ${formUrl}. Destinatário: ${resolvedFocalEmail || "não informado"}.`},
      ${dispatchedAt}::timestamptz,
      COALESCE((SELECT MAX(sort_order) + 1 FROM entity_timeline_events WHERE entity_id = ${entity.id}::uuid), 1),
      false
    )
  `;

  return {
    entitySlug: entity.slug,
    vendorName: entity.name,
    jiraTicket,
    focalEmail: resolvedFocalEmail || null,
    formUrl,
    slackMode: slackResult.mode,
  };
}
