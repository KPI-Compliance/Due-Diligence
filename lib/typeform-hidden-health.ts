import { sql } from "@/lib/db";
import { getTypeformApiCredentials } from "@/lib/typeform-admin";

type FormRow = {
  id: string;
  form_id: string;
  name: string;
  workflow: string;
  entity_kind: "VENDOR" | "PARTNER" | null;
  hidden_assessment_field: string | null;
};

export type TypeformHiddenHealthFormResult = {
  form_id: string;
  form_name: string;
  workflow: string;
  entity_kind: "VENDOR" | "PARTNER" | null;
  expected_hidden_fields: string[];
  responses_scanned: number;
  recent_window_days: number;
  recent_responses: number;
  recent_responses_with_any_hidden: number;
  recent_responses_with_expected_hidden: number;
  recent_responses_missing_hidden: number;
  recent_missing_hidden_tokens: string[];
  recent_dispatches: number | null;
  status: "ok" | "warning" | "critical";
  notes: string[];
};

export type TypeformHiddenHealthSummary = {
  forms_checked: number;
  forms_with_no_recent_responses: number;
  forms_with_recent_missing_hidden: number;
  forms_with_recent_dispatch_but_no_hidden_linkage: number;
};

export type TypeformHiddenHealthReport = {
  ok: boolean;
  message: string;
  checked_at: string;
  days: number;
  summary: TypeformHiddenHealthSummary;
  forms: TypeformHiddenHealthFormResult[];
};

type TypeformResponseItem = {
  token?: string;
  submitted_at?: string;
  hidden?: Record<string, string | number | boolean | null | undefined>;
};

type TypeformResponsesApiResponse = {
  items?: TypeformResponseItem[];
};

function normalizeKey(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function toTimestamp(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

export async function getTypeformHiddenHealth(input?: {
  days?: number;
  pageSize?: number;
  entityKind?: "VENDOR" | "PARTNER" | "ALL";
}): Promise<TypeformHiddenHealthReport> {
  const days = Math.max(1, Math.min(365, input?.days ?? 30));
  const pageSize = Math.max(10, Math.min(1000, input?.pageSize ?? 200));
  const entityKind = input?.entityKind ?? "ALL";
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const { token } = await getTypeformApiCredentials();
  if (!token) {
    return {
      ok: false,
      message: "Typeform API token is not configured.",
      checked_at: new Date().toISOString(),
      days,
      summary: {
        forms_checked: 0,
        forms_with_no_recent_responses: 0,
        forms_with_recent_missing_hidden: 0,
        forms_with_recent_dispatch_but_no_hidden_linkage: 0,
      },
      forms: [],
    };
  }

  const forms = (await sql`
    SELECT
      id::text,
      form_id,
      name,
      workflow,
      entity_kind::text,
      hidden_assessment_field
    FROM typeform_forms
    WHERE enabled = true
      AND workflow = 'external_questionnaire'
      AND (
        ${entityKind === "ALL" ? null : entityKind}::text IS NULL
        OR entity_kind = ${entityKind === "ALL" ? null : entityKind}::entity_kind
        OR entity_kind IS NULL
      )
    ORDER BY created_at DESC
  `) as FormRow[];

  const summary: TypeformHiddenHealthSummary = {
    forms_checked: forms.length,
    forms_with_no_recent_responses: 0,
    forms_with_recent_missing_hidden: 0,
    forms_with_recent_dispatch_but_no_hidden_linkage: 0,
  };

  const results: TypeformHiddenHealthFormResult[] = [];

  for (const form of forms) {
    const expectedHiddenFields = Array.from(
      new Set(
        [normalizeKey(form.hidden_assessment_field), "assessment_id", "dispatch_id"].filter(Boolean),
      ),
    );

    const response = await fetch(
      `https://api.typeform.com/forms/${form.form_id}/responses?page_size=${pageSize}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    );

    if (!response.ok) {
      results.push({
        form_id: form.form_id,
        form_name: form.name,
        workflow: form.workflow,
        entity_kind: form.entity_kind,
        expected_hidden_fields: expectedHiddenFields,
        responses_scanned: 0,
        recent_window_days: days,
        recent_responses: 0,
        recent_responses_with_any_hidden: 0,
        recent_responses_with_expected_hidden: 0,
        recent_responses_missing_hidden: 0,
        recent_missing_hidden_tokens: [],
        recent_dispatches: null,
        status: "critical",
        notes: [`Typeform responses API returned HTTP ${response.status}.`],
      });
      continue;
    }

    const payload = (await response.json()) as TypeformResponsesApiResponse;
    const items = payload.items ?? [];
    const recentItems = items.filter((item) => {
      const submittedAt = toTimestamp(item.submitted_at);
      return !Number.isNaN(submittedAt) && submittedAt >= sinceMs;
    });

    const withAnyHidden = recentItems.filter((item) => {
      const hidden = item.hidden;
      return Boolean(hidden && typeof hidden === "object" && Object.keys(hidden).length > 0);
    });

    const withExpectedHidden = recentItems.filter((item) => {
      const hidden = item.hidden;
      if (!hidden || typeof hidden !== "object") return false;
      const keys = Object.keys(hidden).map((key) => normalizeKey(key));
      return expectedHiddenFields.some((expected) => keys.includes(expected));
    });

    const missingHiddenItems = recentItems.filter((item) => {
      const hidden = item.hidden;
      if (!hidden || typeof hidden !== "object") return true;
      return Object.keys(hidden).length === 0;
    });

    let recentDispatches: number | null = null;
    if (form.entity_kind !== "PARTNER") {
      try {
        const dispatchRows = (await sql`
          SELECT COUNT(*)::int AS count
          FROM vendor_external_questionnaire_dispatches
          WHERE form_id = ${form.form_id}
            AND sent_at >= now() - (${`${days} days`}::interval)
        `) as Array<{ count: number }>;
        recentDispatches = dispatchRows[0]?.count ?? 0;
      } catch (error) {
        const code = (error as { code?: string })?.code;
        if (code !== "42P01") {
          recentDispatches = null;
        }
      }
    }

    const notes: string[] = [];
    let status: "ok" | "warning" | "critical" = "ok";

    if (recentItems.length === 0) {
      summary.forms_with_no_recent_responses += 1;
      status = "warning";
      notes.push(`No responses in the last ${days} days.`);
    }

    if (missingHiddenItems.length > 0) {
      summary.forms_with_recent_missing_hidden += 1;
      if (status === "ok") status = "warning";
      notes.push(`${missingHiddenItems.length} recent response(s) arrived without hidden payload.`);
    }

    if ((recentDispatches ?? 0) > 0 && recentItems.length > 0 && withExpectedHidden.length === 0) {
      summary.forms_with_recent_dispatch_but_no_hidden_linkage += 1;
      status = "critical";
      notes.push(
        `There are ${recentDispatches} recent dispatch(es), but none of the recent responses includes expected hidden fields.`,
      );
    }

    results.push({
      form_id: form.form_id,
      form_name: form.name,
      workflow: form.workflow,
      entity_kind: form.entity_kind,
      expected_hidden_fields: expectedHiddenFields,
      responses_scanned: items.length,
      recent_window_days: days,
      recent_responses: recentItems.length,
      recent_responses_with_any_hidden: withAnyHidden.length,
      recent_responses_with_expected_hidden: withExpectedHidden.length,
      recent_responses_missing_hidden: missingHiddenItems.length,
      recent_missing_hidden_tokens: missingHiddenItems.map((item) => item.token ?? "").filter(Boolean).slice(0, 10),
      recent_dispatches: recentDispatches,
      status,
      notes,
    });
  }

  const ok = results.every((item) => item.status === "ok");

  return {
    ok,
    message: ok
      ? "All checked forms have healthy hidden-field linkage signals."
      : "One or more forms show hidden-field linkage risk.",
    checked_at: new Date().toISOString(),
    days,
    summary,
    forms: results,
  };
}
