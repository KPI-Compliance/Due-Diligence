"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { recalculatePartnerAssessmentDecision } from "@/lib/partner-risk-scoring";

const allowedTables = new Set([
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
]);

const allowedEvaluations = new Set(["NOT_EVALUATED", "NA", "DOES_NOT_MEET", "PARTIALLY", "FULLY"]);

export async function savePartnerExternalQuestionnaireSection(formData: FormData) {
  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim() || null;
  const tableName = String(formData.get("response_table") ?? "").trim();
  const activeTab = String(formData.get("active_tab") ?? "external_questionnaire").trim() || "external_questionnaire";
  const activeSection = String(formData.get("active_section") ?? "Common").trim() || "Common";

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

  if (responseIds.length > 0) {
    await recalculatePartnerAssessmentDecision(
      tableName as
        | "partner_typeform_assessment_en_responses"
        | "partner_typeform_assessment_ptbr_responses"
        | "partner_typeform_assessment_en_v2_responses"
        | "partner_typeform_assessment_pt_v2_responses",
      responseIds[0],
      assessmentId,
    );
  }

  revalidatePath(`/partners/${entitySlug}`);
  redirect(`/partners/${entitySlug}?tab=${encodeURIComponent(activeTab)}&section=${encodeURIComponent(activeSection)}&saved=1`);
}
