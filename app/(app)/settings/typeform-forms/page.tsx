import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { SectionCard } from "@/components/ui/SectionCard";
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
import { fetchTypeformFormFields } from "@/lib/typeform-admin";
import { flattenTypeformFieldDefinitions } from "@/lib/typeform";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://due-diligence-eight.vercel.app");
const typeformApiTokenConfigured = Boolean(process.env.TYPEFORM_API_TOKEN ?? process.env.TYPEFORM_ACCESS_TOKEN);

export const dynamic = "force-dynamic";

function getSetting<T>(
  list: Array<{ provider: IntegrationProvider; enabled: boolean; config: unknown }>,
  provider: IntegrationProvider,
) {
  return list.find((item) => item.provider === provider) as { provider: IntegrationProvider; enabled: boolean; config: T };
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

  revalidatePath("/settings");
  revalidatePath("/settings/typeform-forms");
  redirect("/settings/typeform-forms?saved=form");
}

async function removeTypeformForm(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (id) {
    await deleteTypeformForm(id);
  }

  revalidatePath("/settings");
  revalidatePath("/settings/typeform-forms");
  redirect("/settings/typeform-forms?saved=deleted");
}

async function saveQuestionMappings(formData: FormData) {
  "use server";

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
    })),
  );

  revalidatePath("/settings/typeform-forms");
  redirect(`/settings/typeform-forms?form=${formConfigId}&saved=mapping`);
}

export default async function TypeformFormsSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const selectedFormId = typeof params.form === "string" ? params.form : "";
  const settings = await getIntegrationSettings();
  const typeform = getSetting<TypeformConfig>(settings, "TYPEFORM");
  const typeformForms = await getTypeformForms();
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
                <table className="w-full min-w-[860px] text-left">
                  <thead>
                    <tr className="border-b border-[var(--color-neutral-200)] text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                      <th className="px-3 py-3">Nome</th>
                      <th className="px-3 py-3">ID</th>
                      <th className="px-3 py-3">Entidade</th>
                      <th className="px-3 py-3">Workflow</th>
                      <th className="px-3 py-3">Status</th>
                      <th className="px-3 py-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {typeformForms.map((form) => (
                      <tr key={form.id} className="border-b border-[var(--color-neutral-100)] text-sm">
                        <td className="px-3 py-4 font-semibold text-[var(--color-text)]">{form.name}</td>
                        <td className="px-3 py-4 font-mono text-xs text-[var(--color-neutral-600)]">{form.form_id}</td>
                        <td className="px-3 py-4 text-[var(--color-neutral-700)]">{form.entity_kind === "ANY" ? "Qualquer" : form.entity_kind}</td>
                        <td className="px-3 py-4 capitalize text-[var(--color-neutral-700)]">{form.workflow.replaceAll("_", " ")}</td>
                        <td className="px-3 py-4">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${form.enabled ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                            {form.enabled ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/settings/typeform-forms?form=${form.id}`}
                              className="rounded-lg p-2 text-[var(--color-neutral-400)] transition hover:bg-[var(--color-neutral-100)] hover:text-[var(--color-primary)]"
                              aria-label={`Editar mapeamento de ${form.name}`}
                            >
                              ✎
                            </Link>
                            <form action={removeTypeformForm}>
                              <input type="hidden" name="id" value={form.id} />
                              <button type="submit" className="rounded-lg p-2 text-[var(--color-neutral-400)] transition hover:bg-red-50 hover:text-red-600" aria-label={`Remover ${form.name}`}>
                                🗑
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

          {selectedForm ? (
            <SectionCard
              title={`Mapeamento de Perguntas • ${selectedForm.name}`}
              description="Todas as perguntas do formulário são listadas na ordem original do Typeform. Defina manualmente a seção de cada item."
            >
              {flattenedQuestions.length === 0 ? (
                <div className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-6 text-sm text-[var(--color-neutral-600)]">
                  Não foi possível carregar a definição do formulário no Typeform. Verifique o token da API e o `form_id`.
                </div>
              ) : (
                <form action={saveQuestionMappings} className="space-y-5">
                  <input type="hidden" name="form_config_id" value={selectedForm.id} />
                  <div className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/60 px-4 py-3 text-sm text-[var(--color-neutral-700)]">
                    {flattenedQuestions.length} perguntas encontradas. As respostas futuras e históricas passarão a usar este mapeamento por pergunta.
                  </div>
                  <div className="space-y-3">
                    {flattenedQuestions.map((question) => (
                      <article key={question.question_key} className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
                        <input type="hidden" name="mapping_id" value={question.id} />
                        <input type="hidden" name="question_key" value={question.question_key} />
                        <input type="hidden" name="question_ref" value={question.question_ref} />
                        <input type="hidden" name="question_text" value={question.question_text} />
                        <input type="hidden" name="question_order" value={question.question_order} />
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-[var(--color-neutral-100)] px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                                Questão {String(question.question_order).padStart(2, "0")}
                              </span>
                              <span className="rounded-md bg-[var(--color-primary)]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                                {question.type}
                              </span>
                            </div>
                            <p className="text-sm font-semibold leading-relaxed text-[var(--color-text)]">{question.question_text}</p>
                            <p className="text-xs text-[var(--color-neutral-600)]">
                              Ref: <span className="font-mono">{question.question_ref || question.question_key}</span>
                            </p>
                          </div>
                          <label className="min-w-[220px] space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Seção</span>
                            <select name="section" defaultValue={question.section} className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-sm font-semibold">
                              <option value="COMMON">Common</option>
                              <option value="COMPLIANCE">Compliance</option>
                              <option value="PRIVACY">Privacy</option>
                              <option value="SECURITY">Security</option>
                            </select>
                          </label>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="flex justify-end gap-3 border-t border-[var(--color-neutral-100)] pt-4">
                    <Link href="/settings/typeform-forms" className="rounded-lg border border-[var(--color-neutral-200)] px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)]">
                      Cancelar
                    </Link>
                    <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white">
                      Salvar mapeamento
                    </button>
                  </div>
                </form>
              )}
            </SectionCard>
          ) : null}
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
              <li>Salve o mapeamento antes de rodar o backfill ou sincronizar novos tickets.</li>
            </ol>
          </SectionCard>
        </aside>
      </div>
    </PageContainer>
  );
}
