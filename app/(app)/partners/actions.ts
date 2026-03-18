"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { addInternalCommentToConfiguredJiraIssue } from "@/lib/jira";
import { recalculatePartnerAssessmentDecision } from "@/lib/partner-risk-scoring";

const allowedTables = new Set([
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
]);

const allowedEvaluations = new Set(["NOT_EVALUATED", "NA", "DOES_NOT_MEET", "PARTIALLY", "FULLY"]);
const allowedSections = new Set(["Compliance", "Privacy", "Security"]);

async function getRepresentativeResponseIdForAssessment(tableName: string, assessmentId: string) {
  if (tableName === "partner_typeform_assessment_ptbr_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_ptbr_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  if (tableName === "partner_typeform_assessment_en_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_en_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  if (tableName === "partner_typeform_assessment_en_v2_responses") {
    const rows = (await sql`
      SELECT id::text
      FROM partner_typeform_assessment_en_v2_responses
      WHERE assessment_id = ${assessmentId}::uuid
      ORDER BY question_order ASC, created_at ASC
      LIMIT 1
    `) as Array<{ id: string }>;
    return rows[0]?.id ?? null;
  }

  const rows = (await sql`
    SELECT id::text
    FROM partner_typeform_assessment_pt_v2_responses
    WHERE assessment_id = ${assessmentId}::uuid
    ORDER BY question_order ASC, created_at ASC
    LIMIT 1
  `) as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function savePartnerExternalQuestionnaireSection(formData: FormData) {
  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim() || null;
  const tableName = String(formData.get("response_table") ?? "").trim();
  const activeTab = String(formData.get("active_tab") ?? "external_questionnaire").trim() || "external_questionnaire";
  const activeSection = String(formData.get("active_section") ?? "Common").trim() || "Common";
  const sectionFinalObservation = String(formData.get("section_final_observation") ?? "").trim();
  const submitIntent = String(formData.get("submit_intent") ?? "save_section").trim();
  const jiraIssueKey = String(formData.get("jira_issue_key") ?? "").trim();

  if (!entitySlug || !allowedTables.has(tableName)) {
    throw new Error("Invalid questionnaire save payload.");
  }

  const responseIds = formData.getAll("response_id").map((value) => String(value).trim()).filter(Boolean);
  let updatedRows = 0;

  for (const responseId of responseIds) {
    const evaluationRaw = String(formData.get(`evaluation_${responseId}`) ?? "NOT_EVALUATED").trim().toUpperCase();
    const analystEvaluation = allowedEvaluations.has(evaluationRaw) ? evaluationRaw : "NOT_EVALUATED";
    const analystObservations = String(formData.get(`observations_${responseId}`) ?? "").trim();

    if (tableName === "partner_typeform_assessment_ptbr_responses") {
      const result = (await sql`
        UPDATE partner_typeform_assessment_ptbr_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
        RETURNING id
      `) as Array<{ id: string }>;
      updatedRows += result.length;
      continue;
    }

    if (tableName === "partner_typeform_assessment_en_responses") {
      const result = (await sql`
        UPDATE partner_typeform_assessment_en_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
        RETURNING id
      `) as Array<{ id: string }>;
      updatedRows += result.length;
      continue;
    }

    if (tableName === "partner_typeform_assessment_en_v2_responses") {
      const result = (await sql`
        UPDATE partner_typeform_assessment_en_v2_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
        RETURNING id
      `) as Array<{ id: string }>;
      updatedRows += result.length;
      continue;
    }

    const result = (await sql`
      UPDATE partner_typeform_assessment_pt_v2_responses
      SET
        analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
        analyst_observations = ${analystObservations},
        analyzed_at = CASE
          WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
          ELSE now()
        END
      WHERE id = ${responseId}::uuid
      RETURNING id
    `) as Array<{ id: string }>;
    updatedRows += result.length;
  }

  if (responseIds.length > 0 && updatedRows === 0) {
    throw new Error("No questionnaire responses were updated.");
  }

  const responseIdForScoring =
    responseIds[0] ?? (assessmentId ? await getRepresentativeResponseIdForAssessment(tableName, assessmentId) : null);

  if (responseIdForScoring) {
    await recalculatePartnerAssessmentDecision(
      tableName as
        | "partner_typeform_assessment_en_responses"
        | "partner_typeform_assessment_ptbr_responses"
        | "partner_typeform_assessment_en_v2_responses"
        | "partner_typeform_assessment_pt_v2_responses",
      responseIdForScoring,
      assessmentId,
    );
  }

  if (assessmentId && allowedSections.has(activeSection)) {
    const noteValue = sectionFinalObservation || null;
    const updatedNotes = (await sql`
      UPDATE assessment_notes
      SET notes = ${noteValue}
      WHERE assessment_id = ${assessmentId}::uuid
        AND section = ${activeSection}
      RETURNING id
    `) as Array<{ id: string }>;

    if (updatedNotes.length === 0 && noteValue !== null) {
      await sql`
        INSERT INTO assessment_notes (assessment_id, section, notes)
        VALUES (${assessmentId}::uuid, ${activeSection}, ${noteValue})
      `;
    }
  }

  revalidatePath(`/partners/${entitySlug}`);
  if (submitIntent === "finalize_review") {
    let jiraSynced = false;

    if (allowedSections.has(activeSection) && sectionFinalObservation && jiraIssueKey) {
      try {
        await addInternalCommentToConfiguredJiraIssue({
          issueKey: jiraIssueKey,
          entityKind: "PARTNER",
          commentBody: `${activeSection} analysis\n\n"${sectionFinalObservation}"`,
        });
        jiraSynced = true;
      } catch {
        redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&jira_error=1`);
      }
    }

    redirect(`/partners/${entitySlug}?tab=decision&saved=1${jiraSynced ? "&jira_synced=1" : ""}`);
  }

  redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&saved=1`);
}
