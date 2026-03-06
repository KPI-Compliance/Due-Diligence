import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getAssessmentsList } from "@/lib/data";

export const dynamic = "force-dynamic";

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

export default async function AssessmentsPage() {
  const assessments = await getAssessmentsList();

  return (
    <EntityWorkspace
      title="Assessments"
      description="Manage and monitor your ongoing vendor and partner due diligence processes."
      actionLabel="New Assessment"
      secondaryActionLabel="Export"
      filters={filters}
      columns={[
        "Company",
        "Empresa",
        "Type",
        "Status",
        "Risk",
        "Response Progress",
        "Analyst",
        "Sent Date",
        "Actions",
      ]}
      tableFooterText={`Showing 1 to ${assessments.length} of ${assessments.length} assessments`}
      summary={[
        {
          label: "In Progress",
          value: assessments.filter((a) => ["pending", "sent", "responded", "in_review"].includes(a.status)).length.toString(),
          note: "Assessments currently in workflow",
          tone: "primary",
        },
        {
          label: "Approved",
          value: assessments.filter((a) => a.status === "completed").length.toString(),
          note: "Completed assessment cycles",
          tone: "success",
        },
        {
          label: "High Risk",
          value: assessments.filter((a) => a.risk === "High" || a.risk === "Critical").length.toString(),
          note: "Requires C-Level sign-off",
          tone: "danger",
        },
      ]}
      rows={assessments.map((item) => (
        <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
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
            <Link
              href={item.type === "Vendor" ? `/vendors/${item.slug}` : `/partners/${item.slug}`}
              className="inline-flex rounded p-1 text-[var(--color-neutral-600)] transition hover:text-[var(--color-primary)]"
              aria-label={`Abrir detalhes de ${item.company}`}
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
