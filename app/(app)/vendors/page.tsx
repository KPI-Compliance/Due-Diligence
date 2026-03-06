import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";

const filters = [
  { label: "Vendor", kind: "text" as const, placeholder: "Filter by vendor name" },
  { label: "Status", kind: "select" as const, options: ["All Status", "Pending", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Owner", kind: "select" as const, options: ["All Owners", "Ana Souza", "Carlos Lima", "Mariana Costa"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 90 days", className: "sm:max-w-[220px]" },
];

const vendors = [
  {
    id: "cloudscale-inc",
    companyGroup: "VTEX",
    company: "CloudScale Inc.",
    domain: "cloudscale.io",
    segment: "Cloud Infrastructure",
    status: "in_review" as const,
    risk: "Medium",
    riskClass: "text-amber-600",
    riskDot: "bg-amber-500",
    openAssessments: 2,
    owner: "Ana Souza",
    lastReview: "24 fev 2026",
  },
  {
    id: "dataguard-systems",
    companyGroup: "Weni",
    company: "DataGuard Systems",
    domain: "dataguard.ai",
    segment: "Security",
    status: "pending" as const,
    risk: "High",
    riskClass: "text-red-600",
    riskDot: "bg-red-500",
    openAssessments: 1,
    owner: "Carlos Lima",
    lastReview: "19 fev 2026",
  },
  {
    id: "securepay",
    companyGroup: "VTEX",
    company: "SecurePay",
    domain: "securepay.com",
    segment: "Payments",
    status: "completed" as const,
    risk: "Low",
    riskClass: "text-emerald-600",
    riskDot: "bg-emerald-500",
    openAssessments: 0,
    owner: "Mariana Costa",
    lastReview: "12 fev 2026",
  },
  {
    id: "nexus-databank",
    companyGroup: "Weni",
    company: "Nexus Databank",
    domain: "nexusdb.io",
    segment: "Data Processing",
    status: "in_review" as const,
    risk: "Critical",
    riskClass: "text-rose-600",
    riskDot: "bg-rose-500",
    openAssessments: 3,
    owner: "Ana Souza",
    lastReview: "08 fev 2026",
  },
];

export default function VendorsPage() {
  return (
    <EntityWorkspace
      title="Vendors"
      description="Consolide fornecedores, acompanhe risco e gerencie ciclos de due diligence em andamento."
      actionLabel="New Vendor"
      secondaryActionLabel="Export"
      filters={filters}
      columns={["Company", "Empresa", "Segment", "Status", "Risk", "Open Assessments", "Owner", "Last Review", "Actions"]}
      tableFooterText="Showing 1 to 4 of 128 vendors"
      summary={[
        { label: "In Progress", value: "21", note: "7 vendors with pending evidence", tone: "primary" },
        { label: "Approved", value: "96", note: "Most recent: SecurePay", tone: "success" },
        { label: "Critical", value: "11", note: "Escalation required this week", tone: "danger" },
      ]}
      rows={vendors.map((item) => (
        <tr key={item.company} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                {item.company[0]}
              </div>
              <div>
                <Link href={`/vendors/${item.id}`} className="text-sm font-bold text-[var(--color-text)] hover:text-[var(--color-primary)]">
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
              href={`/vendors/${item.id}`}
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
