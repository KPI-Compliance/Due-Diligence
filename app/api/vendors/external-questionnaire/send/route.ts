import { NextResponse } from "next/server";
import { resolveUserAccess } from "@/lib/access-control";
import { getAuthenticatedSessionResult, getSessionErrorCode } from "@/lib/auth";
import { sendVendorInternalQuestionnaire } from "@/lib/internal-questionnaire-dispatch";
import { recordVendorExternalQuestionnaireSend } from "@/lib/vendor-external-questionnaire";
import { isValidEmail, isValidSlug, isValidUuid, isValidTypeformFormId } from "@/lib/validators";

export const runtime = "nodejs";

const MAX_RECIPIENTS = 20;

export async function POST(request: Request) {
  try {
    const sessionResult = await getAuthenticatedSessionResult();
    if (!sessionResult.session) {
      return NextResponse.json(
        { ok: false, message: "Not authenticated.", error: getSessionErrorCode(sessionResult.reason) },
        { status: 401 },
      );
    }

    const access = await resolveUserAccess(sessionResult.session.email);
    if (!access.permissions.canWriteVendors) {
      return NextResponse.json({ ok: false, message: "Access denied." }, { status: 403 });
    }

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

    if (!entitySlug || !selectedFormId || !questionnaireBaseUrl || recipients.length === 0) {
      return NextResponse.json({ ok: false, message: "Invalid send payload." }, { status: 400 });
    }

    if (!isValidSlug(entitySlug)) {
      return NextResponse.json({ ok: false, message: "Invalid entity slug." }, { status: 400 });
    }

    if (!isValidTypeformFormId(selectedFormId)) {
      return NextResponse.json({ ok: false, message: "Invalid form ID." }, { status: 400 });
    }

    if (assessmentId && !isValidUuid(assessmentId)) {
      return NextResponse.json({ ok: false, message: "Invalid assessment ID." }, { status: 400 });
    }

    if (recipients.length > MAX_RECIPIENTS) {
      return NextResponse.json(
        { ok: false, message: `Too many recipients (max ${MAX_RECIPIENTS}).` },
        { status: 400 },
      );
    }

    const invalidEmails = recipients.filter((email) => !isValidEmail(email));
    if (invalidEmails.length > 0) {
      return NextResponse.json(
        { ok: false, message: "One or more recipient email addresses are invalid." },
        { status: 400 },
      );
    }

    const result = await recordVendorExternalQuestionnaireSend({
      entitySlug,
      assessmentId,
      selectedFormId,
      recipients,
      hiddenAssessmentField,
      questionnaireBaseUrl,
      questionnaireEntryBaseUrl: new URL(request.url).origin,
    });

    let internalQuestionnaireResult:
      | { ok: true; mode: "dm" | "channel"; focalEmail: string | null }
      | { ok: false; message: string }
      | null = null;

    if (entitySlug) {
      try {
        const internalResult = await sendVendorInternalQuestionnaire({ entitySlug });
        internalQuestionnaireResult = {
          ok: true,
          mode: internalResult.slackMode,
          focalEmail: internalResult.focalEmail,
        };
      } catch (error) {
        internalQuestionnaireResult = {
          ok: false,
          message: error instanceof Error ? error.message : "Falha ao enviar mini questionário interno no Slack.",
        };
      }
    }

    return NextResponse.json({
      ok: true,
      assessmentId: result.assessmentId,
      questionnaireUrl: result.questionnaireUrl,
      internalQuestionnaire: internalQuestionnaireResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown send error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
