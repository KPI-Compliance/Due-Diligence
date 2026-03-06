import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";

const filters = [
  { label: "Partner", kind: "text" as const, placeholder: "Filter by partner name" },
  { label: "Status", kind: "select" as const, options: ["All Status", "Pending", "Sent", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Region", kind: "select" as const, options: ["All Regions", "LATAM", "North America", "Europe"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 60 days", className: "sm:max-w-[220px]" },
];

const partners = [
  {
    id: "prime-logistics",
    companyGroup: "VTEX",
    company: "Prime Logistics",
    domain: "prime.logistics",
    segment: "Distribution",
    status: "sent" as const,
    risk: "High",
    riskClass: "text-red-600",
    riskDot: "bg-red-500",
    openAssessments: 2,
    owner: "Lucas Nogueira",
    lastReview: "26 fev 2026",
  },
  {
    id: "orbit-commerce",
    companyGroup: "Weni",
    company: "Orbit Commerce",
    domain: "orbit-commerce.com",
    segment: "Marketplace",
    status: "in_review" as const,
    risk: "Medium",
    riskClass: "text-amber-600",
    riskDot: "bg-amber-500",
    openAssessments: 1,
    owner: "Marina Alves",
    lastReview: "21 fev 2026",
  },
  {
    id: "blueroute",
    companyGroup: "VTEX",
    company: "BlueRoute",
    domain: "blueroute.app",
    segment: "Operations",
    status: "completed" as const,
    risk: "Low",
    riskClass: "text-emerald-600",
    riskDot: "bg-emerald-500",
    openAssessments: 0,
    owner: "Bruno Martins",
    lastReview: "15 fev 2026",
  },
  {
    id: "nexus-flows",
    companyGroup: "Weni",
    company: "Nexus Flows",
    domain: "nexusflows.net",
    segment: "Integration",
    status: "pending" as const,
    risk: "Critical",
    riskClass: "text-rose-600",
    riskDot: "bg-rose-500",
    openAssessments: 3,
    owner: "Lucas Nogueira",
    lastReview: "10 fev 2026",
  },
];

export default function PartnersPage() {
  return (
    <EntityWorkspace
      title="Partners"
      description="Centralize strategic partners and track relationship risk across active due diligence cycles."
      actionLabel="New Partner"
      secondaryActionLabel="Export"
      filters={filters}
      columns={["Company", "Empresa", "Segment", "Status", "Risk", "Open Assessments", "Owner", "Last Review", "Actions"]}
      tableFooterText="Showing 1 to 4 of 62 partners"
      summary={[
        { label: "In Progress", value: "14", note: "5 partners awaiting documentation", tone: "primary" },
        { label: "Approved", value: "41", note: "Last approved: BlueRoute", tone: "success" },
        { label: "Critical", value: "07", note: "Requires executive approval", tone: "danger" },
      ]}
      rows={partners.map((item) => (
        <tr key={item.company} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
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
