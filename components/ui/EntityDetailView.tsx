import Link from "next/link";
import { savePartnerExternalQuestionnaireSection } from "@/app/(app)/partners/actions";
import { AnalystEvaluationControl } from "@/components/ui/AnalystEvaluationControl";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { VendorExternalQuestionnaireCard } from "@/components/ui/VendorExternalQuestionnaireCard";
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
  saveStatus?: string;
  jiraErrorStatus?: string;
  jiraSyncStatus?: string;
};

const vendorTabs: Array<{ key: DetailTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "internal_questionnaire", label: "Internal Questionnaire" },
  { key: "external_questionnaire", label: "External Questionnaire" },
  { key: "decision", label: "Decision" },
];

const partnerTabs: Array<{ key: DetailTabKey; label: string }> = [
  { key: "overview", label: "Overview" },
  { key: "external_questionnaire", label: "External Questionnaire" },
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

const levelBadgeStyles: Record<RiskLevel, string> = {
  Low: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-red-100 text-red-700",
  Pending: "bg-slate-100 text-slate-700",
};

const analystEvaluationSummaryLabels: Record<Exclude<AnalystEvaluationStatus, "NOT_EVALUATED"> | "NOT_EVALUATED", string> = {
  DOES_NOT_MEET: "Não atende",
  PARTIALLY: "Parcialmente",
  FULLY: "Totalmente",
  NA: "N/A",
  NOT_EVALUATED: "Não avaliado",
};

type ExternalSection = "Common" | "Compliance" | "Privacy" | "Security";

function getAvailableExternalSections(kind: "vendor" | "partner") {
  return kind === "vendor"
    ? (["Common", "Privacy", "Security"] as ExternalSection[])
    : (["Common", "Compliance", "Privacy", "Security"] as ExternalSection[]);
}

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

function DecisionSummaryCard({
  decision,
  kind,
  compact = false,
}: {
  decision: EntityDetailData["decision"];
  kind: "vendor" | "partner";
  compact?: boolean;
}) {
  const getLevelLabel = (level: RiskLevel) => {
    if (level === "Pending") return "Pending";
    return `${level} Risk`;
  };
  const showCompliance = kind === "partner";

  return (
    <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
      <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Decision Summary</h3>
      <div className={`grid grid-cols-1 gap-4 ${showCompliance ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
        <article className={`space-y-3 rounded-xl border border-[var(--color-primary)]/10 ${compact ? "bg-[var(--color-neutral-100)] p-4" : "bg-white p-5 shadow-sm"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Security</span>
            <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[decision.security.level]}`}>
              {getLevelLabel(decision.security.level)}
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            Score: <span className="text-[var(--color-text)]">{decision.security.score ?? "0.0"}</span>
          </p>
          <p className="text-sm text-[var(--color-neutral-700)]">{decision.security.note}</p>
        </article>

        <article className={`space-y-3 rounded-xl border border-[var(--color-primary)]/10 ${compact ? "bg-[var(--color-neutral-100)] p-4" : "bg-white p-5 shadow-sm"}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Privacy</span>
            <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[decision.privacy.level]}`}>
              {getLevelLabel(decision.privacy.level)}
            </span>
          </div>
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
            Score: <span className="text-[var(--color-text)]">{decision.privacy.score ?? "0.0"}</span>
          </p>
          <p className="text-sm text-[var(--color-neutral-700)]">{decision.privacy.note}</p>
        </article>

        {showCompliance ? (
          <article className={`space-y-3 rounded-xl border border-[var(--color-primary)]/10 ${compact ? "bg-[var(--color-neutral-100)] p-4" : "bg-white p-5 shadow-sm"}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Compliance</span>
              <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${levelBadgeStyles[decision.compliance.level]}`}>
                {getLevelLabel(decision.compliance.level)}
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
              Score: <span className="text-[var(--color-text)]">{decision.compliance.score ?? "0.0"}</span>
            </p>
            <p className="text-sm text-[var(--color-neutral-700)]">{decision.compliance.note}</p>
          </article>
        ) : null}
      </div>

      <div className={`mt-4 flex flex-col items-start justify-between gap-4 rounded-2xl border border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 ${compact ? "p-5" : "p-6"} md:flex-row md:items-center`}>
        <div className="flex items-center gap-4">
          <div
            className={`flex items-center justify-center rounded-full border-4 border-white bg-[var(--color-primary)] font-bold text-white shadow-lg ${
              compact ? "h-14 w-14 text-xl" : "h-16 w-16 text-2xl"
            }`}
          >
            {decision.combinedScore}
          </div>
          <div>
            <h4 className={`${compact ? "text-base" : "text-lg"} font-bold text-[var(--color-text)]`}>Combined Risk Score</h4>
            <p className="text-sm text-[var(--color-neutral-700)]">Weighted average based on assessment modules.</p>
          </div>
        </div>
        <div className="rounded-xl border border-[var(--color-primary)]/10 bg-white px-5 py-3">
          <span className="text-sm font-semibold uppercase tracking-widest text-[var(--color-neutral-600)]">Classification: </span>
          <span className="text-lg font-extrabold text-[var(--color-primary)]">{decision.classification}</span>
        </div>
      </div>
    </article>
  );
}

function getAnswerHref(answer: string) {
  const normalized = answer.trim().replace(/^"|"$/g, "");
  if (!/^https?:\/\//i.test(normalized)) return null;

  try {
    const url = new URL(normalized);
    const isTypeformFileUrl =
      url.protocol === "https:" &&
      url.hostname === "api.typeform.com" &&
      (/^\/forms\/[^/]+\/responses\/[^/]+\/fields\/[^/]+\/files\/.+/i.test(url.pathname) ||
        /^\/responses\/files\/.+/i.test(url.pathname));

    if (isTypeformFileUrl) {
      return `/api/typeform/file?url=${encodeURIComponent(normalized)}`;
    }

    return normalized;
  } catch {
    return null;
  }
}

function getAnswerLinkLabel(answer: string) {
  const normalized = answer.trim().replace(/^"|"$/g, "");

  try {
    const url = new URL(normalized);
    const fileName = decodeURIComponent(url.pathname.split("/").pop() ?? "").trim();
    return fileName || normalized;
  } catch {
    return normalized;
  }
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
  const answerHref = getAnswerHref(answer);
  const answerLinkLabel = getAnswerLinkLabel(answer);

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
          {answerHref ? (
            <a
              href={answerHref}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium leading-relaxed text-[var(--color-primary)] underline-offset-2 hover:underline"
            >
              {answerLinkLabel}
            </a>
          ) : (
            <p className="text-sm font-medium italic leading-relaxed text-[var(--color-neutral-700)]">&quot;{answer}&quot;</p>
          )}
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
            placeholder="Registre observações, evidências e condicionantes para este item."
            className="w-full resize-none rounded-lg border border-[var(--color-primary)]/10 bg-white px-3 py-3 text-sm outline-none"
          />
        </div>
      </div>
    </article>
  );
}

export function EntityDetailView({ kind, basePath, detail, activeTab, activeQuestionnaireSection, saveStatus, jiraErrorStatus, jiraSyncStatus }: EntityDetailViewProps) {
  const backHref = kind === "vendor" ? "/vendors" : "/partners";
  const visibleTabs = kind === "partner" ? partnerTabs : vendorTabs;
  const availableExternalSections = getAvailableExternalSections(kind);
  const questionnaireAnswerCount = detail.questions.length;
  const externalQuestionsBySection = getExternalQuestionsBySection(detail.questions).filter((entry) =>
    availableExternalSections.includes(entry.section),
  );
  const normalizedActiveSection = (
    activeQuestionnaireSection && availableExternalSections.includes(activeQuestionnaireSection as ExternalSection)
      ? activeQuestionnaireSection
      : "Common"
  ) as ExternalSection;
  const supportsSectionFinalObservation =
    kind === "partner" &&
    (normalizedActiveSection === "Compliance" || normalizedActiveSection === "Privacy" || normalizedActiveSection === "Security");
  const selectedExternalSection =
    externalQuestionsBySection.find((entry) => entry.section === normalizedActiveSection) ?? externalQuestionsBySection[0];
  const selectedSectionFinalObservation =
    normalizedActiveSection === "Compliance" || normalizedActiveSection === "Privacy" || normalizedActiveSection === "Security"
      ? detail.externalQuestionnaire.sectionNotes?.[normalizedActiveSection] ?? ""
      : "";
  const activeDecisionSection =
    normalizedActiveSection === "Security"
      ? detail.decision.security
      : normalizedActiveSection === "Privacy"
        ? detail.decision.privacy
        : normalizedActiveSection === "Compliance"
          ? detail.decision.compliance
          : null;
  const selectedSectionItems = selectedExternalSection?.items ?? [];
  const selectedSectionEvaluationSummary = selectedSectionItems.reduce<Record<string, number>>((acc, item) => {
    const key = item.analystEvaluation ?? "NOT_EVALUATED";
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});
  const selectedSectionReviewedCount = selectedSectionItems.filter((item) => (item.analystEvaluation ?? "NOT_EVALUATED") !== "NOT_EVALUATED").length;
  const selectedSectionTopOutcomes = (["FULLY", "PARTIALLY", "DOES_NOT_MEET", "NA", "NOT_EVALUATED"] as const)
    .map((key) => ({
      key,
      label: analystEvaluationSummaryLabels[key],
      count: selectedSectionEvaluationSummary[key] ?? 0,
    }))
    .filter((item) => item.count > 0);

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
                {questionnaireAnswerCount > 0 ? "Questionário recebido" : "Aguardando vinculação"}
              </p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                {kind === "vendor" ? "Formulário selecionado" : "Formulário"}
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-text)]">
                {kind === "vendor"
                  ? detail.externalQuestionnaire.formName ?? detail.externalQuestionnaire.formId ?? "Nenhum formulário selecionado"
                  : detail.externalQuestionnaire.formName ?? detail.externalQuestionnaire.formId ?? "-"}
              </p>
              {kind === "vendor" ? (
                <p className="mt-1 text-xs text-[var(--color-neutral-600)]">
                  Este é o formulário atualmente selecionado para envio ao ponto focal externo.
                </p>
              ) : null}
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Quantidade de questões</p>
              <p className="mt-1 text-2xl font-black text-[var(--color-primary)]">{selectedExternalSection?.items.length ?? 0}</p>
              <p className="mt-1 text-xs text-[var(--color-neutral-600)]">
                Itens prontos para revisão na seção {selectedExternalSection?.section ?? "Common"}.
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between border-t border-[var(--color-neutral-100)] pt-4">
          <div className="flex gap-6 overflow-x-auto">
            {visibleTabs.map((tab) => (
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
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">{kind === "partner" ? "Company Details" : "Detalhes do Ticket"}</h3>
                {kind === "partner" ? (
                  <>
                    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Contact Name</p>
                        <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.contactName}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Jira Ticket</p>
                        {detail.jiraTicket && detail.jiraTicketHref ? (
                          <a
                            href={detail.jiraTicketHref}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex break-words text-sm font-semibold text-[var(--color-primary)] hover:underline"
                          >
                            {detail.jiraTicket}
                          </a>
                        ) : (
                          <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.jiraTicket ?? "-"}</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Phone Number</p>
                        <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.contactPhone}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Email</p>
                        <p className="mt-1 break-all text-sm font-semibold text-[var(--color-text)]">{detail.overview.contactEmail}</p>
                      </div>
                    </div>
                    <p className="mt-8 border-t border-[var(--color-neutral-100)] pt-6 text-sm leading-relaxed text-[var(--color-neutral-700)]">
                      {detail.overview.description}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail do Vendor</p>
                        <p className="mt-1 break-all text-sm font-semibold text-[var(--color-text)]">{detail.overview.vendorEmail ?? "-"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Jira Ticket</p>
                        {detail.jiraTicket && detail.jiraTicketHref ? (
                          <a
                            href={detail.jiraTicketHref}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-1 inline-flex break-words text-sm font-semibold text-[var(--color-primary)] hover:underline"
                          >
                            {detail.jiraTicket}
                          </a>
                        ) : (
                          <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.jiraTicket ?? "-"}</p>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Empresa</p>
                        <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.company ?? "-"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Idioma</p>
                        <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.vendorLanguage ?? "-"}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Website</p>
                        {detail.overview.website && detail.overview.website !== "-" ? (
                          <a className="mt-1 break-all text-sm font-semibold text-[var(--color-primary)] hover:underline" href={`https://${detail.overview.website}`}>
                            {detail.overview.website}
                          </a>
                        ) : (
                          <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">-</p>
                        )}
                      </div>
                    </div>
                    <div className="mt-8 border-t border-[var(--color-neutral-100)] pt-6">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Escopo</p>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--color-neutral-700)]">{detail.overview.scope ?? detail.overview.description}</p>
                    </div>
                  </>
                )}
              </article>

              <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                <h3 className="mb-6 text-lg font-bold text-[var(--color-text)]">Ponto Focal Interno</h3>
                {kind === "vendor" ? (
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Responsável VTEX</p>
                      <p className="mt-1 break-all text-sm font-semibold text-[var(--color-text)]">
                        {detail.overview.vtexResponsibleEmail ?? detail.overview.internalFocalPoint.email}
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Prioridade</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.priority ?? "-"}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">CAP Number</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.capNumber ?? "-"}</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-6 md:grid-cols-5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Nome</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.name}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Cargo</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.role}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Área</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.area}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">E-mail</p>
                      <p className="mt-1 break-all text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.email}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Telefone</p>
                      <p className="mt-1 break-words text-sm font-semibold text-[var(--color-text)]">{detail.overview.internalFocalPoint.phone}</p>
                    </div>
                  </div>
                )}
              </article>

              <DecisionSummaryCard decision={detail.decision} kind={kind} compact />
            </div>

            <aside className="space-y-6 lg:col-span-4">
              {kind === "vendor" ? (
                <VendorExternalQuestionnaireCard
                  entitySlug={detail.id}
                  assessmentId={detail.externalQuestionnaire.assessmentId}
                  recipientEmail={detail.externalQuestionnaire.recipientEmail}
                  currentFormId={detail.externalQuestionnaire.formId}
                  forms={detail.externalQuestionnaire.availableForms ?? []}
                />
              ) : null}

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
              description="Visualize as respostas recebidas do ponto focal interno e centralize as anotações da análise em um layout de revisão mais estruturado."
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
                      A solicitação foi identificada, mas ainda não há respostas preenchidas para análise.
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
                    {internalQuestionnaire.questions.length} respostas carregadas para a revisão interna.
                  </p>
                </section>
              </aside>
            </div>
          </section>
            );
          })()
        ) : (
          <section className="rounded-xl border border-[var(--color-neutral-200)] bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-bold text-[var(--color-text)]">Mini questionário interno não encontrado</p>
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
            title="Questionário Externo"
            description={
              kind === "partner"
                ? "Centralize as respostas recebidas do parceiro em um fluxo de revisão visual, com contexto da fonte, resposta original e espaço reservado para a avaliação do analista."
                : "Centralize as respostas recebidas do vendor em um fluxo de revisão visual, com contexto da fonte, resposta original e espaço reservado para a avaliação do analista."
            }
            sectionOptions={availableExternalSections}
            selectedSection={selectedExternalSection?.section}
            sectionHrefBuilder={(section) => `${basePath}?tab=external_questionnaire&section=${section}`}
          />

          <div className="space-y-6">
            <div className="space-y-6">
              {questionnaireAnswerCount > 0 ? (
                selectedExternalSection?.section === "Common" ? (
                  <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-[var(--color-text)]">Informações Gerais do Parceiro</h3>
                        <p className="mt-1 text-sm text-[var(--color-neutral-600)]">
                          Esta seção é apenas informativa e reúne as respostas enviadas no bloco Common do formulário.
                        </p>
                      </div>
                      <span className="rounded-full bg-[var(--color-primary)]/8 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--color-primary)]">
                        {selectedExternalSection.items.length} itens
                      </span>
                    </div>

                    <div className="mt-6 space-y-4">
                      {selectedExternalSection.items.map((item, index) => (
                        <div
                          key={`external-common-${index}-${item.domain}-${item.question}`}
                          className="rounded-xl border border-[var(--color-neutral-200)] bg-[var(--color-neutral-100)]/50 p-4"
                        >
                          <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                            Questão {String(index + 1).padStart(2, "0")}
                          </p>
                          <p className="mt-2 text-sm font-semibold leading-relaxed text-[var(--color-text)]">{item.question}</p>
                          <p className="mt-3 rounded-lg border-l-4 border-[var(--color-primary)]/25 bg-white p-3 text-sm leading-relaxed text-[var(--color-neutral-700)]">
                            {item.answer}
                          </p>
                        </div>
                      ))}
                    </div>
                  </article>
                ) : (
                  <form action={savePartnerExternalQuestionnaireSection} className="space-y-6">
                    <input type="hidden" name="entity_slug" value={detail.id} />
                    <input type="hidden" name="assessment_id" value={detail.externalQuestionnaire.assessmentId ?? ""} />
                    <input type="hidden" name="response_table" value={detail.externalQuestionnaire.responseTable ?? ""} />
                    <input type="hidden" name="jira_issue_key" value={detail.jiraTicket ?? ""} />
                    <input type="hidden" name="active_tab" value="external_questionnaire" />
                    <input type="hidden" name="active_section" value={selectedExternalSection?.section ?? "Common"} />
                    {saveStatus === "1" ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        Avaliações salvas com sucesso.
                      </div>
                    ) : null}
                    {jiraSyncStatus === "1" ? (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                        Comentário interno enviado ao Jira com sucesso.
                      </div>
                    ) : null}
                    {jiraErrorStatus === "1" ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">
                        As avaliações foram salvas, mas não foi possível replicar a observação interna no Jira para este ticket.
                      </div>
                    ) : null}
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
                      <div className={supportsSectionFinalObservation ? "space-y-6 xl:col-span-8" : "space-y-6 xl:col-span-12"}>
                        {(selectedExternalSection?.items ?? []).map((item, index) => (
                          <QuestionnaireResponseCard
                            key={`external-${selectedExternalSection?.section}-${index}-${item.domain}-${item.question}`}
                            cardKey={`external-${selectedExternalSection?.section}-${index}`}
                            badge={`Question ${String(index + 1).padStart(2, "0")} • ${getQuestionCategoryLabel(item.domain, index)}`}
                            sourceLabel={getQuestionSourceLabel(item.source ?? "database")}
                            question={item.question}
                            answer={item.answer}
                            answerLabel={kind === "partner" ? "Partner Response" : "Vendor Response"}
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
                            name="submit_intent"
                            value="save_section"
                            className="rounded-lg bg-[var(--color-primary)] px-6 py-3 text-sm font-bold text-white shadow-lg shadow-[var(--color-primary)]/20 transition hover:brightness-95"
                          >
                            Salvar avaliações de {selectedExternalSection?.section ?? "Common"}
                          </button>
                        </div>
                      </div>

                      {supportsSectionFinalObservation ? (
                        <aside className="xl:col-span-4">
                          <div className="rounded-2xl border border-[var(--color-primary)]/10 bg-white shadow-sm xl:sticky xl:top-4">
                            <div className="flex flex-col">
                              <div className="space-y-5 p-5 xl:max-h-[calc(100vh-12rem)] xl:overflow-y-auto xl:pr-4">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                                      Observação final da aba
                                    </p>
                                    <h3 className="mt-2 text-lg font-bold text-[var(--color-text)]">
                                      {normalizedActiveSection} Final Observation
                                    </h3>
                                  </div>
                                  <span className="rounded-full bg-[var(--color-primary)]/8 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-[var(--color-primary)]">
                                    {normalizedActiveSection}
                                  </span>
                                </div>

                                <p className="text-sm leading-relaxed text-[var(--color-neutral-600)]">
                                  Use este campo para registrar a conclusão consolidada da aba selecionada, com contexto, ressalvas e próximos passos.
                                </p>

                                <section className="rounded-2xl border border-[var(--color-primary)]/10 bg-[var(--color-neutral-100)]/35 p-4">
                                  <div className="flex items-center justify-between gap-3">
                                    <div>
                                      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">
                                        Resultado da análise
                                      </p>
                                      <h4 className="mt-1 text-base font-bold text-[var(--color-text)]">
                                        Resumo de {normalizedActiveSection}
                                      </h4>
                                    </div>
                                    {activeDecisionSection ? (
                                      <span className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider ${levelBadgeStyles[activeDecisionSection.level]}`}>
                                        {activeDecisionSection.level}
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="mt-4 grid grid-cols-2 gap-3">
                                    <div className="rounded-xl bg-white px-3 py-3">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Score da seção</p>
                                      <p className="mt-1 text-xl font-black text-[var(--color-text)]">{activeDecisionSection?.score ?? "-"}</p>
                                    </div>
                                    <div className="rounded-xl bg-white px-3 py-3">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Questões avaliadas</p>
                                      <p className="mt-1 text-xl font-black text-[var(--color-text)]">
                                        {selectedSectionReviewedCount}/{selectedSectionItems.length}
                                      </p>
                                    </div>
                                  </div>

                                  <div className="mt-4 rounded-xl bg-white p-3">
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Distribuição das avaliações</p>
                                    <div className="mt-3 space-y-2">
                                      {selectedSectionTopOutcomes.length > 0 ? (
                                        selectedSectionTopOutcomes.map((item) => (
                                          <div key={item.key} className="flex items-center justify-between gap-3 text-sm">
                                            <span className="text-[var(--color-neutral-700)]">{item.label}</span>
                                            <span className="rounded-full bg-[var(--color-primary)]/8 px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]">
                                              {item.count}
                                            </span>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="text-sm text-[var(--color-neutral-600)]">Nenhuma avaliação registrada nesta aba ainda.</p>
                                      )}
                                    </div>
                                  </div>

                                  {activeDecisionSection?.note ? (
                                    <div className="mt-4 rounded-xl border border-[var(--color-primary)]/10 bg-white p-3">
                                      <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-neutral-600)]">Resultado encontrado</p>
                                      <p className="mt-2 text-sm leading-relaxed text-[var(--color-neutral-700)]">{activeDecisionSection.note}</p>
                                    </div>
                                  ) : null}
                                </section>

                                <div>
                                  <label
                                    className="mb-2 block text-xs font-bold uppercase tracking-wider text-[var(--color-neutral-600)]"
                                    htmlFor="section-final-observation"
                                  >
                                    Observação final
                                  </label>
                                  <textarea
                                    id="section-final-observation"
                                    name="section_final_observation"
                                    rows={8}
                                    defaultValue={selectedSectionFinalObservation}
                                    placeholder={`Registre a observação final de ${normalizedActiveSection.toLowerCase()} desta avaliação.`}
                                    className="w-full resize-none rounded-xl border border-[var(--color-primary)]/10 bg-[var(--color-neutral-100)]/30 px-4 py-3 text-sm outline-none transition focus:border-[var(--color-primary)]/30 focus:ring-2 focus:ring-[var(--color-primary)]/10"
                                  />
                                </div>
                              </div>

                              <div className="space-y-3 border-t border-[var(--color-primary)]/10 bg-white px-5 pb-5 pt-4">
                              <button
                                type="submit"
                                name="submit_intent"
                                value="finalize_review"
                                className="w-full rounded-xl bg-[var(--color-text)] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:opacity-95"
                              >
                                Finalizar revisão
                              </button>
                              <p className="text-xs leading-relaxed text-[var(--color-neutral-600)]">
                                Salva as avaliações e a observação final desta aba antes de abrir a etapa de decisão.
                              </p>
                              </div>
                            </div>
                          </div>
                        </aside>
                      ) : null}
                    </div>
                  </form>
                )
              ) : (
                <article className="rounded-xl border border-[var(--color-primary)]/10 bg-white p-10 text-center shadow-sm">
                  <p className="text-lg font-bold text-[var(--color-text)]">Questionário externo ainda não encontrado</p>
                  <p className="mt-2 text-sm text-[var(--color-neutral-600)]">
                    Nenhuma resposta do Typeform foi vinculada a esta entidade até o momento.
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

          <DecisionSummaryCard decision={detail.decision} kind={kind} />

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
