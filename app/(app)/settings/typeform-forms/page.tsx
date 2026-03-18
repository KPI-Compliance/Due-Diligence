import Link from "next/link";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { TypeformQuestionMappingModal } from "@/components/settings/TypeformQuestionMappingModal";
import { SectionCard } from "@/components/ui/SectionCard";
import { getSessionErrorCode, refreshServerActionSession } from "@/lib/auth";
import {
  deleteTypeformForm,
  getIntegrationSettings,
  getTypeformFormById,
  getTypeformFormQuestionMappings,
  getTypeformForms,
  replaceTypeformFormQuestionMappings,
  type IntegrationProvider,
  type TypeformConfig,
  upsertTypeformForm,
} from "@/lib/settings-data";
import {
  getPlatformSettings,
  normalizeRiskScoringSettings,
  type RiskScoringSettings,
} from "@/lib/platform-settings";
import { recalculatePartnerAssessmentDecisionsForForm } from "@/lib/partner-risk-scoring";
import { fetchTypeformFormFields } from "@/lib/typeform-admin";
import { flattenTypeformFieldDefinitions } from "@/lib/typeform";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://due-diligence-eight.vercel.app");
const typeformApiTokenConfigured = Boolean(process.env.TYPEFORM_API_TOKEN ?? process.env.TYPEFORM_ACCESS_TOKEN);

export const dynamic = "force-dynamic";

async function requireServerActionSession(context: string) {
  const sessionResult = await refreshServerActionSession(context);
  if (!sessionResult.session) {
    redirect(`/?error=${encodeURIComponent(getSessionErrorCode(sessionResult.reason))}`);
  }
}

type FormMappingStatus = {
  mappedCount: number;
  totalQuestions: number;
  tone: string;
  label: string;
  detail: string;
};

const weightOptions: Array<{ value: number; label: string }> = [
  { value: 0, label: "0 - Sem impacto" },
  { value: 1, label: "1 - Baixo" },
  { value: 2, label: "2 - Médio" },
  { value: 3, label: "3 - Alto" },
  { value: 5, label: "5 - Crítico" },
];

function getSetting<T>(
  list: Array<{ provider: IntegrationProvider; enabled: boolean; config: unknown }>,
  provider: IntegrationProvider,
) {
  return list.find((item) => item.provider === provider) as { provider: IntegrationProvider; enabled: boolean; config: T };
}

function RiskScoringLegend({ settings }: { settings: RiskScoringSettings }) {
  const profile = settings.partner;

  return (
    <div className="rounded-xl border border-[var(--color-primary)]/10 bg-[var(--color-primary)]/5 p-4">
      <p className="text-sm font-bold text-[var(--color-text)]">Como o score é calculado</p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-3 text-sm text-[var(--color-neutral-700)]">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Score da avaliação</p>
          <p className="mt-2">Totalmente = {profile.fully_score.toFixed(1)}</p>
          <p>Parcialmente = {profile.partially_score.toFixed(1)}</p>
          <p>Não Atende = {profile.does_not_meet_score.toFixed(1)}</p>
          <p>N/A = fora do cálculo</p>
        </div>
        <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-3 text-sm text-[var(--color-neutral-700)]">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Peso da pergunta</p>
          <p className="mt-2">
            Os pesos são <span className="font-semibold">relativos</span>. Uma pergunta com peso maior influencia mais o resultado da seção.
          </p>
          <p className="mt-1">
            O sistema considera a proporção entre as perguntas avaliadas e calcula a seção por <span className="font-semibold">média ponderada</span>.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-3 text-sm text-[var(--color-neutral-700)]">
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Fórmula e thresholds</p>
          <p className="mt-2">Seção = soma(peso × nota) / soma dos pesos avaliados</p>
          <p className="mt-2">Low: 0.0 até {profile.low_max.toFixed(1)}</p>
          <p>Medium: acima de {profile.low_max.toFixed(1)} até {profile.medium_max.toFixed(1)}</p>
          <p>High: acima de {profile.medium_max.toFixed(1)}</p>
        </div>
      </div>
    </div>
  );
}

async function saveTypeformForm(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.typeformForms.saveTypeformForm");

  const rawEntityKind = String(formData.get("entity_kind") ?? "ANY").toUpperCase();
  const entity_kind = rawEntityKind === "VENDOR" || rawEntityKind === "PARTNER" ? rawEntityKind : "ANY";

  await upsertTypeformForm({
    id: String(formData.get("id") ?? "").trim() || null,
    name: String(formData.get("name") ?? "").trim(),
    form_id: String(formData.get("form_id") ?? "").trim(),
    entity_kind,
    workflow: String(formData.get("workflow") ?? "external_questionnaire").trim() || "external_questionnaire",
    hidden_assessment_field:
      String(formData.get("hidden_assessment_field") ?? "assessment_id").trim() || "assessment_id",
    section_rules: {
      compliance: { start: "", end: "" },
      privacy: { start: "", end: "" },
      security: { start: "", end: "" },
    },
    enabled: formData.get("enabled") === "on",
  });

  redirect("/settings/typeform-forms?saved=form");
}

async function removeTypeformForm(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.typeformForms.removeTypeformForm");

  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    await deleteTypeformForm(id);
  }

  redirect("/settings/typeform-forms?saved=deleted");
}

async function saveQuestionMappings(formData: FormData) {
  "use server";
  await requireServerActionSession("settings.typeformForms.saveQuestionMappings");

  const formConfigId = String(formData.get("form_config_id") ?? "").trim();
  if (!formConfigId) {
    redirect("/settings/typeform-forms");
  }

  const mappingIds = formData.getAll("mapping_id").map((value) => String(value));
  const questionKeys = formData.getAll("question_key").map((value) => String(value));
  const questionRefs = formData.getAll("question_ref").map((value) => String(value));
  const questionTexts = formData.getAll("question_text").map((value) => String(value));
  const questionOrders = formData.getAll("question_order").map((value) => Number.parseInt(String(value), 10));
  const sections = formData.getAll("section").map((value) => String(value).toUpperCase());
  const weights = formData.getAll("weight").map((value) => Number.parseFloat(String(value)));

  await replaceTypeformFormQuestionMappings(
    formConfigId,
    questionKeys.map((question_key, index) => ({
      id: mappingIds[index] || null,
      question_key,
      question_ref: questionRefs[index] || null,
      question_text: questionTexts[index] || "",
      question_order: Number.isNaN(questionOrders[index]) ? index + 1 : questionOrders[index],
      section:
        sections[index] === "COMPLIANCE" || sections[index] === "PRIVACY" || sections[index] === "SECURITY"
          ? sections[index]
          : "COMMON",
      weight: Number.isFinite(weights[index]) && weights[index] >= 0 ? weights[index] : 1,
    })),
  );

  const selectedForm = await getTypeformFormById(formConfigId);
  if (selectedForm?.form_id) {
    await recalculatePartnerAssessmentDecisionsForForm(selectedForm.form_id);
  }

  redirect("/settings/typeform-forms?saved=mapping");
}

export default async function TypeformFormsSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedFormId = typeof params.form === "string" ? params.form : "";
  const savedFlag = typeof params.saved === "string" ? params.saved : "";
  const settings = await getIntegrationSettings();
  const riskScoringSettings = await getPlatformSettings("RISK_SCORING", normalizeRiskScoringSettings);
  const typeform = getSetting<TypeformConfig>(settings, "TYPEFORM");
  const typeformForms = await getTypeformForms();
  const formMappingStatusEntries = await Promise.all(
    typeformForms.map(async (form) => {
      const [mappings, fields] = await Promise.all([
        getTypeformFormQuestionMappings(form.id),
        fetchTypeformFormFields(form.form_id).catch(() => []),
      ]);
      const questions = flattenTypeformFieldDefinitions(fields).filter((field) => field.title || field.ref);
      const totalQuestions = questions.length;
      const mappedCount = mappings.length;
      const allWeightsValid = mappings.every((item) => item.weight > 0);

      const status: FormMappingStatus =
        totalQuestions === 0
          ? {
              mappedCount,
              totalQuestions,
              tone: "bg-slate-100 text-slate-600",
              label: "Sem leitura API",
              detail: "Não foi possível validar a definição do formulário agora.",
            }
          : mappedCount === 0
            ? {
                mappedCount,
                totalQuestions,
                tone: "bg-amber-100 text-amber-700",
                label: "Pendente",
                detail: "Nenhuma pergunta mapeada ainda.",
              }
            : mappedCount < totalQuestions || !allWeightsValid
              ? {
                  mappedCount,
                  totalQuestions,
                  tone: "bg-orange-100 text-orange-700",
                  label: "Parcial",
                  detail: `${mappedCount}/${totalQuestions} perguntas configuradas.`,
                }
              : {
                  mappedCount,
                  totalQuestions,
                  tone: "bg-emerald-100 text-emerald-700",
                  label: "Completo",
                  detail: `${mappedCount}/${totalQuestions} perguntas configuradas.`,
                };

      return [form.id, status] as const;
    }),
  );
  const formMappingStatuses = new Map(formMappingStatusEntries);
  const selectedForm = selectedFormId ? await getTypeformFormById(selectedFormId) : null;
  const existingMappings = selectedForm ? await getTypeformFormQuestionMappings(selectedForm.id) : [];
  const rawFields = selectedForm ? await fetchTypeformFormFields(selectedForm.form_id) : [];
  const flattenedQuestions = rawFields
    .length > 0
    ? flattenTypeformFieldDefinitions(rawFields)
        .filter((field) => field.title || field.ref)
        .map((field, index) => {
          const questionKey = field.ref ?? field.id ?? `order:${index + 1}`;
          const saved = existingMappings.find(
            (item) =>
              item.question_key === questionKey ||
              (field.ref && item.question_ref === field.ref) ||
              item.question_order === index + 1,
          );

          return {
            id: saved?.id ?? "",
            question_key: questionKey,
            question_ref: field.ref ?? field.id ?? "",
            question_text: field.title ?? field.ref ?? `Question ${index + 1}`,
            question_order: index + 1,
            section: saved?.section ?? "COMMON",
            weight: saved?.weight ?? 1,
            type: field.type ?? "question",
          };
        })
    : [];

  return (
    <PageContainer
      title="Typeform Forms"
      description="Gerencie os formulários cadastrados, organize a ordem das perguntas e defina manualmente a qual seção cada item pertence."
      actions={
        <div className="flex items-center gap-3">
          <Link
            href="/settings?tab=integracoes"
            className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]"
          >
            Voltar para Integrações
          </Link>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,2fr)_360px]">
        <div className="space-y-8">
          <SectionCard title="Formulários Ativos" description="Clique no lápis para abrir a tela de mapeamento completo das perguntas.">
            {typeformForms.length === 0 ? (
              <p className="text-sm text-[var(--color-neutral-600)]">Nenhum formulário cadastrado ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-neutral-200)] text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                      <th className="px-3 py-3">Nome</th>
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">Entidade</th>
                      <th className="px-3 py-3">Workflow</th>
                      <th className="px-3 py-3">Mapeamento</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Remover</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeformForms.map((form) => {
                      const mappingStatus = formMappingStatuses.get(form.id);

                      return (
                      <tr key={form.id} className="border-b border-[var(--color-neutral-100)] text-sm">
                        <td className="px-3 py-4 font-semibold text-[var(--color-text)]">{form.name}</td>
                        <td className="px-3 py-4 font-mono text-xs text-[var(--color-neutral-600)]">{form.form_id}</td>
                        <td className="px-3 py-4 text-[var(--color-neutral-700)]">{form.entity_kind === "ANY" ? "Qualquer" : form.entity_kind}</td>
                        <td className="px-3 py-4 capitalize text-[var(--color-neutral-700)]">{form.workflow.replaceAll("_", " ")}</td>
                        <td className="px-3 py-4">
                          {mappingStatus ? (
                            <div className="space-y-1">
                              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${mappingStatus.tone}`}>
                                {mappingStatus.label}
                              </span>
                              <p className="text-xs text-[var(--color-neutral-600)]">{mappingStatus.detail}</p>
                              <div className="pt-2">
                                <Link
                                  href={`/settings/typeform-forms?form=${form.id}`}
                                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)]/15 bg-[var(--color-primary)]/5 px-3 py-2 text-xs font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10"
                                  aria-label={`Editar mapeamento de ${form.name}`}
                                >
                                  <span aria-hidden="true">✎</span>
                                  Customizar
                                </Link>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <span className="text-xs text-[var(--color-neutral-600)]">Aguardando leitura</span>
                              <Link
                                href={`/settings/typeform-forms?form=${form.id}`}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-primary)]/15 bg-[var(--color-primary)]/5 px-3 py-2 text-xs font-bold text-[var(--color-primary)] transition hover:bg-[var(--color-primary)]/10"
                                aria-label={`Editar mapeamento de ${form.name}`}
                              >
                                <span aria-hidden="true">✎</span>
                                Customizar
                              </Link>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${form.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                            {form.enabled ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex justify-end gap-2">
                            <form action={removeTypeformForm}>
                              <input type="hidden" name="id" value={form.id} />
                              <button type="submit" className="rounded-lg p-2 text-[var(--color-neutral-400)] transition hover:bg-red-50 hover:text-red-600" aria-label={`Remover ${form.name}`}>
                                🗑
                              </button>
                            </form>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          <SectionCard title="Adicionar Novo Formulário" description="Cadastre o formulário base. O mapeamento detalhado das perguntas acontece ao clicar no lápis do formulário criado.">
            <form action={saveTypeformForm} className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--color-neutral-700)]">Display Name</span>
                <input name="name" type="text" placeholder="Ex: VTEX Partner Assessment PTBR" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--color-neutral-700)]">Typeform Form ID</span>
                <input name="form_id" type="text" placeholder="Ex: pMnmAXxm" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm font-mono" required />
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--color-neutral-700)]">Entity Type</span>
                <select name="entity_kind" defaultValue="PARTNER" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm">
                  <option value="ANY">Qualquer</option>
                  <option value="VENDOR">Vendor</option>
                  <option value="PARTNER">Partner</option>
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-sm font-bold text-[var(--color-neutral-700)]">Workflow</span>
                <select name="workflow" defaultValue="external_questionnaire" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm">
                  <option value="external_questionnaire">External Questionnaire</option>
                  <option value="internal_questionnaire">Internal Questionnaire</option>
                  <option value="security_review">Security Review</option>
                  <option value="privacy_review">Privacy Review</option>
                  <option value="decision">Decision</option>
                </select>
              </label>
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-bold text-[var(--color-neutral-700)]">Hidden Field Name</span>
                <input name="hidden_assessment_field" type="text" defaultValue="assessment_id" className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2.5 text-sm" />
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-text)] md:col-span-2">
                <input name="enabled" type="checkbox" defaultChecked className="h-4 w-4 accent-[var(--color-primary)]" />
                Ativar este formulário
              </label>
              <div className="md:col-span-2 flex justify-end">
                <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white">
                  Salvar formulário
                </button>
              </div>
            </form>
          </SectionCard>

        </div>

        <aside className="space-y-6">
          <SectionCard title="Status da API" description="Resumo operacional da integração Typeform.">
            <div className={`rounded-xl border p-4 ${typeform.enabled ? "border-emerald-100 bg-emerald-50" : "border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]"}`}>
              <p className={`text-sm font-bold ${typeform.enabled ? "text-emerald-700" : "text-[var(--color-neutral-700)]"}`}>
                {typeform.enabled ? "Conectado com sucesso" : "Integração desativada"}
              </p>
              <p className={`mt-1 text-xs ${typeform.enabled ? "text-emerald-700/80" : "text-[var(--color-neutral-600)]"}`}>
                {typeformApiTokenConfigured || typeform.config.api_token ? "Token de API disponível para leitura da definição dos forms." : "Configure o token no card principal do Typeform."}
              </p>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[var(--color-neutral-600)]">Usuário</dt>
                <dd className="max-w-[180px] truncate font-semibold text-[var(--color-text)]">{typeform.config.api_user || "Não informado"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="text-[var(--color-neutral-600)]">Webhook</dt>
                <dd className="font-semibold text-[var(--color-text)]">{typeform.config.webhook_mode === "signed" ? "Assinado" : "Sem assinatura"}</dd>
              </div>
            </dl>
          </SectionCard>

          <SectionCard title="Webhook URL" description="Use este endpoint nas automações e testes do Typeform.">
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-3 font-mono text-[10px] text-[var(--color-text)]">
              {appUrl}/api/typeform/webhook
            </div>
          </SectionCard>

          <SectionCard title="Como usar" description="Fluxo recomendado para cadastrar e mapear corretamente.">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--color-neutral-700)]">
              <li>Cadastre o formulário base com o `form_id` exato do Typeform.</li>
              <li>Clique no lápis do formulário para carregar todas as perguntas em ordem.</li>
              <li>Classifique cada pergunta em `Common`, `Compliance`, `Privacy` ou `Security`.</li>
              <li>Defina o peso de cada pergunta para influenciar o score de risco da seção.</li>
              <li>Salve o mapeamento antes de rodar o backfill ou sincronizar novos tickets.</li>
            </ol>
          </SectionCard>

          <SectionCard title="Como os Pesos Funcionam" description="Entenda como o peso de cada pergunta influencia o cálculo do risco.">
            <div className="space-y-4 text-sm leading-relaxed text-[var(--color-neutral-700)]">
              <p>
                Os pesos das perguntas são <span className="font-bold text-[var(--color-text)]">relativos</span>. Isso significa que uma
                pergunta com peso maior influencia mais o resultado da sua seção do que uma pergunta com peso menor.
              </p>
              <p>
                O sistema não exige que os pesos somem um valor máximo fixo. O cálculo da seção é feito por
                <span className="font-bold text-[var(--color-text)]"> média ponderada</span>, considerando apenas as perguntas avaliadas.
              </p>
              <div className="rounded-lg bg-[var(--color-neutral-100)] px-4 py-3 font-mono text-xs text-[var(--color-text)]">
                Score da seção = soma(peso × nota da avaliação) / soma dos pesos avaliados
              </div>
              <p>
                Depois, cada seção gera seu próprio score e nível de risco. O score combinado continua como apoio quantitativo,
                mas a classificação final segue a regra da pior seção obrigatória concluída.
              </p>
              <p>
                Em resumo: <span className="font-bold text-[var(--color-text)]">peso maior = mais impacto</span>, mas o que importa é a
                proporção entre as perguntas da mesma seção.
              </p>
            </div>
          </SectionCard>
        </aside>
      </div>

      {selectedForm ? (
        flattenedQuestions.length === 0 ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/45 p-4">
            <Link href="/settings/typeform-forms" aria-label="Fechar modal" className="absolute inset-0" />
            <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-2xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-text)]">
                    Mapeamento de Perguntas • {selectedForm.name}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                    Não foi possível carregar a definição do formulário no Typeform. Verifique o token da API e o `form_id`.
                  </p>
                </div>
                <Link
                  href="/settings/typeform-forms"
                  className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
                >
                  Fechar
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <TypeformQuestionMappingModal
            formConfigId={selectedForm.id}
            formName={selectedForm.name}
            questions={flattenedQuestions}
            weightOptions={weightOptions}
            saveAction={saveQuestionMappings}
            legend={<RiskScoringLegend settings={riskScoringSettings} />}
          />
        )
      ) : null}

      {savedFlag === "mapping" ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[var(--color-text)]/45 p-4">
          <Link href="/settings/typeform-forms" aria-label="Fechar pop-up" className="absolute inset-0" />
          <div className="relative z-10 w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-600">
              ✓
            </div>
            <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--color-text)]">Mapeamento salvo com sucesso</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--color-neutral-700)]">
              As perguntas do formulário foram atualizadas e o sistema já pode usar esse mapeamento nas respostas futuras e históricas.
            </p>
            <div className="mt-6 flex justify-end">
              <Link
                href="/settings/typeform-forms"
                className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95"
              >
                Fechar
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
