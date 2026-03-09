import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeAssessmentId, normalizeTypeformAnswers, verifyTypeformSignature } from "@/lib/typeform";

export const runtime = "nodejs";

type TypeformWebhookPayload = {
  event_id?: string;
  event_type?: string;
  form_response?: {
    token?: string;
    submitted_at?: string;
    hidden?: Record<string, string>;
    definition?: { id?: string };
    answers?: Array<{
      type?: string;
      field?: { ref?: string; title?: string; type?: string };
      text?: string;
      email?: string;
      number?: number;
      boolean?: boolean;
      date?: string;
      url?: string;
      file_url?: string;
      phone_number?: string;
      choice?: { label?: string };
      choices?: { labels?: string[] };
    }>;
  };
};

type TypeformIntegrationRow = {
  enabled: boolean;
  config: {
    default_hidden_assessment_field?: string;
    webhook_mode?: "signed" | "unsigned";
  } | null;
};

type TypeformFormMapping = {
  id: string;
  form_id: string;
  entity_kind: "VENDOR" | "PARTNER" | null;
  workflow: string;
  hidden_assessment_field: string;
  enabled: boolean;
};

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const payload = JSON.parse(rawBody) as TypeformWebhookPayload;

    if (payload.event_type !== "form_response") {
      return NextResponse.json({ ok: true, message: "Event ignored (not form_response)." });
    }

    const formId = payload.form_response?.definition?.id?.trim();
    if (!formId) {
      return NextResponse.json({ ok: false, message: "Missing form_id in payload." }, { status: 400 });
    }

    let typeformSetting: TypeformIntegrationRow = {
      enabled: true,
      config: { default_hidden_assessment_field: "assessment_id", webhook_mode: "signed" },
    };

    try {
      const rows = (await sql`
        SELECT enabled, config
        FROM integration_settings
        WHERE provider = 'TYPEFORM'
        LIMIT 1
      `) as TypeformIntegrationRow[];

      if (rows.length > 0) {
        typeformSetting = rows[0];
      }
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code !== "42P01") {
        throw error;
      }
    }

    if (!typeformSetting.enabled) {
      return NextResponse.json({ ok: true, message: "Typeform integration disabled. Event ignored." });
    }

    const webhookMode = typeformSetting.config?.webhook_mode ?? "signed";
    if (webhookMode === "signed") {
      const secret = process.env.TYPEFORM_WEBHOOK_SECRET;
      if (!secret) {
        return NextResponse.json({ ok: false, message: "TYPEFORM_WEBHOOK_SECRET is not configured." }, { status: 500 });
      }

      const signature = request.headers.get("typeform-signature");
      const validSignature = verifyTypeformSignature(rawBody, signature, secret);
      if (!validSignature) {
        return NextResponse.json({ ok: false, message: "Invalid Typeform signature." }, { status: 401 });
      }
    }

    const eventId = payload.event_id ?? payload.form_response?.token;
    if (!eventId) {
      return NextResponse.json({ ok: false, message: "Missing event_id/token in payload." }, { status: 400 });
    }

    const savedEvent = (await sql`
      INSERT INTO typeform_webhook_events (event_id, event_type, form_id, payload)
      VALUES (
        ${eventId},
        ${payload.event_type ?? null},
        ${formId},
        ${rawBody}::jsonb
      )
      ON CONFLICT (event_id) DO NOTHING
      RETURNING event_id
    `) as Array<{ event_id: string }>;

    if (savedEvent.length === 0) {
      return NextResponse.json({ ok: true, message: "Duplicate event ignored." });
    }

    let formMapping: TypeformFormMapping | null = null;
    try {
      const rows = (await sql`
        SELECT id::text, form_id, entity_kind::text, workflow, hidden_assessment_field, enabled
        FROM typeform_forms
        WHERE form_id = ${formId}
        LIMIT 1
      `) as TypeformFormMapping[];

      formMapping = rows[0] ?? null;
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (code === "42P01") {
        formMapping = {
          id: "legacy",
          form_id: formId,
          entity_kind: null,
          workflow: "security_review",
          hidden_assessment_field:
            typeformSetting.config?.default_hidden_assessment_field || "assessment_id",
          enabled: true,
        };
      } else {
        throw error;
      }
    }

    if (!formMapping || !formMapping.enabled) {
      return NextResponse.json({ ok: true, message: "Form not configured or disabled. Event stored and ignored." });
    }

    const hiddenFieldName =
      formMapping.hidden_assessment_field || typeformSetting.config?.default_hidden_assessment_field || "assessment_id";

    const assessmentId = normalizeAssessmentId(payload.form_response?.hidden, hiddenFieldName);
    if (!assessmentId || !isValidUuid(assessmentId)) {
      return NextResponse.json(
        { ok: false, message: `Missing or invalid hidden field: ${hiddenFieldName}.` },
        { status: 400 },
      );
    }

    const assessmentRows = (await sql`
      SELECT a.id::text, e.kind::text AS entity_kind
      FROM assessments a
      INNER JOIN entities e ON e.id = a.entity_id
      WHERE a.id = ${assessmentId}::uuid
      LIMIT 1
    `) as Array<{ id: string; entity_kind: "VENDOR" | "PARTNER" }>;

    if (assessmentRows.length === 0) {
      return NextResponse.json({ ok: false, message: "Assessment not found for provided assessment_id." }, { status: 404 });
    }

    if (formMapping.entity_kind && formMapping.entity_kind !== assessmentRows[0].entity_kind) {
      return NextResponse.json(
        { ok: false, message: `Assessment entity kind mismatch. Expected ${formMapping.entity_kind}.` },
        { status: 400 },
      );
    }

    const answers = normalizeTypeformAnswers(payload.form_response?.answers);

    await sql`
      UPDATE assessments
      SET
        status = 'RESPONDED',
        responded_at = COALESCE(${payload.form_response?.submitted_at ?? null}::timestamptz, now()),
        typeform_form_id = ${payload.form_response?.definition?.id ?? null},
        typeform_response_token = ${payload.form_response?.token ?? null},
        typeform_submitted_at = ${payload.form_response?.submitted_at ?? null}::timestamptz
      WHERE id = ${assessmentId}::uuid
    `;

    await sql`DELETE FROM assessment_question_responses WHERE assessment_id = ${assessmentId}::uuid`;

    for (const answer of answers) {
      await sql`
        INSERT INTO assessment_question_responses (
          assessment_id,
          domain,
          question_text,
          answer_text,
          review_status
        )
        VALUES (
          ${assessmentId}::uuid,
          ${answer.domain},
          ${answer.question},
          ${answer.value},
          'NEEDS_REVIEW'
        )
      `;
    }

    return NextResponse.json({
      ok: true,
      message: "Typeform response processed successfully.",
      assessment_id: assessmentId,
      answers_saved: answers.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown webhook error.";
    return NextResponse.json({ ok: false, message }, { status: 500 });
  }
}
