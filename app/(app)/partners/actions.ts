"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";

const allowedTables = new Set([
  "partner_typeform_assessment_en_responses",
  "partner_typeform_assessment_ptbr_responses",
  "partner_typeform_assessment_en_v2_responses",
  "partner_typeform_assessment_pt_v2_responses",
]);

const allowedEvaluations = new Set(["NOT_EVALUATED", "NA", "DOES_NOT_MEET", "PARTIALLY", "FULLY"]);

export async function savePartnerExternalQuestionnaireSection(formData: FormData) {
  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const tableName = String(formData.get("response_table") ?? "").trim();

  if (!entitySlug || !allowedTables.has(tableName)) {
    throw new Error("Invalid questionnaire save payload.");
  }

  const responseIds = formData.getAll("response_id").map((value) => String(value).trim()).filter(Boolean);

  for (const responseId of responseIds) {
    const evaluationRaw = String(formData.get(`evaluation_${responseId}`) ?? "NOT_EVALUATED").trim().toUpperCase();
    const analystEvaluation = allowedEvaluations.has(evaluationRaw) ? evaluationRaw : "NOT_EVALUATED";
    const analystObservations = String(formData.get(`observations_${responseId}`) ?? "").trim();

    if (tableName === "partner_typeform_assessment_ptbr_responses") {
      await sql`
        UPDATE partner_typeform_assessment_ptbr_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
      `;
      continue;
    }

    if (tableName === "partner_typeform_assessment_en_responses") {
      await sql`
        UPDATE partner_typeform_assessment_en_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
      `;
      continue;
    }

    if (tableName === "partner_typeform_assessment_en_v2_responses") {
      await sql`
        UPDATE partner_typeform_assessment_en_v2_responses
        SET
          analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
          analyst_observations = ${analystObservations},
          analyzed_at = CASE
            WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
            ELSE now()
          END
        WHERE id = ${responseId}::uuid
      `;
      continue;
    }

    await sql`
      UPDATE partner_typeform_assessment_pt_v2_responses
      SET
        analyst_evaluation = ${analystEvaluation}::analyst_evaluation_status,
        analyst_observations = ${analystObservations},
        analyzed_at = CASE
          WHEN ${analystEvaluation} = 'NOT_EVALUATED' AND ${analystObservations} = '' THEN NULL
          ELSE now()
        END
      WHERE id = ${responseId}::uuid
    `;
  }

  revalidatePath(`/partners/${entitySlug}`);
}
