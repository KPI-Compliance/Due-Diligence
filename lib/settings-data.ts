import { sql } from "@/lib/db";

export type IntegrationProvider = "TYPEFORM" | "JIRA" | "SLACK" | "GOOGLE_SHEETS";

export type TypeformConfig = {
  default_hidden_assessment_field: string;
  webhook_mode: "signed" | "unsigned";
  api_user: string;
  api_token: string;
};

export type JiraConfig = {
  base_url: string;
  api_email: string;
  api_token: string;
  vendors: {
    queue_url: string;
    project_key: string;
    issue_type: string;
  };
  partners: {
    queue_url: string;
    project_key: string;
    issue_type: string;
  };
};

export type SlackConfig = {
  channel: string;
  notify_on_responded: boolean;
  notify_on_critical: boolean;
};

export type GoogleSheetsConfig = {
  service_account_emails: string[];
  spreadsheets: Array<{
    name: string;
    entity_kind: "VENDOR" | "PARTNER";
    workflow: "internal_questionnaire" | "external_questionnaire";
    spreadsheet_url: string;
    worksheet_names: string[];
  }>;
};

export type TypeformFormItem = {
  id: string;
  name: string;
  form_id: string;
  entity_kind: "ANY" | "VENDOR" | "PARTNER";
  workflow: string;
  hidden_assessment_field: string;
  section_rules: {
    compliance: { start: string; end: string };
    privacy: { start: string; end: string };
    security: { start: string; end: string };
  };
  enabled: boolean;
};

export type TypeformQuestionSection = "COMMON" | "COMPLIANCE" | "PRIVACY" | "SECURITY";

export type TypeformFormQuestionMapping = {
  id: string;
  typeform_form_config_id: string;
  question_key: string;
  question_ref: string | null;
  question_text: string;
  question_order: number;
  section: TypeformQuestionSection;
};

export type IntegrationSetting = {
  provider: IntegrationProvider;
  enabled: boolean;
  config: TypeformConfig | JiraConfig | SlackConfig | GoogleSheetsConfig;
  validation_status: string | null;
  last_validated_at: string | null;
};

function fallbackConfig(provider: IntegrationProvider): TypeformConfig | JiraConfig | SlackConfig | GoogleSheetsConfig {
  if (provider === "TYPEFORM") {
    return {
      default_hidden_assessment_field: "assessment_id",
      webhook_mode: "signed",
      api_user: "",
      api_token: "",
    };
  }

  if (provider === "JIRA") {
    return {
      base_url: "",
      api_email: "",
      api_token: "",
      vendors: {
        queue_url: "",
        project_key: "VSC",
        issue_type: "Task",
      },
      partners: {
        queue_url: "",
        project_key: "VSC",
        issue_type: "Task",
      },
    };
  }

  if (provider === "GOOGLE_SHEETS") {
    return {
      service_account_emails: [],
      spreadsheets: [
        {
          name: "Mini Questionário Interno",
          entity_kind: "VENDOR",
          workflow: "internal_questionnaire",
          spreadsheet_url: "",
          worksheet_names: ["Página 1"],
        },
      ],
    };
  }

  return {
    channel: "",
    notify_on_responded: true,
    notify_on_critical: true,
  };
}

function normalizeConfig(provider: IntegrationProvider, config: unknown) {
  const base = fallbackConfig(provider);

  if (!config || typeof config !== "object") {
    return base;
  }

  const merged = {
    ...base,
    ...(config as Record<string, unknown>),
  } as TypeformConfig | JiraConfig | SlackConfig | GoogleSheetsConfig;

  if (provider === "TYPEFORM") {
    const legacyForm = (config as { form_id?: string }).form_id;

    return {
      default_hidden_assessment_field:
        (merged as TypeformConfig).default_hidden_assessment_field ||
        (merged as { hidden_assessment_field?: string }).hidden_assessment_field ||
        "assessment_id",
      webhook_mode: (merged as TypeformConfig).webhook_mode ?? "signed",
      api_user: String((merged as { api_user?: string }).api_user ?? "").trim(),
      api_token: String((merged as { api_token?: string }).api_token ?? "").trim(),
      ...(legacyForm ? { form_id: legacyForm } : {}),
    } as TypeformConfig;
  }

  if (provider === "GOOGLE_SHEETS") {
    const raw = merged as GoogleSheetsConfig & {
      service_account_email?: string;
      spreadsheet_url?: string;
      worksheet_name?: string;
      worksheet_names?: string[];
    };

    const serviceAccountEmails = Array.isArray(raw.service_account_emails)
      ? raw.service_account_emails.map((item) => String(item).trim()).filter(Boolean)
      : raw.service_account_email
        ? [String(raw.service_account_email).trim()].filter(Boolean)
        : [];

    const spreadsheets = Array.isArray(raw.spreadsheets)
      ? raw.spreadsheets
          .map((item) => {
            if (!item || typeof item !== "object") return null;
            const row = item as Record<string, unknown>;
            return {
              name: String(row.name ?? "").trim() || "Planilha",
              entity_kind: String(row.entity_kind ?? "VENDOR").toUpperCase() === "PARTNER" ? "PARTNER" : "VENDOR",
              workflow:
                String(row.workflow ?? "internal_questionnaire") === "external_questionnaire"
                  ? "external_questionnaire"
                  : "internal_questionnaire",
              spreadsheet_url: String(row.spreadsheet_url ?? "").trim(),
              worksheet_names: Array.isArray(row.worksheet_names)
                ? row.worksheet_names.map((item) => String(item).trim()).filter(Boolean)
                : [String(row.worksheet_name ?? "Página 1").trim() || "Página 1"],
            };
          })
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
      : raw.spreadsheet_url
        ? [
            {
              name: "Planilha Principal",
              entity_kind: "VENDOR",
              workflow: "internal_questionnaire",
              spreadsheet_url: String(raw.spreadsheet_url).trim(),
              worksheet_names: [String(raw.worksheet_name ?? "Página 1").trim() || "Página 1"],
            },
          ]
        : [];

    return {
      service_account_emails: serviceAccountEmails,
      spreadsheets:
        spreadsheets.length > 0
          ? spreadsheets
          : [
              {
                name: "Mini Questionário Interno",
                entity_kind: "VENDOR",
                workflow: "internal_questionnaire",
                spreadsheet_url: "",
                worksheet_names: ["Página 1"],
              },
            ],
    } as GoogleSheetsConfig;
  }

  if (provider === "JIRA") {
    const raw = merged as JiraConfig & {
      project_key?: string;
      issue_type?: string;
      vendor_queue_url?: string;
      partner_queue_url?: string;
      vendors?: Partial<JiraConfig["vendors"]>;
      partners?: Partial<JiraConfig["partners"]>;
    };

    const legacyProjectKey = String(raw.project_key ?? "").trim();
    const legacyIssueType = String(raw.issue_type ?? "Task").trim() || "Task";

    return {
      base_url: String(raw.base_url ?? "").trim(),
      api_email: String((raw as { api_email?: string }).api_email ?? "").trim(),
      api_token: String((raw as { api_token?: string }).api_token ?? "").trim(),
      vendors: {
        queue_url: String(raw.vendors?.queue_url ?? raw.vendor_queue_url ?? "").trim(),
        project_key: String(raw.vendors?.project_key ?? (legacyProjectKey || "VSC")).trim() || "VSC",
        issue_type: String(raw.vendors?.issue_type ?? legacyIssueType).trim() || "Task",
      },
      partners: {
        queue_url: String(raw.partners?.queue_url ?? raw.partner_queue_url ?? "").trim(),
        project_key: String(raw.partners?.project_key ?? (legacyProjectKey || "VSC")).trim() || "VSC",
        issue_type: String(raw.partners?.issue_type ?? legacyIssueType).trim() || "Task",
      },
    } as JiraConfig;
  }

  return merged;
}

export async function getIntegrationSettings(): Promise<IntegrationSetting[]> {
  let rows: Array<{
    provider: IntegrationProvider;
    enabled: boolean;
    config: unknown;
    validation_status: string | null;
    last_validated_at: string | null;
  }> = [];

  try {
    rows = (await sql`
      SELECT provider::text, enabled, config, validation_status, last_validated_at
      FROM integration_settings
      ORDER BY provider::text
    `) as Array<{
      provider: IntegrationProvider;
      enabled: boolean;
      config: unknown;
      validation_status: string | null;
      last_validated_at: string | null;
    }>;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code !== "42P01") {
      throw error;
    }
  }

  const providers: IntegrationProvider[] = ["TYPEFORM", "JIRA", "SLACK", "GOOGLE_SHEETS"];

  const mapped = rows.map((row) => ({
    provider: row.provider,
    enabled: row.enabled,
    config: normalizeConfig(row.provider, row.config),
    validation_status: row.validation_status,
    last_validated_at: row.last_validated_at,
  }));

  const missing = providers
    .filter((provider) => !mapped.some((item) => item.provider === provider))
    .map((provider) => ({
      provider,
      enabled: false,
      config: fallbackConfig(provider),
      validation_status: null,
      last_validated_at: null,
    }));

  return [...mapped, ...missing].sort((a, b) => a.provider.localeCompare(b.provider));
}

export async function upsertIntegrationSetting(
  provider: IntegrationProvider,
  enabled: boolean,
  config: TypeformConfig | JiraConfig | SlackConfig | GoogleSheetsConfig,
) {
  try {
    await sql`
      INSERT INTO integration_settings (provider, enabled, config)
      VALUES (${provider}::integration_provider, ${enabled}, ${JSON.stringify(config)}::jsonb)
      ON CONFLICT (provider)
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        validation_status = NULL,
        last_validated_at = NULL
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("integration_settings table not found. Run database/004_settings_configuration.sql.");
    }

    const message = (error as { message?: string })?.message ?? "";
    if (
      provider === "GOOGLE_SHEETS" &&
      (code === "22P02" || message.includes('invalid input value for enum integration_provider: "GOOGLE_SHEETS"'))
    ) {
      await sql`ALTER TYPE integration_provider ADD VALUE IF NOT EXISTS 'GOOGLE_SHEETS'`;

      await sql`
        INSERT INTO integration_settings (provider, enabled, config)
        VALUES (${provider}::integration_provider, ${enabled}, ${JSON.stringify(config)}::jsonb)
        ON CONFLICT (provider)
        DO UPDATE SET
          enabled = EXCLUDED.enabled,
          config = EXCLUDED.config,
          validation_status = NULL,
          last_validated_at = NULL
      `;
      return;
    }

    throw error;
  }
}

export async function getTypeformForms(): Promise<TypeformFormItem[]> {
  try {
    const rows = (await sql`
      SELECT id::text, name, form_id, entity_kind::text, workflow, hidden_assessment_field, section_rules, enabled
      FROM typeform_forms
      ORDER BY created_at DESC
    `) as Array<{
      id: string;
      name: string;
      form_id: string;
      entity_kind: "VENDOR" | "PARTNER" | null;
      workflow: string;
      hidden_assessment_field: string;
      section_rules: unknown;
      enabled: boolean;
    }>;

    return rows.map((row) => ({
      ...row,
      entity_kind: row.entity_kind ?? "ANY",
      section_rules:
        row.section_rules && typeof row.section_rules === "object"
          ? {
              compliance: {
                start: String((row.section_rules as Record<string, unknown>)?.compliance && typeof (row.section_rules as Record<string, unknown>).compliance === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).compliance?.start ?? "") : ""),
                end: String((row.section_rules as Record<string, unknown>)?.compliance && typeof (row.section_rules as Record<string, unknown>).compliance === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).compliance?.end ?? "") : ""),
              },
              privacy: {
                start: String((row.section_rules as Record<string, unknown>)?.privacy && typeof (row.section_rules as Record<string, unknown>).privacy === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).privacy?.start ?? "") : ""),
                end: String((row.section_rules as Record<string, unknown>)?.privacy && typeof (row.section_rules as Record<string, unknown>).privacy === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).privacy?.end ?? "") : ""),
              },
              security: {
                start: String((row.section_rules as Record<string, unknown>)?.security && typeof (row.section_rules as Record<string, unknown>).security === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).security?.start ?? "") : ""),
                end: String((row.section_rules as Record<string, unknown>)?.security && typeof (row.section_rules as Record<string, unknown>).security === "object" ? ((row.section_rules as Record<string, { start?: string; end?: string }>).security?.end ?? "") : ""),
              },
            }
          : {
              compliance: { start: "", end: "" },
              privacy: { start: "", end: "" },
              security: { start: "", end: "" },
            },
    }));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return [];
    }
    throw error;
  }
}

export async function getTypeformFormById(id: string): Promise<TypeformFormItem | null> {
  const forms = await getTypeformForms();
  return forms.find((item) => item.id === id) ?? null;
}

export async function getTypeformFormQuestionMappings(formConfigId: string): Promise<TypeformFormQuestionMapping[]> {
  try {
    const rows = (await sql`
      SELECT
        id::text,
        typeform_form_config_id::text,
        question_key,
        question_ref,
        question_text,
        question_order,
        section::text
      FROM typeform_form_question_mappings
      WHERE typeform_form_config_id = ${formConfigId}::uuid
      ORDER BY question_order ASC, created_at ASC
    `) as Array<{
      id: string;
      typeform_form_config_id: string;
      question_key: string;
      question_ref: string | null;
      question_text: string;
      question_order: number;
      section: string;
    }>;

    return rows.map((row) => ({
      ...row,
      section:
        row.section === "COMPLIANCE" || row.section === "PRIVACY" || row.section === "SECURITY"
          ? row.section
          : "COMMON",
    }));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return [];
    }
    throw error;
  }
}

export async function replaceTypeformFormQuestionMappings(
  formConfigId: string,
  mappings: Array<{
    id?: string | null;
    question_key: string;
    question_ref?: string | null;
    question_text: string;
    question_order: number;
    section: TypeformQuestionSection;
  }>,
) {
  try {
    await sql`DELETE FROM typeform_form_question_mappings WHERE typeform_form_config_id = ${formConfigId}::uuid`;

    for (const mapping of mappings) {
      await sql`
        INSERT INTO typeform_form_question_mappings (
          id,
          typeform_form_config_id,
          question_key,
          question_ref,
          question_text,
          question_order,
          section
        ) VALUES (
          COALESCE(${mapping.id ?? null}::uuid, gen_random_uuid()),
          ${formConfigId}::uuid,
          ${mapping.question_key},
          ${mapping.question_ref ?? null},
          ${mapping.question_text},
          ${mapping.question_order},
          ${mapping.section}::typeform_question_section
        )
      `;
    }
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("typeform_form_question_mappings table not found. Run database/011_typeform_form_question_mappings.sql.");
    }
    if (code === "42704") {
      throw new Error("typeform_question_section enum not found. Run database/011_typeform_form_question_mappings.sql.");
    }
    throw error;
  }
}

export async function upsertTypeformForm(input: {
  id?: string | null;
  name: string;
  form_id: string;
  entity_kind: "ANY" | "VENDOR" | "PARTNER";
  workflow: string;
  hidden_assessment_field: string;
  section_rules: TypeformFormItem["section_rules"];
  enabled: boolean;
}) {
  const entityKind = input.entity_kind === "ANY" ? null : input.entity_kind;

  try {
    if (input.id) {
      await sql`
        INSERT INTO typeform_forms (
          id,
          name,
          form_id,
          entity_kind,
          workflow,
          hidden_assessment_field,
          section_rules,
          enabled
        )
        VALUES (
          ${input.id}::uuid,
          ${input.name},
          ${input.form_id},
          ${entityKind}::entity_kind,
          ${input.workflow},
          ${input.hidden_assessment_field},
          ${JSON.stringify(input.section_rules)}::jsonb,
          ${input.enabled}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          form_id = EXCLUDED.form_id,
          entity_kind = EXCLUDED.entity_kind,
          workflow = EXCLUDED.workflow,
          hidden_assessment_field = EXCLUDED.hidden_assessment_field,
          section_rules = EXCLUDED.section_rules,
          enabled = EXCLUDED.enabled
      `;
      return;
    }

    await sql`
      INSERT INTO typeform_forms (
        name,
        form_id,
        entity_kind,
        workflow,
        hidden_assessment_field,
        section_rules,
        enabled
      )
      VALUES (
        ${input.name},
        ${input.form_id},
        ${entityKind}::entity_kind,
        ${input.workflow},
        ${input.hidden_assessment_field},
        ${JSON.stringify(input.section_rules)}::jsonb,
        ${input.enabled}
      )
      ON CONFLICT (form_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        entity_kind = EXCLUDED.entity_kind,
        workflow = EXCLUDED.workflow,
        hidden_assessment_field = EXCLUDED.hidden_assessment_field,
        section_rules = EXCLUDED.section_rules,
        enabled = EXCLUDED.enabled
    `;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("typeform_forms table not found. Run database/005_typeform_multiple_forms.sql.");
    }
    throw error;
  }
}

export async function deleteTypeformForm(id: string) {
  try {
    await sql`DELETE FROM typeform_forms WHERE id = ${id}::uuid`;
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      throw new Error("typeform_forms table not found. Run database/005_typeform_multiple_forms.sql.");
    }
    throw error;
  }
}
