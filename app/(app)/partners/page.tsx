import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getPartnersList } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Partner", kind: "text" as const, placeholder: "Filter by partner name" },
  { label: "Status", kind: "select" as const, options: ["All Status", "Pending", "Sent", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Region", kind: "select" as const, options: ["All Regions"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 60 days", className: "sm:max-w-[220px]" },
];

export default async function PartnersPage() {
  const partners = await getPartnersList();

  return (
    <EntityWorkspace
      title="Partners"
      description="Centralize strategic partners and track relationship risk across active due diligence cycles."
      actionLabel="New Partner"
      secondaryActionLabel="Export"
      filters={filters}
      columns={[
        "Company",
        "Empresa",
        "Segment",
        "Status",
        "Risk",
        "Open Assessments",
        "Owner",
        "Last Review",
        "Actions",
      ]}
      tableFooterText={`Showing 1 to ${partners.length} of ${partners.length} partners`}
      summary={[
        {
          label: "In Progress",
          value: partners.filter((v) => v.status === "in_review" || v.status === "pending" || v.status === "sent").length.toString(),
          note: "Partners with active due diligence workflows",
          tone: "primary",
        },
        {
          label: "Approved",
          value: partners.filter((v) => v.status === "completed").length.toString(),
          note: "Partners with completed assessments",
          tone: "success",
        },
        {
          label: "Critical",
          value: partners.filter((v) => v.risk === "Critical").length.toString(),
          note: "Executive attention required",
          tone: "danger",
        },
      ]}
      rows={partners.map((item) => (
        <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                {item.company[0]}
              </div>
              <div>
                <Link href={`/partners/${item.id}`} className="text-sm font-bold text-[var(--color-text)] hover:text-[var(--color-primary)]">
                  {item.company}
                </Link>
                <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.companyGroup}</td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.segment}</td>
          <td className="px-6 py-4">
            <StatusBadge status={item.status} />
          </td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
              <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
              {item.risk}
            </span>
          </td>
          <td className="px-6 py-4 text-sm font-semibold text-[var(--color-text)]">{item.openAssessments}</td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.owner}</td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]">{item.lastReview}</td>
          <td className="px-6 py-4 text-right">
            <Link
              href={`/partners/${item.id}`}
              aria-label={`Abrir detalhes de ${item.company}`}
              className="inline-flex rounded p-1 text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="18" r="1.8" />
              </svg>
            </Link>
          </td>
        </tr>
      ))}
    />
  );
}
