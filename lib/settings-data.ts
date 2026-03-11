import { sql } from "@/lib/db";

export type IntegrationProvider = "TYPEFORM" | "JIRA" | "SLACK" | "GOOGLE_SHEETS";

export type TypeformConfig = {
  default_hidden_assessment_field: string;
  webhook_mode: "signed" | "unsigned";
};

export type JiraConfig = {
  base_url: string;
  project_key: string;
  issue_type: string;
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
    worksheet_name: string;
  }>;
};

export type TypeformFormItem = {
  id: string;
  name: string;
  form_id: string;
  entity_kind: "ANY" | "VENDOR" | "PARTNER";
  workflow: string;
  hidden_assessment_field: string;
  enabled: boolean;
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
    };
  }

  if (provider === "JIRA") {
    return {
      base_url: "",
      project_key: "",
      issue_type: "Task",
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
          worksheet_name: "Página 1",
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
      ...(legacyForm ? { form_id: legacyForm } : {}),
    } as TypeformConfig;
  }

  if (provider === "GOOGLE_SHEETS") {
    const raw = merged as GoogleSheetsConfig & {
      service_account_email?: string;
      spreadsheet_url?: string;
      worksheet_name?: string;
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
              worksheet_name: String(row.worksheet_name ?? "Página 1").trim() || "Página 1",
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
              worksheet_name: String(raw.worksheet_name ?? "Página 1").trim() || "Página 1",
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
                worksheet_name: "Página 1",
              },
            ],
    } as GoogleSheetsConfig;
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
      SELECT id::text, name, form_id, entity_kind::text, workflow, hidden_assessment_field, enabled
      FROM typeform_forms
      ORDER BY created_at DESC
    `) as Array<{
      id: string;
      name: string;
      form_id: string;
      entity_kind: "VENDOR" | "PARTNER" | null;
      workflow: string;
      hidden_assessment_field: string;
      enabled: boolean;
    }>;

    return rows.map((row) => ({
      ...row,
      entity_kind: row.entity_kind ?? "ANY",
    }));
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === "42P01") {
      return [];
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
          enabled
        )
        VALUES (
          ${input.id}::uuid,
          ${input.name},
          ${input.form_id},
          ${entityKind}::entity_kind,
          ${input.workflow},
          ${input.hidden_assessment_field},
          ${input.enabled}
        )
        ON CONFLICT (id)
        DO UPDATE SET
          name = EXCLUDED.name,
          form_id = EXCLUDED.form_id,
          entity_kind = EXCLUDED.entity_kind,
          workflow = EXCLUDED.workflow,
          hidden_assessment_field = EXCLUDED.hidden_assessment_field,
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
        enabled
      )
      VALUES (
        ${input.name},
        ${input.form_id},
        ${entityKind}::entity_kind,
        ${input.workflow},
        ${input.hidden_assessment_field},
        ${input.enabled}
      )
      ON CONFLICT (form_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        entity_kind = EXCLUDED.entity_kind,
        workflow = EXCLUDED.workflow,
        hidden_assessment_field = EXCLUDED.hidden_assessment_field,
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
