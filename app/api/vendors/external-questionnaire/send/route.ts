import { NextResponse } from "next/server";
import { recordVendorExternalQuestionnaireSend } from "@/lib/vendor-external-questionnaire";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      entitySlug?: string;
      assessmentId?: string;
      selectedFormId?: string;
      recipients?: string[];
      hiddenAssessmentField?: string;
      questionnaireBaseUrl?: string;
    };

    const entitySlug = String(payload.entitySlug ?? "").trim();
    const assessmentId = String(payload.assessmentId ?? "").trim();
    const selectedFormId = String(payload.selectedFormId ?? "").trim();
    const hiddenAssessmentField = String(payload.hiddenAssessmentField ?? "").trim();
    const questionnaireBaseUrl = String(payload.questionnaireBaseUrl ?? "").trim();
    const recipients = Array.isArray(payload.recipients)
      ? payload.recipients.map((item) => String(item).trim()).filter(Boolean)
      : [];

    if ((!assessmentId && !entitySlug) || !selectedFormId || !questionnaireBaseUrl || recipients.length === 0) {
      return NextResponse.json({ ok: false, message: "Invalid send payload." }, { status: 400 });
    }

    const result = await recordVendorExternalQuestionnaireSend({
      entitySlug,
      assessmentId,
      selectedFormId,
      recipients,
      hiddenAssessmentField,
      questionnaireBaseUrl,
    });

    return NextResponse.json({ ok: true, assessmentId: result.assessmentId, questionnaireUrl: result.questionnaireUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
