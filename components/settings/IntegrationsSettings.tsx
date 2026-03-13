"use client";

import Link from "next/link";
import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { GoogleSheetsConfig, JiraConfig, SlackConfig, TypeformConfig, TypeformFormItem } from "@/lib/settings-data";

type ModalKey = "typeform" | "typeform_forms" | "jira" | "slack" | "google_sheets" | null;

const modalPanelClass = "overflow-hidden rounded-xl border border-[var(--color-neutral-200)] bg-white shadow-sm";
const modalInputClass =
  "w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm text-[var(--color-text)] outline-none transition focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary)]/15";
const modalReadOnlyInputClass =
  "w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-4 py-2.5 text-sm text-[var(--color-text)]";
const modalLabelClass = "text-sm font-bold text-[var(--color-neutral-700)]";
const modalHintClass = "block text-xs text-[var(--color-neutral-600)]";

type IntegrationsSettingsProps = {
  appUrl: string;
  typeform: { enabled: boolean; config: TypeformConfig };
  typeformForms: TypeformFormItem[];
  jira: { enabled: boolean; config: JiraConfig };
  slack: { enabled: boolean; config: SlackConfig };
  googleSheets: { enabled: boolean; config: GoogleSheetsConfig };
  typeformSecretConfigured: boolean;
  typeformApiTokenConfigured: boolean;
  jiraTokenConfigured: boolean;
  jiraWebhookSecretConfigured: boolean;
  slackTokenConfigured: boolean;
  saveTypeformSettings: (formData: FormData) => Promise<void>;
  saveTypeformForm: (formData: FormData) => Promise<void>;
  deleteTypeformForm: (formData: FormData) => Promise<void>;
  saveJiraSettings: (formData: FormData) => Promise<void>;
  saveSlackSettings: (formData: FormData) => Promise<void>;
  saveGoogleSheetsSettings: (formData: FormData) => Promise<void>;
};

function Backdrop({
  onClose,
  children,
  maxWidthClass = "max-w-3xl",
}: {
  onClose: () => void;
  children: React.ReactNode;
  maxWidthClass?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/45 p-4">
      <button aria-label="Fechar modal" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div className={`relative z-10 max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[var(--color-neutral-200)] bg-white p-6 shadow-2xl ${maxWidthClass}`}>
        {children}
      </div>
    </div>
  );
}

export function IntegrationsSettings({
  appUrl,
  typeform,
  typeformForms,
  jira,
  slack,
  googleSheets,
  typeformSecretConfigured,
  typeformApiTokenConfigured,
  jiraTokenConfigured,
  jiraWebhookSecretConfigured,
  slackTokenConfigured,
  saveTypeformSettings,
  saveTypeformForm,
  deleteTypeformForm,
  saveJiraSettings,
  saveSlackSettings,
  saveGoogleSheetsSettings,
}: IntegrationsSettingsProps) {
  const [openModal, setOpenModal] = useState<ModalKey>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [googleServiceAccounts, setGoogleServiceAccounts] = useState<string[]>(
    googleSheets.config.service_account_emails.length > 0 ? googleSheets.config.service_account_emails : [""],
  );
  const [googleSpreadsheets, setGoogleSpreadsheets] = useState<
    Array<{
      name: string;
      entity_kind: "VENDOR" | "PARTNER";
      workflow: "internal_questionnaire" | "external_questionnaire";
      spreadsheet_url: string;
      worksheet_names: string[];
    }>
  >(
    googleSheets.config.spreadsheets.length > 0
      ? googleSheets.config.spreadsheets
      : [
          {
            name: "Mini Questionário Interno",
            entity_kind: "VENDOR",
            workflow: "internal_questionnaire",
            spreadsheet_url: "",
            worksheet_names: ["Página 1"],
          },
      ],
  );
  const [googleWorksheetDrafts, setGoogleWorksheetDrafts] = useState<string[]>(
    googleSheets.config.spreadsheets.length > 0 ? googleSheets.config.spreadsheets.map(() => "") : [""],
  );

  async function copyToClipboard(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback(successMessage);
      setTimeout(() => setCopyFeedback(null), 2200);
    } catch {
      setCopyFeedback("Nao foi possivel copiar automaticamente. Copie manualmente.");
      setTimeout(() => setCopyFeedback(null), 2200);
    }
  }

  const testPayload = JSON.stringify(
    {
      event_id: "evt_test_001",
      event_type: "form_response",
      form_response: {
        token: "resp_test_001",
        submitted_at: "2026-03-06T12:00:00Z",
        definition: {
          id: "<TYPEFORM_FORM_ID>",
        },
        hidden: {
          assessment_id: "<ASSESSMENT_UUID>",
        },
        answers: [
          {
            type: "text",
            field: { ref: "security_program", title: "Describe your security program", type: "short_text" },
            text: "Resposta de exemplo do ponto focal.",
          },
        ],
      },
    },
    null,
    2,
  );

  return (
    <section className="space-y-6">
      <header>
        <h2 className="text-xl font-bold text-[var(--color-text)]">Integracoes</h2>
        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Configure Typeform, Jira, Slack e Google Sheets para automatizar fluxos operacionais.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        <SectionCard
          title="Typeform"
          description="Formularios de intake e respostas de questionarios"
          className={typeform.enabled ? "border-emerald-200" : "border-[var(--color-neutral-200)]"}
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Status: <span className={typeform.enabled ? "text-emerald-600" : "text-amber-600"}>{typeform.enabled ? "Ativado" : "Desativado"}</span>
            </p>
            <p className="text-xs text-[var(--color-neutral-600)]">Formularios configurados: {typeformForms.length}</p>
            <button
              type="button"
              onClick={() => setOpenModal("typeform")}
              className="w-full rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5"
            >
              Configurar
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Typeform Forms"
          description="Catalogo e mapeamento dos formularios cadastrados"
          className={typeformForms.length > 0 ? "border-emerald-200" : "border-[var(--color-neutral-200)]"}
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Status: <span className={typeformForms.length > 0 ? "text-emerald-600" : "text-amber-600"}>{typeformForms.length > 0 ? "Configurado" : "Sem formularios"}</span>
            </p>
            <p className="text-xs text-[var(--color-neutral-600)]">
              Total: {typeformForms.length} | Partners: {typeformForms.filter((form) => form.entity_kind === "PARTNER").length}
            </p>
            <Link
              href="/settings/typeform-forms"
              className="block w-full rounded-lg border border-[var(--color-primary)] px-3 py-2 text-center text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5"
            >
              Configurar
            </Link>
          </div>
        </SectionCard>

        <SectionCard title="Jira" description="Tickets para mitigacao e filas de revisao" className={jira.enabled ? "border-emerald-200" : "border-[var(--color-neutral-200)]"}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Status: <span className={jira.enabled ? "text-emerald-600" : "text-amber-600"}>{jira.enabled ? "Ativado" : "Desativado"}</span>
            </p>
            <button type="button" onClick={() => setOpenModal("jira")} className="w-full rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5">
              Configurar
            </button>
          </div>
        </SectionCard>

        <SectionCard title="Slack" description="Alertas e notificacoes de fluxo" className={slack.enabled ? "border-emerald-200" : "border-[var(--color-neutral-200)]"}>
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Status: <span className={slack.enabled ? "text-emerald-600" : "text-amber-600"}>{slack.enabled ? "Ativado" : "Desativado"}</span>
            </p>
            <button type="button" onClick={() => setOpenModal("slack")} className="w-full rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5">
              Configurar
            </button>
          </div>
        </SectionCard>

        <SectionCard
          title="Google Sheets"
          description="Leitura autenticada de planilhas para intake e mini questionario"
          className={googleSheets.enabled ? "border-emerald-200" : "border-[var(--color-neutral-200)]"}
        >
          <div className="space-y-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Status: <span className={googleSheets.enabled ? "text-emerald-600" : "text-amber-600"}>{googleSheets.enabled ? "Ativado" : "Desativado"}</span>
            </p>
            <p className="text-xs text-[var(--color-neutral-600)]">
              Contas: {googleSheets.config.service_account_emails.length} | Planilhas: {googleSheets.config.spreadsheets.length}
            </p>
            <button
              type="button"
              onClick={() => setOpenModal("google_sheets")}
              className="w-full rounded-lg border border-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/5"
            >
              Configurar
            </button>
          </div>
        </SectionCard>
      </div>

      {openModal === "typeform" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Typeform</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Configure uma vez e depois mapeie um ou varios formularios por `form_id`, inclusive varios externos para Partners.</p>
            </div>
            <button type="button" onClick={() => setOpenModal(null)} className="rounded-md px-2 py-1 text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
              ✕
            </button>
          </div>

          <section className="mb-4 space-y-3 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-[var(--color-text)]">Configuracao Rapida (recomendada)</p>
              {copyFeedback ? <span className="text-xs font-semibold text-emerald-700">{copyFeedback}</span> : null}
            </div>
            <ol className="space-y-1 text-sm text-[var(--color-neutral-700)]">
              <li>1. Salve as configuracoes globais (endpoint, modo e hidden field padrao).</li>
              <li>2. No Typeform, cadastre a URL de webhook abaixo.</li>
              <li>3. Para cada formulario Typeform, adicione um mapeamento com o `form_id` exato.</li>
              <li>4. Para Partners, voce pode cadastrar varios formularios `external_questionnaire` apontando para a mesma fila do Jira.</li>
              <li>5. Hidden field continua opcional quando o vinculo for feito pelo nome da empresa.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copyToClipboard(`${appUrl}/api/typeform/webhook`, "Endpoint de webhook copiado.")}
                className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
              >
                Copiar Endpoint do Webhook
              </button>
              <button
                type="button"
                onClick={() => copyToClipboard(testPayload, "Payload de teste copiado.")}
                className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
              >
                Copiar Payload de Teste
              </button>
            </div>
          </section>

          <form action={saveTypeformSettings} className="space-y-4 rounded-xl border border-[var(--color-neutral-200)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Configuracoes Globais do Typeform</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Endpoint do Webhook</span>
                <input type="text" readOnly value={`${appUrl}/api/typeform/webhook`} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm" />
                <span className="block text-xs text-[var(--color-neutral-600)]">Use essa URL exatamente como webhook no Typeform.</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Segredo do Webhook</span>
                <input
                  type="text"
                  readOnly
                  value={typeformSecretConfigured ? "Configurado no ambiente" : "Ausente: TYPEFORM_WEBHOOK_SECRET"}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">Quando o modo for Assinado, essa variavel e obrigatoria.</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Usuario da API</span>
                <input
                  name="api_user"
                  type="email"
                  defaultValue={typeform.config.api_user}
                  placeholder="seu.usuario@vtex.com"
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">Conta usada para administrar ou auditar a integracao do Typeform.</span>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Typeform API Token</span>
                <input
                  name="api_token"
                  type="password"
                  defaultValue={typeform.config.api_token}
                  placeholder={typeformApiTokenConfigured ? "Configurado no ambiente ou sobrescreva aqui" : "Cole aqui o TYPEFORM_API_TOKEN"}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">Se preenchido aqui, o sistema usa este token antes do `TYPEFORM_API_TOKEN` do ambiente.</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome do Hidden Field Padrao</span>
                <input
                  name="default_hidden_assessment_field"
                  type="text"
                  defaultValue={typeform.config.default_hidden_assessment_field}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">Campo de fallback caso o mapeamento do formulario nao sobrescreva.</span>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Modo do Webhook</span>
                <select name="webhook_mode" defaultValue={typeform.config.webhook_mode} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm">
                  <option value="signed">Assinado</option>
                  <option value="unsigned">Sem assinatura</option>
                </select>
                <span className="block text-xs text-[var(--color-neutral-600)]">Assinado e recomendado para producao.</span>
              </label>
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm font-medium text-[var(--color-text)]">
              <input name="enabled" type="checkbox" defaultChecked={typeform.enabled} className="h-4 w-4 accent-[var(--color-primary)]" />
              Ativar integracao com Typeform
            </label>

            <div className="flex justify-end">
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Configuracoes Globais</button>
            </div>
          </form>

        </Backdrop>
      ) : null}

      {openModal === "typeform_forms" ? (
        <Backdrop onClose={() => setOpenModal(null)} maxWidthClass="max-w-7xl">
          <div className="space-y-8">
            <div className="flex flex-col gap-4 border-b border-[var(--color-neutral-100)] pb-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-3xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--color-text)] text-white shadow-lg shadow-[var(--color-text)]/10">
                    <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v4H7v2h4v4h2v-4h4v-2h-4V7z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.24em] text-[var(--color-neutral-500)]">Typeform Forms</p>
                    <h3 className="text-3xl font-extrabold tracking-tight text-[var(--color-text)]">Integração Typeform</h3>
                  </div>
                </div>
                <p className="text-base leading-relaxed text-[var(--color-neutral-600)]">
                  Gerencie o catálogo de formulários ativos do Typeform e defina, por formulário, como as respostas devem ser roteadas para Vendors ou Partners, incluindo o intervalo manual de perguntas para Compliance, Privacy e Security.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full bg-[var(--color-primary)]/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                  {typeformForms.length} integrados
                </div>
                <button
                  type="button"
                  onClick={() => setOpenModal("typeform")}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95"
                >
                  Conectar Conta
                </button>
                <button
                  type="button"
                  onClick={() => setOpenModal(null)}
                  className="rounded-lg border border-[var(--color-neutral-200)] px-4 py-2.5 text-sm font-bold text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-100)]"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_360px]">
              <div className="space-y-8">
                <section className={modalPanelClass}>
                  <div className="flex items-center justify-between border-b border-[var(--color-neutral-100)] px-6 py-4">
                    <h4 className="font-bold text-[var(--color-text)]">Formulários Ativos</h4>
                    <span className="rounded-full bg-[var(--color-primary)]/10 px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                      {typeformForms.length} Integrados
                    </span>
                  </div>
                  {typeformForms.length === 0 ? (
                    <div className="px-6 py-10 text-center text-sm text-[var(--color-neutral-600)]">
                      Nenhum formulário configurado ainda.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[860px] text-left">
                        <thead>
                          <tr className="bg-[var(--color-neutral-100)]/60 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                            <th className="px-6 py-3">Nome do Formulário</th>
                            <th className="px-6 py-3">ID</th>
                            <th className="px-6 py-3">Entidade / Workflow</th>
                            <th className="px-6 py-3">Mapeamento</th>
                            <th className="px-6 py-3">Status</th>
                            <th className="px-6 py-3 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-neutral-100)]">
                          {typeformForms.map((form) => (
                            <tr key={form.id} className="text-sm transition-colors hover:bg-[var(--color-neutral-100)]/30">
                              <td className="px-6 py-4 font-semibold text-[var(--color-text)]">{form.name}</td>
                              <td className="px-6 py-4 font-mono text-xs text-[var(--color-neutral-600)]">{form.form_id}</td>
                              <td className="px-6 py-4">
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs font-medium text-[var(--color-neutral-700)]">
                                    {form.entity_kind === "ANY" ? "Qualquer" : form.entity_kind === "PARTNER" ? "Partner" : "Vendor"}
                                  </span>
                                  <span className="w-fit rounded bg-[var(--color-neutral-100)] px-2 py-0.5 text-xs capitalize text-[var(--color-neutral-700)]">
                                    {form.workflow.replaceAll("_", " ")}
                                  </span>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1 text-xs text-[var(--color-neutral-700)]">
                                  <div>C: {form.section_rules.compliance.start ? "Configurado" : "-"}</div>
                                  <div>P: {form.section_rules.privacy.start ? "Configurado" : "-"}</div>
                                  <div>S: {form.section_rules.security.start ? "Configurado" : "-"}</div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${
                                    form.enabled
                                      ? "bg-emerald-100 text-emerald-700"
                                      : "bg-[var(--color-neutral-100)] text-[var(--color-neutral-600)]"
                                  }`}
                                >
                                  <span className={`h-1.5 w-1.5 rounded-full ${form.enabled ? "bg-emerald-600" : "bg-[var(--color-neutral-400)]"}`} />
                                  {form.enabled ? "Ativo" : "Inativo"}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg p-1.5 text-[var(--color-neutral-400)] transition-colors hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
                                  >
                                    <span className="text-xl">✎</span>
                                  </button>
                                  <form action={deleteTypeformForm}>
                                    <input type="hidden" name="id" value={form.id} />
                                    <button
                                      type="submit"
                                      className="rounded-lg p-1.5 text-[var(--color-neutral-400)] transition-colors hover:bg-red-50 hover:text-red-600"
                                    >
                                      <span className="text-xl">🗑</span>
                                    </button>
                                  </form>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>

                <section className={modalPanelClass}>
                  <div className="border-b border-[var(--color-neutral-100)] px-6 py-5">
                    <h4 className="text-lg font-bold text-[var(--color-text)]">Adicionar Novo Mapeamento</h4>
                    <p className="text-sm text-[var(--color-neutral-600)]">Defina como os dados do Typeform serão processados pelo sistema.</p>
                  </div>
                  <form action={saveTypeformForm} className="space-y-6 p-6">
                    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                      <label className="space-y-2">
                        <span className={modalLabelClass}>Display Name</span>
                        <input name="name" type="text" placeholder="Ex: Assessment Global 2024" className={modalInputClass} required />
                      </label>
                      <label className="space-y-2">
                        <span className={modalLabelClass}>Typeform Form ID <span className="text-[var(--color-primary)]">*</span></span>
                        <input name="form_id" type="text" placeholder="Ex: ABCdef123" className={`${modalInputClass} border-[var(--color-primary)]/30 font-mono`} required />
                      </label>
                      <label className="space-y-2">
                        <span className={modalLabelClass}>Entity Type</span>
                        <select name="entity_kind" defaultValue="ANY" className={modalInputClass}>
                          <option value="ANY">Qualquer</option>
                          <option value="VENDOR">Vendor</option>
                          <option value="PARTNER">Partner</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className={modalLabelClass}>Workflow Destination</span>
                        <select name="workflow" defaultValue="security_review" className={modalInputClass}>
                          <option value="security_review">Security Review</option>
                          <option value="privacy_review">Privacy Review</option>
                          <option value="decision">Decision</option>
                          <option value="internal_questionnaire">Internal Questionnaire</option>
                          <option value="external_questionnaire">External Questionnaire</option>
                        </select>
                      </label>
                      <label className="space-y-2 md:col-span-2">
                        <span className={modalLabelClass}>Hidden Field Name (Primary Identifier)</span>
                        <div className="flex flex-col gap-2 md:flex-row md:items-center">
                          <input name="hidden_assessment_field" type="text" defaultValue="assessment_id" className={modalInputClass} required />
                          <p className="max-w-xs text-xs text-[var(--color-neutral-600)]">
                            Utilizado para vincular a resposta à entidade correta no sistema.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="border-t border-[var(--color-neutral-100)] pt-8">
                      <div className="mb-6">
                        <h5 className="flex items-center gap-2 font-bold text-[var(--color-text)]">
                          <span className="text-[var(--color-primary)]">◌</span>
                          Question Range Mapping
                        </h5>
                        <p className="text-sm text-[var(--color-neutral-600)]">Especifique o intervalo de perguntas para cada análise técnica.</p>
                      </div>
                      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        {[
                          { key: "compliance", label: "Compliance", accent: "text-[var(--color-neutral-500)]", ring: "border-[var(--color-neutral-200)]" },
                          { key: "privacy", label: "Privacy & GDPR", accent: "text-indigo-500", ring: "border-indigo-100" },
                          { key: "security", label: "Cybersecurity", accent: "text-[var(--color-primary)]", ring: "border-[var(--color-primary)]/10" },
                        ].map((section) => (
                          <div key={section.key} className={`space-y-4 rounded-xl border bg-[var(--color-neutral-100)]/60 p-4 ${section.ring}`}>
                            <h6 className={`text-xs font-black uppercase tracking-widest ${section.accent}`}>{section.label}</h6>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase text-[var(--color-neutral-600)]">First Question</span>
                              <textarea
                                name={`${section.key}_start`}
                                rows={3}
                                placeholder="Cole aqui a primeira pergunta"
                                className={`${modalInputClass} min-h-[92px] px-3 py-2 text-xs`}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-[10px] font-bold uppercase text-[var(--color-neutral-600)]">Last Question</span>
                              <textarea
                                name={`${section.key}_end`}
                                rows={3}
                                placeholder="Cole aqui a última pergunta"
                                className={`${modalInputClass} min-h-[92px] px-3 py-2 text-xs`}
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-4 border-t border-[var(--color-neutral-100)] pt-6">
                      <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
                        <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--color-primary)]" />
                        Ativar este mapeamento
                      </label>
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg px-5 py-2.5 text-sm font-bold text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
                          Descartar
                        </button>
                        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-8 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95">
                          Salvar Configurações
                        </button>
                      </div>
                    </div>
                  </form>
                </section>
              </div>

              <aside className="space-y-6">
                <section className={`${modalPanelClass} p-6`}>
                  <h4 className="mb-4 font-bold text-[var(--color-text)]">Status da API</h4>
                  <div className={`flex items-center gap-4 rounded-lg border p-4 ${typeform.enabled ? "border-emerald-100 bg-emerald-50" : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]"}`}>
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full text-white ${typeform.enabled ? "bg-emerald-500" : "bg-[var(--color-neutral-400)]"}`}>
                      ⇄
                    </div>
                    <div>
                      <p className={`text-sm font-bold ${typeform.enabled ? "text-emerald-700" : "text-[var(--color-neutral-700)]"}`}>
                        {typeform.enabled ? "Conectado com Sucesso" : "Integração desativada"}
                      </p>
                      <p className={`text-xs ${typeform.enabled ? "text-emerald-700/80" : "text-[var(--color-neutral-600)]"}`}>
                        {typeformApiTokenConfigured || typeform.config.api_token ? "Token de API disponível para sincronização." : "Configure o token de API para sincronizar respostas."}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[var(--color-neutral-600)]">Usuário da API</dt>
                      <dd className="max-w-[180px] truncate font-semibold text-[var(--color-text)]">{typeform.config.api_user || "Não informado"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[var(--color-neutral-600)]">Webhook mode</dt>
                      <dd className="font-semibold text-[var(--color-text)]">{typeform.config.webhook_mode === "signed" ? "Assinado" : "Sem assinatura"}</dd>
                    </div>
                    <div className="flex items-start justify-between gap-3">
                      <dt className="text-[var(--color-neutral-600)]">Hidden field padrão</dt>
                      <dd className="font-mono text-xs font-semibold text-[var(--color-text)]">{typeform.config.default_hidden_assessment_field || "assessment_id"}</dd>
                    </div>
                  </dl>
                </section>

                <section className="group relative overflow-hidden rounded-xl bg-[var(--color-text)] p-6 text-white shadow-sm">
                  <div className="relative z-10">
                    <h4 className="mb-3 flex items-center gap-2 font-bold">
                      <span className="text-[var(--color-primary)]">✦</span>
                      Dica de Integração
                    </h4>
                    <p className="mb-4 text-sm leading-relaxed text-white/70">
                      Cadastre aqui o mapeamento manual das seções para que as respostas do parceiro sejam distribuídas corretamente entre Compliance, Privacy e Security.
                    </p>
                    <button type="button" onClick={() => copyToClipboard(`${appUrl}/api/typeform/webhook`, "Endpoint de webhook copiado.")} className="text-sm font-bold text-[var(--color-primary)] hover:underline">
                      Copiar Webhook
                    </button>
                  </div>
                  <div className="absolute -bottom-5 -right-3 text-[110px] text-white/10 transition-opacity group-hover:text-white/20">
                    ⌘
                  </div>
                </section>

                <section className={`${modalPanelClass} p-6`}>
                  <h4 className="mb-3 font-bold text-[var(--color-text)]">Sua URL de Webhook</h4>
                  <div className="relative">
                    <input
                      className={`${modalReadOnlyInputClass} pr-10 font-mono text-[10px]`}
                      readOnly
                      value={`${appUrl}/api/typeform/webhook`}
                    />
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${appUrl}/api/typeform/webhook`, "Endpoint de webhook copiado.")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-neutral-400)] transition-colors hover:text-[var(--color-primary)]"
                    >
                      ⧉
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--color-neutral-600)]">
                    Copie e cole este link nas configurações de Webhook do Typeform.
                  </p>
                </section>

                <section className={`${modalPanelClass} p-6`}>
                  <h4 className="mb-3 font-bold text-[var(--color-text)]">Orientação de Mapeamento</h4>
                  <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-neutral-700)]">
                    <li>Cadastre o `form_id` exato do Typeform para evitar respostas misturadas entre formulários.</li>
                    <li>Preencha manualmente a primeira e a última pergunta de cada seção para segmentar Compliance, Privacy e Security.</li>
                    <li>Use nomes amigáveis para identificar rapidamente a versão do formulário no detalhe do Partner ou Vendor.</li>
                  </ol>
                </section>
              </aside>
            </div>
          </div>
        </Backdrop>
      ) : null}

      {openModal === "jira" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Jira</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Separe a configuracao operacional das filas de Vendors e Partners dentro do mesmo projeto Jira.</p>
            </div>
            <button type="button" onClick={() => setOpenModal(null)} className="rounded-md px-2 py-1 text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
              ✕
            </button>
          </div>

          <section className="mb-4 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Webhook de Sincronizacao Jira</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--color-neutral-700)]">
              <li>Cadastre no Jira Automation ou Webhook um gatilho para issue criada e issue atualizada.</li>
              <li>Aponte o destino para o endpoint abaixo.</li>
              <li>Se usar segredo, envie o header `x-jira-webhook-secret` com o mesmo valor de `JIRA_WEBHOOK_SECRET`.</li>
              <li>Use as filas configuradas abaixo para orientar a operacao: Vendors e Partners possuem links diferentes.</li>
            </ol>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Endpoint do Webhook</span>
                <input type="text" readOnly value={`${appUrl}/api/jira/webhook`} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Segredo do Webhook</span>
                <input type="text" readOnly value={jiraWebhookSecretConfigured ? "Configurado no ambiente" : "Opcional, mas recomendado: JIRA_WEBHOOK_SECRET"} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
              </label>
            </div>
          </section>

          <form action={saveJiraSettings} className="space-y-4">
            <label className="space-y-1 block">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">URL Base do Jira</span>
              <input name="base_url" type="text" placeholder="https://your-company.atlassian.net" defaultValue={jira.config.base_url} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
            </label>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="space-y-1 block">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">API Email</span>
                <input
                  name="api_email"
                  type="email"
                  placeholder="seu.email@vtex.com"
                  defaultValue={jira.config.api_email}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">
                  E-mail da conta Atlassian que gerou o token da API.
                </span>
              </label>

              <label className="space-y-1 block">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">API Token</span>
                <input
                  name="api_token"
                  type="password"
                  placeholder={jiraTokenConfigured ? "Configurado no ambiente ou sobrescreva aqui" : "Cole aqui o JIRA_API_TOKEN"}
                  defaultValue={jira.config.api_token}
                  className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                />
                <span className="block text-xs text-[var(--color-neutral-600)]">
                  Se preenchido aqui, o sistema usa este token antes do `JIRA_API_TOKEN` do ambiente.
                </span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <section className="space-y-3 rounded-xl border border-[var(--color-neutral-200)] p-4">
                <p className="text-sm font-bold text-[var(--color-text)]">Fila de Vendors</p>
                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">URL da fila</span>
                  <input
                    name="vendors_queue_url"
                    type="text"
                    defaultValue={jira.config.vendors.queue_url}
                    placeholder="https://vtex-dev.atlassian.net/jira/servicedesk/projects/VSC/queues/custom/114"
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Project Key</span>
                    <input name="vendors_project_key" type="text" defaultValue={jira.config.vendors.project_key} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Issue Type</span>
                    <input name="vendors_issue_type" type="text" defaultValue={jira.config.vendors.issue_type} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
              </section>

              <section className="space-y-3 rounded-xl border border-[var(--color-neutral-200)] p-4">
                <p className="text-sm font-bold text-[var(--color-text)]">Fila de Partners</p>
                <label className="space-y-1 block">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">URL da fila</span>
                  <input
                    name="partners_queue_url"
                    type="text"
                    defaultValue={jira.config.partners.queue_url}
                    placeholder="https://vtex-dev.atlassian.net/jira/servicedesk/projects/VSC/queues/custom/159"
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Project Key</span>
                    <input name="partners_project_key" type="text" defaultValue={jira.config.partners.project_key} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
                  </label>
                  <label className="space-y-1 block">
                    <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Issue Type</span>
                    <input name="partners_issue_type" type="text" defaultValue={jira.config.partners.issue_type} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
                  </label>
                </div>
              </section>
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm font-medium text-[var(--color-text)]">
              <input name="enabled" type="checkbox" defaultChecked={jira.enabled} className="h-4 w-4 accent-[var(--color-primary)]" />
              Ativar integracao com Jira
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                Cancelar
              </button>
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Configuracoes do Jira</button>
            </div>
          </form>
        </Backdrop>
      ) : null}

      {openModal === "slack" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Slack</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Defina canal e preferencias de alerta.</p>
            </div>
            <button type="button" onClick={() => setOpenModal(null)} className="rounded-md px-2 py-1 text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
              ✕
            </button>
          </div>

          <form action={saveSlackSettings} className="space-y-4">
            <label className="space-y-1 block">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Canal Padrao de Alerta</span>
              <input name="channel" type="text" placeholder="#risk-alerts" defaultValue={slack.config.channel} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
            </label>

            <label className="space-y-1 block">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Bot Token</span>
              <input type="text" readOnly value={slackTokenConfigured ? "Configurado no ambiente" : "Ausente: SLACK_BOT_TOKEN"} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm" />
            </label>

            <div className="grid grid-cols-1 gap-2">
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
                <input name="notify_on_responded" type="checkbox" defaultChecked={slack.config.notify_on_responded} className="h-4 w-4 accent-[var(--color-primary)]" />
                Notificar quando o questionario for respondido
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
                <input name="notify_on_critical" type="checkbox" defaultChecked={slack.config.notify_on_critical} className="h-4 w-4 accent-[var(--color-primary)]" />
                Notificar quando risco critico for identificado
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
                <input name="enabled" type="checkbox" defaultChecked={slack.enabled} className="h-4 w-4 accent-[var(--color-primary)]" />
                Ativar integracao com Slack
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                Cancelar
              </button>
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Configuracoes do Slack</button>
            </div>
          </form>
        </Backdrop>
      ) : null}

      {openModal === "google_sheets" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Google Sheets</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                Defina a conta que tera acesso as planilhas do ambiente e os dados basicos da origem.
              </p>
            </div>
            <button type="button" onClick={() => setOpenModal(null)} className="rounded-md px-2 py-1 text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
              ✕
            </button>
          </div>

          <section className="mb-4 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Acesso recomendado</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--color-neutral-700)]">
              <li>Crie ou defina a conta de servico que sera usada para ler as planilhas.</li>
              <li>Compartilhe a planilha oficial com esse e-mail como leitora.</li>
              <li>Cadastre abaixo a conta autorizada e a URL base da planilha.</li>
              <li>Depois, a implementacao autenticada pode consumir os dados sem abrir o arquivo publicamente.</li>
            </ol>
          </section>

          <form action={saveGoogleSheetsSettings} className="space-y-4">
            <input type="hidden" name="service_account_emails_json" value={JSON.stringify(googleServiceAccounts)} />
            <input type="hidden" name="spreadsheets_json" value={JSON.stringify(googleSpreadsheets)} />

            <div className="space-y-3 rounded-xl border border-[var(--color-neutral-200)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--color-text)]">Contas autorizadas</p>
                <button
                  type="button"
                  onClick={() => setGoogleServiceAccounts((current) => [...current, ""])}
                  className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                >
                  Adicionar conta
                </button>
              </div>

              {googleServiceAccounts.map((email, index) => (
                <div key={`service-account-${index}`} className="flex gap-2">
                  <input
                    type="email"
                    placeholder="due-diligence-bot@project-id.iam.gserviceaccount.com"
                    value={email}
                    onChange={(event) =>
                      setGoogleServiceAccounts((current) =>
                        current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                      )
                    }
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setGoogleServiceAccounts((current) => (current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [""]))
                    }
                    className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                </div>
              ))}

              <p className="text-xs text-[var(--color-neutral-600)]">
                Cada e-mail listado aqui deve receber acesso de leitura nas planilhas oficiais da area.
              </p>
            </div>

            <div className="space-y-3 rounded-xl border border-[var(--color-neutral-200)] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold text-[var(--color-text)]">Planilhas configuradas</p>
                <button
                  type="button"
                  onClick={() => {
                    setGoogleSpreadsheets((current) => [
                      ...current,
                      {
                        name: `Planilha ${current.length + 1}`,
                        entity_kind: "VENDOR",
                        workflow: "internal_questionnaire",
                        spreadsheet_url: "",
                        worksheet_names: ["Página 1"],
                      },
                    ]);
                    setGoogleWorksheetDrafts((current) => [...current, ""]);
                  }}
                  className="rounded-lg border border-[var(--color-primary)] px-3 py-1.5 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                >
                  Adicionar planilha
                </button>
              </div>

              {googleSpreadsheets.map((sheet, index) => (
                <div key={`spreadsheet-${index}`} className="space-y-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Planilha {index + 1}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setGoogleSpreadsheets((current) =>
                          current.length > 1
                            ? current.filter((_, itemIndex) => itemIndex !== index)
                            : [
                                {
                                  name: "Mini Questionário Interno",
                                  entity_kind: "VENDOR",
                                  workflow: "internal_questionnaire",
                                  spreadsheet_url: "",
                                  worksheet_names: ["Página 1"],
                                },
                              ],
                        );
                        setGoogleWorksheetDrafts((current) =>
                          current.length > 1 ? current.filter((_, itemIndex) => itemIndex !== index) : [""],
                        );
                      }}
                      className="rounded border border-red-200 px-2 py-1 text-[10px] font-bold text-red-600 hover:bg-red-50"
                    >
                      Remover
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="Nome interno da planilha"
                    value={sheet.name}
                    onChange={(event) =>
                      setGoogleSpreadsheets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                  />
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <select
                      value={sheet.entity_kind}
                      onChange={(event) =>
                        setGoogleSpreadsheets((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  entity_kind: event.target.value === "PARTNER" ? "PARTNER" : "VENDOR",
                                  workflow:
                                    event.target.value === "PARTNER" ? "external_questionnaire" : item.workflow,
                                }
                              : item,
                          ),
                        )
                      }
                      className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                    >
                      <option value="VENDOR">Vendor</option>
                      <option value="PARTNER">Partner</option>
                    </select>
                    <select
                      value={sheet.entity_kind === "PARTNER" ? "external_questionnaire" : sheet.workflow}
                      onChange={(event) =>
                        setGoogleSpreadsheets((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? {
                                  ...item,
                                  workflow:
                                    item.entity_kind === "PARTNER"
                                      ? "external_questionnaire"
                                      : event.target.value === "external_questionnaire"
                                        ? "external_questionnaire"
                                        : "internal_questionnaire",
                                }
                              : item,
                          ),
                        )
                      }
                      disabled={sheet.entity_kind === "PARTNER"}
                      className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm disabled:bg-[var(--color-neutral-100)]"
                    >
                      {sheet.entity_kind === "VENDOR" ? (
                        <>
                          <option value="internal_questionnaire">Internal Questionnaire</option>
                          <option value="external_questionnaire">External Questionnaire</option>
                        </>
                      ) : (
                        <option value="external_questionnaire">External Questionnaire</option>
                      )}
                    </select>
                  </div>
                  <input
                    type="text"
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    value={sheet.spreadsheet_url}
                    onChange={(event) =>
                      setGoogleSpreadsheets((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, spreadsheet_url: event.target.value } : item,
                        ),
                      )
                    }
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                  />
                  <label className="space-y-1">
                    <span className="block text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Abas que devem ser lidas</span>
                    <div className="space-y-2 rounded-lg border border-[var(--color-neutral-200)] bg-white p-3">
                      <div className="flex flex-wrap gap-2">
                        {sheet.worksheet_names.map((worksheetName, worksheetIndex) => (
                          <span
                            key={`worksheet-${index}-${worksheetIndex}`}
                            className="inline-flex items-center gap-2 rounded-full border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-medium text-[var(--color-text)]"
                          >
                            {worksheetName}
                            <button
                              type="button"
                              onClick={() =>
                                setGoogleSpreadsheets((current) =>
                                  current.map((item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          worksheet_names: item.worksheet_names.filter((_, currentWorksheetIndex) => currentWorksheetIndex !== worksheetIndex),
                                        }
                                      : item,
                                  ),
                                )
                              }
                              className="text-[var(--color-neutral-600)] hover:text-red-600"
                              aria-label={`Remover aba ${worksheetName}`}
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Ex.: VTEX Partner Assessment PTBR"
                          value={googleWorksheetDrafts[index] ?? ""}
                          onChange={(event) =>
                            setGoogleWorksheetDrafts((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                            )
                          }
                          className="flex-1 rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const nextValue = (googleWorksheetDrafts[index] ?? "").trim();
                            if (!nextValue) return;

                            setGoogleSpreadsheets((current) =>
                              current.map((item, itemIndex) =>
                                itemIndex === index && !item.worksheet_names.includes(nextValue)
                                  ? { ...item, worksheet_names: [...item.worksheet_names, nextValue] }
                                  : item,
                              ),
                            );
                            setGoogleWorksheetDrafts((current) =>
                              current.map((item, itemIndex) => (itemIndex === index ? "" : item)),
                            );
                          }}
                          className="rounded-lg border border-[var(--color-primary)] px-3 py-2 text-xs font-bold text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5"
                        >
                          Adicionar aba
                        </button>
                      </div>
                    </div>
                    <span className="block text-xs text-[var(--color-neutral-600)]">Adicione cada aba individualmente. O sistema tenta cada aba ate encontrar a resposta correta.</span>
                  </label>
                </div>
              ))}
            </div>

            <label className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm font-medium text-[var(--color-text)]">
              <input name="enabled" type="checkbox" defaultChecked={googleSheets.enabled} className="h-4 w-4 accent-[var(--color-primary)]" />
              Ativar integracao com Google Sheets
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                Cancelar
              </button>
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">
                Salvar Configuracoes do Google Sheets
              </button>
            </div>
          </form>
        </Backdrop>
      ) : null}
    </section>
  );
}
