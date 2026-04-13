import Link from "next/link";
import { redirect } from "next/navigation";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { RiskScoringSettingsPanel } from "@/components/settings/RiskScoringSettingsPanel";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";
import { getAuthenticatedSessionResult, getSessionErrorCode, refreshServerActionSession } from "@/lib/auth";
import {
  deleteUserAccessProfile,
  listUserAccessProfiles,
  resolveUserAccess,
  upsertUserAccessProfile,
  type AccessGroup,
  type UserAccessProfileRow,
} from "@/lib/access-control";
import {
  deleteTypeformForm as deleteTypeformFormRow,
  getTypeformForms,
  getIntegrationSettings,
  type GoogleSheetsConfig,
  type IntegrationProvider,
  type JiraConfig,
  type SlackConfig,
  type TypeformConfig,
  upsertTypeformForm,
  upsertIntegrationSetting,
} from "@/lib/settings-data";
import {
  getPlatformSettings,
  normalizeGeneralSettings,
  normalizeNotificationSettings,
  normalizeRiskScoringSettings,
  type GeneralSettings,
  type NotificationSettings,
  type RiskScoringProfile,
  type RiskScoringSettings,
  upsertPlatformSettings,
} from "@/lib/platform-settings";
import { recalculateAllPartnerAssessmentDecisions } from "@/lib/partner-risk-scoring";
import { recalculateAllVendorAssessmentDecisions } from "@/lib/vendor-risk-scoring";
import { backfillExternalQuestionnaireForQueueTickets } from "@/lib/typeform-sync";
import { getTypeformHiddenHealth } from "@/lib/typeform-hidden-health";

type SettingsTab = "geral" | "usuarios" | "integracoes" | "pontuacao" | "notificacoes";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "geral", label: "Geral" },
  { id: "usuarios", label: "Usuários e Perfis" },
  { id: "integracoes", label: "Integrações" },
  { id: "pontuacao", label: "Pontuação de Risco" },
  { id: "notificacoes", label: "Notificações" },
];

const accessGroupLabel: Record<AccessGroup, string> = {
  ADMIN: "Administrador",
  TECGRC: "TECGRC",
  COMPLIANCE: "Compliance",
  PRIVACY: "Privacy",
  PROCUREMENT: "Procurement",
};

const accessGroupClass: Record<AccessGroup, string> = {
  ADMIN: "bg-blue-100 text-blue-700",
  TECGRC: "bg-indigo-100 text-indigo-700",
  COMPLIANCE: "bg-emerald-100 text-emerald-700",
  PRIVACY: "bg-fuchsia-100 text-fuchsia-700",
  PROCUREMENT: "bg-slate-100 text-slate-700",
};

const accessGroupDescription: Record<AccessGroup, string> = {
  ADMIN: "Acesso total ao sistema e gestão de usuários/perfis.",
  TECGRC: "Acesso total ao sistema.",
  COMPLIANCE: "Pode escrever/atualizar apenas tickets da fila de Partners.",
  PRIVACY: "Pode escrever/atualizar tickets de Partners e Vendors.",
  PROCUREMENT: "Somente visibilidade (sem alteração).",
};

function initialsFromName(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://due-diligence-eight.vercel.app");
const typeformSecretConfigured = Boolean(process.env.TYPEFORM_WEBHOOK_SECRET);
const typeformApiTokenConfigured = Boolean(process.env.TYPEFORM_API_TOKEN ?? process.env.TYPEFORM_ACCESS_TOKEN);
const jiraTokenConfigured = Boolean(process.env.JIRA_API_TOKEN);
const jiraWebhookSecretConfigured = Boolean(process.env.JIRA_WEBHOOK_SECRET);
const slackTokenConfigured = Boolean(process.env.SLACK_BOT_TOKEN);
const googleWorkspaceCredentialsConfigured = Boolean(
  process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON?.trim() ||
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_JSON_BASE64?.trim() ||
    process.env.GOOGLE_WORKSPACE_SERVICE_ACCOUNT_FILE?.trim() ||
    (process.env.GOOGLE_WORKSPACE_CLIENT_EMAIL?.trim() && process.env.GOOGLE_WORKSPACE_PRIVATE_KEY?.trim()),
);
const googleWorkspaceImpersonatedConfigured = Boolean(
  process.env.GOOGLE_WORKSPACE_IMPERSONATED_USER?.trim() || process.env.EMAIL_FROM?.trim(),
);
const emailReplyToConfigured = Boolean(process.env.EMAIL_REPLY_TO?.trim());

export const dynamic = "force-dynamic";

async function requireServerActionSession(context: string) {
  const sessionResult = await refreshServerActionSession(context);
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }

  const access = await resolveUserAccess(sessionResult.session.email);
  if (!access.permissions.canManageSettings) {
    redirect("/dashboard");
  }

  return {
    session: sessionResult.session,
    access,
  };
}

function getSetting<T>(
  list: Array<{ provider: IntegrationProvider; enabled: boolean; config: unknown }>,
  provider: IntegrationProvider,
) {
  return list.find((item) => item.provider === provider) as { provider: IntegrationProvider; enabled: boolean; config: T };
}

function normalizeTab(value: string | undefined): SettingsTab {
  const tab = (value ?? "").toLowerCase();
  if (tab === "usuarios" || tab === "integracoes" || tab === "pontuacao" || tab === "notificacoes") {
    return tab;
  }
  return "geral";
}

function formatRiskSettingsError(errorCode: string | undefined) {
  if (!errorCode) return null;

  if (errorCode === "partner_weights") {
    return "A soma dos pesos de Partners precisa ser exatamente 100%.";
  }
  if (errorCode === "vendor_weights") {
    return "A soma dos pesos de Vendors precisa ser exatamente 100% entre Security e Privacy.";
  }
  if (errorCode === "partner_scores") {
    return "Em Partners, os scores precisam respeitar a ordem: Totalmente <= Parcialmente <= Não Atende.";
  }
  if (errorCode === "vendor_scores") {
    return "Em Vendors, os scores precisam respeitar a ordem: Totalmente <= Parcialmente <= Não Atende.";
  }
  if (errorCode === "partner_thresholds") {
    return "Em Partners, os thresholds precisam respeitar: Low < Medium e ambos entre 0 e 10.";
  }
  if (errorCode === "vendor_thresholds") {
    return "Em Vendors, os thresholds precisam respeitar: Low < Medium e ambos entre 0 e 10.";
  }
  if (errorCode === "usuarios_self_remove") {
    return "Você não pode remover seu próprio perfil de acesso.";
  }
  if (errorCode === "usuarios_invalid_email") {
    return "E-mail inválido para atualização de perfil.";
  }

  return "Não foi possível salvar a pontuação de risco. Revise os valores informados.";
}

function formatSavedMessage(savedFlag: string | undefined) {
  if (!savedFlag) return null;
  if (savedFlag === "usuarios_bulk") {
    return "Alterações de usuários e perfis salvas com sucesso.";
  }
  if (savedFlag === "usuario_removido") {
    return "Usuário removido da lista de perfis com sucesso.";
  }
  return `Configurações de ${savedFlag.toUpperCase()} salvas com sucesso.`;
}

function parseDecimalField(formData: FormData, key: string, fallback: number) {
  const raw = Number(formData.get(key) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.round(Math.max(0, Math.min(10, raw)) * 10) / 10;
}

function isValidRiskProfile(profile: RiskScoringProfile) {
  const validScores =
    profile.fully_score <= profile.partially_score && profile.partially_score <= profile.does_not_meet_score;
  const validThresholds = profile.low_max < profile.medium_max && profile.low_max >= 0 && profile.medium_max <= 10;

  return {
    validScores,
    validThresholds,
  };
}

async function saveTypeformSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveTypeformSettings");

  const enabled = formData.get("enabled") === "on";

  const config: TypeformConfig = {
    default_hidden_assessment_field:
      String(formData.get("default_hidden_assessment_field") ?? "assessment_id").trim() || "assessment_id",
    webhook_mode: formData.get("webhook_mode") === "unsigned" ? "unsigned" : "signed",
    api_user: String(formData.get("api_user") ?? "").trim(),
    api_token: String(formData.get("api_token") ?? "").trim(),
    sender_email: String(formData.get("sender_email") ?? "").trim(),
    external_questionnaire_email_subject:
      String(formData.get("external_questionnaire_email_subject") ?? "").trim() || "VTEX | Due Diligence Analysis",
    external_questionnaire_email_template:
      String(formData.get("external_questionnaire_email_template") ?? "").trim() ||
      "[PT]\nPrezado(a), tudo bem?\n\nParte do processo de aquisição da VTEX consiste em avaliar as práticas de segurança da informação dos fornecedores. Por favor, responda ao questionário abaixo.\n\n{{form_link}}\n\nImportante: caso seja necessário encaminhar este questionário internamente, compartilhe o link completo (sem remover parâmetros) para preservar a qualidade e a assertividade das análises realizadas pelo time.\n\nCaso tenha dúvidas, entre em contato com a equipe de Compras da VTEX.\n\n[EN]\nDear all, hope you are doing well.\n\nAs part of VTEX's procurement process, we evaluate vendors' information security practices. Please complete the questionnaire below.\n\n{{form_link}}\n\nImportant: if you need to forward this questionnaire internally, share the full link (without removing parameters) to preserve the quality and accuracy of the analyses performed by our team.\n\nIf you have any questions, please contact the VTEX Procurement team.",
    external_questionnaire_email_signature_html:
      String(formData.get("external_questionnaire_email_signature_html") ?? "").trim() ||
      "<div style=\"margin-top:20px;padding-top:14px;border-top:1px solid #e5e7eb;font-family:Arial,sans-serif;color:#111827;\"><table role=\"presentation\" cellpadding=\"0\" cellspacing=\"0\" style=\"width:100%;max-width:620px;\"><tr><td style=\"vertical-align:top;\"><p style=\"margin:0;font-size:24px;line-height:1.2;font-weight:700;color:#111827;\">SEC GRC Integrations</p><p style=\"margin:8px 0 0 0;font-size:14px;line-height:1.5;color:#1f2937;\">Official VTEX channel for vendor Due Diligence.</p><p style=\"margin:10px 0 0 0;font-size:14px;line-height:1.5;\"><a href=\"https://www.vtex.com\" target=\"_blank\" rel=\"noreferrer\" style=\"color:#0f4fd6;text-decoration:underline;\">www.vtex.com</a></p><div style=\"margin-top:16px;padding-top:12px;border-top:1px solid #e5e7eb;\"><img src=\"{{logo_data_uri}}\" alt=\"VTEX\" style=\"height:26px;width:auto;display:block;\" /></div></td></tr></table></div>",
  };

  await upsertIntegrationSetting("TYPEFORM", enabled, config);
  redirect("/settings?tab=integracoes&saved=typeform");
}

async function saveTypeformForm(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveTypeformForm");

  const rawEntityKind = String(formData.get("entity_kind") ?? "ANY").toUpperCase();
  const entity_kind = rawEntityKind === "VENDOR" || rawEntityKind === "PARTNER" ? rawEntityKind : "ANY";
  const workflow = String(formData.get("workflow") ?? "security_review").trim() || "security_review";
  const formId = String(formData.get("form_id") ?? "").trim();
  const enabled = formData.get("enabled") === "on";

  await upsertTypeformForm({
    id: String(formData.get("id") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    form_id: formId,
    entity_kind,
    workflow,
    hidden_assessment_field:
      String(formData.get("hidden_assessment_field") ?? "assessment_id").trim() || "assessment_id",
    section_rules: {
      compliance: {
        start: String(formData.get("compliance_start") ?? "").trim(),
        end: String(formData.get("compliance_end") ?? "").trim(),
      },
      privacy: {
        start: String(formData.get("privacy_start") ?? "").trim(),
        end: String(formData.get("privacy_end") ?? "").trim(),
      },
      security: {
        start: String(formData.get("security_start") ?? "").trim(),
        end: String(formData.get("security_end") ?? "").trim(),
      },
    },
    enabled,
  });

  if (enabled && workflow === "external_questionnaire" && formId) {
    if (entity_kind === "PARTNER" || entity_kind === "ANY") {
      await backfillExternalQuestionnaireForQueueTickets({ entityKind: "PARTNER", formId });
    }
    if (entity_kind === "VENDOR" || entity_kind === "ANY") {
      await backfillExternalQuestionnaireForQueueTickets({ entityKind: "VENDOR", formId });
    }
  }

  redirect("/settings?tab=integracoes&saved=typeform-form");
}

async function deleteTypeformForm(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.deleteTypeformForm");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/settings?tab=integracoes&saved=typeform-form");
  }

  await deleteTypeformFormRow(id);

  redirect("/settings?tab=integracoes&saved=typeform-form");
}

async function saveJiraSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveJiraSettings");

  const enabled = formData.get("enabled") === "on";

  const config: JiraConfig = {
    base_url: String(formData.get("base_url") ?? "").trim(),
    api_email: String(formData.get("api_email") ?? "").trim(),
    api_token: String(formData.get("api_token") ?? "").trim(),
    vendors: {
      queue_url: String(formData.get("vendors_queue_url") ?? "").trim(),
      project_key: String(formData.get("vendors_project_key") ?? "VSC").trim() || "VSC",
      issue_type: String(formData.get("vendors_issue_type") ?? "Task").trim() || "Task",
    },
    partners: {
      queue_url: String(formData.get("partners_queue_url") ?? "").trim(),
      project_key: String(formData.get("partners_project_key") ?? "VSC").trim() || "VSC",
      issue_type: String(formData.get("partners_issue_type") ?? "Task").trim() || "Task",
    },
  };

  await upsertIntegrationSetting("JIRA", enabled, config);
  redirect("/settings?tab=integracoes&saved=jira");
}

async function saveSlackSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveSlackSettings");

  const enabled = formData.get("enabled") === "on";

  const config: SlackConfig = {
    channel: String(formData.get("channel") ?? "").trim(),
    notify_on_responded: formData.get("notify_on_responded") === "on",
    notify_on_critical: formData.get("notify_on_critical") === "on",
  };

  await upsertIntegrationSetting("SLACK", enabled, config);
  redirect("/settings?tab=integracoes&saved=slack");
}

async function saveGoogleSheetsSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveGoogleSheetsSettings");

  const enabled = formData.get("enabled") === "on";
  const rawEmails = String(formData.get("service_account_emails_json") ?? "[]");
  const rawSpreadsheets = String(formData.get("spreadsheets_json") ?? "[]");

  const service_account_emails = (() => {
    try {
      const parsed = JSON.parse(rawEmails);
      return Array.isArray(parsed) ? parsed.map((item) => String(item).trim()).filter(Boolean) : [];
    } catch {
      return [];
    }
  })();

  const spreadsheets = (() => {
    try {
      const parsed = JSON.parse(rawSpreadsheets);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const row = item as Record<string, unknown>;
          const entity_kind = String(row.entity_kind ?? "VENDOR").toUpperCase() === "PARTNER" ? "PARTNER" : "VENDOR";
          const workflow =
            entity_kind === "PARTNER"
              ? "external_questionnaire"
              : String(row.workflow ?? "internal_questionnaire") === "external_questionnaire"
                ? "external_questionnaire"
                : "internal_questionnaire";

          return {
            name: String(row.name ?? "").trim() || "Planilha",
            entity_kind,
            workflow,
            spreadsheet_url: String(row.spreadsheet_url ?? "").trim(),
            worksheet_names: Array.isArray(row.worksheet_names)
              ? row.worksheet_names.map((item) => String(item).trim()).filter(Boolean)
              : String(row.worksheet_name ?? "Página 1")
                  .split(/\r?\n|,/)
                  .map((item) => item.trim())
                  .filter(Boolean),
            impersonated_user: String(row.impersonated_user ?? "").trim(),
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)) as GoogleSheetsConfig["spreadsheets"];
    } catch {
      return [] as GoogleSheetsConfig["spreadsheets"];
    }
  })();

  const config: GoogleSheetsConfig = {
    service_account_emails,
    spreadsheets,
  };

  await upsertIntegrationSetting("GOOGLE_SHEETS", enabled, config);
  redirect("/settings?tab=integracoes&saved=google-sheets");
}

async function saveGeneralSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveGeneralSettings");

  const primaryBusinessUnit = String(formData.get("primary_business_unit") ?? "VTEX").toUpperCase() === "WENI" ? "WENI" : "VTEX";
  const defaultRiskLevel = String(formData.get("default_risk_level") ?? "MEDIUM").toUpperCase();
  const validRiskLevel = (["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(defaultRiskLevel)
    ? defaultRiskLevel
    : "MEDIUM") as GeneralSettings["default_risk_level"];

  const payload: GeneralSettings = {
    organization_name: String(formData.get("organization_name") ?? "").trim() || "Due Diligence VTEX",
    primary_business_unit: primaryBusinessUnit,
    platform_domain: String(formData.get("platform_domain") ?? "").trim(),
    sla_response_days: Math.max(1, Number(formData.get("sla_response_days") ?? 10) || 10),
    sla_review_days: Math.max(1, Number(formData.get("sla_review_days") ?? 5) || 5),
    default_risk_level: validRiskLevel,
    auto_create_assessment: formData.get("auto_create_assessment") === "on",
    require_security_review: formData.get("require_security_review") === "on",
  };

  await upsertPlatformSettings("GENERAL", payload);
  redirect("/settings?tab=geral&saved=geral");
}

async function saveRiskScoringSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveRiskScoringSettings");

  const currentSettings = await getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings);

  const payload: RiskScoringSettings = {
    partner: {
      security_weight: currentSettings.partner.security_weight,
      privacy_weight: currentSettings.partner.privacy_weight,
      compliance_weight: currentSettings.partner.compliance_weight,
      fully_score: parseDecimalField(formData, "partner_fully_score", 0),
      partially_score: parseDecimalField(formData, "partner_partially_score", 5),
      does_not_meet_score: parseDecimalField(formData, "partner_does_not_meet_score", 10),
      low_max: parseDecimalField(formData, "partner_low_max", 3),
      medium_max: parseDecimalField(formData, "partner_medium_max", 6),
    },
    vendor: {
      security_weight: currentSettings.vendor.security_weight,
      privacy_weight: currentSettings.vendor.privacy_weight,
      compliance_weight: 0,
      fully_score: parseDecimalField(formData, "vendor_fully_score", 0),
      partially_score: parseDecimalField(formData, "vendor_partially_score", 5),
      does_not_meet_score: parseDecimalField(formData, "vendor_does_not_meet_score", 10),
      low_max: parseDecimalField(formData, "vendor_low_max", 3),
      medium_max: parseDecimalField(formData, "vendor_medium_max", 6),
    },
  };

  const partnerValidation = isValidRiskProfile(payload.partner);
  if (!partnerValidation.validScores) {
    redirect("/settings?tab=pontuacao&error=partner_scores");
  }
  if (!partnerValidation.validThresholds) {
    redirect("/settings?tab=pontuacao&error=partner_thresholds");
  }

  const vendorValidation = isValidRiskProfile(payload.vendor);
  if (!vendorValidation.validScores) {
    redirect("/settings?tab=pontuacao&error=vendor_scores");
  }
  if (!vendorValidation.validThresholds) {
    redirect("/settings?tab=pontuacao&error=vendor_thresholds");
  }

  await upsertPlatformSettings("RISK_SCORING", payload);
  await recalculateAllPartnerAssessmentDecisions();
  await recalculateAllVendorAssessmentDecisions();
  redirect("/settings?tab=pontuacao&saved=pontuacao");
}

async function saveNotificationSettings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveNotificationSettings");

  const payload: NotificationSettings = {
    notify_on_responded: formData.get("notify_on_responded") === "on",
    notify_on_critical: formData.get("notify_on_critical") === "on",
    notify_on_overdue: formData.get("notify_on_overdue") === "on",
    slack_channel: String(formData.get("slack_channel") ?? "").trim(),
    escalation_emails: String(formData.get("escalation_emails") ?? "").trim(),
  };

  await upsertPlatformSettings("NOTIFICATIONS", payload);
  redirect("/settings?tab=notificacoes&saved=notificacoes");
}

async function saveUserAccessProfile(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.saveUserAccessProfile");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const rawGroup = String(formData.get("access_group") ?? "PROCUREMENT").trim().toUpperCase();
  const isActive = formData.get("is_active") === "on";

  const accessGroup = (["ADMIN", "TECGRC", "COMPLIANCE", "PRIVACY", "PROCUREMENT"].includes(rawGroup)
    ? rawGroup
    : "PROCUREMENT") as AccessGroup;

  if (!email || !email.includes("@")) {
    redirect("/settings?tab=usuarios&error=usuarios_invalid_email");
  }

  await upsertUserAccessProfile({
    email,
    fullName: fullName || null,
    group: accessGroup,
    isActive,
  });

  redirect("/settings?tab=usuarios&saved=usuarios");
}

async function saveUserAccessProfilesBulk(formData: FormData) {
  "use server";
  const { session } = await requireServerActionSession("settings.saveUserAccessProfilesBulk");

  const rowCount = Math.max(0, Number.parseInt(String(formData.get("row_count") ?? "0"), 10) || 0);
  const currentEmail = session.email.trim().toLowerCase();

  for (let index = 0; index < rowCount; index += 1) {
    const email = String(formData.get(`row_${index}_email`) ?? "").trim().toLowerCase();
    const fullName = String(formData.get(`row_${index}_full_name`) ?? "").trim();
    const rawGroup = String(formData.get(`row_${index}_access_group`) ?? "PROCUREMENT").trim().toUpperCase();
    const isActive = formData.get(`row_${index}_is_active`) === "on";

    if (!email || !email.includes("@")) continue;

    const accessGroup = (["ADMIN", "TECGRC", "COMPLIANCE", "PRIVACY", "PROCUREMENT"].includes(rawGroup)
      ? rawGroup
      : "PROCUREMENT") as AccessGroup;

    const isSelf = email === currentEmail;
    const safeGroupForSelf = isSelf && (accessGroup === "PROCUREMENT" || accessGroup === "COMPLIANCE" || accessGroup === "PRIVACY")
      ? "ADMIN"
      : accessGroup;
    const safeIsActiveForSelf = isSelf ? true : isActive;

    await upsertUserAccessProfile({
      email,
      fullName: fullName || null,
      group: safeGroupForSelf,
      isActive: safeIsActiveForSelf,
    });
  }

  redirect("/settings?tab=usuarios&saved=usuarios_bulk");
}

async function removeUserAccessProfile(formData: FormData) {
  "use server";
  const { session } = await requireServerActionSession("settings.removeUserAccessProfile");

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    redirect("/settings?tab=usuarios&error=usuarios_invalid_email");
  }
  if (email === session.email.trim().toLowerCase()) {
    redirect("/settings?tab=usuarios&error=usuarios_self_remove");
  }

  await deleteUserAccessProfile(email);
  redirect("/settings?tab=usuarios&saved=usuario_removido");
}

function GeneralTab({
  value,
  saveAction,
}: {
  value: GeneralSettings;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={saveAction} className="space-y-6">
      <SectionCard title="Identidade da Organização" description="Dados gerais usados em comunicações, exportações e evidências.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome da Organização</span>
            <input name="organization_name" type="text" defaultValue={value.organization_name} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Unidade Principal</span>
            <select name="primary_business_unit" defaultValue={value.primary_business_unit} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm">
              <option value="VTEX">VTEX</option>
              <option value="WENI">Weni</option>
            </select>
          </label>
          <label className="space-y-1 md:col-span-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Domínio da Plataforma</span>
            <input name="platform_domain" type="text" defaultValue={value.platform_domain} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Políticas Operacionais" description="Defina padrões de SLA e comportamento padrão para novos casos.">
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">SLA para Resposta</span>
              <input name="sla_response_days" type="number" min={1} defaultValue={value.sla_response_days} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">SLA para Revisão</span>
              <input name="sla_review_days" type="number" min={1} defaultValue={value.sla_review_days} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Risco Padrão</span>
              <select name="default_risk_level" defaultValue={value.default_risk_level} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm">
                <option value="LOW">Baixo</option>
                <option value="MEDIUM">Médio</option>
                <option value="HIGH">Alto</option>
                <option value="CRITICAL">Crítico</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input name="auto_create_assessment" type="checkbox" defaultChecked={value.auto_create_assessment} className="h-4 w-4 accent-[var(--color-primary)]" />
              Criar assessment automaticamente ao cadastrar Vendor/Partner
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input name="require_security_review" type="checkbox" defaultChecked={value.require_security_review} className="h-4 w-4 accent-[var(--color-primary)]" />
              Exigir revisão de segurança antes da decisão final
            </label>
          </div>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Aba Geral</button>
      </div>
    </form>
  );
}

function UsersTab({
  currentUser,
  currentAccessGroup,
  userProfiles,
  saveAction,
  saveBulkAction,
  removeAction,
}: {
  currentUser: { name: string; email: string };
  currentAccessGroup: AccessGroup;
  userProfiles: UserAccessProfileRow[];
  saveAction: (formData: FormData) => Promise<void>;
  saveBulkAction: (formData: FormData) => Promise<void>;
  removeAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <div className="space-y-6">
      <SectionCard title="Perfil do Usuário" description="Informações básicas do usuário e preferências da conta.">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--color-primary)]/20 bg-[var(--color-neutral-100)] text-lg font-bold text-[var(--color-primary)]">
            {initialsFromName(currentUser.name)}
          </div>

          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome Completo</span>
                <input
                  type="text"
                  value={currentUser.name}
                  readOnly
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</span>
                <input
                  type="email"
                  value={currentUser.email}
                  readOnly
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none"
                />
              </label>
            </div>
            <div className="rounded-lg border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 px-4 py-3 text-sm text-[var(--color-text)]">
              Perfil atual: <span className={`rounded px-2 py-1 text-xs font-bold ${accessGroupClass[currentAccessGroup]}`}>{accessGroupLabel[currentAccessGroup]}</span>
              <p className="mt-2 text-xs text-[var(--color-neutral-700)]">{accessGroupDescription[currentAccessGroup]}</p>
            </div>
          </div>
        </div>
      </SectionCard>

      <form action={saveAction} className="space-y-6">
        <SectionCard title="Adicionar/Atualizar Acesso" description="Defina o grupo de acesso por e-mail da pessoa.">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <label className="space-y-1 md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</span>
              <input
                name="email"
                type="email"
                required
                placeholder="nome@vtex.com"
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome (opcional)</span>
              <input
                name="full_name"
                type="text"
                placeholder="Nome completo"
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Grupo</span>
              <select
                name="access_group"
                defaultValue="PROCUREMENT"
                className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              >
                {(["ADMIN", "TECGRC", "COMPLIANCE", "PRIVACY", "PROCUREMENT"] as AccessGroup[]).map((group) => (
                  <option key={group} value={group}>{accessGroupLabel[group]}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--color-primary)]" />
            Usuário ativo
          </label>
          <div className="mt-4 flex justify-end">
            <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
              Salvar acesso
            </button>
          </div>
        </SectionCard>
      </form>

      <SectionCard title="Usuários e Perfis" description="Gerencie acessos da equipe e níveis de permissão.">
        <form action={saveBulkAction}>
          <input type="hidden" name="row_count" value={String(userProfiles.length)} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left">
              <thead>
                <tr className="border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]">
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Perfil</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Status</th>
                  <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Ações</th>
                </tr>
              </thead>
              <tbody>
                {userProfiles.map((user, index) => (
                  <tr key={user.email} className="border-b border-[var(--color-neutral-100)]">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-xs font-bold text-[var(--color-primary)]">
                          {initialsFromName(user.fullName ?? user.email)}
                        </div>
                        <span className="text-sm font-medium text-[var(--color-text)]">{user.fullName ?? "-"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="text-sm text-[var(--color-neutral-700)]">{user.email}</span>
                      <input type="hidden" name={`row_${index}_email`} value={user.email} />
                      <input type="hidden" name={`row_${index}_full_name`} value={user.fullName ?? ""} />
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded px-2 py-1 text-xs font-bold ${accessGroupClass[user.group]}`}>{accessGroupLabel[user.group]}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${user.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                        <span className={`h-2 w-2 rounded-full ${user.isActive ? "bg-emerald-600" : "bg-slate-400"}`} />
                        {user.isActive ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          name={`row_${index}_access_group`}
                          defaultValue={user.group}
                          className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                        >
                          {(["ADMIN", "TECGRC", "COMPLIANCE", "PRIVACY", "PROCUREMENT"] as AccessGroup[]).map((group) => (
                            <option key={group} value={group}>{accessGroupLabel[group]}</option>
                          ))}
                        </select>
                        <label className="inline-flex items-center gap-1 text-xs text-[var(--color-neutral-700)]">
                          <input name={`row_${index}_is_active`} type="checkbox" defaultChecked={user.isActive} className="h-3.5 w-3.5 accent-[var(--color-primary)]" />
                          Ativo
                        </label>
                        <button
                          type="submit"
                          form={`remove-user-${index}`}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                        >
                          Remover
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="submit"
              className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
            >
              Salvar alterações
            </button>
          </div>
        </form>
        {userProfiles.map((user, index) => (
          <form key={`remove-${user.email}`} id={`remove-user-${index}`} action={removeAction} hidden>
            <input type="hidden" name="email" value={user.email} />
          </form>
        ))}
      </SectionCard>
    </div>
  );
}

function RiskScoringTab({
  value,
  saveAction,
}: {
  value: RiskScoringSettings;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  return <RiskScoringSettingsPanel value={value} saveAction={saveAction} />;
}

function NotificationsTab({
  value,
  saveAction,
}: {
  value: NotificationSettings;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  return (
    <form action={saveAction} className="space-y-6">
      <SectionCard title="Alertas de Operação" description="Configure eventos que disparam alertas para o time de risco.">
        <div className="grid grid-cols-1 gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input name="notify_on_responded" type="checkbox" defaultChecked={value.notify_on_responded} className="h-4 w-4 accent-[var(--color-primary)]" />
            Notificar quando questionário for respondido
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input name="notify_on_critical" type="checkbox" defaultChecked={value.notify_on_critical} className="h-4 w-4 accent-[var(--color-primary)]" />
            Notificar quando um caso for marcado como risco crítico
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
            <input name="notify_on_overdue" type="checkbox" defaultChecked={value.notify_on_overdue} className="h-4 w-4 accent-[var(--color-primary)]" />
            Notificar quando prazo de resposta estiver vencido
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Canais de Notificação" description="Defina para onde os alertas serão enviados por padrão.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Canal do Slack</span>
            <input name="slack_channel" type="text" defaultValue={value.slack_channel} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mails de Escalação</span>
            <input name="escalation_emails" type="text" defaultValue={value.escalation_emails} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Notificações</button>
      </div>
    </form>
  );
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{ saved?: string; tab?: string; error?: string }>;
}) {
  const sessionResult = await getAuthenticatedSessionResult();
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }

  const currentAccess = await resolveUserAccess(sessionResult.session.email);
  if (!currentAccess.permissions.canManageSettings) {
    redirect("/dashboard");
  }

  const [settings, typeformForms, generalSettings, riskScoringSettings, notificationSettings, userProfiles, params] = await Promise.all([
    getIntegrationSettings(),
    getTypeformForms(),
    getPlatformSettings("GENERAL", normalizeGeneralSettings),
    getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings),
    getPlatformSettings("NOTIFICATIONS", normalizeNotificationSettings),
    listUserAccessProfiles(),
    searchParams ? searchParams : Promise.resolve(undefined),
  ]);

  const typeform = getSetting<TypeformConfig>(settings, "TYPEFORM");
  const jira = getSetting<JiraConfig>(settings, "JIRA");
  const slack = getSetting<SlackConfig>(settings, "SLACK");
  const googleSheets = getSetting<GoogleSheetsConfig>(settings, "GOOGLE_SHEETS");
  const currentEmail = sessionResult.session.email.trim().toLowerCase();
  const mergedUserProfiles = userProfiles.some((profile) => profile.email === currentEmail)
    ? userProfiles
    : [
        {
          email: currentEmail,
          fullName: sessionResult.session.name || null,
          group: currentAccess.group,
          isActive: true,
          updatedAt: null,
        } satisfies UserAccessProfileRow,
        ...userProfiles,
      ];

  const savedFlag = params?.saved;
  const activeTab = normalizeTab(params?.tab);
  const typeformHiddenHealth =
    activeTab === "integracoes"
      ? await getTypeformHiddenHealth({ entityKind: "VENDOR", days: 30, pageSize: 200 })
      : null;
  const errorMessage = formatRiskSettingsError(params?.error);
  const savedMessage = formatSavedMessage(savedFlag);

  return (
    <PageContainer
      title="Configurações"
      description="Gerencie preferências da plataforma, controles de acesso e integrações externas."
      className="space-y-8"
    >
      {savedMessage ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {savedMessage}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="overflow-x-auto border-b border-[var(--color-neutral-200)]">
        <div className="flex min-w-max gap-8">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <Link
                key={tab.id}
                href={`/settings?tab=${tab.id}`}
                className={`pb-4 text-sm transition ${
                  isActive
                    ? "border-b-2 border-[var(--color-primary)] font-bold text-[var(--color-primary)]"
                    : "font-medium text-[var(--color-neutral-600)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {activeTab === "geral" ? <GeneralTab value={generalSettings} saveAction={saveGeneralSettings} /> : null}
      {activeTab === "usuarios" ? (
        <UsersTab
          currentUser={{ name: sessionResult.session.name, email: sessionResult.session.email }}
          currentAccessGroup={currentAccess.group}
          userProfiles={mergedUserProfiles}
          saveAction={saveUserAccessProfile}
          saveBulkAction={saveUserAccessProfilesBulk}
          removeAction={removeUserAccessProfile}
        />
      ) : null}
      {activeTab === "integracoes" ? (
        <IntegrationsSettings
          appUrl={appUrl}
          typeform={typeform}
          typeformForms={typeformForms}
          jira={jira}
          slack={slack}
          googleSheets={googleSheets}
          typeformSecretConfigured={typeformSecretConfigured}
          typeformApiTokenConfigured={typeformApiTokenConfigured}
          jiraTokenConfigured={jiraTokenConfigured}
          jiraWebhookSecretConfigured={jiraWebhookSecretConfigured}
          slackTokenConfigured={slackTokenConfigured}
          googleWorkspaceCredentialsConfigured={googleWorkspaceCredentialsConfigured}
          googleWorkspaceImpersonatedConfigured={googleWorkspaceImpersonatedConfigured}
          emailReplyToConfigured={emailReplyToConfigured}
          typeformHiddenHealth={typeformHiddenHealth}
          saveTypeformSettings={saveTypeformSettings}
          saveTypeformForm={saveTypeformForm}
          deleteTypeformForm={deleteTypeformForm}
          saveJiraSettings={saveJiraSettings}
          saveSlackSettings={saveSlackSettings}
          saveGoogleSheetsSettings={saveGoogleSheetsSettings}
        />
      ) : null}
      {activeTab === "pontuacao" ? <RiskScoringTab value={riskScoringSettings} saveAction={saveRiskScoringSettings} /> : null}
      {activeTab === "notificacoes" ? <NotificationsTab value={notificationSettings} saveAction={saveNotificationSettings} /> : null}

      {activeTab === "geral" ? (
        <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-200)] pt-6">
          <button type="button" className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-6 py-2.5 text-sm font-bold text-[var(--color-neutral-700)]">
            Restaurar Padrão
          </button>
          <button type="button" className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 text-sm font-bold text-white">
            Aplicar Configuração
          </button>
        </div>
      ) : null}
    </PageContainer>
  );
}
