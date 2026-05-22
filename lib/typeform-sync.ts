import { sql } from "@/lib/db";
import { fetchJiraIssueCreatedAt } from "@/lib/jira";
import { normalizeComparable, normalizeLooseLookup } from "@/lib/normalization";
import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";
import { getTypeformApiCredentials } from "@/lib/typeform-admin";
import { getVendorQuestionnaireSignals } from "@/lib/vendor-questionnaire-dispatch";
import {
  applyTypeformFieldDefinitions,
  extractCompanyNameFromTypeformAnswers,
  extractOfficialPartnerCompanyNameAnswerWithForm,
  extractRespondentEmailFromTypeformAnswers,
  extractTicketFromTypeformAnswers,
  flattenResponseAnswersArray,
  normalizeTypeformAnswers,
  sortTypeformAnswersByFieldDefinitions,
  type TypeformAnswer,
  type TypeformFieldDefinition,
} from "@/lib/typeform";

type TypeformResponseItem = {
  token?: string;
  submitted_at?: string;
  answers?: TypeformAnswer[];
  /** Flattened API answers before definition merge (for company field when title is missing on response). */
  syncRawAnswers?: TypeformAnswer[];
  hidden?: Record<string, string | number | boolean | null | undefined>;
};

async function dedupeAssessmentQuestionResponses(assessmentId: string) {
  await sql`
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY
            assessment_id,
            lower(trim(question_text)),
            COALESCE(answer_text, '')
          ORDER BY created_at ASC, ctid ASC
        ) AS rn
      FROM assessment_question_responses
      WHERE assessment_id = ${assessmentId}::uuid
    )
    DELETE FROM assessment_question_responses target
    USING ranked
    WHERE target.ctid = ranked.ctid
      AND ranked.rn > 1
  `;
}

type TypeformResponsesApiResponse = {
  items?: TypeformResponseItem[];
};

/** Typeform allows up to 1000 responses per request; we paginate with `before` for larger forms. */
const TYPEFORM_RESPONSES_PAGE_SIZE = 1000;
const TYPEFORM_RESPONSES_MAX_PAGES = 80;

function normalizeJiraIssueKeyForMatch(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

type TypeformApiErrorBody = { code?: string; description?: string };

async function readTypeformErrorBody(response: Response): Promise<TypeformApiErrorBody> {
  try {
    const data = (await response.json()) as TypeformApiErrorBody;
    return {
      code: typeof data.code === "string" ? data.code : undefined,
      description: typeof data.description === "string" ? data.description : undefined,
    };
  } catch {
    return {};
  }
}

async function fetchAllTypeformFormResponseItems(
  formId: string,
  token: string,
): Promise<{
  ok: boolean;
  items: TypeformResponseItem[];
  httpStatus?: number;
  truncated: boolean;
  typeformError?: TypeformApiErrorBody;
}> {
  const items: TypeformResponseItem[] = [];
  let before: string | undefined;

  for (let page = 0; page < TYPEFORM_RESPONSES_MAX_PAGES; page++) {
    const url = new URL(`https://api.typeform.com/forms/${encodeURIComponent(formId)}/responses`);
    url.searchParams.set("page_size", String(TYPEFORM_RESPONSES_PAGE_SIZE));
    if (before) {
      url.searchParams.set("before", before);
    }

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const typeformError = await readTypeformErrorBody(response);
      return { ok: false, items, httpStatus: response.status, truncated: page > 0, typeformError };
    }

    const payload = (await response.json()) as TypeformResponsesApiResponse;
    const batch = payload.items ?? [];
    if (batch.length === 0) {
      return { ok: true, items, truncated: false };
    }

    items.push(...batch);

    if (batch.length < TYPEFORM_RESPONSES_PAGE_SIZE) {
      return { ok: true, items, truncated: false };
    }

    const lastToken = batch[batch.length - 1]?.token;
    if (!lastToken || lastToken === before) {
      return { ok: true, items, truncated: false };
    }
    before = lastToken;
  }

  return { ok: true, items, truncated: true };
}

type TypeformFormDefinitionResponse = {
  fields?: TypeformFieldDefinition[];
};

type PartnerFormMappingRow = {
  id?: string;
  form_id: string;
  name: string;
  hidden_assessment_field?: string | null;
  entity_kind?: "VENDOR" | "PARTNER" | null;
  section_rules?: {
    compliance?: { start?: string; end?: string };
    privacy?: { start?: string; end?: string };
    security?: { start?: string; end?: string };
  } | null;
};

type QuestionMappingRow = {
  question_key: string;
  question_ref: string | null;
  question_text: string;
  question_order: number;
  section: "COMMON" | "COMPLIANCE" | "PRIVACY" | "SECURITY";
};

export type ExternalQuestionnaireSyncResultStatus =
  | "updated"
  | "already_linked"
  | "no_match"
  | "missing_credentials"
  | "no_form_mapping"
  /** Typeform GET .../responses returned 403 for every mapped form (token scopes / wrong account). */
  | "typeform_forbidden";

export type ExternalQuestionnaireSyncResult = {
  status: ExternalQuestionnaireSyncResultStatus;
  assessmentId: string | null;
  responseToken: string | null;
};

let diagnosticsTableReady = false;

async function ensureTypeformSyncDiagnosticsTable() {
  if (diagnosticsTableReady) return;

  await sql`
    CREATE TABLE IF NOT EXISTS typeform_sync_diagnostics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source TEXT NOT NULL,
      entity_id UUID,
      entity_name TEXT,
      entity_kind entity_kind,
      jira_issue_key TEXT,
      assessment_id UUID,
      form_id TEXT,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      message TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_typeform_sync_diagnostics_entity
    ON typeform_sync_diagnostics(entity_id, created_at DESC)
  `;

  await sql`
    CREATE INDEX IF NOT EXISTS idx_typeform_sync_diagnostics_jira
    ON typeform_sync_diagnostics(jira_issue_key, created_at DESC)
  `;

  diagnosticsTableReady = true;
}

async function logTypeformSyncDiagnostic(input: {
  source: "entity_sync" | "queue_backfill";
  entityId?: string | null;
  entityName?: string | null;
  entityKind?: "VENDOR" | "PARTNER" | null;
  jiraIssueKey?: string | null;
  assessmentId?: string | null;
  formId?: string | null;
  stage: string;
  status: "started" | "skipped" | "error" | "success";
  message: string;
  payload?: Record<string, unknown>;
}) {
  try {
    await ensureTypeformSyncDiagnosticsTable();
    await sql`
      INSERT INTO typeform_sync_diagnostics (
        source,
        entity_id,
        entity_name,
        entity_kind,
        jira_issue_key,
        assessment_id,
        form_id,
        stage,
        status,
        message,
        payload
      )
      VALUES (
        ${input.source},
        ${input.entityId ?? null}::uuid,
        ${input.entityName ?? null},
        ${input.entityKind ?? null}::entity_kind,
        ${input.jiraIssueKey ?? null},
        ${input.assessmentId ?? null}::uuid,
        ${input.formId ?? null},
        ${input.stage},
        ${input.status},
        ${input.message},
        ${JSON.stringify(input.payload ?? {})}::jsonb
      )
    `;
  } catch (error) {
    console.warn(
      "[typeform-sync] failed to persist diagnostic:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

async function getJiraCreatedAt(issueKey: string | null | undefined) {
  if (!issueKey) return null;

  const settings = await getIntegrationSettings();
  const jiraSetting = settings.find((item) => item.provider === "JIRA");
  if (!jiraSetting?.enabled) return null;

  const config = jiraSetting.config as JiraConfig;
  const baseUrl = config.base_url?.trim();
  const email = config.api_email?.trim() || process.env.JIRA_API_EMAIL || "";
  const token = config.api_token?.trim() || process.env.JIRA_API_TOKEN || "";

  if (!baseUrl || !email || !token) return null;

  try {
    return await fetchJiraIssueCreatedAt({
      baseUrl,
      email,
      token,
      issueKey,
    });
  } catch (error) {
    console.warn("[typeform-sync] getJiraCreatedAt failed", {
      issueKey,
      message: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function getQuestionMappings(formConfigId: string | undefined) {
  if (!formConfigId) return [] as QuestionMappingRow[];

  try {
    return (await sql`
      SELECT question_key, question_ref, question_text, question_order, section::text
      FROM typeform_form_question_mappings
      WHERE typeform_form_config_id = ${formConfigId}::uuid
      ORDER BY question_order ASC, created_at ASC
    `) as QuestionMappingRow[];
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") return [];
    throw error;
  }
}

function toTimestamp(value: string | undefined | null) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

function compareResponseDistance(candidate: TypeformResponseItem, referenceTimestamp: number) {
  const submittedAt = toTimestamp(candidate.submitted_at);
  if (Number.isNaN(submittedAt) || Number.isNaN(referenceTimestamp)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.abs(submittedAt - referenceTimestamp);
}

const MATCH_WINDOW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const MATCH_WINDOW_AFTER_MS = 120 * 24 * 60 * 60 * 1000;

/** Partner company-name disambiguation vs ticket / entity timeline (Response time ~ submitted_at). */
const PARTNER_RESPONSE_MATCH_WINDOW_BEFORE_MS = 90 * 24 * 60 * 60 * 1000;
const PARTNER_RESPONSE_MATCH_WINDOW_AFTER_MS = 548 * 24 * 60 * 60 * 1000;

function isResponseWithinPartnerTimeWindow(submittedAt: string | undefined, referenceMs: number) {
  const submittedMs = toTimestamp(submittedAt);
  if (Number.isNaN(submittedMs) || Number.isNaN(referenceMs)) return true;
  return (
    submittedMs >= referenceMs - PARTNER_RESPONSE_MATCH_WINDOW_BEFORE_MS &&
    submittedMs <= referenceMs + PARTNER_RESPONSE_MATCH_WINDOW_AFTER_MS
  );
}

function isWithinMatchWindow(submittedAtTimestamp: number, referenceTimestamp: number) {
  return (
    submittedAtTimestamp >= referenceTimestamp - MATCH_WINDOW_BEFORE_MS &&
    submittedAtTimestamp <= referenceTimestamp + MATCH_WINDOW_AFTER_MS
  );
}

function distanceToClosestReference(candidate: TypeformResponseItem, references: number[]) {
  if (references.length === 0) return Number.MAX_SAFE_INTEGER;
  const submittedAt = toTimestamp(candidate.submitted_at);
  if (Number.isNaN(submittedAt)) return Number.MAX_SAFE_INTEGER;

  let closest = Number.MAX_SAFE_INTEGER;
  for (const reference of references) {
    const distance = Math.abs(submittedAt - reference);
    if (distance < closest) closest = distance;
  }
  return closest;
}

function normalizeComparableToken(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return "";
  return String(value).trim().toLowerCase();
}

function normalizeStrictEntityKey(value: string | null | undefined) {
  return normalizeComparable(value).replace(/[^a-z0-9]+/g, "");
}

/**
 * Vendor Typeform answers must not be linked to a Jira issue created *after* the response was
 * submitted (same contact email reused across tests/tickets caused false matches).
 * Small slack before `created` handles minor clock skew.
 */
const VENDOR_TYPEFORM_SUBMIT_BEFORE_ISSUE_SLACK_MS = 24 * 60 * 60 * 1000;

function vendorResponseSubmittedOnOrAfterIssueCreated(
  submittedAt: string | undefined,
  referenceTimestamp: number,
): boolean {
  if (Number.isNaN(referenceTimestamp)) return true;
  const submittedMs = toTimestamp(submittedAt);
  if (Number.isNaN(submittedMs)) return false;
  return submittedMs >= referenceTimestamp - VENDOR_TYPEFORM_SUBMIT_BEFORE_ISSUE_SLACK_MS;
}

/** Same fuzzy match logic as the `byCompanyName` branch (company / vendor name in answers). */
function vendorTypeformCompanyAnswerMatchesEntityName(
  companyNameRaw: string | null | undefined,
  targetName: string,
  targetNameLoose: string,
  targetNameStrict: string,
): boolean {
  const companyName = normalizeComparable(companyNameRaw ?? "");
  const companyNameLoose = normalizeLooseLookup(companyNameRaw ?? "");
  const companyNameStrict = normalizeStrictEntityKey(companyNameRaw ?? "");
  if (!companyName && !companyNameLoose && !companyNameStrict) return false;
  return (
    companyName === targetName ||
    companyName.includes(targetName) ||
    targetName.includes(companyName) ||
    companyNameLoose === targetNameLoose ||
    companyNameLoose.includes(targetNameLoose) ||
    targetNameLoose.includes(companyNameLoose) ||
    companyNameStrict === targetNameStrict ||
    companyNameStrict.includes(targetNameStrict) ||
    targetNameStrict.includes(companyNameStrict)
  );
}

/**
 * When the form exposes a company/vendor-style name, it must match the entity name.
 * If no such field is detected, we rely on the submission date vs Jira issue `created` gate only.
 */
function vendorTypeformCompanyMatchesEntityIfPresent(
  item: TypeformResponseItem,
  targetName: string,
  targetNameLoose: string,
  targetNameStrict: string,
): boolean {
  const raw = extractCompanyNameFromTypeformAnswers(item.answers) ?? undefined;
  if (!raw?.trim()) return true;
  return vendorTypeformCompanyAnswerMatchesEntityName(raw, targetName, targetNameLoose, targetNameStrict);
}

async function getTypeformFormFields(formId: string, token: string) {
  const response = await fetch(`https://api.typeform.com/forms/${formId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    console.warn(`Typeform form definition fetch failed for form ${formId}: ${response.status}`);
    return [] as TypeformFieldDefinition[];
  }

  const payload = (await response.json()) as TypeformFormDefinitionResponse;
  return payload.fields ?? [];
}

function normalizeFormName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function resolvePartnerQuestionnaireTable(form: PartnerFormMappingRow | null | undefined) {
  const normalized = normalizeFormName(form?.name);
  if (!normalized) return null;

  switch (normalized) {
    case "vtex partner assessment ptbr":
      return "partner_typeform_assessment_ptbr_responses" as const;
    case "vtex partner assessment en":
      return "partner_typeform_assessment_en_responses" as const;
    case "vtex partner assessment pt (v2)":
      return "partner_typeform_assessment_pt_v2_responses" as const;
    case "vtex partner assessment en (v2)":
      return "partner_typeform_assessment_en_v2_responses" as const;
    default:
      return null;
  }
}

function resolvePartnerSectionsFromRules(
  answers: Array<{ domain: string; question: string; questionRef: string; value: string }>,
  sectionRules: PartnerFormMappingRow["section_rules"],
) {
  const empty: Array<"COMPLIANCE" | "PRIVACY" | "SECURITY" | "UNCLASSIFIED"> = answers.map(() => "UNCLASSIFIED");
  if (!sectionRules) return empty;

  const normalizedQuestions = answers.map((answer) => normalizeComparable(answer.question));
  const sectionDefinitions: Array<{ key: keyof NonNullable<PartnerFormMappingRow["section_rules"]>; value: "COMPLIANCE" | "PRIVACY" | "SECURITY" }> = [
    { key: "compliance", value: "COMPLIANCE" },
    { key: "privacy", value: "PRIVACY" },
    { key: "security", value: "SECURITY" },
  ];

  for (const section of sectionDefinitions) {
    const rules = sectionRules[section.key];
    const start = normalizeComparable(rules?.start);
    const end = normalizeComparable(rules?.end);
    if (!start || !end) continue;
    const startIndex = normalizedQuestions.findIndex((question) => question === start);
    const endIndex = normalizedQuestions.findIndex((question) => question === end);
    if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) continue;
    for (let index = startIndex; index <= endIndex; index += 1) {
      empty[index] = section.value;
    }
  }

  return empty;
}

function resolvePartnerSectionsFromMappings(
  answers: Array<{ domain: string; question: string; questionRef: string; value: string }>,
  mappings: QuestionMappingRow[],
) {
  if (mappings.length === 0) return answers.map(() => "UNCLASSIFIED" as const);

  return answers.map((answer, index) => {
    const byRef = mappings.find((item) => item.question_ref && item.question_ref === answer.questionRef);
    const byOrder = mappings.find((item) => item.question_order === index + 1);
    const byText = mappings.find((item) => normalizeComparable(item.question_text) === normalizeComparable(answer.question));
    const matched = byRef ?? byOrder ?? byText;
    if (!matched) return "UNCLASSIFIED" as const;
    return matched.section === "COMMON" ? "COMMON" : matched.section;
  });
}

async function deletePartnerFormRows(tableName: ReturnType<typeof resolvePartnerQuestionnaireTable>, assessmentId: string) {
  if (tableName === "partner_typeform_assessment_en_responses") {
    await sql`DELETE FROM partner_typeform_assessment_en_responses WHERE assessment_id = ${assessmentId}::uuid`;
    return;
  }
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    await sql`DELETE FROM partner_typeform_assessment_ptbr_responses WHERE assessment_id = ${assessmentId}::uuid`;
    return;
  }
  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    await sql`DELETE FROM partner_typeform_assessment_en_v2_responses WHERE assessment_id = ${assessmentId}::uuid`;
    return;
  }
  if (tableName === "partner_typeform_assessment_pt_v2_responses") {
    await sql`DELETE FROM partner_typeform_assessment_pt_v2_responses WHERE assessment_id = ${assessmentId}::uuid`;
  }
}

async function insertPartnerFormRow(input: {
  tableName: NonNullable<ReturnType<typeof resolvePartnerQuestionnaireTable>>;
  entityId: string;
  assessmentId: string;
  jiraIssueKey: string | null | undefined;
  formId: string;
  responseToken: string;
  submittedAt: string | null | undefined;
  companyName: string;
  questionOrder: number;
  questionKey: string;
  questionText: string;
  answerText: string;
  section: "COMMON" | "COMPLIANCE" | "PRIVACY" | "SECURITY" | "UNCLASSIFIED";
  rawAnswer: unknown;
}) {
  const rawAnswer = JSON.stringify(input.rawAnswer);

  if (input.tableName === "partner_typeform_assessment_en_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_en_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${input.entityId}::uuid, ${input.assessmentId}::uuid, ${input.jiraIssueKey ?? null}, ${input.formId}, ${input.responseToken}, ${input.submittedAt ?? null}::timestamptz,
        ${input.companyName}, ${input.questionOrder}, ${input.questionKey}, ${input.questionText}, ${input.answerText}, ${input.section}::partner_questionnaire_section, ${rawAnswer}::jsonb
      )
    `;
    return;
  }
  if (input.tableName === "partner_typeform_assessment_ptbr_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_ptbr_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${input.entityId}::uuid, ${input.assessmentId}::uuid, ${input.jiraIssueKey ?? null}, ${input.formId}, ${input.responseToken}, ${input.submittedAt ?? null}::timestamptz,
        ${input.companyName}, ${input.questionOrder}, ${input.questionKey}, ${input.questionText}, ${input.answerText}, ${input.section}::partner_questionnaire_section, ${rawAnswer}::jsonb
      )
    `;
    return;
  }
  if (input.tableName === "partner_typeform_assessment_en_v2_responses") {
    await sql`
      INSERT INTO partner_typeform_assessment_en_v2_responses (
        entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
        company_name, question_order, question_key, question_text, answer_text, section, raw_answer
      ) VALUES (
        ${input.entityId}::uuid, ${input.assessmentId}::uuid, ${input.jiraIssueKey ?? null}, ${input.formId}, ${input.responseToken}, ${input.submittedAt ?? null}::timestamptz,
        ${input.companyName}, ${input.questionOrder}, ${input.questionKey}, ${input.questionText}, ${input.answerText}, ${input.section}::partner_questionnaire_section, ${rawAnswer}::jsonb
      )
    `;
    return;
  }

  await sql`
    INSERT INTO partner_typeform_assessment_pt_v2_responses (
      entity_id, assessment_id, jira_issue_key, typeform_form_id, typeform_response_token, response_submitted_at,
      company_name, question_order, question_key, question_text, answer_text, section, raw_answer
    ) VALUES (
      ${input.entityId}::uuid, ${input.assessmentId}::uuid, ${input.jiraIssueKey ?? null}, ${input.formId}, ${input.responseToken}, ${input.submittedAt ?? null}::timestamptz,
      ${input.companyName}, ${input.questionOrder}, ${input.questionKey}, ${input.questionText}, ${input.answerText}, ${input.section}::partner_questionnaire_section, ${rawAnswer}::jsonb
    )
  `;
}

async function getExternalFormMappings(kind: "VENDOR" | "PARTNER", formId?: string | null) {
  return (await sql`
    SELECT id::text, form_id, name, hidden_assessment_field, entity_kind::text, section_rules
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND (${formId ?? null}::text IS NULL OR form_id = ${formId ?? null})
      AND (entity_kind = ${kind}::entity_kind OR entity_kind IS NULL)
    ORDER BY created_at DESC
  `) as PartnerFormMappingRow[];
}

/** Partner queue: only these Typeform form IDs (case-insensitive vs DB). Order = scan priority. */
const PARTNER_QUEUE_TYPEFORM_FORM_IDS_LOWER: string[] = ["pmnmaxxm", "r7y55vho", "i8n27yf6", "fcql4ffv"];

function filterPartnerQueueFormMappings(rows: PartnerFormMappingRow[]): PartnerFormMappingRow[] {
  const allow = new Set(PARTNER_QUEUE_TYPEFORM_FORM_IDS_LOWER);
  const indexOf = (formId: string) => {
    const lower = formId.trim().toLowerCase();
    const i = PARTNER_QUEUE_TYPEFORM_FORM_IDS_LOWER.findIndex((id) => id === lower);
    return i === -1 ? 999 : i;
  };

  const preferred = rows.filter((row) => allow.has(row.form_id.trim().toLowerCase()));
  const rest = rows.filter((row) => !allow.has(row.form_id.trim().toLowerCase()));

  // If none of the canonical four are registered, keep previous behavior (scan all partner mappings).
  if (preferred.length === 0) {
    return rows;
  }

  // Prefer the four official forms first (stable order), but still scan any other enabled Partner
  // external questionnaires — otherwise tickets answered on another mapped form never match.
  preferred.sort((a, b) => indexOf(a.form_id) - indexOf(b.form_id));
  return [...preferred, ...rest];
}

export async function syncExternalQuestionnaireForEntity(input: {
  entityId: string;
  entityName: string;
  entityKind: "VENDOR" | "PARTNER";
  jiraIssueKey?: string | null;
  formId?: string | null;
  /** When set (e.g. from entities.contact_email), match Typeform respondent email for partners/vendors. */
  entityContactEmail?: string | null;
  /** When set (e.g. entities.jira_issue_created_at), disambiguate Partner matches by Typeform submitted_at. */
  entityJiraIssueCreatedAt?: string | null;
}): Promise<ExternalQuestionnaireSyncResult> {
  const { entityId, entityName, entityKind, jiraIssueKey, formId, entityContactEmail, entityJiraIssueCreatedAt } = input;
  await logTypeformSyncDiagnostic({
    source: "entity_sync",
    entityId,
    entityName,
    entityKind,
    jiraIssueKey,
    formId: formId ?? null,
    stage: "start",
    status: "started",
    message: "Starting external questionnaire sync.",
  });

  const { token } = await getTypeformApiCredentials();
  if (!token) {
    await logTypeformSyncDiagnostic({
      source: "entity_sync",
      entityId,
      entityName,
      entityKind,
      jiraIssueKey,
      formId: formId ?? null,
      stage: "credentials",
      status: "error",
      message: "Typeform API token is not configured.",
    });
    return {
      status: "missing_credentials",
      assessmentId: null,
      responseToken: null,
    };
  }

  let formMappings = await getExternalFormMappings(entityKind, formId);
  if (entityKind === "PARTNER" && !formId) {
    formMappings = filterPartnerQueueFormMappings(formMappings);
  }

  if (formMappings.length === 0) {
    await logTypeformSyncDiagnostic({
      source: "entity_sync",
      entityId,
      entityName,
      entityKind,
      jiraIssueKey,
      formId: formId ?? null,
      stage: "form_mapping",
      status: "skipped",
      message: "No enabled external_questionnaire form mapping found for this entity kind.",
    });
    return {
      status: "no_form_mapping",
      assessmentId: null,
      responseToken: null,
    };
  }

  let latestAssessment = (await sql`
    SELECT id::text, typeform_response_token, created_at::text AS created_at
    FROM assessments
    WHERE entity_id = ${entityId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ id: string; typeform_response_token: string | null; created_at: string | null }>;

  if (latestAssessment.length === 0) {
    latestAssessment = (await sql`
      INSERT INTO assessments (entity_id, title, status)
      VALUES (${entityId}::uuid, ${`External Questionnaire - ${entityName}`}, 'PENDING')
      RETURNING id::text, typeform_response_token, created_at::text AS created_at
    `) as Array<{ id: string; typeform_response_token: string | null; created_at: string | null }>;
  }

  const assessment = latestAssessment[0];
  if (!assessment) {
    return {
      status: "no_match",
      assessmentId: null,
      responseToken: null,
    };
  }

  const entityNameTrimmed = entityName.trim();
  const targetName = normalizeComparable(entityNameTrimmed);
  const targetNameLoose = normalizeLooseLookup(entityNameTrimmed);
  const targetNameStrict = normalizeStrictEntityKey(entityNameTrimmed);
  const jiraCreatedAt = await getJiraCreatedAt(jiraIssueKey);
  const jiraCreatedTimestamp = toTimestamp(jiraCreatedAt);
  const entityJiraRowTimestamp = toTimestamp(entityJiraIssueCreatedAt ?? null);
  const assessmentCreatedTimestamp = toTimestamp(assessment.created_at ?? null);

  let referenceTimestamp = Number.NaN;
  let referenceSource: "none" | "jira_api" | "entity_row" | "assessment" = "none";
  if (!Number.isNaN(jiraCreatedTimestamp)) {
    referenceTimestamp = jiraCreatedTimestamp;
    referenceSource = "jira_api";
  } else if (!Number.isNaN(entityJiraRowTimestamp)) {
    referenceTimestamp = entityJiraRowTimestamp;
    referenceSource = "entity_row";
  } else if (!Number.isNaN(assessmentCreatedTimestamp)) {
    referenceTimestamp = assessmentCreatedTimestamp;
    referenceSource = "assessment";
  }

  const emptyVendorSignals = { recipientEmails: [] as string[], sentTimestamps: [] as number[], dispatchIds: [] as string[] };
  let anySuccessfulResponsesFetch = false;
  const responsesFetchFailureStatuses: number[] = [];
  let matchedResponse: (TypeformResponseItem & { form_id: string; form_name: string }) | null = null;
  let lastPartnerMatchScan: {
    form_id: string;
    official_title_pool: number;
    in_time_window: number;
    used_time_window_filter: boolean;
  } | null = null;

  for (const form of formMappings) {
    lastPartnerMatchScan = null;
    const formScopedVendorSignals =
      entityKind === "VENDOR"
        ? await getVendorQuestionnaireSignals({
            entityId,
            assessmentId: assessment.id,
            formId: form.form_id,
          })
        : emptyVendorSignals;

    const formFields = await getTypeformFormFields(form.form_id, token);
    const fetchResult = await fetchAllTypeformFormResponseItems(form.form_id, token);

    if (!fetchResult.ok) {
      if (typeof fetchResult.httpStatus === "number") {
        responsesFetchFailureStatuses.push(fetchResult.httpStatus);
      }
      console.warn(
        `Typeform responses fetch failed for form ${form.form_id}: ${fetchResult.httpStatus ?? "unknown"}`,
      );
      await logTypeformSyncDiagnostic({
        source: "entity_sync",
        entityId,
        entityName,
        entityKind,
        jiraIssueKey,
        assessmentId: assessment.id,
        formId: form.form_id,
        stage: "responses_fetch",
        status: "error",
        message: "Typeform responses fetch failed.",
        payload: {
          http_status: fetchResult.httpStatus,
          typeform_code: fetchResult.typeformError?.code ?? null,
          typeform_description: fetchResult.typeformError?.description ?? null,
        },
      });
      continue;
    }

    anySuccessfulResponsesFetch = true;

    const payload: TypeformResponsesApiResponse = { items: fetchResult.items };
    await logTypeformSyncDiagnostic({
      source: "entity_sync",
      entityId,
      entityName,
      entityKind,
      jiraIssueKey,
      assessmentId: assessment.id,
      formId: form.form_id,
      stage: "responses_scan",
      status: "started",
      message: "Scanning Typeform responses for entity name match.",
      payload: {
        response_count: fetchResult.items.length,
        truncated: fetchResult.truncated,
        pages_max: TYPEFORM_RESPONSES_MAX_PAGES,
        page_size: TYPEFORM_RESPONSES_PAGE_SIZE,
        reference_source: referenceSource,
        reference_timestamp_configured: !Number.isNaN(referenceTimestamp),
      },
    });
    const configuredHiddenField = normalizeComparableToken(form.hidden_assessment_field ?? "assessment_id");
    const hiddenFieldCandidates = [configuredHiddenField, "assessment_id"].filter(Boolean);
    const targetAssessmentId = normalizeComparableToken(assessment.id);

    const normalizedItems =
      payload.items?.map((item) => ({
        ...item,
        syncRawAnswers: flattenResponseAnswersArray(item.answers),
        answers: sortTypeformAnswersByFieldDefinitions(
          applyTypeformFieldDefinitions(flattenResponseAnswersArray(item.answers), formFields),
          formFields,
        ),
      })) ?? [];

    const byHiddenAssessment = normalizedItems
      .filter((item) => {
        if (!item.hidden || typeof item.hidden !== "object") return false;
        return hiddenFieldCandidates.some((fieldName) => {
          const hiddenValue = normalizeComparableToken(item.hidden?.[fieldName]);
          return Boolean(hiddenValue) && hiddenValue === targetAssessmentId;
        });
      })
      .sort((a, b) => Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? ""))[0] ?? null;

    const byHiddenJiraKey =
      jiraIssueKey?.trim()
        ? normalizedItems
            .filter((item) => {
              if (!item.hidden || typeof item.hidden !== "object") return false;
              const target = normalizeJiraIssueKeyForMatch(jiraIssueKey);
              return Object.values(item.hidden).some((raw) => {
                const h = normalizeJiraIssueKeyForMatch(String(raw ?? ""));
                if (!h || !target) return false;
                return h === target || h.includes(target) || target.includes(h);
              });
            })
            .sort((a, b) => Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? ""))[0] ?? null
        : null;

    const byHiddenDispatch =
      entityKind === "VENDOR" && formScopedVendorSignals.dispatchIds.length > 0
        ? normalizedItems
            .filter((item) => {
              if (!item.hidden || typeof item.hidden !== "object") return false;
              const dispatchValue =
                normalizeComparableToken(item.hidden.dispatch_id) ||
                normalizeComparableToken(item.hidden.dispatchId) ||
                normalizeComparableToken(item.hidden.dispatch);
              return Boolean(dispatchValue) && formScopedVendorSignals.dispatchIds.includes(dispatchValue);
            })
            .sort((a, b) => Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? ""))[0] ?? null
        : null;

    const byRecipientAndPeriod =
      entityKind === "VENDOR" && formScopedVendorSignals.recipientEmails.length > 0
        ? normalizedItems
            .filter((item) => {
              const respondentEmail = normalizeComparableToken(extractRespondentEmailFromTypeformAnswers(item.answers));
              if (!respondentEmail || !respondentEmail.includes("@")) return false;
              if (!formScopedVendorSignals.recipientEmails.includes(respondentEmail)) return false;

              if (!Number.isNaN(referenceTimestamp)) {
                if (!vendorResponseSubmittedOnOrAfterIssueCreated(item.submitted_at, referenceTimestamp)) {
                  return false;
                }
                // Note: company name check intentionally omitted here.
                // A dispatch-record email match is already a strong signal (we explicitly sent
                // the form to this address). Requiring the company name to also match the entity
                // name blocks valid responses where the vendor answered with a trade name or
                // abbreviated name instead of the legal/registered name stored in the system.
              }

              if (formScopedVendorSignals.sentTimestamps.length === 0) return true;

              const submittedTimestamp = toTimestamp(item.submitted_at);
              if (Number.isNaN(submittedTimestamp)) return false;

              return formScopedVendorSignals.sentTimestamps.some((referenceTimestamp) =>
                isWithinMatchWindow(submittedTimestamp, referenceTimestamp),
              );
            })
            .sort((a, b) => {
              if (formScopedVendorSignals.sentTimestamps.length > 0) {
                return (
                  distanceToClosestReference(a, formScopedVendorSignals.sentTimestamps) -
                  distanceToClosestReference(b, formScopedVendorSignals.sentTimestamps)
                );
              }
              return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
            })[0] ?? null
        : null;

    const contactTarget = (entityContactEmail ?? "").trim();
    // Partners: never match on entity `contact_email` vs Typeform "Email" — that field is the *partner*
    // respondent (e.g. guilherme@mercadolivre.com), while `contact_email` on the entity is often the
    // Jira reporter / VTEX focal and would steal an unrelated test response (same internal email).
    // Partner identity is the Jira summary / entity name vs official company-name question (e.g.
    // "Hi! What is the Company Name?") — see `byPartnerOfficialCompanyQuestion` below.
    const byEntityContactEmail =
      entityKind === "PARTNER"
        ? null
        : contactTarget.includes("@")
        ? normalizedItems
            .filter((item) => {
              const respondent = normalizeComparableToken(extractRespondentEmailFromTypeformAnswers(item.answers));
              const normalizedContact = normalizeComparableToken(contactTarget);
              if (!respondent || !normalizedContact || respondent !== normalizedContact) return false;

              if (entityKind === "VENDOR") {
                if (!Number.isNaN(referenceTimestamp)) {
                  if (!vendorResponseSubmittedOnOrAfterIssueCreated(item.submitted_at, referenceTimestamp)) {
                    return false;
                  }
                }
                // Company name check is a soft guard here: only block when a company name IS
                // present in the answers AND it clearly belongs to a different entity.
                // contact_email matching is already specific enough when the respondent email
                // equals the vendor's registered contact (e.g. the same person who received the
                // form link). Vendors often answer with a trade name instead of the legal entity
                // name stored in the system.
                if (
                  !vendorTypeformCompanyMatchesEntityIfPresent(item, targetName, targetNameLoose, targetNameStrict) &&
                  // Only hard-block when the vendor signals are empty (no dispatch record);
                  // if we have dispatch signals, the email match is already a strong enough anchor.
                  formScopedVendorSignals.recipientEmails.length === 0
                ) {
                  return false;
                }
              }

              return true;
            })
            .sort((a, b) => {
              if (!Number.isNaN(referenceTimestamp)) {
                return compareResponseDistance(a, referenceTimestamp) - compareResponseDistance(b, referenceTimestamp);
              }
              return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
            })[0] ?? null
        : null;

    const partnerOfficialNameMatchesEntity = (item: TypeformResponseItem) => {
      const companyNameRaw =
        extractOfficialPartnerCompanyNameAnswerWithForm(item.answers, formFields) ??
        extractOfficialPartnerCompanyNameAnswerWithForm(item.syncRawAnswers, formFields) ??
        undefined;
      if (!companyNameRaw) return false;
      const companyName = normalizeComparable(companyNameRaw);
      const companyNameLoose = normalizeLooseLookup(companyNameRaw);
      const companyNameStrict = normalizeStrictEntityKey(companyNameRaw);
      if (!companyName && !companyNameLoose && !companyNameStrict) return false;
      return (
        companyName === targetName ||
        companyName.includes(targetName) ||
        targetName.includes(companyName) ||
        companyNameLoose === targetNameLoose ||
        companyNameLoose.includes(targetNameLoose) ||
        targetNameLoose.includes(companyNameLoose) ||
        companyNameStrict === targetNameStrict ||
        companyNameStrict.includes(targetNameStrict) ||
        targetNameStrict.includes(companyNameStrict)
      );
    };

    const byPartnerOfficialCompanyQuestion =
      entityKind === "PARTNER"
        ? (() => {
            const pool = normalizedItems.filter((item) => {
              if (!partnerOfficialNameMatchesEntity(item)) return false;
              if (!Number.isNaN(referenceTimestamp)) {
                return vendorResponseSubmittedOnOrAfterIssueCreated(item.submitted_at, referenceTimestamp);
              }
              return true;
            });
            const hasRef = !Number.isNaN(referenceTimestamp);
            const inWindow = hasRef
              ? pool.filter((item) => isResponseWithinPartnerTimeWindow(item.submitted_at, referenceTimestamp))
              : pool;
            const usedTimeWindowFilter = hasRef && inWindow.length > 0 && inWindow.length < pool.length;
            const ranked = hasRef && inWindow.length > 0 ? inWindow : pool;
            lastPartnerMatchScan = {
              form_id: form.form_id,
              official_title_pool: pool.length,
              in_time_window: inWindow.length,
              used_time_window_filter: usedTimeWindowFilter,
            };
            return ranked
              .sort((a, b) => {
                if (!Number.isNaN(referenceTimestamp)) {
                  return compareResponseDistance(a, referenceTimestamp) - compareResponseDistance(b, referenceTimestamp);
                }
                return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
              })[0] ?? null;
          })()
        : null;

    const byJiraTicket =
      jiraIssueKey?.trim()
        ? normalizedItems
            .filter((item) => {
              const ticketRaw = extractTicketFromTypeformAnswers(item.answers);
              if (!ticketRaw?.trim()) return false;
              const t = normalizeJiraIssueKeyForMatch(ticketRaw);
              const target = normalizeJiraIssueKeyForMatch(jiraIssueKey);
              if (!t || !target) return false;
              if (t === target) return true;
              return t.includes(target) || target.includes(t);
            })
            .sort((a, b) => {
              if (!Number.isNaN(referenceTimestamp)) {
                return compareResponseDistance(a, referenceTimestamp) - compareResponseDistance(b, referenceTimestamp);
              }
              return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
            })[0] ?? null
        : null;

    const byCompanyName =
      normalizedItems
        .filter((item) => {
          if (
            (entityKind === "VENDOR" || entityKind === "PARTNER") &&
            !Number.isNaN(referenceTimestamp)
          ) {
            if (!vendorResponseSubmittedOnOrAfterIssueCreated(item.submitted_at, referenceTimestamp)) {
              return false;
            }
          }
          const companyNameRaw = extractCompanyNameFromTypeformAnswers(item.answers) ?? undefined;
          const companyName = normalizeComparable(companyNameRaw);
          const companyNameLoose = normalizeLooseLookup(companyNameRaw);
          const companyNameStrict = normalizeStrictEntityKey(companyNameRaw);
          if (!companyName && !companyNameLoose && !companyNameStrict) return false;
          return (
            companyName === targetName ||
            companyName.includes(targetName) ||
            targetName.includes(companyName) ||
            companyNameLoose === targetNameLoose ||
            companyNameLoose.includes(targetNameLoose) ||
            targetNameLoose.includes(companyNameLoose) ||
            companyNameStrict === targetNameStrict ||
            companyNameStrict.includes(targetNameStrict) ||
            targetNameStrict.includes(companyNameStrict)
          );
        })
        .sort((a, b) => {
          if (!Number.isNaN(referenceTimestamp)) {
            return compareResponseDistance(a, referenceTimestamp) - compareResponseDistance(b, referenceTimestamp);
          }

          if (formScopedVendorSignals.sentTimestamps.length > 0) {
            return (
              distanceToClosestReference(a, formScopedVendorSignals.sentTimestamps) -
              distanceToClosestReference(b, formScopedVendorSignals.sentTimestamps)
            );
          }

          return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
        })[0] ?? null;

    const candidate =
      byHiddenAssessment ??
      byHiddenJiraKey ??
      byHiddenDispatch ??
      byRecipientAndPeriod ??
      byEntityContactEmail ??
      byPartnerOfficialCompanyQuestion ??
      byJiraTicket ??
      byCompanyName;

    if (!candidate) continue;

    if (
      !matchedResponse ||
      (!Number.isNaN(referenceTimestamp) &&
        compareResponseDistance(candidate, referenceTimestamp) <
          compareResponseDistance(matchedResponse, referenceTimestamp)) ||
      (Number.isNaN(referenceTimestamp) &&
        Date.parse(candidate.submitted_at ?? "") > Date.parse(matchedResponse.submitted_at ?? ""))
    ) {
      matchedResponse = {
        ...candidate,
        form_id: form.form_id,
        form_name: form.name,
      };
    }
  }

  const existingAssessmentQuestionRows = (await sql`
    SELECT question_text
    FROM assessment_question_responses
    WHERE assessment_id = ${assessment.id}::uuid
    ORDER BY created_at ASC
    LIMIT 300 -- sample size to detect opaque (UUID-as-text) question rows from old schema
  `) as Array<{ question_text: string | null }>;
  const hasExistingAssessmentAnswers = existingAssessmentQuestionRows.length > 0;
  const hasOpaqueQuestionText = existingAssessmentQuestionRows.some((row) => {
    const question = String(row.question_text ?? "").trim();
    if (!question) return true;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(question);
  });

  const matchedToken = matchedResponse?.token ?? null;
  const tokenAlreadyLinked = Boolean(
    matchedToken &&
      assessment.typeform_response_token &&
      assessment.typeform_response_token === matchedToken,
  );
  const needsRehydration =
    tokenAlreadyLinked &&
    (!hasExistingAssessmentAnswers || hasOpaqueQuestionText);

  if (!matchedResponse?.token || (tokenAlreadyLinked && !needsRehydration)) {
    const missingMatch = !matchedResponse?.token;
    const everyResponsesFetchWas403 =
      missingMatch &&
      !anySuccessfulResponsesFetch &&
      responsesFetchFailureStatuses.length > 0 &&
      responsesFetchFailureStatuses.every((code) => code === 403);

    if (everyResponsesFetchWas403) {
      await logTypeformSyncDiagnostic({
        source: "entity_sync",
        entityId,
        entityName,
        entityKind,
        jiraIssueKey,
        assessmentId: assessment.id,
        formId: null,
        stage: "typeform_authorization",
        status: "error",
        message:
          "All Typeform GET .../responses calls returned 403. The API token cannot read responses for these forms (missing scopes, wrong account, or revoked token).",
        payload: {
          http_statuses: responsesFetchFailureStatuses,
          reference_source: referenceSource,
        },
      });
      return {
        status: "typeform_forbidden",
        assessmentId: assessment.id,
        responseToken: null,
      };
    }

    await logTypeformSyncDiagnostic({
      source: "entity_sync",
      entityId,
      entityName,
      entityKind,
      jiraIssueKey,
      assessmentId: assessment.id,
      formId: matchedResponse?.form_id ?? formId ?? null,
      stage: "match",
      status: "skipped",
      message: !matchedResponse?.token
        ? "No matching Typeform response token found for this entity."
        : "Matched response token is already linked to assessment.",
      payload: {
        matched_token: matchedResponse?.token ?? null,
        current_token: assessment.typeform_response_token,
        existing_answer_count: existingAssessmentQuestionRows.length,
        has_opaque_question_text: hasOpaqueQuestionText,
        reference_source: referenceSource,
        reference_timestamp_configured: !Number.isNaN(referenceTimestamp),
        last_partner_scan: lastPartnerMatchScan,
      },
    });
    return {
      status: !matchedResponse?.token ? "no_match" : "already_linked",
      assessmentId: assessment.id,
      responseToken: matchedResponse?.token ?? assessment.typeform_response_token ?? null,
    };
  }

  if (needsRehydration) {
    await logTypeformSyncDiagnostic({
      source: "entity_sync",
      entityId,
      entityName,
      entityKind,
      jiraIssueKey,
      assessmentId: assessment.id,
      formId: matchedResponse?.form_id ?? formId ?? null,
      stage: "rehydrate",
      status: "started",
      message: "Token already linked but stored answers are empty/opaque. Rehydrating from Typeform API.",
      payload: {
        existing_answer_count: existingAssessmentQuestionRows.length,
        has_opaque_question_text: hasOpaqueQuestionText,
        token: matchedToken,
      },
    });
  }

  const matchedForm = formMappings.find((form) => form.form_id === matchedResponse.form_id) ?? null;
  const answers = normalizeTypeformAnswers(flattenResponseAnswersArray(matchedResponse.answers));
  const questionMappings = await getQuestionMappings(matchedForm?.id);
  const sections =
    questionMappings.length > 0
      ? resolvePartnerSectionsFromMappings(answers, questionMappings)
      : resolvePartnerSectionsFromRules(answers, matchedForm?.section_rules ?? null);
  const partnerFormTable =
    entityKind === "PARTNER"
      ? resolvePartnerQuestionnaireTable({
          form_id: matchedResponse.form_id,
          name: matchedResponse.form_name,
        })
      : null;

  await sql`
    UPDATE assessments
    SET
      status = 'RESPONDED',
      responded_at = COALESCE(${matchedResponse.submitted_at ?? null}::timestamptz, now()),
      typeform_form_id = ${matchedResponse.form_id},
      typeform_response_token = ${matchedResponse.token},
      typeform_submitted_at = ${matchedResponse.submitted_at ?? null}::timestamptz,
      updated_at = now()
    WHERE id = ${assessment.id}::uuid
  `;

  await sql`DELETE FROM assessment_question_responses WHERE assessment_id = ${assessment.id}::uuid`;
  if (partnerFormTable) {
    await deletePartnerFormRows(partnerFormTable, assessment.id);
  }

  if (answers.length > 0) {
    const vendorQuestionMappings = await getQuestionMappings(matchedForm?.id);
    const resolvedSections =
      vendorQuestionMappings.length > 0
        ? resolvePartnerSectionsFromMappings(answers, vendorQuestionMappings)
        : answers.map(() => null as string | null);

    const assessmentIds = answers.map(() => assessment.id);
    const domains = answers.map((a) => a.domain);
    const questionRefs = answers.map((a) => a.questionRef || null);
    const questionTexts = answers.map((a) => a.question);
    const answerTexts = answers.map((a) => a.value);
    const sections = resolvedSections.map((s) => (s && s !== "UNCLASSIFIED" ? s : null));
    const questionOrders = answers.map((answer, index) => {
      if (!vendorQuestionMappings.length) return index + 1;
      const byRef = vendorQuestionMappings.find((m) => m.question_ref && m.question_ref === answer.questionRef);
      const byText = vendorQuestionMappings.find(
        (m) => normalizeComparable(m.question_text) === normalizeComparable(answer.question),
      );
      return (byRef ?? byText)?.question_order ?? index + 1;
    });

    await sql`
      INSERT INTO assessment_question_responses (
        assessment_id,
        domain,
        question_ref,
        question_text,
        answer_text,
        section,
        question_order,
        review_status
      )
      SELECT
        unnest(${assessmentIds}::uuid[]),
        unnest(${domains}::text[]),
        unnest(${questionRefs}::text[]),
        unnest(${questionTexts}::text[]),
        unnest(${answerTexts}::text[]),
        unnest(${sections}::typeform_question_section[]),
        unnest(${questionOrders}::integer[]),
        'NEEDS_REVIEW'
    `;
  }

  if (partnerFormTable) {
    for (const [index, answer] of answers.entries()) {
      await insertPartnerFormRow({
        tableName: partnerFormTable,
        entityId,
        assessmentId: assessment.id,
        jiraIssueKey,
        formId: matchedResponse.form_id,
        responseToken: matchedResponse.token,
        submittedAt: matchedResponse.submitted_at,
        companyName: entityName,
        questionOrder: index + 1,
        questionKey: answer.questionRef || answer.question,
        questionText: answer.question,
        answerText: answer.value,
        section: sections[index] ?? "UNCLASSIFIED",
        rawAnswer: answer,
      });
    }
  }

  await dedupeAssessmentQuestionResponses(assessment.id);

  await logTypeformSyncDiagnostic({
    source: "entity_sync",
    entityId,
    entityName,
    entityKind,
    jiraIssueKey,
    assessmentId: assessment.id,
    formId: matchedResponse.form_id,
    stage: "finish",
    status: "success",
    message: "External questionnaire synced successfully.",
    payload: {
      response_token: matchedResponse.token,
      answers_saved: answers.length,
      submitted_at: matchedResponse.submitted_at ?? null,
      reference_source: referenceSource,
      reference_timestamp_configured: !Number.isNaN(referenceTimestamp),
    },
  });

  return {
    status: "updated",
    assessmentId: assessment.id,
    responseToken: matchedResponse.token,
  };
}

export async function syncPartnerExternalQuestionnaire(entityId: string, entityName: string, jiraIssueKey?: string | null) {
  await syncExternalQuestionnaireForEntity({
    entityId,
    entityName,
    entityKind: "PARTNER",
    jiraIssueKey,
  });
}

export async function backfillExternalQuestionnaireForQueueTickets(input: {
  entityKind: "VENDOR" | "PARTNER";
  formId?: string | null;
}) {
  await logTypeformSyncDiagnostic({
    source: "queue_backfill",
    entityKind: input.entityKind,
    formId: input.formId ?? null,
    stage: "start",
    status: "started",
    message: "Starting queue backfill for external questionnaire.",
  });

  const entities = (await sql`
    SELECT id::text, name, jira_issue_key, contact_email, jira_issue_created_at::text AS jira_issue_created_at
    FROM entities
    WHERE kind = ${input.entityKind}::entity_kind
      AND jira_issue_key IS NOT NULL
    ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
  `) as Array<{
    id: string;
    name: string;
    jira_issue_key: string | null;
    contact_email: string | null;
    jira_issue_created_at: string | null;
  }>;

  await logTypeformSyncDiagnostic({
    source: "queue_backfill",
    entityKind: input.entityKind,
    formId: input.formId ?? null,
    stage: "entities_loaded",
    status: "started",
    message: "Loaded entities for queue backfill.",
    payload: { entity_count: entities.length },
  });

  for (const entity of entities) {
    try {
      await syncExternalQuestionnaireForEntity({
        entityId: entity.id,
        entityName: entity.name,
        entityKind: input.entityKind,
        jiraIssueKey: entity.jira_issue_key,
        entityContactEmail: entity.contact_email,
        entityJiraIssueCreatedAt: entity.jira_issue_created_at,
        formId: input.formId,
      });
    } catch (error) {
      console.warn(
        `[typeform-sync] failed to sync ${input.entityKind} questionnaire for entity ${entity.id}:`,
        error instanceof Error ? error.message : String(error),
      );
      await logTypeformSyncDiagnostic({
        source: "queue_backfill",
        entityId: entity.id,
        entityName: entity.name,
        entityKind: input.entityKind,
        jiraIssueKey: entity.jira_issue_key,
        formId: input.formId ?? null,
        stage: "entity_sync",
        status: "error",
        message: "Backfill failed for entity.",
        payload: { error: error instanceof Error ? error.message : String(error) },
      });
    }
  }

  await logTypeformSyncDiagnostic({
    source: "queue_backfill",
    entityKind: input.entityKind,
    formId: input.formId ?? null,
    stage: "finish",
    status: "success",
    message: "Queue backfill finished.",
    payload: { entity_count: entities.length },
  });
}
