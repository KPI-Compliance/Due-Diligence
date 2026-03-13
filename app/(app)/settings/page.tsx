import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { IntegrationsSettings } from "@/components/settings/IntegrationsSettings";
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
  type RiskScoringSettings,
  upsertPlatformSettings,
} from "@/lib/platform-settings";

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
    security_weight: Math.max(0, Math.min(100, Number(formData.get("security_weight") ?? 50) || 50)),
    privacy_weight: Math.max(0, Math.min(100, Number(formData.get("privacy_weight") ?? 30) || 30)),
    compliance_weight: Math.max(0, Math.min(100, Number(formData.get("compliance_weight") ?? 20) || 20)),
    low_min: Math.max(0, Math.min(100, Number(formData.get("low_min") ?? 80) || 80)),
    medium_min: Math.max(0, Math.min(100, Number(formData.get("medium_min") ?? 60) || 60)),
    high_min: Math.max(0, Math.min(100, Number(formData.get("high_min") ?? 40) || 40)),
    critical_min: Math.max(0, Math.min(100, Number(formData.get("critical_min") ?? 0) || 0)),
  };

  await upsertPlatformSettings("RISK_SCORING", payload);
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
  const totalWeight = value.security_weight + value.privacy_weight + value.compliance_weight;
  return (
    <form action={saveAction} className="space-y-6">
      <SectionCard title="Pesos de Pontuação" description="Defina como cada domínio afeta a nota final de risco (total deve somar 100%).">
        <div className="space-y-8">
          {[
            { key: "security_weight", label: "Postura de Segurança", icon: "security", value: value.security_weight },
            { key: "privacy_weight", label: "Privacidade e Dados", icon: "privacy_tip", value: value.privacy_weight },
            { key: "compliance_weight", label: "Conformidade Regulatória", icon: "verified_user", value: value.compliance_weight },
          ].map((item) => (
            <div key={item.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--color-primary)]">{item.icon}</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{item.label}</span>
                </div>
                <div className="rounded bg-[var(--color-neutral-100)] px-2 py-1 text-xs font-bold text-[var(--color-neutral-700)]">{item.value}%</div>
              </div>
              <input name={item.key} type="number" min={0} max={100} defaultValue={item.value} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
            </div>
          ))}
          <p className={`text-xs font-semibold ${totalWeight === 100 ? "text-emerald-700" : "text-amber-700"}`}>
            Soma atual dos pesos: {totalWeight}% (recomendado: 100%)
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Classificação Automática" description="Limiares usados para converter nota numérica em nível de risco.">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          {[
            { key: "low_min", label: "Baixo", range: `${value.low_min}-100`, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
            { key: "medium_min", label: "Médio", range: `${value.medium_min}-${value.low_min - 1}`, tone: "text-amber-700 bg-amber-50 border-amber-200" },
            { key: "high_min", label: "Alto", range: `${value.high_min}-${value.medium_min - 1}`, tone: "text-orange-700 bg-orange-50 border-orange-200" },
            { key: "critical_min", label: "Crítico", range: `${value.critical_min}-${value.high_min - 1}`, tone: "text-red-700 bg-red-50 border-red-200" },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
              <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
              <p className="mt-1 text-lg font-black">{item.range}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Mínimo Baixo</span>
            <input name="low_min" type="number" min={0} max={100} defaultValue={value.low_min} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Mínimo Médio</span>
            <input name="medium_min" type="number" min={0} max={100} defaultValue={value.medium_min} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Mínimo Alto</span>
            <input name="high_min" type="number" min={0} max={100} defaultValue={value.high_min} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Mínimo Crítico</span>
            <input name="critical_min" type="number" min={0} max={100} defaultValue={value.critical_min} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Pontuação de Risco</button>
      </div>
    </form>
  );
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
  searchParams?: Promise<{ saved?: string; tab?: string }>;
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
