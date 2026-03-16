"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensureVendorQuestionnaireSelection } from "@/lib/vendor-external-questionnaire";

export async function saveVendorExternalQuestionnaire(formData: FormData) {
  const entitySlug = String(formData.get("entity_slug") ?? "").trim();
  const assessmentId = String(formData.get("assessment_id") ?? "").trim();
  const selectedFormId = String(formData.get("typeform_form_id") ?? "").trim();

  if (!entitySlug || !assessmentId || !selectedFormId) {
    throw new Error("Invalid vendor questionnaire payload.");
  }

  await ensureVendorQuestionnaireSelection({
    assessmentId,
    entitySlug,
    selectedFormId,
  });

  revalidatePath(`/vendors/${entitySlug}`);
  redirect(`/vendors/${entitySlug}?tab=overview&questionnaire=saved`);
}
