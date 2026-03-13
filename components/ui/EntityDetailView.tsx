import Link from "next/link";
import { savePartnerExternalQuestionnaireSection } from "@/app/(app)/partners/actions";
import { AnalystEvaluationControl } from "@/components/ui/AnalystEvaluationControl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import type {
  AnalystEvaluationStatus,
  DetailTabKey,
  EntityDetailData,
  ReviewStatus,
  RiskLevel,
} from "@/lib/entity-detail-data";

type EntityDetailViewProps = {
  kind: "vendor" | "partner";
  basePath: string;
  detail: EntityDetailData;
  activeTab: DetailTabKey;
  activeQuestionnaireSection?: string;
};

const tabs: Array<{ key: DetailTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "internal_questionnaire", label: "Internal Questionnaire" },
  { key: "external_questionnaire", label: "External Questionnaire" },
  { key: "evidence", label: "Evidence" },
  { key: "security_review", label: "Security Review" },
  { key: "privacy_review", label: "Privacy Review" },
  { key: "decision", label: "Decision" },
];

const reviewLabel: Record<ReviewStatus, string> = {
  compliant: "COMPLIANT",
  needs_review: "NEEDS REVIEW",
};

const reviewClasses: Record<ReviewStatus, string> = {
  compliant: "text-emerald-600",
  needs_review: "text-amber-600",
};

const reviewAccent: Record<ReviewStatus, string> = {
  compliant: "border-[var(--color-primary)]/30",
  needs_review: "border-amber-500/50",
};

const statusDot: Record<EntityDetailData["statusMode"], string> = {
  pending: "bg-slate-500",
  in_review: "bg-[var(--color-primary)]",
  completed: "bg-emerald-500",
};

const statusBadgeMap: Record<EntityDetailData["statusMode"], "pending" | "in_review" | "completed"> = {
  pending: "pending",
  in_review: "in_review",
  completed: "completed",
};

const levelStyles: Record<RiskLevel, string> = {
  Low: "text-emerald-600",
  Medium: "text-amber-600",
  High: "text-red-600",
};

const levelBadgeStyles: Record<RiskLevel, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-700",
};

type ExternalSection = "Common" | "Compliance" | "Privacy" | "Security";

const externalQuestionnaireTemplates: Array<{
  sections: Record<Exclude<ExternalSection, "Common">, { start: string; end: string }>;
}> = [
  {
    sections: {
      Compliance: {
        start: "Qual é o nome da empresa?",
        end: "A Empresa Parceira envolverá algum terceiro/subcontratado em sua parceria com a VTEX?",
      },
      Privacy: {
        start: "Os dados pessoais serão compartilhados com terceiros (além da VTEX e do parceiro)?",
        end: "Os funcionários são informados e treinados sobre suas responsabilidades de manter a conscientização e a conformidade com as políticas, procedimentos, padrões e requisitos regulatórios aplicáveis de segurança e privacidade publicados?",
      },
      Security: {
        start: "Que tipo de informação da VTEX será processada pelo parceiro?",
        end: "Descreva quais são os procedimentos para notificar a VTEX sobre qualquer problema ou incidente de Segurança da Informação que possa ocorrer, de acordo com seu Plano de Resposta a Incidentes.",
      },
    },
  },
  {
    sections: {
      Compliance: {
        start: "Hi! What is the Company Name?",
        end: "Will the Partner Company engage any third party/subcontractor in its partnership with VTEX?",
      },
      Privacy: {
        start: "Will personal data be shared with third parties (other than VTEX and Partner)?",
        end: "Are employees informed and trained about their responsibilities for maintaining awareness of and compliance with applicable published security and privacy policies, procedures, standards, and regulatory requirements?",
      },
      Security: {
        start: "What kind of VTEX's information will be processed by the partner?",
        end: "Please describe what are the procedure to notify VTEX about any Information Security issue or incident that may occur, in accordance with your Incident Response Plan.",
      },
    },
  },
  {
    sections: {
      Compliance: {
        start: "Olá! Qual é o nome da empresa?",
        end: "A Empresa Parceira contratará algum terceiro/subcontratado em sua parceria com a VTEX?",
      },
      Privacy: {
        start: "Os contratos que sua empresa celebra incluem cláusulas relacionadas à privacidade e à proteção de Dados Pessoais?",
        end: "Os funcionários são informados e treinados sobre suas responsabilidades de manter a conscientização e a conformidade com as políticas, procedimentos, padrões e requisitos regulatórios de segurança e privacidade publicados aplicáveis?",
      },
      Security: {
        start: "Que tipo de informação da VTEX será processada ou acessada pelo parceiro?",
        end: "Os registros de segurança são monitorados e mantidos (SIEM, alertas, trilhas de auditoria)?",
      },
    },
  },
  {
    sections: {
      Compliance: {
        start: "Hi! What is the Company Name?",
        end: "Will the Partner Company engage any third party/subcontractor in its partnership with VTEX?",
      },
      Privacy: {
        start: "Do the contracts that your company enters into include clauses relating to privacy and the protection of Personal Data?",
        end: "Are employees informed and trained about their responsibilities for maintaining awareness of and compliance with applicable published security and privacy policies, procedures, standards, and regulatory requirements?",
      },
      Security: {
        start: "What type of VTEX information will be processed or accessed by the partner?",
        end: "Are security logs monitored and retained (SIEM, alerts, audit trails)?",
      },
    },
  },
];

function getQuestionnaireStatusClasses(status: string) {
  const normalized = status.trim().toLowerCase();
  if (normalized.includes("concl")) return "bg-emerald-100 text-emerald-700";
  if (normalized.includes("pend")) return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-700";
}

function normalizeQuestionComparable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getExternalSection(domain: string) {
  const commonNormalized = domain.trim().toLowerCase();
  if (commonNormalized.includes("common")) return "Common";
  const normalized = domain.trim().toLowerCase();
  if (normalized.includes("privacy") || normalized.includes("privacidade")) return "Privacy";
  if (normalized.includes("security") || normalized.includes("seguranca")) return "Security";
  return "Compliance";
}

function getExternalQuestionsBySection(
  questions: EntityDetailData["questions"],
): Array<{ section: ExternalSection; items: EntityDetailData["questions"] }> {
  const sectionBackedQuestions = questions.some((item) => item.section && item.section !== "Unclassified");
  if (sectionBackedQuestions) {
    return (["Common", "Compliance", "Privacy", "Security"] as ExternalSection[]).map((section) => ({
      section,
      items: questions.filter((item) => item.section === section),
    }));
  }

  const normalizedQuestions = questions.map((item) => normalizeQuestionComparable(item.question));

  for (const template of externalQuestionnaireTemplates) {
    const boundaries = {
      Compliance: {
        start: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Compliance.start)),
        end: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Compliance.end)),
      },
      Privacy: {
        start: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Privacy.start)),
        end: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Privacy.end)),
      },
      Security: {
        start: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Security.start)),
        end: normalizedQuestions.indexOf(normalizeQuestionComparable(template.sections.Security.end)),
      },
    };

    const matchesTemplate = Object.values(boundaries).every(({ start, end }) => start >= 0 && end >= start);
    if (!matchesTemplate) continue;

    return (["Compliance", "Privacy", "Security"] as Array<Exclude<ExternalSection, "Common">>).map((section) => ({
      section,
      items: questions.slice(boundaries[section].start, boundaries[section].end + 1),
    }));
  }

  return (["Common", "Compliance", "Privacy", "Security"] as ExternalSection[]).map((section) => ({
    section,
    items: questions.filter((item) => getExternalSection(item.domain) === section),
  }));
}

function getQuestionSourceLabel(
  source:
    | EntityDetailData["questions"][number]["source"]
    | NonNullable<EntityDetailData["internalQuestionnaire"]>["source"],
) {
  return source === "google_sheets" ? "From Google Sheets" : "From Typeform";
}

function getQuestionCategoryLabel(domain: string, index: number) {
  const normalized = domain.trim();
  return normalized.length > 0 ? normalized : `Question ${String(index + 1).padStart(2, "0")}`;
}

function QuestionnaireHero({
  title,
  description,
  sectionLabel,
  sectionOptions,
  sectionHrefBuilder,
  selectedSection,
}: {
  title: string;
  description: string;
  sectionLabel: string;
  sectionOptions?: string[];
  sectionHrefBuilder?: (section: string) => string;
  selectedSection?: string;
}) {
  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-xl border border-[var(--color-primary)]/10 bg-white p-1 shadow-sm">
        {sectionOptions && sectionOptions.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {sectionOptions.map((option, index) => (
              <Link
                key={option}
                href={sectionHrefBuilder ? sectionHrefBuilder(option) : "#"}
                className={
                  selectedSection === option || (!selectedSection && index === 0)
                    ? "rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white shadow-sm"
                    : "rounded-lg px-6 py-2.5 text-sm font-bold text-[var(--color-neutral-600)] transition hover:text-[var(--color-text)]"
                }
              >
                {option}
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-lg bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white shadow-sm">
            {sectionLabel}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-2xl font-extrabold tracking-tight text-[var(--color-text)]">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--color-neutral-700)]">{description}</p>
      </div>
    </div>
  );
}

function QuestionnaireResponseCard({
  badge,
  sourceLabel,
  question,
  answer,
  answerLabel,
  reviewStatus,
  cardKey,
  responseId,
  analystEvaluation,
  analystObservations,
  editable = false,
}: {
  badge: string;
  sourceLabel: string;
  question: string;
  answer: string;
  answerLabel: string;
  reviewStatus: ReviewStatus;
  cardKey: string;
  responseId?: string;
  analystEvaluation?: AnalystEvaluationStatus;
  analystObservations?: string;
  editable?: boolean;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-[var(--color-primary)]/10 bg-white shadow-sm">
      <div className="border-b border-[var(--color-neutral-100)] p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <span className="rounded-md bg-[var(--color-neutral-100)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            {badge}
          </span>
          <span className="flex items-center gap-1 text-xs font-bold text-[var(--color-primary)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--color-primary)]" />
            {sourceLabel}
          </span>
        </div>

        <h3 className="mb-4 text-lg font-semibold leading-snug text-[var(--color-text)]">{question}</h3>

        <div className="rounded-lg border border-[var(--color-neutral-100)] bg-[var(--color-neutral-100)]/60 p-4">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">{answerLabel}</p>
          <p className="text-sm font-medium italic leading-relaxed text-[var(--color-neutral-700)]">"{answer}"</p>
        </div>
      </div>

      <div className="flex flex-col gap-6 bg-[var(--color-primary)]/5 p-6 md:flex-row">
        <div className="flex-1">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Analyst Evaluation</p>
          <AnalystEvaluationControl
            responseId={responseId}
            analystEvaluation={analystEvaluation}
            reviewStatus={reviewStatus}
            editable={editable}
          />
        </div>

        <div className="flex-1">
          <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]" htmlFor={`${cardKey}-notes`}>
            Analyst Observations
          </label>
          <textarea
            id={`${cardKey}-notes`}
            rows={3}
            name={responseId ? `observations_${responseId}` : `${cardKey}-notes`}
            defaultValue={analystObservations ?? ""}
            readOnly={!editable}
            placeholder="Registre observacoes, evidencias e condicionantes para este item."
            className="w-full resize-none rounded-lg border border-[var(--color-primary)]/10 bg-white px-3 py-3 text-sm outline-none"
          />
        </div>
      </div>
    </article>
  );
}

export function EntityDetailView({ kind, basePath, detail, activeTab, activeQuestionnaireSection }: EntityDetailViewProps) {
  const backHref = kind === "vendor" ? "/vendors" : "/partners";
  const questionnaireAnswerCount = detail.questions.length;
  const externalQuestionsBySection = getExternalQuestionsBySection(detail.questions);
  const normalizedActiveSection = (
    activeQuestionnaireSection &&
    ["Common", "Compliance", "Privacy", "Security"].includes(activeQuestionnaireSection)
      ? activeQuestionnaireSection
      : "Common"
  ) as ExternalSection;
  const selectedExternalSection =
    externalQuestionsBySection.find((entry) => entry.section === normalizedActiveSection) ?? externalQuestionsBySection[0];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--color-primary)]/10 bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--color-primary)]/10 text-[var(--color-primary)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l7 4v6c0 5-3 8-7 10-4-2-7-5-7-10V6l7-4z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold tracking-tight text-[var(--color-text)]">{detail.name}</h1>
                <StatusBadge status={statusBadgeMap[detail.statusMode]} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-neutral-600)]">{detail.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="rounded-full border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/10 px-3 py-1.5">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${statusDot[detail.statusMode]}`} />
                <span className="text-sm font-bold text-[var(--color-primary)]">{detail.statusLabel}</span>
              </div>
            </div>

            <div className="rounded-xl border border-[var(--color-primary)]/10 bg-white px-4 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--color-neutral-600)]">Risk Score</p>
              <p className="text-xl font-black text-[var(--color-text)]">
                {detail.riskScore}
                <span className="text-xs font-medium text-[var(--color-neutral-600)]">/100</span>
              </p>
            </div>
          </div>
        </div>

        {activeTab === "external_questionnaire" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--color-neutral-100)] pt-4 md:grid-cols-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Entidade</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.name}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Jira Ticket</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.jiraTicket ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Status</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                {questionnaireAnswerCount > 0 ? "Questionario recebido" : "Aguardando vinculacao"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Formulario</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                {detail.externalQuestionnaire.formName ?? detail.externalQuestionnaire.formId ?? "-"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Question Count</p>
              <p className="mt-1 text-2xl font-black text-[var(--color-primary)]">{selectedExternalSection?.items.length ?? 0}</p>
              <p className="mt-1 text-xs text-[var(--color-neutral-600)]">
                Itens prontos para revisao na secao {selectedExternalSection?.section ?? "Common"}.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-neutral-100)] pt-4">
          <div className="flex gap-6 overflow-x-auto">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`${basePath}?tab=${tab.key}`}
                className={
                  tab.key === activeTab
                    ? "border-b-2 border-[var(--color-primary)] pb-2 text-sm font-bold text-[var(--color-primary)] whitespace-nowrap"
                    : "border-b-2 border-transparent pb-2 text-sm font-semibold text-[var(--color-neutral-600)] whitespace-nowrap hover:text-[var(--color-primary)]"
                }
              >
                {tab.label}
              </Link>
            ))}
          </div>
          <Link href={backHref} className="text-sm font-semibold text-[var(--color-secondary)] hover:underline">
            Voltar para lista
          </Link>
        </div>
      </section>

      {activeTab === "overview" ? (
        <section className="space-y-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-8">
              <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Company Details</h3>
                <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Category</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.category}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Jira Ticket</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.jiraTicket ?? "-"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">HQ Location</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.hqLocation}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Website</p>
                    <a className="mt-1 text-sm font-semibold text-[var(--color-primary)] hover:underline" href={`https://${detail.overview.website}`}>
                      {detail.overview.website}
                    </a>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Contact</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.contact}</p>
                  </div>
                </div>
                <p className="mt-8 border-t border-[var(--color-neutral-100)] pt-6 text-sm leading-relaxed text-[var(--color-neutral-700)]">
                  {detail.overview.description}
                </p>
              </article>

              <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Ponto Focal Interno</h3>
                <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.name}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Cargo</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.role}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Área</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.area}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.email}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Telefone</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.phone}</p>
                  </div>
                </div>
              </article>

              <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Risk Classification</h3>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {detail.overview.riskBreakdown.map((risk) => (
                    <div key={risk.label} className="rounded-lg border border-[var(--color-primary)]/10 bg-[var(--color-neutral-100)] p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">{risk.label}</span>
                        <span className={`text-sm font-bold ${levelStyles[risk.level]}`}>{risk.level}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-200)]">
                        <div
                          className={
                            risk.level === "High"
                              ? "h-full bg-red-500"
                              : risk.level === "Medium"
                                ? "h-full bg-amber-500"
                                : "h-full bg-emerald-500"
                          }
                          style={{ width: `${risk.score}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <aside className="lg:col-span-4">
              <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Timeline</h3>
                <div className="relative ml-2 space-y-8">
                  <div className="absolute bottom-0 left-[11px] top-0 w-px bg-[var(--color-neutral-200)]" />
                  {detail.overview.timeline.map((item) => (
                    <div key={item.title} className="relative flex gap-4">
                      <div className="z-10 mt-0.5 flex h-6 w-6 items-center justify-center rounded-full border border-white bg-[var(--color-primary)] text-[10px] text-white shadow-sm">
                        {item.current ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : "✓"}
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${item.current ? "text-[var(--color-primary)]" : "text-[var(--color-text)]"}`}>
                          {item.title}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-neutral-600)]">{item.date}</p>
                        <p className="mt-1 text-xs text-[var(--color-neutral-600)]">{item.note}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </aside>
          </div>

          <article className="flex flex-col items-start justify-between gap-4 rounded-xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-6 md:flex-row md:items-center">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-[var(--color-primary)]/10 p-2 text-[var(--color-primary)]">i</div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">Analysis Phase In Progress</p>
                <p className="text-sm text-[var(--color-neutral-700)]">
                  The security team is reviewing evidence for critical control points.
                </p>
              </div>
            </div>
            <button
              type="button"
              className="rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-bold text-white transition hover:brightness-95"
            >
              View Review Queue
            </button>
          </article>
        </section>
      ) : null}

      {activeTab === "internal_questionnaire" ? (
        detail.internalQuestionnaire ? (
          (() => {
            const internalQuestionnaire = detail.internalQuestionnaire;

            return (
          <section className="space-y-6">
            <QuestionnaireHero
              sectionLabel="Internal Questionnaire"
              title="Mini Questionario Interno"
              description="Visualize as respostas recebidas do ponto focal interno e centralize as anotacoes da analise em um layout de revisao mais estruturado."
            />

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              <div className="space-y-6 lg:col-span-8">
                {internalQuestionnaire.questions.length > 0 ? (
                  <div className="space-y-6">
                    {internalQuestionnaire.questions.map((item, index) => (
                      <QuestionnaireResponseCard
                        key={`internal-${index}-${item.question}`}
                        cardKey={`internal-${index}`}
                        badge={`Question ${String(index + 1).padStart(2, "0")} • Internal`}
                        sourceLabel={getQuestionSourceLabel(internalQuestionnaire.source)}
                        question={item.question}
                        answer={item.answer}
                        answerLabel="Internal Response"
                        reviewStatus="needs_review"
                      />
                    ))}
                  </div>
                ) : (
                  <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-10 text-center shadow-sm">
                    <p className="text-lg font-bold text-[var(--color-text)]">Mini questionario ainda sem respostas</p>
                    <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
                      A solicitacao foi identificada, mas ainda nao ha respostas preenchidas para analise.
                    </p>
                  </article>
                )}
              </div>

              <aside className="space-y-4 lg:col-span-4">
                <section className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-[var(--color-text)]">Resumo da Solicitacao</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${getQuestionnaireStatusClasses(internalQuestionnaire.status)}`}
                    >
                      {internalQuestionnaire.status}
                    </span>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Solicitante</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{internalQuestionnaire.requester}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Ticket Jira</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{internalQuestionnaire.ticket || detail.jiraTicket || "-"}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Entidade</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{internalQuestionnaire.vendor}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Fonte</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{getQuestionSourceLabel(internalQuestionnaire.source)}</p>
                    </div>
                    {internalQuestionnaire.submittedAt ? (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Data de resposta</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">{internalQuestionnaire.submittedAt}</p>
                      </div>
                    ) : null}
                  </div>
                </section>

                <section className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--color-neutral-600)]">Progress</p>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-neutral-200)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary)]"
                      style={{
                        width: `${
                          internalQuestionnaire.questions.length > 0
                            ? Math.min(100, Math.max(12, internalQuestionnaire.questions.length * 8))
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-[var(--color-neutral-700)]">
                    {internalQuestionnaire.questions.length} respostas carregadas para a revisao interna.
                  </p>
                </section>
              </aside>
            </div>
          </section>
            );
          })()
        ) : (
          <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-bold text-[var(--color-text)]">Mini questionario interno nao encontrado</p>
            <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
              Nenhuma linha correspondente foi localizada na planilha do Google Sheets para este vendor.
            </p>
          </section>
        )
      ) : null}

      {activeTab === "external_questionnaire" ? (
        <section className="space-y-6">
          <QuestionnaireHero
            sectionLabel="External Questionnaire"
            title="Questionario Externo"
            description="Centralize as respostas recebidas do parceiro em um fluxo de revisao visual, com contexto da fonte, resposta original e espaco reservado para a avaliacao do analista."
            sectionOptions={["Common", "Compliance", "Privacy", "Security"]}
            selectedSection={selectedExternalSection?.section}
            sectionHrefBuilder={(section) => `${basePath}?tab=external_questionnaire&section=${section}`}
          />

          <div className="space-y-6">
            <div className="space-y-6">
              {questionnaireAnswerCount > 0 ? (
                <form action={savePartnerExternalQuestionnaireSection} className="space-y-6">
                  <input type="hidden" name="entity_slug" value={detail.id} />
                  <input type="hidden" name="response_table" value={detail.externalQuestionnaire.responseTable ?? ""} />
                  {(selectedExternalSection?.items ?? []).map((item, index) => (
                    <QuestionnaireResponseCard
                      key={`external-${selectedExternalSection?.section}-${index}-${item.domain}-${item.question}`}
                      cardKey={`external-${selectedExternalSection?.section}-${index}`}
                      badge={`Question ${String(index + 1).padStart(2, "0")} • ${getQuestionCategoryLabel(item.domain, index)}`}
                      sourceLabel={getQuestionSourceLabel(item.source ?? "database")}
                      question={item.question}
                      answer={item.answer}
                      answerLabel="Partner Response"
                      reviewStatus={item.status}
                      responseId={item.responseId}
                      analystEvaluation={item.analystEvaluation}
                      analystObservations={item.analystObservations}
                      editable={kind === "partner" && Boolean(detail.externalQuestionnaire.responseTable)}
                    />
                  ))}
                  <div className="flex justify-end">
                    <button
                      type="submit"
                      className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95"
                    >
                      Salvar avaliacoes de {selectedExternalSection?.section ?? "Common"}
                    </button>
                  </div>
                </form>
              ) : (
                <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-10 text-center shadow-sm">
                  <p className="text-lg font-bold text-[var(--color-text)]">Questionario externo ainda nao encontrado</p>
                  <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
                    Nenhuma resposta do Typeform foi vinculada a esta entidade ate o momento.
                  </p>
                </article>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "security_review" ? (
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-7">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-[var(--color-text)]">Security Questionnaire Responses</h2>
              <span className="rounded bg-[var(--color-neutral-100)] px-2 py-1 text-xs font-semibold text-[var(--color-neutral-600)]">
                {detail.questions.length} Answers
              </span>
            </div>

            {detail.questions.map((item) => (
              <article
                key={`${item.domain}-${item.question}`}
                className={`rounded-xl border bg-white p-5 shadow-sm ${reviewAccent[item.status]} transition-shadow hover:shadow-md`}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <span className="rounded bg-[var(--color-primary)]/5 px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--color-primary)]">
                    {item.domain}
                  </span>
                  <span className={`text-xs font-bold ${reviewClasses[item.status]}`}>{reviewLabel[item.status]}</span>
                </div>
                <h3 className="mb-2 text-sm font-bold text-[var(--color-text)]">{item.question}</h3>
                <p className="rounded-lg border-l-4 border-[var(--color-primary)]/30 bg-[var(--color-neutral-100)] p-3 text-sm text-[var(--color-neutral-700)]">
                  {item.answer}
                </p>
                {item.evidenceUrl ? (
                  <a
                    href={item.evidenceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex text-xs font-semibold text-[var(--color-secondary)] hover:underline"
                  >
                    Ver evidência anexada
                  </a>
                ) : null}
                {item.source === "google_sheets" ? (
                  <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Fonte: Google Sheets</p>
                ) : null}
              </article>
            ))}
          </div>

          <aside className="space-y-4 lg:col-span-5">
            <section className="rounded-2xl border border-[var(--color-neutral-200)] bg-white shadow-sm">
              <header className="rounded-t-2xl bg-[var(--color-primary)] p-4 text-white">
                <h3 className="text-lg font-bold">Security Analysis</h3>
                <p className="text-xs font-medium text-white/80">Conclua sua revisão da postura de segurança.</p>
              </header>

              <form className="space-y-5 p-5">
                <div>
                  <label className="mb-2 block text-sm font-bold text-[var(--color-text)]" htmlFor="risk-rating">
                    Security Risk Rating
                  </label>
                  <select
                    id="risk-rating"
                    className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm font-semibold outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                    defaultValue="medium"
                  >
                    <option value="low">Low Risk</option>
                    <option value="medium">Medium Risk</option>
                    <option value="high">High Risk</option>
                    <option value="critical">Critical Risk</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-[var(--color-text)]" htmlFor="notes">
                    Analysis Notes
                  </label>
                  <textarea
                    id="notes"
                    rows={4}
                    placeholder="Enter your observations..."
                    className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-bold text-[var(--color-text)]" htmlFor="recommendations">
                    Recommendations / Conditions
                  </label>
                  <textarea
                    id="recommendations"
                    rows={3}
                    placeholder="List mandatory conditions..."
                    className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95"
                >
                  Submit Security Analysis
                </button>

                <p className="border-t border-[var(--color-neutral-100)] pt-3 text-center text-[10px] font-bold uppercase tracking-widest text-[var(--color-neutral-600)]">
                  Last saved: 4 minutes ago by Sarah Jenkins
                </p>
              </form>
            </section>

            <section className="grid grid-cols-2 gap-3">
              <article className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4 text-center shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Critical Findings</p>
                <p className="mt-1 text-xl font-black text-[var(--color-text)]">02</p>
              </article>
              <article className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-4 text-center shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Audit Score</p>
                <p className="mt-1 text-xl font-black text-[var(--color-primary)]">A-</p>
              </article>
            </section>
          </aside>
        </section>
      ) : null}

      {activeTab === "decision" ? (
        <section className="space-y-6">
          <div>
            <h2 className="text-3xl font-extrabold tracking-tight text-[var(--color-text)]">Final Assessment Decision</h2>
            <p className="mt-2 text-sm text-[var(--color-neutral-700)]">
              Complete the evaluation and finalize the verdict based on cross-departmental review outcomes.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <article className="space-y-3 rounded-xl border border-[var(--color-primary)]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Security</span>
                <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[detail.decision.security.level]}`}>
                  {detail.decision.security.level} Risk
                </span>
              </div>
              <p className="text-sm text-[var(--color-neutral-700)]">{detail.decision.security.note}</p>
            </article>

            <article className="space-y-3 rounded-xl border border-[var(--color-primary)]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Privacy</span>
                <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[detail.decision.privacy.level]}`}>
                  {detail.decision.privacy.level} Risk
                </span>
              </div>
              <p className="text-sm text-[var(--color-neutral-700)]">{detail.decision.privacy.note}</p>
            </article>

            <article className="space-y-3 rounded-xl border border-[var(--color-primary)]/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Compliance</span>
                <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[detail.decision.compliance.level]}`}>
                  {detail.decision.compliance.level} Risk
                </span>
              </div>
              <p className="text-sm text-[var(--color-neutral-700)]">{detail.decision.compliance.note}</p>
            </article>
          </div>

          <article className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-6 md:flex-row md:items-center">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-white bg-[var(--color-primary)] text-2xl font-bold text-white shadow-lg">
                {detail.decision.combinedScore}
              </div>
              <div>
                <h4 className="text-lg font-bold text-[var(--color-text)]">Combined Risk Score</h4>
                <p className="text-sm text-[var(--color-neutral-700)]">Weighted average based on assessment modules.</p>
              </div>
            </div>
            <div className="rounded-xl border border-[var(--color-primary)]/10 bg-white px-6 py-3">
              <span className="text-sm font-semibold uppercase tracking-widest text-[var(--color-neutral-600)]">Classification: </span>
              <span className="text-lg font-extrabold text-[var(--color-primary)]">{detail.decision.classification}</span>
            </div>
          </article>

          <section className="space-y-4">
            <h3 className="text-xl font-bold text-[var(--color-text)]">Final Decision Options</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <label className="cursor-pointer">
                <input type="radio" name="decision" className="peer sr-only" />
                <div className="flex h-full flex-col items-center gap-2 rounded-xl border-2 border-[var(--color-neutral-200)] bg-white p-5 text-center transition peer-checked:border-emerald-500 peer-checked:bg-emerald-50">
                  <span className="text-sm font-bold">Approved</span>
                  <p className="text-xs text-[var(--color-neutral-600)]">Full clearance for partnership operations.</p>
                </div>
              </label>

              <label className="cursor-pointer">
                <input type="radio" name="decision" defaultChecked className="peer sr-only" />
                <div className="flex h-full flex-col items-center gap-2 rounded-xl border-2 border-[var(--color-neutral-200)] bg-white p-5 text-center transition peer-checked:border-[var(--color-primary)] peer-checked:bg-[var(--color-primary)]/5">
                  <span className="text-sm font-bold">Approved with Restrictions</span>
                  <p className="text-xs text-[var(--color-neutral-600)]">Limited access until mitigation tasks are met.</p>
                </div>
              </label>

              <label className="cursor-pointer">
                <input type="radio" name="decision" className="peer sr-only" />
                <div className="flex h-full flex-col items-center gap-2 rounded-xl border-2 border-[var(--color-neutral-200)] bg-white p-5 text-center transition peer-checked:border-red-500 peer-checked:bg-red-50">
                  <span className="text-sm font-bold">Rejected</span>
                  <p className="text-xs text-[var(--color-neutral-600)]">Serious violations identified.</p>
                </div>
              </label>
            </div>
          </section>

          <section className="space-y-6 rounded-2xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--color-text)]">Conditions for Approval</label>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4 text-sm outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                  placeholder="List specific conditions for the entity..."
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-bold text-[var(--color-text)]">Mitigation Plan</label>
                <textarea
                  className="min-h-[120px] w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] p-4 text-sm outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                  placeholder="Outline risk mitigation steps..."
                />
              </div>
            </div>

            <div className="max-w-xs">
              <label className="mb-2 block text-sm font-bold text-[var(--color-text)]">Approval Expiration Date</label>
              <input
                type="date"
                defaultValue="2026-12-31"
                className="w-full rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)] px-3 py-2 text-sm outline-none focus:border-[var(--color-primary)]/40 focus:ring-2 focus:ring-[var(--color-primary)]/10"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="rounded-xl px-5 py-2.5 text-sm font-bold text-[var(--color-neutral-700)] transition hover:bg-[var(--color-neutral-100)]"
              >
                Save as Draft
              </button>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95"
              >
                Finalize Assessment
              </button>
            </div>
          </section>
        </section>
      ) : null}

      {activeTab !== "overview" &&
      activeTab !== "internal_questionnaire" &&
      activeTab !== "external_questionnaire" &&
      activeTab !== "security_review" &&
      activeTab !== "decision" ? (
        <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-10 text-center shadow-sm">
          <p className="text-lg font-bold text-[var(--color-text)]">Tab em construção</p>
          <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
            Esta seção será implementada no próximo ciclo. Use Overview, Security Review ou Decision por enquanto.
          </p>
        </section>
      ) : null}
    </div>
  );
}
