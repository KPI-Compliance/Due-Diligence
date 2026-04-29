import { sql } from "@/lib/db";
import { syncExternalQuestionnaireForEntity } from "@/lib/typeform-sync";

export type TypeformResponseIntegrityItem = {
  assessmentId: string;
  entityId: string;
  entityName: string;
  entityKind: "VENDOR" | "PARTNER";
  jiraIssueKey: string | null;
  status: string;
  responseCount: number;
  opaqueQuestionCount: number;
  typeformFormId: string | null;
  typeformResponseToken: string | null;
};

/** Public health payloads must not expose Typeform response tokens. */
export type TypeformResponseIntegrityHealthItem = Omit<TypeformResponseIntegrityItem, "typeformResponseToken">;

function parseEntityKind(value: string | null | undefined): "VENDOR" | "PARTNER" | "ALL" {
  const normalized = String(value ?? "ALL").trim().toUpperCase();
  if (normalized === "VENDOR" || normalized === "PARTNER" || normalized === "ALL") {
    return normalized;
  }
  return "ALL";
}

function parsePositiveInt(value: number | undefined, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.floor(value as number);
  return normalized > 0 ? normalized : fallback;
}

export async function getTypeformResponseIntegrityIssues(input?: {
  entityKind?: "VENDOR" | "PARTNER" | "ALL";
  limit?: number;
}) {
  const entityKind = parseEntityKind(input?.entityKind);
  const limit = parsePositiveInt(input?.limit, 200);

  const rows = (await sql`
    WITH latest AS (
      SELECT DISTINCT ON (a.entity_id)
        a.id::text AS assessment_id,
        a.entity_id::text AS entity_id,
        a.status::text AS status,
        a.typeform_form_id,
        a.typeform_response_token,
        e.name AS entity_name,
        e.kind::text AS entity_kind,
        e.jira_issue_key
      FROM assessments a
      JOIN entities e ON e.id = a.entity_id
      WHERE a.status = 'RESPONDED'
        AND (${entityKind}::text = 'ALL' OR e.kind::text = ${entityKind}::text)
      ORDER BY a.entity_id, a.created_at DESC
    )
    SELECT
      l.assessment_id,
      l.entity_id,
      l.entity_name,
      l.entity_kind,
      l.jira_issue_key,
      l.status,
      l.typeform_form_id,
      l.typeform_response_token,
      COUNT(aqr.*)::int AS response_count,
      COUNT(*) FILTER (
        WHERE aqr.question_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )::int AS opaque_question_count
    FROM latest l
    LEFT JOIN assessment_question_responses aqr
      ON aqr.assessment_id = l.assessment_id::uuid
    GROUP BY
      l.assessment_id,
      l.entity_id,
      l.entity_name,
      l.entity_kind,
      l.jira_issue_key,
      l.status,
      l.typeform_form_id,
      l.typeform_response_token
    HAVING
      COUNT(aqr.*) = 0
      OR COUNT(*) FILTER (
        WHERE aqr.question_text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      ) > 0
    ORDER BY l.entity_name ASC
    LIMIT ${limit}
  `) as Array<{
    assessment_id: string;
    entity_id: string;
    entity_name: string;
    entity_kind: "VENDOR" | "PARTNER";
    jira_issue_key: string | null;
    status: string;
    response_count: number;
    opaque_question_count: number;
    typeform_form_id: string | null;
    typeform_response_token: string | null;
  }>;

  return rows.map((row) => ({
    assessmentId: row.assessment_id,
    entityId: row.entity_id,
    entityName: row.entity_name,
    entityKind: row.entity_kind,
    jiraIssueKey: row.jira_issue_key,
    status: row.status,
    responseCount: Number(row.response_count ?? 0),
    opaqueQuestionCount: Number(row.opaque_question_count ?? 0),
    typeformFormId: row.typeform_form_id,
    typeformResponseToken: row.typeform_response_token,
  })) as TypeformResponseIntegrityItem[];
}

export async function getTypeformResponseIntegrityHealth(input?: {
  entityKind?: "VENDOR" | "PARTNER" | "ALL";
  limit?: number;
}) {
  const issues = await getTypeformResponseIntegrityIssues(input);
  const respondedWithoutAnswers = issues.filter((item) => item.responseCount === 0).length;
  const respondedWithOpaqueQuestions = issues.filter((item) => item.opaqueQuestionCount > 0).length;

  const items: TypeformResponseIntegrityHealthItem[] = issues.map((item) => {
    const { typeformResponseToken: _token, ...rest } = item;
    void _token;
    return rest;
  });

  return {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    totalIssues: issues.length,
    respondedWithoutAnswers,
    respondedWithOpaqueQuestions,
    items,
  };
}

export async function autoRepairTypeformResponseIntegrity(input?: {
  entityKind?: "VENDOR" | "PARTNER" | "ALL";
  limit?: number;
}) {
  const issues = await getTypeformResponseIntegrityIssues(input);
  let repaired = 0;
  let failed = 0;
  const errors: Array<{ assessmentId: string; issueKey: string | null; message: string }> = [];

  for (const issue of issues) {
    try {
      const result = await syncExternalQuestionnaireForEntity({
        entityId: issue.entityId,
        entityName: issue.entityName,
        entityKind: issue.entityKind,
        jiraIssueKey: issue.jiraIssueKey,
        formId: issue.typeformFormId,
      });

      if (result.status === "updated" || result.status === "already_linked") {
        repaired += 1;
      }
    } catch (error) {
      failed += 1;
      errors.push({
        assessmentId: issue.assessmentId,
        issueKey: issue.jiraIssueKey,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const after = await getTypeformResponseIntegrityHealth(input);
  return {
    ok: failed === 0 && after.totalIssues === 0,
    checkedAt: new Date().toISOString(),
    scanned: issues.length,
    repaired,
    failed,
    remainingIssues: after.totalIssues,
    errors,
    after,
  };
}
