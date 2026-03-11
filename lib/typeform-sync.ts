import { sql } from "@/lib/db";
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

export async function syncPartnerExternalQuestionnaire(entityId: string, entityName: string) {
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
        .sort((a, b) => Date.parse(b.submitted_at ?? "") - Date.parse(a.submitted_at ?? ""))[0] ?? null;

    if (!candidate) continue;

    if (!matchedResponse || Date.parse(candidate.submitted_at ?? "") > Date.parse(matchedResponse.submitted_at ?? "")) {
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
