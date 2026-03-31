import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeDispatchId } from "@/lib/vendor-questionnaire-dispatch";

export const runtime = "nodejs";

type DispatchTargetRow = {
  form_id: string;
  assessment_id: string;
  hidden_assessment_field: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ dispatchId: string }> },
) {
  const params = await context.params;
  const dispatchId = normalizeDispatchId(params.dispatchId);
  if (!dispatchId) {
    return NextResponse.json({ ok: false, message: "Invalid dispatch id." }, { status: 400 });
  }

  const rows = (await sql`
    SELECT
      d.form_id,
      d.assessment_id::text AS assessment_id,
      f.hidden_assessment_field
    FROM vendor_external_questionnaire_dispatches d
    LEFT JOIN typeform_forms f ON f.form_id = d.form_id
    WHERE d.dispatch_id = ${dispatchId}::uuid
    ORDER BY f.enabled DESC NULLS LAST, f.created_at DESC NULLS LAST, d.sent_at DESC
    LIMIT 1
  `) as DispatchTargetRow[];

  const target = rows[0];
  if (!target?.form_id || !target?.assessment_id) {
    return NextResponse.json({ ok: false, message: "Dispatch not found." }, { status: 404 });
  }

  const hiddenAssessmentField = (target.hidden_assessment_field ?? "assessment_id").trim() || "assessment_id";
  const redirectUrl = new URL(`https://form.typeform.com/to/${target.form_id}`);
  redirectUrl.searchParams.set("dispatch_id", dispatchId);
  redirectUrl.searchParams.set("assessment_id", target.assessment_id);
  if (hiddenAssessmentField !== "assessment_id") {
    redirectUrl.searchParams.set(hiddenAssessmentField, target.assessment_id);
  }

  return NextResponse.redirect(redirectUrl, { status: 302 });
}
