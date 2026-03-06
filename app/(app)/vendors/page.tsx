import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { getVendorsList } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Vendor", kind: "text" as const, placeholder: "Filter by vendor name" },
  { label: "Status", kind: "select" as const, options: ["All Status", "Pending", "In Review", "Completed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Owner", kind: "select" as const, options: ["All Owners"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 90 days", className: "sm:max-w-[220px]" },
];

export default async function VendorsPage() {
  const vendors = await getVendorsList();

  return (
    <EntityWorkspace
      title="Vendors"
      description="Consolide fornecedores, acompanhe risco e gerencie ciclos de due diligence em andamento."
      actionLabel="New Vendor"
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
      tableFooterText={`Showing 1 to ${vendors.length} of ${vendors.length} vendors`}
      summary={[
        {
          label: "In Progress",
          value: vendors.filter((v) => v.status === "in_review" || v.status === "pending").length.toString(),
          note: "Vendors with open due diligence workflows",
          tone: "primary",
        },
        {
          label: "Approved",
          value: vendors.filter((v) => v.status === "completed").length.toString(),
          note: "Vendors with completed assessments",
          tone: "success",
        },
        {
          label: "Critical",
          value: vendors.filter((v) => v.risk === "Critical").length.toString(),
          note: "High-priority risk escalation",
          tone: "danger",
        },
      ]}
      rows={vendors.map((item) => (
        <tr key={item.id} className="hover:bg-[var(--color-neutral-100)]/40 transition-colors">
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
