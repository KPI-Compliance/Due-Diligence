import Link from "next/link";
import { EntityWorkspace } from "@/components/ui/EntityWorkspace";
import { getVendorsList } from "@/lib/data";

export const dynamic = "force-dynamic";

const filters = [
  { label: "Vendor", kind: "text" as const, placeholder: "Filter by vendor name" },
  { label: "Initial Questionnaire", kind: "select" as const, options: ["All", "Pending", "Sent", "Responded", "Reviewed"] },
  { label: "Main Questionnaire", kind: "select" as const, options: ["All", "Pending", "Responded", "Reviewed"] },
  { label: "Risk Level", kind: "select" as const, options: ["All Risks", "Low", "Medium", "High", "Critical"] },
  { label: "Owner", kind: "select" as const, options: ["All Owners"] },
  { label: "Date Range", kind: "button" as const, buttonText: "Last 90 days", className: "sm:max-w-[220px]" },
];

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
}: {
  searchParams?: Promise<{ updated?: string }>;
}) {
  const vendors = await getVendorsList();

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
          "Empresa",
          "Segment",
          "Initial Questionnaire",
          "Main Questionnaire",
          "Redteam",
          "Final Risk",
          "Owner",
          "Last Review",
        ]}
        tableFooterText={`Showing 1 to ${vendors.length} of ${vendors.length} vendors`}
        summary={[
          {
            label: "Initial Pending",
            value: vendors.filter((v) => v.intakeStatus === "Pending").length.toString(),
            note: "Vendors aguardando o primeiro questionario",
            tone: "primary",
          },
          {
            label: "Main Reviewed",
            value: vendors.filter((v) => v.principalQuestionnaireStatus === "Reviewed").length.toString(),
            note: "Questionario principal revisado por Privacy e Security",
            tone: "success",
          },
          {
            label: "Critical",
            value: vendors.filter((v) => v.risk === "Critical").length.toString(),
            note: "Maior risco final entre Privacy e Security",
            tone: "danger",
          },
        ]}
        rows={vendors.map((item) => (
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
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-700)]"><Link href={`/vendors/${item.id}`} className="block">{item.owner}</Link></td>
            <td className="px-6 py-4 text-sm text-[var(--color-neutral-600)]"><Link href={`/vendors/${item.id}`} className="block">{item.lastReview}</Link></td>
          </tr>
        ))}
      />
    </div>
  );
}
