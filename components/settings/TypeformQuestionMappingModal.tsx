"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type MappingQuestion = {
  id: string;
  question_key: string;
  question_ref: string;
  question_text: string;
  question_order: number;
  section: string;
  weight: number;
  type: string;
};

type WeightOption = {
  value: number;
  label: string;
};

type TypeformQuestionMappingModalProps = {
  formConfigId: string;
  formName: string;
  questions: MappingQuestion[];
  weightOptions: WeightOption[];
  saveAction: (formData: FormData) => void;
  legend: React.ReactNode;
};

export function TypeformQuestionMappingModal({
  formConfigId,
  formName,
  questions,
  weightOptions,
  saveAction,
  legend,
}: TypeformQuestionMappingModalProps) {
  const [items, setItems] = useState(questions);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [bulkSection, setBulkSection] = useState("SECURITY");
  const [bulkWeight, setBulkWeight] = useState(String(weightOptions[1]?.value ?? weightOptions[0]?.value ?? 1));
  const [bulkFeedback, setBulkFeedback] = useState("");

  const showFeedback = (message: string) => {
    setBulkFeedback(message);
  };

  const selectedCount = selectedKeys.length;
  const allSelected = items.length > 0 && selectedCount === items.length;

  const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);

  const toggleAll = () => {
    setSelectedKeys(allSelected ? [] : items.map((item) => item.question_key));
  };

  const toggleOne = (questionKey: string) => {
    setSelectedKeys((current) =>
      current.includes(questionKey)
        ? current.filter((item) => item !== questionKey)
        : [...current, questionKey],
    );
  };

  const updateItem = (questionKey: string, patch: Partial<MappingQuestion>) => {
    setItems((current) =>
      current.map((item) => (item.question_key === questionKey ? { ...item, ...patch } : item)),
    );
    showFeedback("Alteração aplicada no modal. Clique em Salvar mapeamento para persistir.");
  };

  const applyBulk = () => {
    if (selectedSet.size === 0) return;

    setItems((current) =>
      current.map((item) =>
        selectedSet.has(item.question_key)
          ? { ...item, section: bulkSection, weight: Number.parseFloat(bulkWeight) }
          : item,
      ),
    );
    showFeedback(`${selectedSet.size} pergunta(s) atualizada(s) com sucesso. Clique em Salvar mapeamento para persistir.`);
  };

  useEffect(() => {
    if (!bulkFeedback) return;

    const timeout = window.setTimeout(() => {
      setBulkFeedback("");
    }, 2500);

    return () => window.clearTimeout(timeout);
  }, [bulkFeedback]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-text)]/45 p-4">
      <Link href="/settings/typeform-forms" aria-label="Fechar modal" className="absolute inset-0" />
      {bulkFeedback ? (
        <div className="pointer-events-none absolute right-6 top-6 z-20 max-w-md rounded-xl border border-emerald-200 bg-white px-4 py-3 shadow-lg">
          <p className="text-sm font-semibold text-emerald-700">{bulkFeedback}</p>
        </div>
      ) : null}
      <div className="relative z-10 max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-text)]">
              Mapeamento de Perguntas • {formName}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
              Todas as perguntas do formulário são listadas na ordem original do Typeform. Defina a seção e o peso usado no cálculo de risco para cada item.
            </p>
          </div>
          <Link
            href="/settings/typeform-forms"
            className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-bold text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
          >
            Fechar
          </Link>
        </div>

        <div className="mt-6">
          <form action={saveAction} className="space-y-5">
            <input type="hidden" name="form_config_id" value={formConfigId} />
            <div className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/60 px-4 py-3 text-sm text-[var(--color-neutral-700)]">
              {items.length} perguntas encontradas. As respostas futuras e históricas passarão a usar este mapeamento por pergunta.
            </div>

            {legend}

            <div className="rounded-xl border border-[var(--color-primary)]/10 bg-[var(--color-primary)]/5 p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="space-y-2">
                  <p className="text-sm font-bold text-[var(--color-text)]">Seleção rápida</p>
                  <p className="text-sm text-[var(--color-neutral-700)]">
                    Selecione várias perguntas e aplique a mesma seção e o mesmo peso de uma vez.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={toggleAll}
                  className="rounded-lg border border-[var(--color-neutral-200)] bg-white px-4 py-2 text-sm font-semibold text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
                >
                  {allSelected ? "Desmarcar todas" : "Selecionar todas"}
                </button>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-[180px_160px_1fr_auto]">
                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Seção em lote</span>
                  <select
                    value={bulkSection}
                    onChange={(event) => setBulkSection(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-sm font-semibold"
                  >
                    <option value="COMMON">Common</option>
                    <option value="COMPLIANCE">Compliance</option>
                    <option value="PRIVACY">Privacy</option>
                    <option value="SECURITY">Security</option>
                  </select>
                </label>

                <label className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Peso em lote</span>
                  <select
                    value={bulkWeight}
                    onChange={(event) => setBulkWeight(event.target.value)}
                    className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-sm font-semibold"
                  >
                    {weightOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="flex items-end">
                  <p className="text-sm text-[var(--color-neutral-700)]">
                    {selectedCount > 0 ? `${selectedCount} pergunta(s) selecionada(s).` : "Nenhuma pergunta selecionada."}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={applyBulk}
                  disabled={selectedCount === 0}
                  className="rounded-lg bg-[var(--color-primary)] px-4 py-2.5 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Aplicar aos selecionados
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {items.map((question) => (
                <article key={question.question_key} className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
                  <input type="hidden" name="mapping_id" value={question.id} />
                  <input type="hidden" name="question_key" value={question.question_key} />
                  <input type="hidden" name="question_ref" value={question.question_ref} />
                  <input type="hidden" name="question_text" value={question.question_text} />
                  <input type="hidden" name="question_order" value={question.question_order} />
                  <input type="hidden" name="section" value={question.section} />
                  <input type="hidden" name="weight" value={question.weight} />

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <label className="inline-flex items-center gap-3 rounded-lg border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-700)]">
                        <input
                          type="checkbox"
                          checked={selectedSet.has(question.question_key)}
                          onChange={() => toggleOne(question.question_key)}
                          className="h-4 w-4 rounded accent-[var(--color-primary)]"
                        />
                        Selecionar
                      </label>
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
                    <div className="grid min-w-[320px] gap-4 lg:grid-cols-[minmax(0,1fr)_120px]">
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Seção</span>
                        <select
                          name={`section_visible_${question.question_key}`}
                          value={question.section}
                          onChange={(event) => updateItem(question.question_key, { section: event.target.value })}
                          className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-sm font-semibold"
                        >
                          <option value="COMMON">Common</option>
                          <option value="COMPLIANCE">Compliance</option>
                          <option value="PRIVACY">Privacy</option>
                          <option value="SECURITY">Security</option>
                        </select>
                      </label>
                      <label className="space-y-2">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Peso</span>
                        <select
                          name={`weight_visible_${question.question_key}`}
                          value={String(question.weight)}
                          onChange={(event) => updateItem(question.question_key, { weight: Number.parseFloat(event.target.value) })}
                          className="w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2.5 text-sm font-semibold"
                        >
                          {weightOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
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
        </div>
      </div>
    </div>
  );
}
