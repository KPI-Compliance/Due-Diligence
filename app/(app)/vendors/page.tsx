import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getVendorsList } from "@/lib/data";

export const dynamic = "force-dynamic";
const MAX_VENDOR_ROWS = 20;
const INTAKE_STATUS_ORDER = ["Pending", "Sent", "Responded", "Reviewed"] as const;
const MAIN_QUESTIONNAIRE_STATUS_ORDER = ["Pending", "Responded", "Reviewed"] as const;
const RISK_LEVEL_ORDER = ["Waiting vendor", "Pending Review", "Low", "Moderate", "High", "Extreme"] as const;
const JIRA_STATUS_ORDER = ["Opened", "Waiting vendor", "Received Quest.", "Red Team", "Concluido"] as const;

function buildOrderedOptions(values: string[], preferredOrder: readonly string[]) {
  const uniqueValues = Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
  const preferred = preferredOrder.filter((option) => uniqueValues.includes(option));
  const remaining = uniqueValues
    .filter((option) => !preferredOrder.includes(option))
    .sort((a, b) => a.localeCompare(b));
  return [...preferred, ...remaining];
}

function renderJiraStatusBadge(label: string) {
  const normalized = label.trim().toLowerCase();
  const className =
    normalized === "opened" || normalized === "open"
      ? "border-amber-200 bg-amber-50 text-amber-700"
      : normalized === "waiting vendor"
        ? "border-orange-200 bg-orange-50 text-orange-700"
        : normalized === "received quest." || normalized === "received quest" || normalized === "responded"
          ? "border-sky-200 bg-sky-50 text-sky-700"
          : normalized === "red team" || normalized.includes("review")
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : normalized === "concluido" || normalized === "concluído" || normalized === "completed"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function renderTechnicalReviewBadge(label: string) {
  const className =
    label === "Sent"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function renderInternalQuestionnaireBadge(label: string) {
  const className =
    label === "Sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function renderFinalRiskBadge(label: string) {
  const normalized = label.trim().toLowerCase();
  const className =
    normalized === "waiting vendor"
      ? "border-orange-200 bg-orange-50 text-orange-700"
      : normalized.includes("pending")
      ? "border-slate-200 bg-slate-100 text-slate-700"
      : normalized.includes("low")
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : normalized.includes("moderate") || normalized.includes("medium")
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : normalized.includes("high")
            ? "border-red-200 bg-red-50 text-red-700"
            : normalized.includes("extreme") || normalized.includes("critical")
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${className}`}>{label}</span>;
}

function normalizeSectionRiskValue(label: string | null | undefined) {
  const value = (label ?? "").trim();
  return value.length > 0 ? value : "-";
}

function renderSectionRiskLine(
  sectionLabel: "Privacy" | "Security",
  label: string | null | undefined,
  jiraStatus: string,
) {
  const value = normalizeSectionRiskValue(label);
  const isConcluded = jiraStatus.trim().toLowerCase() === "concluido";
  const highlightPending = value === "-" && !isConcluded;
  const toneClassName =
    highlightPending
      ? "text-[var(--color-primary)]"
      : "text-[var(--color-neutral-600)]";

  return (
    <p className={`text-[11px] ${toneClassName}`}>
      <span className="font-semibold">{sectionLabel}:</span>{" "}
      <span className={highlightPending ? "font-semibold" : "text-[var(--color-neutral-700)]"}>{value}</span>
    </p>
  );
}

function normalizeJiraStatusStage(label: string) {
  const normalized = label.trim().toLowerCase();

  if (normalized === "opened" || normalized === "open") return "OPEN";
  if (normalized === "waiting vendor") return "WAITING_RESPONSE";
  if (normalized === "received quest." || normalized === "received quest" || normalized === "responded") return "RESPONDED";
  if (normalized === "concluido" || normalized === "concluído" || normalized === "completed" || normalized === "done") {
    return "FINALIZED";
  }

  return "OPEN";
}

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    vendor?: string;
    ticket_stage?: string;
    jira_status?: string;
    initial_questionnaire?: string;
    main_questionnaire?: string;
    risk_level?: string;
    company_group?: string;
    updated?: string;
  }>;
}) {
  const vendors = await getVendorsList();
  const params = searchParams ? await searchParams : undefined;
  const vendorQuery = (params?.vendor ?? "").trim().toLowerCase();
  const ticketStage = (params?.ticket_stage ?? "ALL").trim().toUpperCase();
  const jiraStatus = (params?.jira_status ?? "All").trim();
  const initialQuestionnaire = (params?.initial_questionnaire ?? "All").trim();
  const mainQuestionnaire = (params?.main_questionnaire ?? "All").trim();
  const riskLevel = (params?.risk_level ?? "All Risks").trim();
  const companyGroup = (params?.company_group ?? "Todos").trim();

  const jiraStatusOptions = ["All", ...buildOrderedOptions(vendors.map((item) => item.jiraStatus), JIRA_STATUS_ORDER)];
  const initialQuestionnaireOptions = ["All", ...buildOrderedOptions(vendors.map((item) => item.intakeStatus), INTAKE_STATUS_ORDER)];
  const mainQuestionnaireOptions = [
    "All",
    ...buildOrderedOptions(vendors.map((item) => item.principalQuestionnaireStatus), MAIN_QUESTIONNAIRE_STATUS_ORDER),
  ];
  const riskLevelOptions = ["All Risks", ...buildOrderedOptions(vendors.map((item) => item.risk), RISK_LEVEL_ORDER)];
  const companyGroupOptions = ["Todos", ...Array.from(new Set(vendors.map((item) => item.companyGroup).filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  const filters = [
    {
      name: "vendor",
      label: "Vendor",
      kind: "text" as const,
      placeholder: "Filtrar por vendor ou ticket",
      value: params?.vendor ?? "",
    },
    {
      name: "jira_status",
      label: "Jira Status",
      kind: "select" as const,
      options: jiraStatusOptions,
      value: jiraStatus,
    },
    {
      name: "initial_questionnaire",
      label: "Questionário Inicial",
      kind: "select" as const,
      options: initialQuestionnaireOptions,
      value: initialQuestionnaire,
    },
    {
      name: "main_questionnaire",
      label: "Questionário Principal",
      kind: "select" as const,
      options: mainQuestionnaireOptions,
      value: mainQuestionnaire,
    },
    {
      name: "risk_level",
      label: "Nível de Risco",
      kind: "select" as const,
      options: riskLevelOptions,
      value: riskLevel,
    },
    {
      name: "company_group",
      label: "Grupo empresarial",
      kind: "select" as const,
      options: companyGroupOptions,
      value: companyGroup,
    },
  ];

  const scopedVendors = vendors.filter((item) => {
    const matchesVendor =
      vendorQuery.length === 0 ||
      item.company.toLowerCase().includes(vendorQuery) ||
      (item.jiraTicket ?? "").toLowerCase().includes(vendorQuery);

    const matchesJiraStatus =
      jiraStatus === "All" || item.jiraStatus === jiraStatus;

    const matchesInitialQuestionnaire =
      initialQuestionnaire === "All" || item.intakeStatus === initialQuestionnaire;

    const matchesMainQuestionnaire =
      mainQuestionnaire === "All" || item.principalQuestionnaireStatus === mainQuestionnaire;

    const matchesRiskLevel =
      riskLevel === "All Risks" || item.risk === riskLevel;

    const matchesCompanyGroup =
      companyGroup === "Todos" || item.companyGroup === companyGroup;

    return (
      matchesVendor &&
      matchesJiraStatus &&
      matchesInitialQuestionnaire &&
      matchesMainQuestionnaire &&
      matchesRiskLevel &&
      matchesCompanyGroup
    );
  });

  const filteredVendors = scopedVendors.filter((item) => {
    if (ticketStage === "ALL") return true;
    return normalizeJiraStatusStage(item.jiraStatus) === ticketStage;
  });

  const statusSummary = scopedVendors.reduce(
    (acc, item) => {
      const stage = normalizeJiraStatusStage(item.jiraStatus);
      if (stage === "OPEN") acc.open += 1;
      if (stage === "WAITING_RESPONSE") acc.waitingResponse += 1;
      if (stage === "RESPONDED") acc.responded += 1;
      if (stage === "FINALIZED") acc.finalized += 1;
      return acc;
    },
    { open: 0, waitingResponse: 0, responded: 0, finalized: 0 },
  );

  const visibleVendors = filteredVendors.slice(0, MAX_VENDOR_ROWS);
  const buildStageHref = (stage: "OPEN" | "WAITING_RESPONSE" | "RESPONDED" | "FINALIZED") => {
    const query = new URLSearchParams();
    if (params?.vendor?.trim()) query.set("vendor", params.vendor.trim());
    if (params?.initial_questionnaire?.trim() && params.initial_questionnaire.trim() !== "All") {
      query.set("initial_questionnaire", params.initial_questionnaire.trim());
    }
    if (params?.main_questionnaire?.trim() && params.main_questionnaire.trim() !== "All") {
      query.set("main_questionnaire", params.main_questionnaire.trim());
    }
    if (params?.risk_level?.trim() && params.risk_level.trim() !== "All Risks") query.set("risk_level", params.risk_level.trim());
    if (params?.company_group?.trim() && params.company_group.trim() !== "Todos") query.set("company_group", params.company_group.trim());
    query.set("ticket_stage", stage);
    return `/vendors?${query.toString()}`;
  };

  return (
    <div className="space-y-4">
      <EntityWorkspace
        title="Vendors"
        description="Centralize vendors e acompanhe o intake inicial, o questionário principal e o risco final por Privacy e Security."
        actionLabel="New Vendor"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Fornecedor",
          "Chamado Jira",
          "Jira Status",
          "Grupo Empresarial",
          "Triagem Interna",
          "Red Team",
          "Risco Final",
          "Última Revisão",
          "DT criação jira",
        ]}
        tableFooterText={
          filteredVendors.length === 0
            ? "Nenhum vendor encontrado com os filtros aplicados"
            : `Mostrando ${visibleVendors.length} de ${filteredVendors.length} vendors`
        }
        summary={[
          {
            label: "Tickets Em Aberto",
            value: statusSummary.open.toString(),
            note: "Cards que ainda não entraram em retorno de questionário",
            tone: "primary",
            href: buildStageHref("OPEN"),
            active: ticketStage === "OPEN",
          },
          {
            label: "Aguardando Resposta",
            value: statusSummary.waitingResponse.toString(),
            note: "Questionário enviado e aguardando retorno do vendor",
            tone: "success",
            href: buildStageHref("WAITING_RESPONSE"),
            active: ticketStage === "WAITING_RESPONSE",
          },
          {
            label: "Respondidos",
            value: statusSummary.responded.toString(),
            note: "Questionário recebido e disponível para análise",
            tone: "primary",
            href: buildStageHref("RESPONDED"),
            active: ticketStage === "RESPONDED",
          },
          {
            label: "Finalizados",
            value: statusSummary.finalized.toString(),
            note: "Tickets encerrados com decisão concluída",
            tone: "danger",
            href: buildStageHref("FINALIZED"),
            active: ticketStage === "FINALIZED",
          },
        ]}
        rows={visibleVendors.map((item) => (
          <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
            <td className="px-6 py-4">
              <Link href={`/vendors/${item.id}`} className="block">
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                    {item.company[0]}
                  </div>
                  <div>
                    <span className="text-sm font-bold text-[var(--color-text)] hover:text-[var(--color-primary)]">{item.company}</span>
                    <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
                  </div>
                </div>
              </Link>
            </td>
            <td className="px-6 py-4 text-sm font-semibold text-[var(--color-secondary)]">
              <Link href={`/vendors/${item.id}`} className="block">{item.jiraTicket ?? "-"}</Link>
            </td>
            <td className="px-6 py-4">
              <Link href={`/vendors/${item.id}`} className="block">
                {renderJiraStatusBadge(item.jiraStatus)}
              </Link>
            </td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]"><Link href={`/vendors/${item.id}`} className="block">{item.companyGroup}</Link></td>
            <td className="px-6 py-4"><Link href={`/vendors/${item.id}`} className="block">{renderInternalQuestionnaireBadge(item.internalQuestionnaireStatus)}</Link></td>
            <td className="px-6 py-4"><Link href={`/vendors/${item.id}`} className="block">{renderTechnicalReviewBadge(item.technicalReviewStatus)}</Link></td>
            <td className="px-6 py-4">
              <Link href={`/vendors/${item.id}`} className="block space-y-1">
                {renderFinalRiskBadge(item.risk)}
                {renderSectionRiskLine("Privacy", item.privacyRisk, item.jiraStatus)}
                {renderSectionRiskLine("Security", item.securityRisk, item.jiraStatus)}
              </Link>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/vendors/${item.id}`} className="block">{item.lastReview}</Link></td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/vendors/${item.id}`} className="block">{item.jiraCreatedAt}</Link></td>
          </tr>
        ))}
      />
    </div>
  );
}
