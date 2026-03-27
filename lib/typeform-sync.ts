import { sql } from "@/lib/db";
import { fetchJiraIssueCreatedAt } from "@/lib/jira";
import { normalizeComparable } from "@/lib/normalization";
import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";
import { getTypeformApiCredentials } from "@/lib/typeform-admin";
import { getVendorQuestionnaireSignals } from "@/lib/vendor-questionnaire-dispatch";
import {
  applyTypeformFieldDefinitions,
  extractCompanyNameFromTypeformAnswers,
  extractRespondentEmailFromTypeformAnswers,
  normalizeTypeformAnswers,
  sortTypeformAnswersByFieldDefinitions,
  type TypeformAnswer,
  type TypeformFieldDefinition,
} from "@/lib/typeform";

type TypeformResponseItem = {
  token?: string;
  submitted_at?: string;
  answers?: TypeformAnswer[];
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
    console.warn(`Jira issue created_at fetch failed for ${issueKey}: ${(error as Error).message}`);
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

export async function syncExternalQuestionnaireForEntity(input: {
  entityId: string;
  entityName: string;
  entityKind: "VENDOR" | "PARTNER";
  jiraIssueKey?: string | null;
  formId?: string | null;
}) {
  const { entityId, entityName, entityKind, jiraIssueKey, formId } = input;
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
    return;
  }

  const formMappings = await getExternalFormMappings(entityKind, formId);

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
    return;
  }

  let latestAssessment = (await sql`
    SELECT id::text, typeform_response_token
    FROM assessments
    WHERE entity_id = ${entityId}::uuid
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ id: string; typeform_response_token: string | null }>;

  if (latestAssessment.length === 0) {
    latestAssessment = (await sql`
      INSERT INTO assessments (entity_id, title, status)
      VALUES (${entityId}::uuid, ${`External Questionnaire - ${entityName}`}, 'PENDING')
      RETURNING id::text, typeform_response_token
    `) as Array<{ id: string; typeform_response_token: string | null }>;
  }

  const assessment = latestAssessment[0];
  if (!assessment) return;

  const targetName = normalizeComparable(entityName);
  const jiraCreatedAt = await getJiraCreatedAt(jiraIssueKey);
  const jiraCreatedTimestamp = toTimestamp(jiraCreatedAt);
  const emptyVendorSignals = { recipientEmails: [], sentTimestamps: [] };
  let matchedResponse: (TypeformResponseItem & { form_id: string; form_name: string }) | null = null;

  for (const form of formMappings) {
    const formScopedVendorSignals =
      entityKind === "VENDOR"
        ? await getVendorQuestionnaireSignals({
            entityId,
            assessmentId: assessment.id,
            formId: form.form_id,
          })
        : emptyVendorSignals;

    const formFields = await getTypeformFormFields(form.form_id, token);
    const response = await fetch(`https://api.typeform.com/forms/${form.form_id}/responses?page_size=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`Typeform responses fetch failed for form ${form.form_id}: ${response.status}`);
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
        payload: { http_status: response.status },
      });
      continue;
    }

    const payload = (await response.json()) as TypeformResponsesApiResponse;
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
      payload: { response_count: payload.items?.length ?? 0 },
    });
    const configuredHiddenField = normalizeComparableToken(form.hidden_assessment_field ?? "assessment_id");
    const hiddenFieldCandidates = [configuredHiddenField, "assessment_id"].filter(Boolean);
    const targetAssessmentId = normalizeComparableToken(assessment.id);

    const normalizedItems =
      payload.items?.map((item) => ({
        ...item,
        answers: sortTypeformAnswersByFieldDefinitions(applyTypeformFieldDefinitions(item.answers, formFields), formFields),
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

    const byCompanyName =
      normalizedItems
        .filter((item) => {
          const companyName = normalizeComparable(extractCompanyNameFromTypeformAnswers(item.answers) ?? undefined);
          if (!companyName) return false;
          return companyName === targetName || companyName.includes(targetName) || targetName.includes(companyName);
        })
        .sort((a, b) => {
          if (!Number.isNaN(jiraCreatedTimestamp)) {
            return compareResponseDistance(a, jiraCreatedTimestamp) - compareResponseDistance(b, jiraCreatedTimestamp);
          }

          if (formScopedVendorSignals.sentTimestamps.length > 0) {
            return (
              distanceToClosestReference(a, formScopedVendorSignals.sentTimestamps) -
              distanceToClosestReference(b, formScopedVendorSignals.sentTimestamps)
            );
          }

          return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
        })[0] ?? null;

    const byRecipientAndPeriod =
      entityKind === "VENDOR" && formScopedVendorSignals.recipientEmails.length > 0
        ? normalizedItems
            .filter((item) => {
              const respondentEmail = normalizeComparableToken(extractRespondentEmailFromTypeformAnswers(item.answers));
              if (!respondentEmail || !respondentEmail.includes("@")) return false;
              if (!formScopedVendorSignals.recipientEmails.includes(respondentEmail)) return false;

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

    const candidate = byHiddenAssessment ?? byRecipientAndPeriod ?? byCompanyName;

    if (!candidate) continue;

    if (
      !matchedResponse ||
      (!Number.isNaN(jiraCreatedTimestamp) &&
        compareResponseDistance(candidate, jiraCreatedTimestamp) <
          compareResponseDistance(matchedResponse, jiraCreatedTimestamp)) ||
      (Number.isNaN(jiraCreatedTimestamp) &&
        Date.parse(candidate.submitted_at ?? "") > Date.parse(matchedResponse.submitted_at ?? ""))
    ) {
      matchedResponse = {
        ...candidate,
        form_id: form.form_id,
        form_name: form.name,
      };
    }
  }

  if (!matchedResponse?.token || assessment.typeform_response_token === matchedResponse.token) {
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
      },
    });
    return;
  }

  const matchedForm = formMappings.find((form) => form.form_id === matchedResponse.form_id) ?? null;
  const answers = normalizeTypeformAnswers(matchedResponse.answers);
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

  for (const [index, answer] of answers.entries()) {
    await sql`
      INSERT INTO assessment_question_responses (
        assessment_id,
        domain,
        question_text,
        answer_text,
        review_status
      )
      VALUES (
        ${assessment.id}::uuid,
        ${answer.domain},
        ${answer.question},
        ${answer.value},
        'NEEDS_REVIEW'
      )
    `;

    if (partnerFormTable) {
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
    },
  });
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
    SELECT id::text, name, jira_issue_key
    FROM entities
    WHERE kind = ${input.entityKind}::entity_kind
      AND jira_issue_key IS NOT NULL
    ORDER BY jira_synced_at DESC NULLS LAST, updated_at DESC
  `) as Array<{ id: string; name: string; jira_issue_key: string | null }>;

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
