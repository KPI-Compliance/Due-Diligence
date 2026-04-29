import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { normalizeLooseLookup } from "@/lib/normalization";
import { fetchTypeformFormFields } from "@/lib/typeform-admin";
import {
  findVendorAssessmentByDispatchId,
  findVendorAssessmentByRecipientDispatch,
  normalizeDispatchId,
} from "@/lib/vendor-questionnaire-dispatch";
import {
  applyTypeformFieldDefinitions,
  extractCompanyNameFromTypeformAnswers,
  extractRespondentEmailFromTypeformAnswers,
  extractTicketFromTypeformAnswers,
  normalizeAssessmentId,
  normalizeTypeformAnswers,
  sortTypeformAnswersByFieldDefinitions,
  verifyTypeformSignature,
} from "@/lib/typeform";

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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function normalizeComparable(value: string | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function normalizeStrictEntityKey(value: string | undefined) {
  return normalizeComparable(value).replace(/[^a-z0-9]+/g, "");
}

function normalizeEmail(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function extractDispatchIdFromHidden(hidden: Record<string, string> | undefined) {
  if (!hidden || typeof hidden !== "object") return null;
  return (
    normalizeDispatchId(hidden.dispatch_id) ??
    normalizeDispatchId(hidden.dispatchId) ??
    normalizeDispatchId(hidden.dispatch) ??
    null
  );
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

const MATCH_WINDOW_BEFORE_MS = 3 * 24 * 60 * 60 * 1000;
const MATCH_WINDOW_AFTER_MS = 120 * 24 * 60 * 60 * 1000;

function isWithinMatchWindow(submittedAtTimestamp: number, referenceTimestamp: number) {
  return (
    submittedAtTimestamp >= referenceTimestamp - MATCH_WINDOW_BEFORE_MS &&
    submittedAtTimestamp <= referenceTimestamp + MATCH_WINDOW_AFTER_MS
  );
}

function assessmentStatusRank(status: string) {
  if (status === "SENT") return 0;
  if (status === "RESPONDED") return 1;
  if (status === "IN_REVIEW") return 2;
  if (status === "PENDING") return 3;
  return 4;
}

async function dedupeAssessmentQuestionResponses(assessmentId: string) {
  await sql`
    WITH ranked AS (
      SELECT
        ctid,
        ROW_NUMBER() OVER (
          PARTITION BY
            assessment_id,
            lower(trim(question_text)),
            COALESCE(answer_text, '')
          ORDER BY created_at ASC, ctid ASC
        ) AS rn
      FROM assessment_question_responses
      WHERE assessment_id = ${assessmentId}::uuid
    )
    DELETE FROM assessment_question_responses target
    USING ranked
    WHERE target.ctid = ranked.ctid
      AND ranked.rn > 1
  `;
}

const TYPEFORM_WEBHOOK_MAX_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const contentLength = request.headers.get("content-length");
    if (contentLength) {
      const parsedLength = Number.parseInt(contentLength, 10);
      if (Number.isFinite(parsedLength) && parsedLength > TYPEFORM_WEBHOOK_MAX_BYTES) {
        return NextResponse.json({ ok: false, message: "Payload too large." }, { status: 413 });
      }
    }

    const rawBody = await request.text();
    if (rawBody.length > TYPEFORM_WEBHOOK_MAX_BYTES) {
      return NextResponse.json({ ok: false, message: "Payload too large." }, { status: 413 });
    }

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
    if (process.env.NODE_ENV === "production" && webhookMode !== "signed") {
      return NextResponse.json(
        { ok: false, message: "Unsigned Typeform webhooks are not allowed in production." },
        { status: 403 },
      );
    }

    const mustVerifySignature = webhookMode === "signed" || process.env.NODE_ENV === "production";
    if (mustVerifySignature) {
      const secret = process.env.TYPEFORM_WEBHOOK_SECRET?.trim();
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

    const formFields = await fetchTypeformFormFields(formId);
    const resolvedAnswers = sortTypeformAnswersByFieldDefinitions(
      applyTypeformFieldDefinitions(payload.form_response?.answers, formFields),
      formFields,
    );
    const answers = normalizeTypeformAnswers(resolvedAnswers);
    const hiddenFieldName =
      formMapping.hidden_assessment_field || typeformSetting.config?.default_hidden_assessment_field || "assessment_id";

    let assessmentId = normalizeAssessmentId(payload.form_response?.hidden, hiddenFieldName);
    let resolvedEntityKind: "VENDOR" | "PARTNER" | null = null;
    let matchedEntityForCreation: {
      id: string;
      entity_kind: "VENDOR" | "PARTNER";
      name: string;
    } | null = null;

    if (!assessmentId || !isValidUuid(assessmentId)) {
      const submittedAt = payload.form_response?.submitted_at ?? null;
      const submittedAtTimestamp = toTimestamp(submittedAt);
      const respondentEmail = normalizeEmail(extractRespondentEmailFromTypeformAnswers(resolvedAnswers));
      const hiddenDispatchId = extractDispatchIdFromHidden(payload.form_response?.hidden);

      if (hiddenDispatchId && formMapping.entity_kind !== "PARTNER") {
        const matchedByDispatchId = await findVendorAssessmentByDispatchId({
          dispatchId: hiddenDispatchId,
          formId,
        });
        if (matchedByDispatchId?.assessmentId && isValidUuid(matchedByDispatchId.assessmentId)) {
          assessmentId = matchedByDispatchId.assessmentId;
          resolvedEntityKind = "VENDOR";
        }
      }

      if (!assessmentId && respondentEmail && respondentEmail.includes("@") && formMapping.entity_kind !== "PARTNER") {
        const matchedByRecipient = await findVendorAssessmentByRecipientDispatch({
          formId,
          respondentEmail,
          submittedAt,
        });

        if (matchedByRecipient?.assessmentId && isValidUuid(matchedByRecipient.assessmentId)) {
          assessmentId = matchedByRecipient.assessmentId;
          resolvedEntityKind = "VENDOR";
        }
      }

      const companyName = extractCompanyNameFromTypeformAnswers(resolvedAnswers);
      const jiraTicket = extractTicketFromTypeformAnswers(resolvedAnswers);

      if (!assessmentId && !companyName) {
        console.warn("[typeform-webhook] orphan response: missing hidden field and no company match hint", {
          formId,
          eventId,
          hiddenFieldName,
          submittedAt,
        });
        return NextResponse.json(
          { ok: true, orphan: true, message: `Missing hidden field ${hiddenFieldName} and no company name answer was found.` },
          { status: 202 },
        );
      }

      if (!assessmentId && companyName) {
        const entityRows = (await sql`
          SELECT e.id::text, e.kind::text AS entity_kind, e.name, e.jira_issue_key, e.contact_email
          FROM entities e
          WHERE ${formMapping.entity_kind ?? null}::text IS NULL OR e.kind = ${formMapping.entity_kind ?? null}::entity_kind
        `) as Array<{
          id: string;
          entity_kind: "VENDOR" | "PARTNER";
          name: string;
          jira_issue_key: string | null;
          contact_email: string | null;
        }>;

        const normalizedCompanyName = normalizeComparable(companyName);
        const normalizedCompanyNameLoose = normalizeLooseLookup(companyName);
        const normalizedCompanyNameStrict = normalizeStrictEntityKey(companyName);
        const normalizedTicket = normalizeComparable(jiraTicket ?? "");

        const normalizeEntityName = (name: string) => normalizeComparable(name);
        const normalizeEntityNameLoose = (name: string) => normalizeLooseLookup(name);
        const normalizeEntityNameStrict = (name: string) => normalizeStrictEntityKey(name);
        const byCompanyAndTicket = entityRows.find(
          (row) =>
            normalizeEntityName(row.name) === normalizedCompanyName &&
            normalizedTicket &&
            normalizeComparable(row.jira_issue_key ?? "") === normalizedTicket,
        );
        const byCompanyExact = entityRows.find((row) => normalizeEntityName(row.name) === normalizedCompanyName);
        const byCompanyExactLoose = entityRows.find(
          (row) => normalizeEntityNameLoose(row.name) === normalizedCompanyNameLoose,
        );
        const byCompanyExactStrict = entityRows.find(
          (row) => normalizeEntityNameStrict(row.name) === normalizedCompanyNameStrict,
        );
        const byRespondentEmail =
          respondentEmail && respondentEmail.includes("@")
            ? entityRows.find((row) => normalizeEmail(row.contact_email) === respondentEmail)
            : null;
        const byCompanyFuzzy = entityRows.find((row) => {
          const candidate = normalizeEntityName(row.name);
          return candidate.includes(normalizedCompanyName) || normalizedCompanyName.includes(candidate);
        });
        const byCompanyFuzzyLoose = entityRows.find((row) => {
          const candidate = normalizeEntityNameLoose(row.name);
          return candidate.includes(normalizedCompanyNameLoose) || normalizedCompanyNameLoose.includes(candidate);
        });
        const byCompanyFuzzyStrict = entityRows.find((row) => {
          const candidate = normalizeEntityNameStrict(row.name);
          return candidate.includes(normalizedCompanyNameStrict) || normalizedCompanyNameStrict.includes(candidate);
        });

        const matchedEntity =
          byCompanyAndTicket ??
          byCompanyExact ??
          byCompanyExactLoose ??
          byCompanyExactStrict ??
          byRespondentEmail ??
          byCompanyFuzzy ??
          byCompanyFuzzyLoose ??
          byCompanyFuzzyStrict;

        if (!matchedEntity) {
          console.warn("[typeform-webhook] orphan response: company not mapped to entity", {
            formId,
            eventId,
            companyName,
            submittedAt,
          });
          return NextResponse.json(
            { ok: true, orphan: true, message: `No entity found for company name "${companyName}".` },
            { status: 202 },
          );
        }

        resolvedEntityKind = matchedEntity.entity_kind;
        matchedEntityForCreation = matchedEntity;

        const assessmentRowsByEntity = (await sql`
          SELECT
            id::text,
            status::text,
            typeform_form_id,
            sent_at::text,
            created_at::text
          FROM assessments
          WHERE entity_id = ${matchedEntity.id}::uuid
          ORDER BY created_at DESC
          LIMIT 20
        `) as Array<{
          id: string;
          status: string;
          typeform_form_id: string | null;
          sent_at: string | null;
          created_at: string;
        }>;

        assessmentRowsByEntity.sort((a, b) => {
          const aFormMatch = a.typeform_form_id === formId ? 0 : 1;
          const bFormMatch = b.typeform_form_id === formId ? 0 : 1;
          if (aFormMatch !== bFormMatch) return aFormMatch - bFormMatch;

          if (!Number.isNaN(submittedAtTimestamp)) {
            const aSentTimestamp = toTimestamp(a.sent_at);
            const bSentTimestamp = toTimestamp(b.sent_at);
            const aHasSent = !Number.isNaN(aSentTimestamp);
            const bHasSent = !Number.isNaN(bSentTimestamp);

            if (aHasSent && bHasSent) {
              const aWithin = isWithinMatchWindow(submittedAtTimestamp, aSentTimestamp);
              const bWithin = isWithinMatchWindow(submittedAtTimestamp, bSentTimestamp);
              if (aWithin !== bWithin) return aWithin ? -1 : 1;
              const aDistance = Math.abs(aSentTimestamp - submittedAtTimestamp);
              const bDistance = Math.abs(bSentTimestamp - submittedAtTimestamp);
              if (aDistance !== bDistance) return aDistance - bDistance;
            } else if (aHasSent !== bHasSent) {
              return aHasSent ? -1 : 1;
            }
          }

          const statusDelta = assessmentStatusRank(a.status) - assessmentStatusRank(b.status);
          if (statusDelta !== 0) return statusDelta;
          return toTimestamp(b.created_at) - toTimestamp(a.created_at);
        });

        assessmentId = assessmentRowsByEntity[0]?.id ?? null;
      }

      if (!assessmentId) {
        if (!matchedEntityForCreation) {
          console.warn("[typeform-webhook] orphan response: missing context to create assessment", {
            formId,
            eventId,
            submittedAt,
          });
          return NextResponse.json(
            { ok: true, orphan: true, message: "No entity context available to create a new assessment." },
            { status: 202 },
          );
        }

        const createdAssessments = (await sql`
          INSERT INTO assessments (entity_id, title, status)
          VALUES (
            ${matchedEntityForCreation.id}::uuid,
            ${`External Questionnaire - ${matchedEntityForCreation.name}`},
            'PENDING'
          )
          RETURNING id::text
        `) as Array<{ id: string }>;

        assessmentId = createdAssessments[0]?.id ?? null;
      }

      if (!assessmentId) {
        return NextResponse.json(
          {
            ok: false,
            message: `Failed to create assessment for "${matchedEntityForCreation?.name ?? "entity"}".`,
          },
          { status: 500 },
        );
      }
    }

    const assessmentRows = (await sql`
      SELECT a.id::text, a.entity_id::text AS entity_id, e.kind::text AS entity_kind
      FROM assessments a
      INNER JOIN entities e ON e.id = a.entity_id
      WHERE a.id = ${assessmentId}::uuid
      LIMIT 1
    `) as Array<{ id: string; entity_id: string; entity_kind: "VENDOR" | "PARTNER" }>;

    if (assessmentRows.length === 0) {
      console.warn("[typeform-webhook] orphan response: resolved assessment not found", {
        formId,
        eventId,
        assessmentId,
      });
      return NextResponse.json({ ok: true, orphan: true, message: "Assessment not found for resolved Typeform response." }, { status: 202 });
    }

    resolvedEntityKind = assessmentRows[0].entity_kind;

    if (formMapping.entity_kind && formMapping.entity_kind !== resolvedEntityKind) {
      return NextResponse.json(
        { ok: false, message: `Assessment entity kind mismatch. Expected ${formMapping.entity_kind}.` },
        { status: 400 },
      );
    }

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

    if (resolvedEntityKind === "VENDOR") {
      await sql`
        UPDATE entities
        SET
          status = 'RESPONDED',
          status_label = 'Received Quest.',
          updated_at = now()
        WHERE id = ${assessmentRows[0].entity_id}::uuid
      `;
    }

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

    await dedupeAssessmentQuestionResponses(assessmentId);

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
