import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";

const filters = [
  { label: "Company", kind: "text" as const, placeholder: "Filter by company name" },
  { label: "Type", kind: "select" as const, options: ["All Types", "Vendor", "Partner"] },
  {
    label: "Status",
    kind: "select" as const,
    options: ["All Status", "Pending", "Sent", "Responded", "In Review", "Completed"],
  },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 30 days", className: "sm:max-w-[220px]" },
];

const assessments = [
  {
    companyGroup: "VTEX",
    company: "V-Global Tech",
    domain: "v-global.cloud",
    type: "Vendor",
    status: "in_review" as const,
    risk: "Medium",
    riskClass: "text-amber-600",
    riskDot: "bg-amber-500",
    progress: 100,
    progressClass: "bg-emerald-500",
    analyst: "Ana Souza",
    sentDate: "12 out 2025",
  },
  {
    companyGroup: "Weni",
    company: "Prime Logistics",
    domain: "prime.logistics",
    type: "Partner",
    status: "sent" as const,
    risk: "High",
    riskClass: "text-red-600",
    riskDot: "bg-red-500",
    progress: 45,
    progressClass: "bg-[var(--color-primary)]",
    analyst: "Carlos Lima",
    sentDate: "18 out 2025",
  },
  {
    companyGroup: "VTEX",
    company: "SecurePay Inc",
    domain: "securepay.com",
    type: "Vendor",
    status: "completed" as const,
    risk: "Low",
    riskClass: "text-emerald-600",
    riskDot: "bg-emerald-500",
    progress: 100,
    progressClass: "bg-emerald-500",
    analyst: "Mariana Costa",
    sentDate: "05 out 2025",
  },
  {
    companyGroup: "Weni",
    company: "CloudScale Ops",
    domain: "cloudscale.io",
    type: "Vendor",
    status: "pending" as const,
    risk: "TBD",
    riskClass: "text-[var(--color-neutral-600)]",
    riskDot: "bg-[var(--color-neutral-600)]",
    progress: 0,
    progressClass: "bg-[var(--color-neutral-200)]",
    analyst: "Unassigned",
    sentDate: "-",
  },
];

export default function AssessmentsPage() {
  return (
    <EntityWorkspace
      title="Assessments"
      description="Manage and monitor your ongoing vendor and partner due diligence processes."
      actionLabel="New Assessment"
      secondaryActionLabel="Export"
      filters={filters}
      columns={["Company", "Empresa", "Type", "Status", "Risk", "Response Progress", "Analyst", "Sent Date", "Actions"]}
      tableFooterText="Showing 1 to 4 of 24 assessments"
      summary={[
        { label: "In Progress", value: "12", note: "4 assessments need immediate review", tone: "primary" },
        { label: "Approved", value: "156", note: "Last approved: SecurePay Inc", tone: "success" },
        { label: "High Risk", value: "08", note: "Requires C-Level sign-off", tone: "danger" },
      ]}
      rows={assessments.map((item) => (
        <tr key={item.company} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
          <td className="px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--color-neutral-100)] text-xs font-bold text-[var(--color-neutral-600)]">
                {item.company[0]}
              </div>
              <div>
                <p className="text-sm font-bold text-[var(--color-text)]">{item.company}</p>
                <p className="text-[11px] text-[var(--color-neutral-600)]">{item.domain}</p>
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-sm font-medium text-[var(--color-neutral-700)]">{item.companyGroup}</td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.type}</td>
          <td className="px-6 py-4">
            <StatusBadge status={item.status} />
          </td>
          <td className="px-6 py-4">
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${item.riskClass}`}>
              <span className={`h-2 w-2 rounded-full ${item.riskDot}`} />
              {item.risk}
            </span>
          </td>
          <td className="px-6 py-4">
            <div className="w-32">
              <p className="mb-1 text-[10px] font-medium text-[var(--color-neutral-700)]">{item.progress}%</p>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-neutral-100)]">
                <div className={`h-full ${item.progressClass}`} style={{ width: `${item.progress}%` }} />
              </div>
            </div>
          </td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]">{item.analyst}</td>
          <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]">{item.sentDate}</td>
          <td className="px-6 py-4 text-right">
            <button type="button" className="rounded p-1 text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="6" r="1.8" />
                <circle cx="12" cy="12" r="1.8" />
                <circle cx="12" cy="18" r="1.8" />
              </svg>
            </button>
          </td>
        </tr>
      ))}
    />
  );
}
