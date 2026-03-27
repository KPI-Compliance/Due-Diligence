import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getPartnersList } from "@/lib/data";

export const dynamic = "force-dynamic";
const MAX_PARTNER_ROWS = 20;

function renderAssessmentBadge(label: string) {
  const normalized = label.toLowerCase();
  const className =
    normalized === "completed"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : normalized === "in review"
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

function renderSectionRiskBadge(label: string | null) {
  const value = label?.trim() || "Pending";
  const normalized = value.toLowerCase();
  const className =
    normalized === "critical"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : normalized === "high"
        ? "border-red-200 bg-red-50 text-red-700"
        : normalized === "medium" || normalized === "moderate"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : normalized === "low"
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-100 text-slate-700";

  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold ${className}`}>{value}</span>;
}

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    partner?: string;
    partner_stage?: string;
    assessment_status?: string;
    risk_level?: string;
    owner?: string;
    updated?: string;
  }>;
}) {
  const partners = await getPartnersList();
  const params = searchParams ? await searchParams : undefined;
  const partnerQuery = (params?.partner ?? "").trim().toLowerCase();
  const partnerStage = (params?.partner_stage ?? "ALL").trim().toUpperCase();
  const assessmentStatus = (params?.assessment_status ?? "All").trim();
  const riskLevel = (params?.risk_level ?? "All Risks").trim();
  const owner = (params?.owner ?? "All Owners").trim();

  const ownerOptions = ["All Owners", ...Array.from(new Set(partners.map((item) => item.owner).filter(Boolean))).sort((a, b) => a.localeCompare(b))];

  const filters = [
    {
      name: "partner",
      label: "Partner",
      kind: "text" as const,
      placeholder: "Filter by partner name",
      value: params?.partner ?? "",
    },
    {
      name: "assessment_status",
      label: "Assessment Status",
      kind: "select" as const,
      options: ["All", "Pending", "In Review", "Completed"],
      value: assessmentStatus,
    },
    {
      name: "risk_level",
      label: "Risk Level",
      kind: "select" as const,
      options: ["All Risks", "Pending", "Low", "Medium", "High", "Critical"],
      value: riskLevel,
    },
    {
      name: "owner",
      label: "Owner",
      kind: "select" as const,
      options: ownerOptions,
      value: owner,
    },
  ];

  const scopedPartners = partners.filter((item) => {
    const matchesPartner =
      partnerQuery.length === 0 ||
      item.company.toLowerCase().includes(partnerQuery) ||
      (item.jiraTicket ?? "").toLowerCase().includes(partnerQuery);

    const matchesAssessmentStatus =
      assessmentStatus === "All" || item.assessmentStatus === assessmentStatus;

    const matchesRiskLevel =
      riskLevel === "All Risks" || item.risk === riskLevel;

    const matchesOwner =
      owner === "All Owners" || item.owner === owner;

    return matchesPartner && matchesAssessmentStatus && matchesRiskLevel && matchesOwner;
  });

  const filteredPartners = scopedPartners.filter((item) => {
    if (partnerStage === "ALL") return true;
    if (partnerStage === "PENDING") return item.assessmentStatus === "Pending";
    if (partnerStage === "IN_REVIEW") return item.assessmentStatus === "In Review";
    if (partnerStage === "COMPLETED") return item.assessmentStatus === "Completed";
    if (partnerStage === "CRITICAL") return item.risk === "Critical";
    return true;
  });

  const statusSummary = scopedPartners.reduce(
    (acc, item) => {
      if (item.assessmentStatus === "Pending") acc.pending += 1;
      if (item.assessmentStatus === "In Review") acc.inReview += 1;
      if (item.assessmentStatus === "Completed") acc.completed += 1;
      if (item.risk === "Critical") acc.critical += 1;
      return acc;
    },
    { pending: 0, inReview: 0, completed: 0, critical: 0 },
  );

  const visiblePartners = filteredPartners.slice(0, MAX_PARTNER_ROWS);
  const buildStageHref = (stage: "PENDING" | "IN_REVIEW" | "COMPLETED" | "CRITICAL") => {
    const query = new URLSearchParams();
    if (params?.partner?.trim()) query.set("partner", params.partner.trim());
    if (params?.owner?.trim() && params.owner.trim() !== "All Owners") {
      query.set("owner", params.owner.trim());
    }
    query.set("partner_stage", stage);
    return `/partners?${query.toString()}`;
  };

  return (
    <div className="space-y-4">
      <EntityWorkspace
        title="Partners"
        description="Acompanhe partners pela etapa da análise e pelo resultado final consolidado de Privacy, Security e Compliance."
        actionLabel="New Partner"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Jira Ticket",
          "Jira Status",
          "Empresa",
          "Assessment Status",
          "Redteam",
          "Final Risk",
          "Last Review",
          "DT criação jira",
        ]}
        tableFooterText={`Showing 1 to ${visiblePartners.length} of ${filteredPartners.length} partners`}
        summary={[
          {
            label: "Pendentes",
            value: statusSummary.pending.toString(),
            note: "Partners aguardando avanço da avaliação",
            tone: "primary",
            href: buildStageHref("PENDING"),
            active: partnerStage === "PENDING",
          },
          {
            label: "Em Revisão",
            value: statusSummary.inReview.toString(),
            note: "Questionários recebidos em etapa de análise",
            tone: "success",
            href: buildStageHref("IN_REVIEW"),
            active: partnerStage === "IN_REVIEW",
          },
          {
            label: "Finalizados",
            value: statusSummary.completed.toString(),
            note: "Partners com análise encerrada",
            tone: "success",
            href: buildStageHref("COMPLETED"),
            active: partnerStage === "COMPLETED",
          },
          {
            label: "Críticos",
            value: statusSummary.critical.toString(),
            note: "Risco final consolidado entre as 3 areas",
            tone: "danger",
            href: buildStageHref("CRITICAL"),
            active: partnerStage === "CRITICAL",
          },
        ]}
        rows={visiblePartners.map((item) => (
          <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
            <td className="px-6 py-4">
              <Link href={`/partners/${item.id}`} className="block">
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
            <td className="px-6 py-4 text-sm font-semibold text-[var(--color-secondary)]"><Link href={`/partners/${item.id}`} className="block">{item.jiraTicket ?? "-"}</Link></td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]"><Link href={`/partners/${item.id}`} className="block">{item.jiraStatus}</Link></td>
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]"><Link href={`/partners/${item.id}`} className="block">{item.companyGroup}</Link></td>
            <td className="px-6 py-4"><Link href={`/partners/${item.id}`} className="block">{renderAssessmentBadge(item.assessmentStatus)}</Link></td>
            <td className="px-6 py-4"><Link href={`/partners/${item.id}`} className="block">{renderTechnicalReviewBadge(item.technicalReviewStatus)}</Link></td>
            <td className="px-6 py-4">
              <Link href={`/partners/${item.id}`} className="block space-y-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                  <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                  {item.risk}
                </span>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-neutral-700)]">
                  <span className="min-w-[64px] font-semibold text-[var(--color-neutral-600)]">Privacy:</span>
                  {renderSectionRiskBadge(item.privacyRisk)}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-neutral-700)]">
                  <span className="min-w-[64px] font-semibold text-[var(--color-neutral-600)]">Security:</span>
                  {renderSectionRiskBadge(item.securityRisk)}
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-neutral-700)]">
                  <span className="min-w-[64px] font-semibold text-[var(--color-neutral-600)]">Compliance:</span>
                  {renderSectionRiskBadge(item.complianceRisk)}
                </div>
              </Link>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/partners/${item.id}`} className="block">{item.lastReview}</Link></td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/partners/${item.id}`} className="block">{item.jiraCreatedAt}</Link></td>
          </tr>
        ))}
      />
    </div>
  );
}
