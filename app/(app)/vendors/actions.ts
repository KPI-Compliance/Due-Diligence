"use server";

import { redirect } from "next/navigation";
import { getSessionErrorCode, refreshServerActionSession } from "@/lib/auth";
import { ensureVendorQuestionnaireSelection } from "@/lib/vendor-external-questionnaire";

export async function saveVendorExternalQuestionnaire(formData: FormData) {
  const sessionResult = await refreshServerActionSession("vendors.saveVendorExternalQuestionnaire");
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }

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

  redirect(`/vendors/${entitySlug}?tab=overview&questionnaire=saved`);
}
