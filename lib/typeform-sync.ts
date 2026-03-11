import { sql } from "@/lib/db";
import { fetchJiraIssueCreatedAt } from "@/lib/jira";
import { getIntegrationSettings, type JiraConfig } from "@/lib/settings-data";
import { extractCompanyNameFromTypeformAnswers, normalizeTypeformAnswers, type TypeformAnswer } from "@/lib/typeform";

type TypeformResponseItem = {
  token?: string;
  submitted_at?: string;
  answers?: TypeformAnswer[];
};

type TypeformResponsesApiResponse = {
  items?: TypeformResponseItem[];
};

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function getTypeformToken() {
  return process.env.TYPEFORM_API_TOKEN ?? process.env.TYPEFORM_ACCESS_TOKEN ?? null;
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

export async function syncPartnerExternalQuestionnaire(entityId: string, entityName: string, jiraIssueKey?: string | null) {
  const token = getTypeformToken();
  if (!token) return;

  const formMappings = (await sql`
    SELECT form_id
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND (entity_kind = 'PARTNER' OR entity_kind IS NULL)
    ORDER BY created_at DESC
  `) as Array<{ form_id: string }>;

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
  let matchedResponse: (TypeformResponseItem & { form_id: string }) | null = null;

  for (const form of formMappings) {
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
        ?.filter((item) => normalizeComparable(extractCompanyNameFromTypeformAnswers(item.answers) ?? undefined) === targetName)
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
      };
    }
  }

  if (!matchedResponse?.token || assessment.typeform_response_token === matchedResponse.token) {
    return;
  }

  const answers = normalizeTypeformAnswers(matchedResponse.answers);

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

  for (const answer of answers) {
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
  }
}
