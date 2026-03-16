"use client";

import { useState } from "react";
import { SectionCard } from "@/components/ui/SectionCard";
import type { RiskScoringProfile, RiskScoringSettings } from "@/lib/platform-settings";

function buildRiskProfileExample(profile: RiskScoringProfile, includeCompliance: boolean) {
  const totalWeight = profile.security_weight + profile.privacy_weight + profile.compliance_weight;
  const weightedExampleScore =
    ((8 * profile.security_weight) + (2 * profile.privacy_weight) + ((includeCompliance ? 4 : 0) * profile.compliance_weight)) /
    Math.max(1, totalWeight);
  const classification =
    weightedExampleScore <= profile.low_max
      ? "Low"
      : weightedExampleScore <= profile.medium_max
        ? "Medium"
        : "High";

  return { totalWeight, weightedExampleScore, classification };
}

function RiskProfileSection({
  title,
  description,
  profile,
  fieldPrefix,
  includeCompliance,
  example,
}: {
  title: string;
  description: string;
  profile: RiskScoringProfile;
  fieldPrefix: "partner" | "vendor";
  includeCompliance: boolean;
  example: { totalWeight: number; weightedExampleScore: number; classification: string };
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
                Cada pergunta recebe um <span className="font-bold text-[var(--color-text)]">peso</span> no mapeamento do formulario.
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Quanto maior o peso, maior o impacto da pergunta dentro da secao.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">2. Avaliacao</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">A escolha do analista vira score numerico:</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">Totalmente = {profile.fully_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">Parcialmente = {profile.partially_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">Nao Atende = {profile.does_not_meet_score.toFixed(1)}</p>
              <p className="text-sm text-[var(--color-neutral-700)]">N/A = fora do calculo</p>
            </div>
            <div className="rounded-lg border border-[var(--color-neutral-200)] bg-white p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">3. Score Final</p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Primeiro calculamos o score de cada secao por media ponderada das perguntas.
              </p>
              <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
                Depois aplicamos os <span className="font-bold text-[var(--color-text)]">pesos por secao</span> para chegar ao risk score final.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-5">
          <p className="text-sm font-bold text-[var(--color-text)]">Exemplo pratico</p>
          <div className="mt-4 space-y-3 text-sm text-[var(--color-neutral-700)]">
            <p>
              Suponha que os scores por secao ficaram:
              <span className="font-bold text-[var(--color-text)]"> Security = 8.0</span>,
              <span className="font-bold text-[var(--color-text)]"> Privacy = 2.0</span>
              {includeCompliance ? (
                <>
                  {" "}e
                  <span className="font-bold text-[var(--color-text)]"> Compliance = 4.0</span>.
                </>
              ) : (
                "."
              )}
            </p>
            <p>
              Com pesos de secao
              <span className="font-bold text-[var(--color-text)]">
                {" "}
                {profile.security_weight}% / {profile.privacy_weight}%{includeCompliance ? ` / ${profile.compliance_weight}%` : ""}
              </span>,
              o score final ponderado fica:
            </p>
            <div className="rounded-lg bg-[var(--color-neutral-100)] px-4 py-3 font-mono text-xs text-[var(--color-text)]">
              {includeCompliance
                ? `((8.0 x ${profile.security_weight}) + (2.0 x ${profile.privacy_weight}) + (4.0 x ${profile.compliance_weight})) / ${example.totalWeight || 1} = ${example.weightedExampleScore.toFixed(1)}`
                : `((8.0 x ${profile.security_weight}) + (2.0 x ${profile.privacy_weight})) / ${example.totalWeight || 1} = ${example.weightedExampleScore.toFixed(1)}`}
            </div>
            <p>
              Com os thresholds atuais, esse resultado seria classificado como
              <span className="font-bold text-[var(--color-text)]"> {example.classification}</span>.
            </p>
          </div>
        </div>
      </div>

      <SectionCard title="Pesos por Secao" description={`Defina como ${includeCompliance ? "Security, Privacy e Compliance" : "Security e Privacy"} afetam o score final ponderado.`}>
        <div className="space-y-8">
          {[
            { key: "security_weight", label: "Security", icon: "security", value: profile.security_weight },
            { key: "privacy_weight", label: "Privacy", icon: "privacy_tip", value: profile.privacy_weight },
            ...(includeCompliance
              ? [{ key: "compliance_weight", label: "Compliance", icon: "verified_user", value: profile.compliance_weight }]
              : []),
          ].map((item) => (
            <div key={item.label} className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[var(--color-primary)]">{item.icon}</span>
                  <span className="text-sm font-bold text-[var(--color-text)]">{item.label}</span>
                </div>
                <div className="rounded bg-[var(--color-neutral-100)] px-2 py-1 text-xs font-bold text-[var(--color-neutral-700)]">{item.value}%</div>
              </div>
              <input
                name={`${fieldPrefix}_${item.key}`}
                type="number"
                min={0}
                max={100}
                defaultValue={item.value}
                className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm"
              />
            </div>
          ))}
          <p className={`text-xs font-semibold ${example.totalWeight === 100 ? "text-emerald-700" : "text-amber-700"}`}>
            Soma atual dos pesos: {example.totalWeight}% (obrigatorio: 100%)
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Score por Avaliacao" description="Regua numerica aplicada quando o analista marca cada resposta do questionario.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            { key: "fully_score", label: "Totalmente", tone: "text-emerald-700 bg-emerald-50 border-emerald-200", value: profile.fully_score },
            { key: "partially_score", label: "Parcialmente", tone: "text-amber-700 bg-amber-50 border-amber-200", value: profile.partially_score },
            { key: "does_not_meet_score", label: "Nao Atende", tone: "text-red-700 bg-red-50 border-red-200", value: profile.does_not_meet_score },
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

      <SectionCard title="Thresholds de Classificacao" description="Faixas de score entre 0 e 10 usadas para classificar o risco.">
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
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Maximo Low</span>
            <input name={`${fieldPrefix}_low_max`} type="number" min={0} max={10} step="0.1" defaultValue={profile.low_max} className="w-full rounded-lg border border-[var(--color-neutral-200)] px-3 py-2 text-sm" />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Maximo Medium</span>
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
  const partnerExample = buildRiskProfileExample(value.partner, true);
  const vendorExample = buildRiskProfileExample(value.vendor, false);

  return (
    <form action={saveAction} className="space-y-6">
      <SectionCard
        title="Estrutura de Calculo"
        description="Partners e Vendors agora possuem configuracoes independentes, porque os fluxos de avaliacao sao diferentes."
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
          title="Configuracao de Partners"
          description="Regra usada para recalcular automaticamente o score e a classificacao dos assessments de partners."
          profile={value.partner}
          fieldPrefix="partner"
          includeCompliance
          example={partnerExample}
        />
      ) : null}

      {activeProfile === "vendor" ? (
        <RiskProfileSection
          title="Configuracao de Vendors"
          description="Regra reservada para o fluxo de vendors, considerando somente Security e Privacy."
          profile={value.vendor}
          fieldPrefix="vendor"
          includeCompliance={false}
          example={vendorExample}
        />
      ) : null}

      <div className="flex justify-end">
        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-bold text-white">Salvar Pontuação de Risco</button>
      </div>
    </form>
  );
}
