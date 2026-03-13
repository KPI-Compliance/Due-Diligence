import { sql } from "@/lib/db";
import { fetchJiraIssueCreatedAt } from "@/lib/jira";
import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";
import { getTypeformApiCredentials } from "@/lib/typeform-admin";
import {
  applyTypeformFieldDefinitions,
  extractCompanyNameFromTypeformAnswers,
  normalizeTypeformAnswers,
  sortTypeformAnswersByFieldDefinitions,
  type TypeformAnswer,
  type TypeformFieldDefinition,
} from "@/lib/typeform";

type TypeformResponseItem = {
  token?: string;
  submitted_at?: string;
  answers?: TypeformAnswer[];
};

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

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
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

export async function syncPartnerExternalQuestionnaire(entityId: string, entityName: string, jiraIssueKey?: string | null) {
  const { token } = await getTypeformApiCredentials();
  if (!token) return;

  const formMappings = (await sql`
    SELECT id::text, form_id, name, section_rules
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND (entity_kind = 'PARTNER' OR entity_kind IS NULL)
    ORDER BY created_at DESC
  `) as PartnerFormMappingRow[];

  if (formMappings.length === 0) return;

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
  let matchedResponse: (TypeformResponseItem & { form_id: string; form_name: string }) | null = null;

  for (const form of formMappings) {
    const formFields = await getTypeformFormFields(form.form_id, token);
    const response = await fetch(`https://api.typeform.com/forms/${form.form_id}/responses?page_size=100`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn(`Typeform responses fetch failed for form ${form.form_id}: ${response.status}`);
      continue;
    }

    const payload = (await response.json()) as TypeformResponsesApiResponse;
    const candidate =
      payload.items
        ?.map((item) => ({
          ...item,
          answers: sortTypeformAnswersByFieldDefinitions(applyTypeformFieldDefinitions(item.answers, formFields), formFields),
        }))
        .filter((item) => normalizeComparable(extractCompanyNameFromTypeformAnswers(item.answers) ?? undefined) === targetName)
        .sort((a, b) => {
          if (!Number.isNaN(jiraCreatedTimestamp)) {
            return compareResponseDistance(a, jiraCreatedTimestamp) - compareResponseDistance(b, jiraCreatedTimestamp);
          }

          return Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? "");
        })[0] ?? null;

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
    return;
  }

  const matchedForm = formMappings.find((form) => form.form_id === matchedResponse.form_id) ?? null;
  const answers = normalizeTypeformAnswers(matchedResponse.answers);
  const questionMappings = await getQuestionMappings(matchedForm?.id);
  const sections =
    questionMappings.length > 0
      ? resolvePartnerSectionsFromMappings(answers, questionMappings)
      : resolvePartnerSectionsFromRules(answers, matchedForm?.section_rules ?? null);
  const partnerFormTable = resolvePartnerQuestionnaireTable({
    form_id: matchedResponse.form_id,
    name: matchedResponse.form_name,
  });

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
}
