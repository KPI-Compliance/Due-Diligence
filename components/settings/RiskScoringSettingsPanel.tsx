"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { RiskScoringProfile, RiskScoringSettings } from "@/lib/platform-settings";

function RiskProfileSection({
  title,
  description,
  profile,
  fieldPrefix,
  includeCompliance,
}: {
  title: string;
  description: string;
  profile: RiskScoringProfile;
  fieldPrefix: "partner" | "vendor";
  includeCompliance: boolean;
}) {
  return (
    <section className="space-y-6 rounded-2xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
      <div>
        <h3 className="text-xl font-bold text-[var(--color-text)]">{title}</h3>
        <p className="mt-1 text-sm text-[var(--color-neutral-700)]">{description}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-4 rounded-xl border border-[var(--color-primary)]/10 bg-[var(--color-primary)]/5 p-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">1. Pergunta</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Cada pergunta recebe um <span className="font-bold text-[var(--color-text)]">peso</span> no mapeamento do formulário.
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Quanto maior o peso, maior o impacto da pergunta dentro da seção.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">2. Avaliação</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">A escolha do analista vira score numérico:</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Totalmente = {profile.fully_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">Parcialmente = {profile.partially_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">Não Atende = {profile.does_not_meet_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">N/A = fora do cálculo</p>
            </div>
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">3. Decisão Final</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                O score combinado continua existindo como apoio quantitativo.
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                A classificação final não pode ficar abaixo da <span className="font-bold text-[var(--color-text)]">pior seção concluída</span>.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">Como interpretar agora</p>
          <div className="mt-4 space-y-3 text-sm text-[var(--color-neutral-700)]">
            <p>
              Se uma seção obrigatória ficar em <span className="font-bold text-[var(--color-text)]">High</span>, a classificação final não pode ficar abaixo de <span className="font-bold text-[var(--color-text)]">High</span>.
            </p>
            <p>
              Se faltar uma seção obrigatória, a classificação final permanece como <span className="font-bold text-[var(--color-text)]">Pending Review</span>.
            </p>
            <p>
              {includeCompliance
                ? "Para Partners, as seções obrigatórias são Security, Privacy e Compliance."
                : "Para Vendors, as seções obrigatórias são Security e Privacy."}
            </p>
          </div>
        </div>
      </div>

      <SectionCard title="Regra da Classificação Final" description="A decisão final segue o Modelo 1 e prioriza o pior risco entre as seções obrigatórias concluídas.">
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Score Combinado</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Permanece como referência quantitativa para leitura e comparação histórica.</p>
          </div>
          <div className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Trava por Pior Seção</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">A classificação final nunca pode ser menor que a pior seção obrigatória concluída.</p>
          </div>
          <div className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Seções Pendentes</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Enquanto houver frente obrigatoria pendente, o caso permanece em Pending Review.</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Score por Avaliação" description="Régua numérica aplicada quando o analista marca cada resposta do questionário.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { key: "fully_score", label: "Totalmente", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", value: profile.fully_score },
            { key: "partially_score", label: "Parcialmente", tone: "text-amber-700 bg-amber-50 border-amber-200", value: profile.partially_score },
            { key: "does_not_meet_score", label: "Não Atende", tone: "text-red-700 bg-red-50 border-red-200", value: profile.does_not_meet_score },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
              <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
              <p className="mt-1 text-lg font-black">{item.value.toFixed(1)}</p>
              <input
                name={`${fieldPrefix}_${item.key}`}
                type="number"
                min={0}
                max={10}
                step="0.1"
                defaultValue={item.value}
                className="mt-3 w-full rounded-lg border border-[var(--color-neutral-200)] bg-white px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Thresholds de Classificação" description="Faixas de score entre 0 e 10 usadas para classificar o risco.">
        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { label: "Low", range: `0.0 - ${profile.low_max.toFixed(1)}`, tone: "text-emerald-700 bg-emerald-50 border-emerald-200" },
            { label: "Medium", range: `${profile.low_max.toFixed(1)} - ${profile.medium_max.toFixed(1)}`, tone: "text-amber-700 bg-amber-50 border-amber-200" },
            { label: "High", range: `>${profile.medium_max.toFixed(1)}`, tone: "text-red-700 bg-red-50 border-red-200" },
          ].map((item) => (
            <div key={item.label} className={`rounded-xl border p-4 ${item.tone}`}>
              <p className="text-xs font-bold uppercase tracking-wider">{item.label}</p>
              <p className="mt-1 text-lg font-black">{item.range}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Máximo Low</span>
            <input name={`${fieldPrefix}_low_max`} type="number" min={0} max={10} step="0.1" defaultValue={profile.low_max} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Máximo Medium</span>
            <input name={`${fieldPrefix}_medium_max`} type="number" min={0} max={10} step="0.1" defaultValue={profile.medium_max} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
        </div>
      </SectionCard>
    </section>
  );
}

export function RiskScoringSettingsPanel({
  value,
  saveAction,
}: {
  value: RiskScoringSettings;
  saveAction: (formData: FormData) => Promise<void>;
}) {
  const [activeProfile, setActiveProfile] = useState<"partner" | "vendor">("partner");

  return (
    <form action={saveAction} className="space-y-6">
      <SectionCard
        title="Estrutura de Calculo"
        description="Partners e Vendors agora possuem configurações independentes, porque os fluxos de avaliação são diferentes."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <button
            type="button"
            onClick={() => setActiveProfile("partner")}
            className={`rounded-2xl border px-6 py-5 text-left transition ${
              activeProfile === "partner"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-sm"
                : "border-[var(--color-neutral-200)] bg-white hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/4"
            }`}
          >
            <p className="text-xl font-bold text-[var(--color-text)]">Partners</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Usa Security, Privacy e Compliance no score final.</p>
          </button>

          <button
            type="button"
            onClick={() => setActiveProfile("vendor")}
            className={`rounded-2xl border px-6 py-5 text-left transition ${
              activeProfile === "vendor"
                ? "border-[var(--color-primary)] bg-[var(--color-primary)]/8 shadow-sm"
                : "border-[var(--color-neutral-200)] bg-white hover:border-[var(--color-primary)]/30 hover:bg-[var(--color-primary)]/4"
            }`}
          >
            <p className="text-xl font-bold text-[var(--color-text)]">Vendors</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Usa apenas Security e Privacy. Compliance fica fora desse processo.</p>
          </button>
        </div>
      </SectionCard>

      {activeProfile === "partner" ? (
        <RiskProfileSection
          title="Configuração de Partners"
          description="Configuração usada para score por pergunta e para a classificação final com trava pela pior seção concluída."
          profile={value.partner}
          fieldPrefix="partner"
          includeCompliance
        />
      ) : null}

      {activeProfile === "vendor" ? (
        <RiskProfileSection
          title="Configuração de Vendors"
          description="Configuração usada para score por pergunta e para a classificação final com trava pela pior seção concluída."
          profile={value.vendor}
          fieldPrefix="vendor"
          includeCompliance={false}
        />
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Pontuação de Risco</button>
      </div>
    </form>
  );
}
