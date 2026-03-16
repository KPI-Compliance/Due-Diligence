import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
import { RiskScoringSettingsPanel } from "@/components/settings/RiskScoringSettingsPanel";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";
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

type UserRow = {
  initials: string;
  name: string;
  role: string;
  roleTone: "admin" | "auditor" | "viewer";
  status: "active" | "pending";
};

type SettingsTab = "geral" | "usuarios" | "integracoes" | "pontuacao" | "notificacoes";

const tabs: Array<{ id: SettingsTab; label: string }> = [
  { id: "geral", label: "Geral" },
  { id: "usuarios", label: "Usuários e Perfis" },
  { id: "integracoes", label: "Integrações" },
  { id: "pontuacao", label: "Pontuação de Risco" },
  { id: "notificacoes", label: "Notificações" },
];

const teamUsers: UserRow[] = [
  { initials: "AR", name: "Alex Rivera", role: "Administrador", roleTone: "admin", status: "active" },
  { initials: "SM", name: "Sarah Miller", role: "Auditor", roleTone: "auditor", status: "active" },
  { initials: "JD", name: "John Dorsey", role: "Leitor", roleTone: "viewer", status: "pending" },
];

const roleToneClass: Record<UserRow["roleTone"], string> = {
  admin: "bg-blue-100 text-blue-700",
  auditor: "bg-purple-100 text-purple-700",
  viewer: "bg-slate-100 text-slate-700",
};

const statusClass: Record<UserRow["status"], string> = {
  active: "text-emerald-600",
  pending: "text-slate-400",
};

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://due-diligence-eight.vercel.app");
const typeformSecretConfigured = Boolean(process.env.TYPEFORM_WEBHOOK_SECRET);
const typeformApiTokenConfigured = Boolean(process.env.TYPEFORM_API_TOKEN ?? process.env.TYPEFORM_ACCESS_TOKEN);
const jiraTokenConfigured = Boolean(process.env.JIRA_API_TOKEN);
const jiraWebhookSecretConfigured = Boolean(process.env.JIRA_WEBHOOK_SECRET);
const slackTokenConfigured = Boolean(process.env.SLACK_BOT_TOKEN);

export const dynamic = "force-dynamic";

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

  return "Nao foi possivel salvar a pontuacao de risco. Revise os valores informados.";
}

function parseDecimalField(formData: FormData, key: string, fallback: number) {
  const raw = Number(formData.get(key) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.round(Math.max(0, Math.min(10, raw)) * 10) / 10;
}

function parsePercentField(formData: FormData, key: string, fallback: number) {
  const raw = Number(formData.get(key) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function isValidRiskProfile(profile: RiskScoringProfile, expectedWeightTotal: number) {
  const totalWeight = profile.security_weight + profile.privacy_weight + profile.compliance_weight;
  const validWeights = totalWeight === expectedWeightTotal;
  const validScores =
    profile.fully_score <= profile.partially_score && profile.partially_score <= profile.does_not_meet_score;
  const validThresholds = profile.low_max < profile.medium_max && profile.low_max >= 0 && profile.medium_max <= 10;

  return {
    validWeights,
    validScores,
    validThresholds,
  };
}

async function saveTypeformSettings(formData: FormData) {
  "use server";

  const enabled = formData.get("enabled") === "on";

  const config: TypeformConfig = {
    default_hidden_assessment_field:
      String(formData.get("default_hidden_assessment_field") ?? "assessment_id").trim() || "assessment_id",
    webhook_mode: formData.get("webhook_mode") === "unsigned" ? "unsigned" : "signed",
    api_user: String(formData.get("api_user") ?? "").trim(),
    api_token: String(formData.get("api_token") ?? "").trim(),
  };

  await upsertIntegrationSetting("TYPEFORM", enabled, config);
  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=typeform");
}

async function saveTypeformForm(formData: FormData) {
  "use server";

  const rawEntityKind = String(formData.get("entity_kind") ?? "ANY").toUpperCase();
  const entity_kind = rawEntityKind === "VENDOR" || rawEntityKind === "PARTNER" ? rawEntityKind : "ANY";

  await upsertTypeformForm({
    id: String(formData.get("id") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    form_id: String(formData.get("form_id") ?? "").trim(),
    entity_kind,
    workflow: String(formData.get("workflow") ?? "security_review").trim() || "security_review",
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
    enabled: formData.get("enabled") === "on",
  });

  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=typeform-form");
}

async function deleteTypeformForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) {
    redirect("/settings?tab=integracoes&saved=typeform-form");
  }

  await deleteTypeformFormRow(id);

  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=typeform-form");
}

async function saveJiraSettings(formData: FormData) {
  "use server";

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
  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=jira");
}

async function saveSlackSettings(formData: FormData) {
  "use server";

  const enabled = formData.get("enabled") === "on";

  const config: SlackConfig = {
    channel: String(formData.get("channel") ?? "").trim(),
    notify_on_responded: formData.get("notify_on_responded") === "on",
    notify_on_critical: formData.get("notify_on_critical") === "on",
  };

  await upsertIntegrationSetting("SLACK", enabled, config);
  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=slack");
}

async function saveGoogleSheetsSettings(formData: FormData) {
  "use server";

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
  revalidatePath("/settings");
  redirect("/settings?tab=integracoes&saved=google-sheets");
}

async function saveGeneralSettings(formData: FormData) {
  "use server";

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
  revalidatePath("/settings");
  redirect("/settings?tab=geral&saved=geral");
}

async function saveRiskScoringSettings(formData: FormData) {
  "use server";

  const payload: RiskScoringSettings = {
    partner: {
      security_weight: parsePercentField(formData, "partner_security_weight", 50),
      privacy_weight: parsePercentField(formData, "partner_privacy_weight", 30),
      compliance_weight: parsePercentField(formData, "partner_compliance_weight", 20),
      fully_score: parseDecimalField(formData, "partner_fully_score", 0),
      partially_score: parseDecimalField(formData, "partner_partially_score", 5),
      does_not_meet_score: parseDecimalField(formData, "partner_does_not_meet_score", 10),
      low_max: parseDecimalField(formData, "partner_low_max", 3),
      medium_max: parseDecimalField(formData, "partner_medium_max", 6),
    },
    vendor: {
      security_weight: parsePercentField(formData, "vendor_security_weight", 50),
      privacy_weight: parsePercentField(formData, "vendor_privacy_weight", 50),
      compliance_weight: 0,
      fully_score: parseDecimalField(formData, "vendor_fully_score", 0),
      partially_score: parseDecimalField(formData, "vendor_partially_score", 5),
      does_not_meet_score: parseDecimalField(formData, "vendor_does_not_meet_score", 10),
      low_max: parseDecimalField(formData, "vendor_low_max", 3),
      medium_max: parseDecimalField(formData, "vendor_medium_max", 6),
    },
  };

  const partnerValidation = isValidRiskProfile(payload.partner, 100);
  if (!partnerValidation.validWeights) {
    redirect("/settings?tab=pontuacao&error=partner_weights");
  }
  if (!partnerValidation.validScores) {
    redirect("/settings?tab=pontuacao&error=partner_scores");
  }
  if (!partnerValidation.validThresholds) {
    redirect("/settings?tab=pontuacao&error=partner_thresholds");
  }

  const vendorValidation = isValidRiskProfile(payload.vendor, 100);
  if (!vendorValidation.validWeights) {
    redirect("/settings?tab=pontuacao&error=vendor_weights");
  }
  if (!vendorValidation.validScores) {
    redirect("/settings?tab=pontuacao&error=vendor_scores");
  }
  if (!vendorValidation.validThresholds) {
    redirect("/settings?tab=pontuacao&error=vendor_thresholds");
  }

  await upsertPlatformSettings("RISK_SCORING", payload);
  await recalculateAllPartnerAssessmentDecisions();
  revalidatePath("/settings");
  redirect("/settings?tab=pontuacao&saved=pontuacao");
}

async function saveNotificationSettings(formData: FormData) {
  "use server";

  const payload: NotificationSettings = {
    notify_on_responded: formData.get("notify_on_responded") === "on",
    notify_on_critical: formData.get("notify_on_critical") === "on",
    notify_on_overdue: formData.get("notify_on_overdue") === "on",
    slack_channel: String(formData.get("slack_channel") ?? "").trim(),
    escalation_emails: String(formData.get("escalation_emails") ?? "").trim(),
  };

  await upsertPlatformSettings("NOTIFICATIONS", payload);
  revalidatePath("/settings");
  redirect("/settings?tab=notificacoes&saved=notificacoes");
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

function UsersTab() {
  return (
    <div className="space-y-6">
      <SectionCard title="Perfil do Usuário" description="Informações básicas do usuário e preferências da conta.">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--color-primary)]/20 bg-[var(--color-neutral-100)] text-lg font-bold text-[var(--color-primary)]">
            AR
          </div>

          <div className="flex-1 space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome Completo</span>
                <input
                  type="text"
                  defaultValue="Alex Rivera"
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</span>
                <input
                  type="email"
                  defaultValue="alex.rivera@enterprise.com"
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3">
              <button type="button" className="rounded-lg bg-[var(--color-neutral-100)] px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                Cancelar
              </button>
              <button type="button" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Usuários e Perfis" description="Gerencie acessos da equipe e níveis de permissão.">
        <div className="mb-4 flex justify-end">
          <button type="button" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
            Adicionar Usuário
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-left">
            <thead>
              <tr className="border-b border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]">
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Perfil</th>
                <th className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Ações</th>
              </tr>
            </thead>
            <tbody>
              {teamUsers.map((user) => (
                <tr key={user.name} className="border-b border-[var(--color-neutral-100)]">
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-primary)]/10 text-xs font-bold text-[var(--color-primary)]">
                        {user.initials}
                      </div>
                      <span className="text-sm font-medium text-[var(--color-text)]">{user.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`rounded px-2 py-1 text-xs font-bold ${roleToneClass[user.roleTone]}`}>{user.role}</span>
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-bold ${statusClass[user.status]}`}>
                      <span className={`h-2 w-2 rounded-full ${user.status === "active" ? "bg-emerald-600" : "bg-slate-400"}`} />
                      {user.status === "active" ? "Ativo" : "Pendente"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-[var(--color-neutral-600)]">•••</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
  const settings = await getIntegrationSettings();
  const typeformForms = await getTypeformForms();
  const generalSettings = await getPlatformSettings("GENERAL", normalizeGeneralSettings);
  const riskScoringSettings = await getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings);
  const notificationSettings = await getPlatformSettings("NOTIFICATIONS", normalizeNotificationSettings);
  const params = searchParams ? await searchParams : undefined;

  const typeform = getSetting<TypeformConfig>(settings, "TYPEFORM");
  const jira = getSetting<JiraConfig>(settings, "JIRA");
  const slack = getSetting<SlackConfig>(settings, "SLACK");
  const googleSheets = getSetting<GoogleSheetsConfig>(settings, "GOOGLE_SHEETS");

  const savedFlag = params?.saved;
  const activeTab = normalizeTab(params?.tab);
  const errorMessage = formatRiskSettingsError(params?.error);

  return (
    <PageContainer
      title="Configurações"
      description="Gerencie preferências da plataforma, controles de acesso e integrações externas."
      className="space-y-8"
    >
      {savedFlag ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Configurações de <span className="font-bold uppercase">{savedFlag}</span> salvas com sucesso.
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
      {activeTab === "usuarios" ? <UsersTab /> : null}
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

      <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-200)] pt-6">
        <button type="button" className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-6 py-2.5 text-sm font-bold text-[var(--color-neutral-700)]">
          Restaurar Padrão
        </button>
        <button type="button" className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 text-sm font-bold text-white">
          Aplicar Configuração
        </button>
      </div>
    </PageContainer>
  );
}
