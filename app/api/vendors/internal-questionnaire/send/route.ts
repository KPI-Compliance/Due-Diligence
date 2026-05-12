import { NextResponse } from "next/server";
import { resolveUserAccess } from "@/lib/access-control";
import { getAuthenticatedSessionResult, getSessionErrorCode } from "@/lib/auth";
import { sendVendorInternalQuestionnaire } from "@/lib/internal-questionnaire-dispatch";
import { isValidEmail, isValidSlug } from "@/lib/validators";
import { isSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const sessionResult = await getAuthenticatedSessionResult();
    if (!sessionResult.session) {
      return NextResponse.json(
        { ok: false, message: "Not authenticated.", error: getSessionErrorCode(sessionResult.reason) },
        { status: 401 },
      );
    }

    if (!isSameOrigin(request)) {
      return NextResponse.json({ ok: false, message: "Cross-origin request rejected." }, { status: 403 });
    }

    const access = await resolveUserAccess(sessionResult.session.email);
    if (!access.permissions.canWriteVendors) {
      return NextResponse.json({ ok: false, message: "Access denied." }, { status: 403 });
    }

    const payload = (await request.json()) as {
      entitySlug?: string;
      focalEmail?: string;
    };

    const entitySlug = String(payload.entitySlug ?? "").trim();
    const focalEmail = String(payload.focalEmail ?? "").trim();

    if (!entitySlug) {
      return NextResponse.json({ ok: false, message: "Invalid internal questionnaire payload." }, { status: 400 });
    }

    if (!isValidSlug(entitySlug)) {
      return NextResponse.json({ ok: false, message: "Invalid entity slug." }, { status: 400 });
    }

    if (focalEmail && !isValidEmail(focalEmail)) {
      return NextResponse.json({ ok: false, message: "Invalid focal email address." }, { status: 400 });
    }

    const result = await sendVendorInternalQuestionnaire({
      entitySlug,
      focalEmail,
    });

    return NextResponse.json({
      ok: true,
      vendorName: result.vendorName,
      jiraTicket: result.jiraTicket,
      focalEmail: result.focalEmail,
      formUrl: result.formUrl,
      slackMode: result.slackMode,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown internal questionnaire send error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
