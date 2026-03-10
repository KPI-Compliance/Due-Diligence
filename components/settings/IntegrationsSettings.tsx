"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { JiraConfig, SlackConfig, TypeformConfig, TypeformFormItem } from "@/lib/settings-data";

type ModalKey = "typeform" | "jira" | "slack" | null;

type IntegrationsSettingsProps = {
  appUrl: string;
  typeform: { enabled: boolean; config: TypeformConfig };
  typeformForms: TypeformFormItem[];
  jira: { enabled: boolean; config: JiraConfig };
  slack: { enabled: boolean; config: SlackConfig };
  typeformSecretConfigured: boolean;
  jiraTokenConfigured: boolean;
  jiraWebhookSecretConfigured: boolean;
  slackTokenConfigured: boolean;
  saveTypeformSettings: (formData: FormData) => Promise<void>;
  saveTypeformForm: (formData: FormData) => Promise<void>;
  deleteTypeformForm: (formData: FormData) => Promise<void>;
  saveJiraSettings: (formData: FormData) => Promise<void>;
  saveSlackSettings: (formData: FormData) => Promise<void>;
};

function Backdrop({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/45 p-4">
      <button aria-label="Fechar modal" className="absolute inset-0 cursor-default" onClick={onClose} type="button" />
      <div className="relative z-10 max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-[var(--color-neutral-200)] bg-white p-6 shadow-2xl">
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
  typeformSecretConfigured,
  jiraTokenConfigured,
  jiraWebhookSecretConfigured,
  slackTokenConfigured,
  saveTypeformSettings,
  saveTypeformForm,
  deleteTypeformForm,
  saveJiraSettings,
  saveSlackSettings,
}: IntegrationsSettingsProps) {
  const [openModal, setOpenModal] = useState<ModalKey>(null);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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
        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Configure Typeform, Jira e Slack para automatizar fluxos operacionais.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
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
      </div>

      {openModal === "typeform" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Typeform</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Configure uma vez e depois mapeie um ou varios formularios por `form_id`.</p>
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
              <li>4. Garanta que o hidden field contenha o UUID do assessment (padrao: `assessment_id`).</li>
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

          <div className="mt-4 space-y-3 rounded-xl border border-[var(--color-neutral-200)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Formularios Configurados</p>
            {typeformForms.length === 0 ? (
              <p className="text-sm text-[var(--color-neutral-600)]">Nenhum formulario configurado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-neutral-200)] text-xs uppercase tracking-wider text-[var(--color-neutral-600)]">
                      <th className="py-2">Nome</th>
                      <th className="py-2">Form ID</th>
                      <th className="py-2">Entidade</th>
                      <th className="py-2">Workflow</th>
                      <th className="py-2">Campo Hidden</th>
                      <th className="py-2">Status</th>
                      <th className="py-2 text-right">Acao</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeformForms.map((form) => (
                      <tr key={form.id} className="border-b border-[var(--color-neutral-100)] text-sm">
                        <td className="py-2 font-medium text-[var(--color-text)]">{form.name}</td>
                        <td className="py-2 text-[var(--color-neutral-700)]">{form.form_id}</td>
                        <td className="py-2 text-[var(--color-neutral-700)]">{form.entity_kind}</td>
                        <td className="py-2 text-[var(--color-neutral-700)]">{form.workflow}</td>
                        <td className="py-2 text-[var(--color-neutral-700)]">{form.hidden_assessment_field}</td>
                        <td className="py-2">
                          <span className={form.enabled ? "text-emerald-600 font-semibold" : "text-amber-600 font-semibold"}>
                            {form.enabled ? "Ativado" : "Desativado"}
                          </span>
                        </td>
                        <td className="py-2 text-right">
                          <form action={deleteTypeformForm}>
                            <input type="hidden" name="id" value={form.id} />
                            <button type="submit" className="rounded border border-red-200 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-50">
                              Remover
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <form action={saveTypeformForm} className="mt-4 space-y-4 rounded-xl border border-[var(--color-neutral-200)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Adicionar ou Atualizar Mapeamento de Formulario</p>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome de Exibicao (interno)</span>
                <input name="name" type="text" placeholder="Revisao de Seguranca - Vendors" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" required />
                <span className="block text-xs text-[var(--color-neutral-600)]">Nome amigavel exibido nesta tabela.</span>
              </label>
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Typeform Form ID (obrigatorio)</span>
                <input name="form_id" type="text" placeholder="abc123xyz" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm font-mono" required />
                <span className="block text-xs text-[var(--color-neutral-600)]">Deve ser exatamente o mesmo form id da URL/API do Typeform.</span>
              </label>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Tipo de Entidade</span>
                <select name="entity_kind" defaultValue="ANY" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm">
                  <option value="ANY">Qualquer</option>
                  <option value="VENDOR">Vendor</option>
                  <option value="PARTNER">Partner</option>
                </select>
                <span className="block text-xs text-[var(--color-neutral-600)]">Use Qualquer, exceto se o formulario for exclusivo para um tipo.</span>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Workflow</span>
                <select name="workflow" defaultValue="security_review" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm">
                  <option value="security_review">security_review</option>
                  <option value="privacy_review">privacy_review</option>
                  <option value="decision">decision</option>
                  <option value="internal_questionnaire">internal_questionnaire</option>
                  <option value="external_questionnaire">external_questionnaire</option>
                </select>
                <span className="block text-xs text-[var(--color-neutral-600)]">Tag usada para organizar automacoes atuais e futuras.</span>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome do Hidden Field</span>
                <input name="hidden_assessment_field" type="text" defaultValue="assessment_id" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" required />
                <span className="block text-xs text-[var(--color-neutral-600)]">Exemplo: {`{"assessment_id":"uuid"}`}</span>
              </label>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-[var(--color-text)]">
              <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--color-primary)]" />
              Ativar este mapeamento
            </label>

            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={() => setOpenModal(null)} className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                Fechar
              </button>
              <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Mapeamento</button>
            </div>
          </form>
        </Backdrop>
      ) : null}

      {openModal === "jira" ? (
        <Backdrop onClose={() => setOpenModal(null)}>
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-[var(--color-text)]">Configurar Jira</h3>
              <p className="mt-1 text-sm text-[var(--color-neutral-600)]">Defina o projeto de destino e o webhook que replica issues para Vendors.</p>
            </div>
            <button type="button" onClick={() => setOpenModal(null)} className="rounded-md px-2 py-1 text-[var(--color-neutral-600)] hover:bg-[var(--color-neutral-100)]">
              ✕
            </button>
          </div>

          <section className="mb-4 rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4">
            <p className="text-sm font-bold text-[var(--color-text)]">Webhook de Sincronizacao Jira → Vendors</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-[var(--color-neutral-700)]">
              <li>Cadastre no Jira Automation ou Webhook um gatilho para issue criada e issue atualizada.</li>
              <li>Aponte o destino para o endpoint abaixo.</li>
              <li>Se usar segredo, envie o header `x-jira-webhook-secret` com o mesmo valor de `JIRA_WEBHOOK_SECRET`.</li>
              <li>Para preencher dominio, segmento e contato automaticamente, inclua esses campos no corpo da issue/descricao.</li>
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

            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 block">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Project Key</span>
                <input name="project_key" type="text" defaultValue={jira.config.project_key} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
              </label>
              <label className="space-y-1 block">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Issue Type</span>
                <input name="issue_type" type="text" defaultValue={jira.config.issue_type} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm" />
              </label>
            </div>

            <label className="space-y-1 block">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">API Token</span>
              <input type="text" readOnly value={jiraTokenConfigured ? "Configurado no ambiente" : "Ausente: JIRA_API_TOKEN"} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm" />
            </label>

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
    </section>
  );
}
