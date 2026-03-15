import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getPartnersList } from "@/lib/data";

export const dynamic = "force-dynamic";
const MAX_PARTNER_ROWS = 25;

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

export default async function PartnersPage({
  searchParams,
}: {
  searchParams?: Promise<{
    partner?: string;
    assessment_status?: string;
    risk_level?: string;
    owner?: string;
    updated?: string;
  }>;
}) {
  const partners = await getPartnersList();
  const params = searchParams ? await searchParams : undefined;
  const partnerQuery = (params?.partner ?? "").trim().toLowerCase();
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

  const filteredPartners = partners.filter((item) => {
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

  const visiblePartners = filteredPartners.slice(0, MAX_PARTNER_ROWS);

  return (
    <div className="space-y-4">
      <EntityWorkspace
        title="Partners"
        description="Acompanhe partners pela etapa da analise e pelo resultado final consolidado de Privacy, Security e Compliance."
        actionLabel="New Partner"
        secondaryActionLabel="Export"
        filters={filters}
        columns={[
          "Company",
          "Jira Ticket",
          "Empresa",
          "Assessment Status",
          "Redteam",
          "Final Risk",
          "Last Review",
        ]}
        tableFooterText={`Showing 1 to ${visiblePartners.length} of ${filteredPartners.length} partners`}
        summary={[
          {
            label: "Pending",
            value: filteredPartners.filter((v) => v.assessmentStatus === "Pending").length.toString(),
            note: "Partners aguardando avance da avaliacao",
            tone: "primary",
          },
          {
            label: "Completed",
            value: filteredPartners.filter((v) => v.assessmentStatus === "Completed").length.toString(),
            note: "Partners com analise encerrada",
            tone: "success",
          },
          {
            label: "Critical",
            value: filteredPartners.filter((v) => v.risk === "Critical").length.toString(),
            note: "Risco final consolidado entre as 3 areas",
            tone: "danger",
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
            <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]"><Link href={`/partners/${item.id}`} className="block">{item.companyGroup}</Link></td>
            <td className="px-6 py-4"><Link href={`/partners/${item.id}`} className="block">{renderAssessmentBadge(item.assessmentStatus)}</Link></td>
            <td className="px-6 py-4"><Link href={`/partners/${item.id}`} className="block">{renderTechnicalReviewBadge(item.technicalReviewStatus)}</Link></td>
            <td className="px-6 py-4">
              <Link href={`/partners/${item.id}`} className="block space-y-1">
                <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
                  <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
                  {item.risk}
                </span>
                <p className="text-[11px] text-[var(--color-neutral-600)]">Privacy: {item.privacyRisk ?? "-"}</p>
                <p className="text-[11px] text-[var(--color-neutral-600)]">Security: {item.securityRisk ?? "-"}</p>
                <p className="text-[11px] text-[var(--color-neutral-600)]">Compliance: {item.complianceRisk ?? "-"}</p>
              </Link>
            </td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/partners/${item.id}`} className="block">{item.lastReview}</Link></td>
          </tr>
        ))}
      />
    </div>
  );
}
