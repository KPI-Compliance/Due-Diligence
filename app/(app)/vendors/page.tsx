import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getVendorsList } from "@/lib/data";

export const dynamic = "force-dynamic";
const MAX_VENDOR_ROWS = 25;
const CURRENT_TIMESTAMP = Date.now();

function renderWorkflowBadge(label: string) {
  const normalized = label.toLowerCase();
  const className =
    normalized === "reviewed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "responded"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : normalized === "sent"
          ? "border-amber-200 bg-amber-50 text-amber-700"
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

export default async function VendorsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    vendor?: string;
    initial_questionnaire?: string;
    main_questionnaire?: string;
    risk_level?: string;
    owner?: string;
    date_range?: string;
    updated?: string;
  }>;
}) {
  const vendors = await getVendorsList();
  const params = searchParams ? await searchParams : undefined;
  const vendorQuery = (params?.vendor ?? "").trim().toLowerCase();
  const initialQuestionnaire = (params?.initial_questionnaire ?? "All").trim();
  const mainQuestionnaire = (params?.main_questionnaire ?? "All").trim();
  const riskLevel = (params?.risk_level ?? "All Risks").trim();
  const owner = (params?.owner ?? "All Owners").trim();
  const dateRange = (params?.date_range ?? "All Periods").trim();

  const ownerOptions = ["All Owners", ...Array.from(new Set(vendors.map((item) => item.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  const filters = [
    {
      name: "vendor",
      label: "Vendor",
      kind: "text" as const,
      placeholder: "Filtrar por vendor ou ticket",
      value: params?.vendor ?? "",
    },
    {
      name: "initial_questionnaire",
      label: "Questionário Inicial",
      kind: "select" as const,
      options: ["All", "Pending", "Sent", "Responded", "Reviewed"],
      value: initialQuestionnaire,
    },
    {
      name: "main_questionnaire",
      label: "Questionário Principal",
      kind: "select" as const,
      options: ["All", "Pending", "Responded", "Reviewed"],
      value: mainQuestionnaire,
    },
    {
      name: "risk_level",
      label: "Nível de Risco",
      kind: "select" as const,
      options: ["All Risks", "Pending", "Low", "Medium", "High", "Critical"],
      value: riskLevel,
    },
    {
      name: "owner",
      label: "Responsável",
      kind: "select" as const,
      options: ownerOptions,
      value: owner,
    },
    {
      name: "date_range",
      label: "Período",
      kind: "select" as const,
      options: ["All Periods", "Last 30 Days", "Last 90 Days", "Last 180 Days", "Last 365 Days"],
      value: dateRange,
      className: "sm:max-w-[220px]",
    },
  ];

  const dateRangeMap: Record<string, number | null> = {
    "All Periods": null,
    "Last 30 Days": 30,
    "Last 90 Days": 90,
    "Last 180 Days": 180,
    "Last 365 Days": 365,
  };

  const filteredVendors = vendors.filter((item) => {
    const matchesVendor =
      vendorQuery.length === 0 ||
      item.company.toLowerCase().includes(vendorQuery) ||
      (item.jiraTicket ?? "").toLowerCase().includes(vendorQuery);

    const matchesInitialQuestionnaire =
      initialQuestionnaire === "All" || item.intakeStatus === initialQuestionnaire;

    const matchesMainQuestionnaire =
      mainQuestionnaire === "All" || item.principalQuestionnaireStatus === mainQuestionnaire;

    const matchesRiskLevel =
      riskLevel === "All Risks" || item.risk === riskLevel;

    const matchesOwner =
      owner === "All Owners" || item.owner === owner;

    const selectedRangeInDays = dateRangeMap[dateRange] ?? null;
    const referenceTimestamp = item.referenceDate ? new Date(item.referenceDate).getTime() : Number.NaN;
    const matchesDateRange =
      selectedRangeInDays === null ||
      (Number.isFinite(referenceTimestamp) && CURRENT_TIMESTAMP - referenceTimestamp <= selectedRangeInDays * 24 * 60 * 60 * 1000);

    return (
      matchesVendor &&
      matchesInitialQuestionnaire &&
      matchesMainQuestionnaire &&
      matchesRiskLevel &&
      matchesOwner &&
      matchesDateRange
    );
  });

  const visibleVendors = filteredVendors.slice(0, MAX_VENDOR_ROWS);

  return (
    <div className="space-y-4">
      <EntityWorkspace
        title="Vendors"
        description="Centralize vendors e acompanhe o intake inicial, o questionário principal e o risco final por Privacy e Security."
        actionLabel="New Vendor"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Jira Ticket",
          "Empresa",
          "Segment",
          "Questionário Inicial",
          "Questionário Principal",
          "Redteam",
          "Risco Final",
          "Última Revisão",
        ]}
        tableFooterText={
          filteredVendors.length === 0
            ? "Nenhum vendor encontrado com os filtros aplicados"
            : `Mostrando ${visibleVendors.length} de ${filteredVendors.length} vendors`
        }
        summary={[
          {
            label: "Initial Pending",
            value: filteredVendors.filter((v) => v.intakeStatus === "Pending").length.toString(),
            note: "Vendors aguardando o primeiro questionário",
            tone: "primary",
          },
          {
            label: "Main Reviewed",
            value: filteredVendors.filter((v) => v.principalQuestionnaireStatus === "Reviewed").length.toString(),
            note: "Questionário principal revisado por Privacy e Security",
            tone: "success",
          },
          {
            label: "Critical",
            value: filteredVendors.filter((v) => v.risk === "Critical").length.toString(),
            note: "Maior risco final entre Privacy e Security",
            tone: "danger",
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
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]"><Link href={`/vendors/${item.id}`} className="block">{item.companyGroup}</Link></td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]"><Link href={`/vendors/${item.id}`} className="block">{item.segment}</Link></td>
            <td className="px-6 py-4"><Link href={`/vendors/${item.id}`} className="block">{renderWorkflowBadge(item.intakeStatus)}</Link></td>
            <td className="px-6 py-4"><Link href={`/vendors/${item.id}`} className="block">{renderWorkflowBadge(item.principalQuestionnaireStatus)}</Link></td>
            <td className="px-6 py-4"><Link href={`/vendors/${item.id}`} className="block">{renderTechnicalReviewBadge(item.technicalReviewStatus)}</Link></td>
            <td className="px-6 py-4">
              <Link href={`/vendors/${item.id}`} className="block space-y-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                  <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                  {item.risk}
                </span>
                <p className="text-[11px] text-[var(--color-neutral-600)]">
                  Privacy: {item.privacyRisk ?? "-"} | Security: {item.securityRisk ?? "-"}
                </p>
              </Link>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/vendors/${item.id}`} className="block">{item.lastReview}</Link></td>
          </tr>
        ))}
      />
    </div>
  );
}
